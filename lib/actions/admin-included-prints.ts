"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth/access-guard";
import { actionErrorMessage } from "@/lib/action-error";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

const GrantSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  bookingId: z.string().min(1),
  printSizeId: z.string().min(1),
  frameDesignId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1.").max(50, "Quantity can't be more than 50."),
  note: z.string().trim().max(200).optional(),
});

const RemoveSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  lineId: z.string().min(1),
});

function fail(error: string, message: string) {
  return { success: false as const, error, message };
}

/** Staff gift an extra included print to a booking, on top of what its package carries. */
export async function grantIncludedPrint(input: z.input<typeof GrantSchema>) {
  try {
    const v = GrantSchema.parse(input);
    const staff = await requireAccess(v.tenantId, "bookings", "MANAGE");

    const booking = await db.clientBooking.findFirst({ where: { id: v.bookingId, tenantId: v.tenantId }, select: { id: true } });
    if (!booking) return fail("BOOKING_NOT_FOUND", "Booking not found.");
    const [size, frame] = await Promise.all([
      db.printSize.findFirst({ where: { id: v.printSizeId, tenantId: v.tenantId } }),
      db.frameDesign.findFirst({ where: { id: v.frameDesignId, tenantId: v.tenantId } }),
    ]);
    if (!size) return fail("SIZE_NOT_FOUND", "Print size not found.");
    if (!frame) return fail("FRAME_NOT_FOUND", "Frame not found.");

    await db.bookingIncludedPrint.create({
      data: {
        tenantId: v.tenantId,
        bookingId: booking.id,
        printSizeId: size.id,
        frameDesignId: frame.id,
        quantity: v.quantity,
        sizeCode: size.code,
        sizeName: size.name,
        widthInches: size.widthInches,
        heightInches: size.heightInches,
        frameName: frame.name,
        source: "MANUAL",
        grantedById: staff.id,
        note: v.note || null,
      },
    });
    safeRevalidate(`/${v.tenantSlug}/admin/bookings/${booking.id}`);
    return { success: true as const };
  } catch (err) {
    return fail("GRANT_FAILED", actionErrorMessage(err, "Failed to grant the included print."));
  }
}

/** Remove a manually granted line. Package lines stay, and so does any line a client has already used. */
export async function removeIncludedPrint(input: z.input<typeof RemoveSchema>) {
  try {
    const v = RemoveSchema.parse(input);
    await requireAccess(v.tenantId, "bookings", "MANAGE");

    const line = await db.bookingIncludedPrint.findFirst({ where: { id: v.lineId, tenantId: v.tenantId } });
    if (!line) return fail("LINE_NOT_FOUND", "Included print not found.");
    if (line.source !== "MANUAL") return fail("NOT_MANUAL", "Only prints granted by hand can be removed.");
    if ((await db.printOrderItem.count({ where: { bookingIncludedPrintId: line.id } })) > 0) {
      return fail("ALREADY_CLAIMED", "The client has already used this print.");
    }
    await db.bookingIncludedPrint.delete({ where: { id: line.id } });
    safeRevalidate(`/${v.tenantSlug}/admin/bookings/${line.bookingId}`);
    return { success: true as const };
  } catch (err) {
    return fail("REMOVE_FAILED", actionErrorMessage(err, "Failed to remove the included print."));
  }
}
