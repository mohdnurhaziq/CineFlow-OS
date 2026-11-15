import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

export type EntitlementLine = Prisma.BookingIncludedPrintGetPayload<object> & { remaining: number };

/**
 * Copy the package's included prints onto a booking, snapshotting the size and frame
 * details so later edits to the package, size or frame never change what was promised.
 * Does nothing if the booking already has package or backfilled lines (manual grants don't count:
 * they are extra, not the package's prints). Returns how many rows were created.
 * Must run inside the transaction that creates the booking.
 *
 * Not a "use server" module.
 */
export async function snapshotIncludedPrints(
  tx: Tx,
  booking: { id: string; tenantId: string; packageId: string | null },
  source: "PACKAGE" | "BACKFILL"
): Promise<number> {
  if (!booking.packageId) return 0;
  const existing = await tx.bookingIncludedPrint.count({
    where: { bookingId: booking.id, source: { in: ["PACKAGE", "BACKFILL"] } },
  });
  if (existing > 0) return 0;

  const lines = await tx.packageIncludedPrint.findMany({ where: { packageId: booking.packageId } });
  if (lines.length === 0) return 0;

  const [sizes, frames] = await Promise.all([
    tx.printSize.findMany({ where: { id: { in: lines.map((l) => l.printSizeId) } } }),
    tx.frameDesign.findMany({ where: { id: { in: lines.map((l) => l.frameDesignId) } } }),
  ]);
  const sizeById = new Map(sizes.map((s) => [s.id, s]));
  const frameById = new Map(frames.map((f) => [f.id, f]));

  let created = 0;
  for (const line of lines) {
    const size = sizeById.get(line.printSizeId);
    const frame = frameById.get(line.frameDesignId);
    if (!size || !frame) continue;
    await tx.bookingIncludedPrint.create({
      data: {
        tenantId: booking.tenantId,
        bookingId: booking.id,
        printSizeId: size.id,
        frameDesignId: frame.id,
        quantity: line.quantity,
        sizeCode: size.code,
        sizeName: size.name,
        widthInches: size.widthInches,
        heightInches: size.heightInches,
        frameName: frame.name,
        source,
      },
    });
    created += 1;
  }
  return created;
}

/** For each line, its quantity minus the items already placed on orders that are not cancelled. */
export async function remainingForLines(tx: Tx, lineIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (lineIds.length === 0) return result;
  const [lines, claimed] = await Promise.all([
    tx.bookingIncludedPrint.findMany({ where: { id: { in: lineIds } }, select: { id: true, quantity: true } }),
    tx.printOrderItem.groupBy({
      by: ["bookingIncludedPrintId"],
      where: { bookingIncludedPrintId: { in: lineIds }, order: { status: { not: "CANCELLED" } } },
      _count: { _all: true },
    }),
  ]);
  const used = new Map(claimed.map((c) => [c.bookingIncludedPrintId as string, c._count._all]));
  for (const l of lines) result.set(l.id, Math.max(0, l.quantity - (used.get(l.id) ?? 0)));
  return result;
}

/** A project's included prints with what is left of each, plus whether the client's files are released. */
export async function loadProjectEntitlements(
  projectId: string
): Promise<{ lines: EntitlementLine[]; unlocked: boolean; hasPhotos: boolean }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { bookingId: true, isFinalBalancePaid: true },
  });
  if (!project) return { lines: [], unlocked: false, hasPhotos: false };

  const [rows, photoCount] = await Promise.all([
    project.bookingId
      ? db.bookingIncludedPrint.findMany({ where: { bookingId: project.bookingId }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    db.deliverableItem.count({ where: { itemType: "PHOTO", deliverable: { projectId } } }),
  ]);
  const remaining = await remainingForLines(db, rows.map((r) => r.id));
  return {
    lines: rows.map((r) => ({ ...r, remaining: remaining.get(r.id) ?? 0 })),
    unlocked: project.isFinalBalancePaid,
    hasPhotos: photoCount > 0,
  };
}
