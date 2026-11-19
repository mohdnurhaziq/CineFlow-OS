import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { errorMessageOf } from "@/lib/action-error";

/**
 * Every slot of a studio, for tests and internal use. Deliberately not a server action ("use server"):
 * it includes booked clients' names and hold ids, so it must never be callable from the browser.
 */
export async function getTenantBookingSlots(params: {
  tenantSlug: string;
  category?: string;
  date?: string;
}) {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: params.tenantSlug },
      select: { id: true },
    });

    if (!tenant) {
      return { success: false, error: "Tenant not found", slots: [] };
    }

    const now = new Date();

    // Auto-cleanup expired holds
    await db.bookingSlot.updateMany({
      where: {
        tenantId: tenant.id,
        status: "HELD",
        heldUntil: { lt: now },
      },
      data: {
        status: "AVAILABLE",
        heldUntil: null,
        heldBySessionId: null,
      },
    });

    const whereClause: Prisma.BookingSlotWhereInput = { tenantId: tenant.id };
    if (params.category && params.category !== "all") {
      whereClause.category = params.category;
    }

    const slots = await db.bookingSlot.findMany({
      where: whereClause,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      include: {
        booking: {
          select: { id: true, clientName: true, status: true },
        },
      },
    });

    return { success: true, slots };
  } catch (err) {
    console.error("Error fetching slots:", err);
    return { success: false, error: errorMessageOf(err), slots: [] };
  }
}
