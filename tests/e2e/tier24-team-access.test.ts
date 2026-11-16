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
import { AuthorizationError } from "@/lib/auth/guard";
import { canAccessBooking, canAccessProject, requireAccess, requireTick } from "@/lib/auth/access-guard";

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

  // ---- Guards and record checks --------------------------------------------------------
  const FULL_NO_TICKS = serializeAccess(LEGACY_TEAM_ACCESS);
  const accessJson = (areas: Record<string, string>, ticks: Record<string, boolean> = {}) => JSON.stringify({ areas, ticks });

  /** Builds team members, bookings and projects in both seeded studios, runs `fn`, then removes everything. */
  async function withFixture<T>(fn: (f: Fixture) => Promise<T>): Promise<T> {
    const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    const apex = await db.tenant.findUniqueOrThrow({ where: { slug: "apex-media" } });
    const luminaOwner = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
    const apexOwner = await db.user.findFirstOrThrow({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } });
    const superAdmin = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
    await ensureStudioRoles(lumina.id);
    const roleIds: string[] = [];
    const userIds: string[] = [];
    const bookingIds: string[] = [];
    try {
      const mkRole = async (name: string, access: string) => {
        const r = await db.teamRole.create({ data: { tenantId: lumina.id, name: `${name} ${run}`, access } });
        roleIds.push(r.id);
        return r.id;
      };
      const mkMember = async (label: string, teamRoleId: string | null) => {
        const u = await db.user.create({
          data: { tenantId: lumina.id, email: `t24-${label}-${run}@example.test`, name: `T24 ${label}`, role: "TEAM_MEMBER", teamRoleId },
        });
        userIds.push(u.id);
        return u;
      };
      const mkBooking = async (tenantId: string, label: string) => {
        const b = await db.clientBooking.create({
          data: { tenantId, trackingCode: `T24-${run}-${label}`, clientName: "T24", clientEmail: "t24@example.test", clientPhone: "000", discipline: "PHOTOGRAPHY", serviceTier: "T24" },
        });
        bookingIds.push(b.id);
        return b;
      };
      const mkProject = (tenantId: string, label: string, leadId: string, bookingId?: string) =>
        db.project.create({
          data: { tenantId, projectNumber: `T24-${run}-${label}`, title: "T24", clientId: leadId, studioLeadId: leadId, discipline: "PHOTOGRAPHY", budget: 0, bookingId },
        });
      return await fn({ lumina, apex, luminaOwner, apexOwner, superAdmin, mkRole, mkMember, mkBooking, mkProject });
    } finally {
      await db.project.deleteMany({ where: { projectNumber: { startsWith: `T24-${run}` } } });
      await db.bookingAssignment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { bookingId: { in: bookingIds } }] } });
      await db.clientBooking.deleteMany({ where: { id: { in: bookingIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.teamRole.deleteMany({ where: { id: { in: roleIds } } });
    }
  }

  type Row = { id: string; email: string; name: string; role: string; tenantId: string | null };
  const sess = (u: Row, slug: string | null) => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug });
  const refusal = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (e) {
      return e instanceof AuthorizationError ? e.message : `NOT AuthorizationError: ${String(e)}`;
    }
  };
  const isForbidden = (m: string | null) => !!m && m.startsWith("FORBIDDEN:");

  await harness.test("T24-ACCESS-04: requireAccess allows the level a role grants and refuses the rest", async () => {
    await withFixture(async (f) => {
      const viewer = await f.mkMember("viewer", await f.mkRole("Viewer", accessJson({ bookings: "VIEW" })));
      const s = sess(viewer, "lumina-cine");
      const ok = await withSession(s, () => requireAccess(f.lumina.id, "bookings", "VIEW"));
      harness.assertEqual(ok.id, viewer.id, "returns the signed-in user");
      harness.assertEqual(ok.access.areas.bookings, "VIEW", "returns the loaded access");
      harness.assertEqual(await refusal(() => withSession(s, () => requireAccess(f.lumina.id, "bookings", "OWN"))), null, "VIEW satisfies OWN");
      const tooLow = await refusal(() => withSession(s, () => requireAccess(f.lumina.id, "bookings", "MANAGE")));
      harness.assert(isForbidden(tooLow), `MANAGE refused: ${tooLow}`);
      const otherArea = await refusal(() => withSession(s, () => requireAccess(f.lumina.id, "services", "VIEW")));
      harness.assert(isForbidden(otherArea), `other area refused: ${otherArea}`);
    });
  });

  await harness.test("T24-ACCESS-05: requireTick is its own check, and extras can add a tick", async () => {
    await withFixture(async (f) => {
      const member = await f.mkMember("ticker", await f.mkRole("Full", FULL_NO_TICKS));
      const s = sess(member, "lumina-cine");
      // Passes the staff check and every area, so the refusal below comes from the tick check alone.
      await withSession(s, () => requireAccess(f.lumina.id, "services", "MANAGE"));
      const refused = await refusal(() => withSession(s, () => requireTick(f.lumina.id, "setPrices")));
      harness.assert(isForbidden(refused), `tick refused with a FORBIDDEN AuthorizationError: ${refused}`);
      await db.user.update({ where: { id: member.id }, data: { extraAccess: accessJson({}, { setPrices: true }) } });
      const ok = await withSession(s, () => requireTick(f.lumina.id, "setPrices"));
      harness.assertEqual(ok.access.ticks.setPrices, true, "extras add the tick");
      const other = await refusal(() => withSession(s, () => requireTick(f.lumina.id, "approvePayments")));
      harness.assert(isForbidden(other), "a different tick is still refused");
    });
  });

  await harness.test("T24-ACCESS-06: deactivated, cross-studio and super-admin cases", async () => {
    await withFixture(async (f) => {
      const member = await f.mkMember("gone", await f.mkRole("Full", FULL_NO_TICKS));
      const s = sess(member, "lumina-cine");
      await withSession(s, () => requireAccess(f.lumina.id, "bookings", "MANAGE"));
      await db.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } });
      const gone = await refusal(() => withSession(s, () => requireAccess(f.lumina.id, "bookings", "VIEW")));
      harness.assert(isForbidden(gone), `deactivated member refused: ${gone}`);
      await db.user.update({ where: { id: member.id }, data: { deactivatedAt: null } });

      const crossMember = await refusal(() => withSession(s, () => requireAccess(f.apex.id, "bookings", "VIEW")));
      harness.assert(isForbidden(crossMember), `lumina member refused in apex: ${crossMember}`);
      const crossOwner = await refusal(() => withSession(sess(f.apexOwner, "apex-media"), () => requireAccess(f.lumina.id, "bookings", "VIEW")));
      harness.assert(isForbidden(crossOwner), `apex owner refused in lumina: ${crossOwner}`);
      harness.assertEqual(
        JSON.stringify(await loadAccess({ id: f.apexOwner.id, role: "STUDIO_OWNER", tenantId: f.lumina.id })),
        JSON.stringify(NO_ACCESS),
        "apex owner has NO_ACCESS for lumina"
      );

      const admin = sess(f.superAdmin, null);
      for (const t of [f.lumina.id, f.apex.id]) {
        const a = await withSession(admin, () => requireAccess(t, "catalog", "MANAGE"));
        harness.assertEqual(a.access.areas.catalog, "MANAGE", "super-admin has every area");
        harness.assertEqual(await refusal(() => withSession(admin, () => requireTick(t, "approvePayments"))), null, "super-admin has every tick");
      }
    });
  });

  await harness.test("T24-ACCESS-07: a team member without a role has no access and gets no role", async () => {
    await withFixture(async (f) => {
      const roleNames = async () =>
        (await db.teamRole.findMany({ where: { tenantId: f.lumina.id }, select: { name: true } })).map((r) => r.name).sort().join("|");
      const member = await f.mkMember("norole", null);
      const before = await roleNames();
      harness.assertEqual(JSON.stringify(await loadAccess(member)), JSON.stringify(NO_ACCESS), "no role means no access");
      await ensureStudioRoles(f.lumina.id);
      harness.assertEqual(await roleNames(), before, "no role was created for them");
      const row = await db.user.findUniqueOrThrow({ where: { id: member.id } });
      harness.assertEqual(row.teamRoleId, null, "they were not linked to a role");
      const refused = await refusal(() => withSession(sess(member, "lumina-cine"), () => requireAccess(f.lumina.id, "bookings", "VIEW")));
      harness.assert(isForbidden(refused), `refused: ${refused}`);
    });
  });

  await harness.test("T24-ACCESS-08: canAccessBooking checks the studio and the assignment", async () => {
    await withFixture(async (f) => {
      const member = await f.mkMember("b", null);
      const mine = await f.mkBooking(f.lumina.id, "mine");
      const other = await f.mkBooking(f.lumina.id, "other");
      const foreign = await f.mkBooking(f.apex.id, "foreign");
      await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: mine.id, userId: member.id } });
      const view = parseAccess(accessJson({ bookings: "VIEW" }));
      const own = parseAccess(accessJson({ bookings: "OWN" }));
      const none = parseAccess(accessJson({}));
      harness.assertEqual(await canAccessBooking(member, view, f.lumina.id, other.id), true, "VIEW sees any booking of the studio");
      harness.assertEqual(await canAccessBooking(member, view, f.lumina.id, foreign.id), false, "VIEW: another studio booking");
      harness.assertEqual(await canAccessBooking(member, view, f.lumina.id, "does-not-exist"), false, "VIEW: nonexistent booking");
      harness.assertEqual(await canAccessBooking(member, own, f.lumina.id, mine.id), true, "OWN: assigned");
      harness.assertEqual(await canAccessBooking(member, own, f.lumina.id, other.id), false, "OWN: not assigned");
      harness.assertEqual(await canAccessBooking(member, own, f.lumina.id, foreign.id), false, "OWN: another studio booking");
      harness.assertEqual(await canAccessBooking(member, none, f.lumina.id, mine.id), false, "NONE: never");
    });
  });

  await harness.test("T24-ACCESS-09: canAccessProject checks the studio, the lead and the booking assignment", async () => {
    await withFixture(async (f) => {
      const member = await f.mkMember("p", null);
      const assignedBooking = await f.mkBooking(f.lumina.id, "assigned");
      const otherBooking = await f.mkBooking(f.lumina.id, "unassigned");
      await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: assignedBooking.id, userId: member.id } });
      const led = await f.mkProject(f.lumina.id, "led", member.id);
      const viaBooking = await f.mkProject(f.lumina.id, "via", f.luminaOwner.id, assignedBooking.id);
      const unrelated = await f.mkProject(f.lumina.id, "unrelated", f.luminaOwner.id, otherBooking.id);
      const foreign = await f.mkProject(f.apex.id, "foreign", f.apexOwner.id);
      const own = parseAccess(accessJson({ galleries: "OWN" }));
      const view = parseAccess(accessJson({ galleries: "VIEW" }));
      harness.assertEqual(await canAccessProject(member, own, f.lumina.id, led.id), true, "OWN: studio lead");
      harness.assertEqual(await canAccessProject(member, own, f.lumina.id, viaBooking.id), true, "OWN: assigned to the project booking");
      harness.assertEqual(await canAccessProject(member, own, f.lumina.id, unrelated.id), false, "OWN: neither");
      harness.assertEqual(await canAccessProject(member, own, f.lumina.id, foreign.id), false, "OWN: another studio project");
      harness.assertEqual(await canAccessProject(member, view, f.lumina.id, unrelated.id), true, "VIEW sees any project of the studio");
      harness.assertEqual(await canAccessProject(member, view, f.lumina.id, foreign.id), false, "VIEW: another studio project");
      harness.assertEqual(await canAccessProject(member, view, f.lumina.id, "does-not-exist"), false, "VIEW: nonexistent project");
    });
  });
}

interface Fixture {
  lumina: { id: string };
  apex: { id: string };
  luminaOwner: { id: string; email: string; name: string; role: string; tenantId: string | null };
  apexOwner: { id: string; email: string; name: string; role: string; tenantId: string | null };
  superAdmin: { id: string; email: string; name: string; role: string; tenantId: string | null };
  mkRole: (name: string, access: string) => Promise<string>;
  mkMember: (label: string, teamRoleId: string | null) => Promise<{ id: string; email: string; name: string; role: string; tenantId: string | null }>;
  mkBooking: (tenantId: string, label: string) => Promise<{ id: string }>;
  mkProject: (tenantId: string, label: string, leadId: string, bookingId?: string) => Promise<{ id: string }>;
}
