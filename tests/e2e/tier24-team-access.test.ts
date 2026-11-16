/**
 * Tier 24: Team, roles, access and shoot assignments
 * - Schema: team roles, per-person extras and booking assignments are stored
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";

export async function runTier24TeamAccessTests(harness: TestHarness) {
  harness.setSuite("Tier 24", "Team Access");

  await harness.test("T24-SCHEMA-01: team roles, extras and assignments are stored", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    const member = await db.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "PHOTOGRAPHER" } });
    const booking = await db.clientBooking.findFirstOrThrow({ where: { tenantId: tenant.id } });
    const name = `Schema test ${Date.now()}`;
    let roleId: string | undefined;
    let assignmentId: string | undefined;
    const before = { teamRoleId: member.teamRoleId, extraAccess: member.extraAccess, deactivatedAt: member.deactivatedAt };
    try {
      const role = await db.teamRole.create({ data: { tenantId: tenant.id, name, access: "{}" } });
      roleId = role.id;
      harness.assertEqual(role.sortOrder, 0, "sortOrder defaults to 0");
      await db.user.update({ where: { id: member.id }, data: { teamRoleId: role.id, extraAccess: "{}" } });
      const assignment = await db.bookingAssignment.create({
        data: { tenantId: tenant.id, bookingId: booking.id, userId: member.id },
      });
      assignmentId = assignment.id;

      const user = await db.user.findUniqueOrThrow({
        where: { id: member.id },
        include: { teamRole: true, assignments: true },
      });
      harness.assertEqual(user.teamRole?.name, name, "user is linked to the role");
      harness.assertEqual(user.extraAccess, "{}", "extraAccess round-trips");
      harness.assertEqual(user.deactivatedAt, null, "deactivatedAt defaults to null");
      harness.assertEqual(user.assignments.length, 1, "user has the assignment");
      harness.assertEqual(user.assignments[0]?.assignedById, null, "assignedById is optional");

      let duplicate = false;
      try {
        await db.teamRole.create({ data: { tenantId: tenant.id, name, access: "{}" } });
      } catch {
        duplicate = true;
      }
      harness.assert(duplicate, "a second role with the same name in the studio is rejected");
    } finally {
      if (assignmentId) await db.bookingAssignment.deleteMany({ where: { id: assignmentId } });
      await db.user.update({ where: { id: member.id }, data: before });
      if (roleId) await db.teamRole.deleteMany({ where: { id: roleId } });
    }
  });
}
