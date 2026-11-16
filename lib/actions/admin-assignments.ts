"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth/access-guard";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { actionErrorMessage } from "@/lib/action-error";
import { teamMemberStatus } from "@/lib/team/status";
import { notifyAssigneesDetailed, summariseDelivery, type AssigneeEmailSummary } from "@/lib/bookings/assignment-emails";

/**
 * Who shoots which booking. Needs Bookings: Manage. The people assigned are told by email;
 * a failed or skipped email never blocks the assignment (the result says what happened).
 */

type Fail = { success: false; error: string; message: string };
const fail = (error: string, message: string): Fail => ({ success: false, error, message });

function revalidate(tenantSlug: string) {
  for (const path of [`/${tenantSlug}/admin/bookings`, `/${tenantSlug}/admin/calendar`, `/${tenantSlug}/admin/schedule`, `/${tenantSlug}/admin`]) {
    try {
      revalidatePath(path);
    } catch {
      // non-request context
    }
  }
}

const AssignSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  bookingIds: z.array(z.string().min(1)).min(1, "Pick at least one booking.").max(200),
  userId: z.string().min(1),
});

/** An active team member of the studio, or its owner. Not a client, a removed or not-yet-joined member, or anyone from another studio. */
async function findAssignable(tenantId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, role: true, deactivatedAt: true, passwordHash: true, passwordResetExpires: true },
  });
  if (!user || !STAFF_ROLES.has(user.role) || user.role === "SUPER_ADMIN") return null;
  if (user.role === "STUDIO_OWNER") return user.deactivatedAt ? null : user;
  return teamMemberStatus(user) === "ACTIVE" ? user : null;
}

export async function assignTeamMember(
  input: z.input<typeof AssignSchema>
): Promise<{ success: true; assigned: number; skipped: number; emailDelivery: AssigneeEmailSummary } | Fail> {
  try {
    const data = AssignSchema.parse(input);
    const session = await requireAccess(data.tenantId, "bookings", "MANAGE");
    if (!(await findAssignable(data.tenantId, data.userId))) return fail("NOT_ON_TEAM", "Only active members of your team can be assigned.");

    const ids = [...new Set(data.bookingIds)];
    // Another studio's bookings simply don't match, so they are skipped and never touched.
    const bookings = await db.clientBooking.findMany({
      where: { id: { in: ids }, tenantId: data.tenantId, status: { not: "CANCELLED" } },
      select: { id: true, assignments: { where: { userId: data.userId }, select: { id: true } } },
    });
    const added: string[] = [];
    for (const booking of bookings) {
      if (booking.assignments.length > 0) continue;
      try {
        await db.bookingAssignment.create({
          data: { tenantId: data.tenantId, bookingId: booking.id, userId: data.userId, assignedById: session.id },
        });
        added.push(booking.id);
      } catch (e) {
        // Someone assigned the same pair at the same moment: already there, so skipped.
        if ((e as { code?: string })?.code !== "P2002") throw e;
      }
    }

    revalidate(data.tenantSlug);
    const results: AssigneeEmailSummary[] = [];
    if (data.userId !== session.id) {
      for (const bookingId of added) {
        results.push(await notifyAssigneesDetailed(bookingId, { kind: "ASSIGNED", userIds: [data.userId], assignedByName: session.name }));
      }
    }
    return { success: true, assigned: added.length, skipped: ids.length - added.length, emailDelivery: summariseDelivery(results) };
  } catch (err) {
    return fail("ASSIGN_FAILED", actionErrorMessage(err, "Could not assign the booking."));
  }
}

const UnassignSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  bookingId: z.string().min(1),
  userId: z.string().min(1),
});

export async function unassignTeamMember(
  input: z.input<typeof UnassignSchema>
): Promise<{ success: true; emailDelivery: AssigneeEmailSummary } | Fail> {
  try {
    const data = UnassignSchema.parse(input);
    const session = await requireAccess(data.tenantId, "bookings", "MANAGE");
    const booking = await db.clientBooking.findFirst({ where: { id: data.bookingId, tenantId: data.tenantId }, select: { id: true } });
    if (!booking) return fail("NOT_FOUND", "Booking not found.");

    const removed = await db.bookingAssignment.deleteMany({ where: { bookingId: booking.id, userId: data.userId, tenantId: data.tenantId } });
    revalidate(data.tenantSlug);
    const emailDelivery: AssigneeEmailSummary =
      removed.count > 0 && data.userId !== session.id ? await notifyAssigneesDetailed(booking.id, { kind: "UNASSIGNED", userIds: [data.userId] }) : "NONE";
    return { success: true, emailDelivery };
  } catch (err) {
    return fail("UNASSIGN_FAILED", actionErrorMessage(err, "Could not remove the assignment."));
  }
}
