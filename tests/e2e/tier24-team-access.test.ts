/**
 * Tier 24: Team, roles, access and shoot assignments
 * - Schema: team roles, per-person extras and booking assignments are stored
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import {
  FULL_ACCESS,
  LEGACY_TEAM_ACCESS,
  NO_ACCESS,
  STARTER_ROLES,
  ensureStudioRoles,
  levelAtLeast,
  loadAccess,
  mergeAccess,
  parseAccess,
  serializeAccess,
} from "@/lib/auth/access";
import { requireAccess, requireTick } from "@/lib/auth/access-guard";

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

  await harness.test("T24-ACCESS-01: parse, merge and levels", async () => {
    harness.assertEqual(JSON.stringify(parseAccess(null)), JSON.stringify(NO_ACCESS), "null parses to no access");
    harness.assertEqual(parseAccess("not json").areas.bookings, "NONE", "invalid JSON is no access");
    harness.assertEqual(parseAccess('{"areas":{"clients":"OWN"}}').areas.clients, "NONE", "OWN outside bookings/galleries is NONE");
    harness.assertEqual(parseAccess('{"areas":{"bookings":"OWN","bogus":"MANAGE"}}').areas.bookings, "OWN", "OWN is kept for bookings");
    const a = parseAccess('{"areas":{"bookings":"OWN"},"ticks":{"setPrices":true}}');
    const b = parseAccess('{"areas":{"bookings":"MANAGE"},"ticks":{"recordPayments":true}}');
    const m = mergeAccess(a, b);
    harness.assertEqual(m.areas.bookings, "MANAGE", "higher level wins");
    harness.assert(m.ticks.setPrices && m.ticks.recordPayments && !m.ticks.approvePayments, "ticks are OR-ed");
    harness.assertEqual(JSON.stringify(parseAccess(serializeAccess(m))), JSON.stringify(m), "serialize round-trips");
    harness.assert(levelAtLeast("VIEW", "OWN"), "VIEW >= OWN");
    harness.assert(!levelAtLeast("OWN", "VIEW"), "OWN < VIEW");
  });

  await harness.test("T24-ACCESS-02: starter and legacy roles", async () => {
    const apex = await db.tenant.findUniqueOrThrow({ where: { slug: "apex-media" } });
    await ensureStudioRoles(apex.id);
    const roles = await db.teamRole.findMany({ where: { tenantId: apex.id } });
    harness.assertEqual(roles.map((r) => r.name).sort().join(","), "Crew,Photographer", "legacy roles only");
    for (const r of roles) {
      harness.assertEqual(JSON.stringify(parseAccess(r.access)), JSON.stringify(LEGACY_TEAM_ACCESS), `${r.name} is legacy access`);
    }
    for (const [role, name] of [["PHOTOGRAPHER", "Photographer"], ["CREW", "Crew"]]) {
      const members = await db.user.findMany({ where: { tenantId: apex.id, role }, include: { teamRole: true } });
      harness.assert(members.length > 0 && members.every((u) => u.teamRole?.name === name), `${role} members linked to ${name}`);
    }
    await ensureStudioRoles(apex.id);
    harness.assertEqual(await db.teamRole.count({ where: { tenantId: apex.id } }), 2, "second call adds nothing");

    const slug = `t24-fresh-${Date.now().toString(36)}`;
    const fresh = await db.tenant.create({ data: { name: "T24 Fresh", slug } });
    try {
      await ensureStudioRoles(fresh.id);
      const starter = await db.teamRole.findMany({ where: { tenantId: fresh.id }, orderBy: { sortOrder: "asc" } });
      harness.assertEqual(starter.length, 4, "four starter roles");
      for (const want of STARTER_ROLES) {
        const got = starter.find((r) => r.name === want.name);
        harness.assert(!!got, `${want.name} exists`);
        harness.assertEqual(JSON.stringify(parseAccess(got?.access)), JSON.stringify(want.access), `${want.name} values`);
      }
      const ph = parseAccess(starter.find((r) => r.name === "Photographer")?.access);
      harness.assert(ph.areas.bookings === "OWN" && ph.areas.galleries === "OWN" && ph.areas.production === "VIEW" && ph.areas.clients === "NONE", "Photographer values");
      const fd = parseAccess(starter.find((r) => r.name === "Front desk")?.access);
      harness.assert(fd.areas.bookings === "MANAGE" && fd.areas.invoices === "VIEW" && fd.areas.catalog === "NONE", "Front desk values");
      await ensureStudioRoles(fresh.id);
      harness.assertEqual(await db.teamRole.count({ where: { tenantId: fresh.id } }), 4, "idempotent");
    } finally {
      await db.teamRole.deleteMany({ where: { tenantId: fresh.id } });
      await db.tenant.delete({ where: { id: fresh.id } });
    }
  });

  await harness.test("T24-ACCESS-03: owner and super-admin always have everything; a deactivated member has nothing", async () => {
    const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    const owner = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
    harness.assertEqual(JSON.stringify(await loadAccess(owner)), JSON.stringify(FULL_ACCESS), "owner has everything");
    const member = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "CREW" } });
    const asMember = { id: member.id, email: member.email, name: member.name, role: member.role, tenantId: member.tenantId, tenantSlug: "lumina-cine" };
    const apex = await db.tenant.findUniqueOrThrow({ where: { slug: "apex-media" } });
    try {
      const live = await loadAccess(member);
      harness.assertEqual(live.ticks.setPrices, false, "legacy members get no ticks");
      harness.assertEqual(live.areas.bookings, "MANAGE", "legacy members manage everything");
      harness.assertEqual(JSON.stringify(await loadAccess({ ...member, tenantId: apex.id })), JSON.stringify(NO_ACCESS), "a user from another studio has nothing");
      let threw = false;
      try {
        await withSession(asMember, () => requireTick(lumina.id, "setPrices"));
      } catch (e) {
        threw = e instanceof Error && e.message.startsWith("FORBIDDEN");
      }
      harness.assert(threw, "requireTick refuses a member without the tick");
      await db.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } });
      harness.assertEqual(JSON.stringify(await loadAccess(member)), JSON.stringify(NO_ACCESS), "deactivated member has nothing");
      let blocked = false;
      try {
        await withSession(asMember, () => requireAccess(lumina.id, "bookings", "VIEW"));
      } catch {
        blocked = true;
      }
      harness.assert(blocked, "a deactivated member is refused");
    } finally {
      await db.user.update({ where: { id: member.id }, data: { deactivatedAt: null } });
    }
  });
}
