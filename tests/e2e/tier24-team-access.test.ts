/**
 * Tier 24: Team, roles, access and shoot assignments
 * - Schema: team roles, per-person extras and booking assignments are stored
 */

import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { COOKIE_NAME, withRequest, withSession } from "./mocks/session";
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
import { canAccessClientRecord } from "@/lib/auth/project-access";
import { updateClientNotes } from "@/lib/actions/admin-clients";
import { createGearItem } from "@/lib/actions/gear";
import {
  createTeamRole,
  deleteTeamRole,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
  restoreTeamMember,
  updateTeamMember,
  updateTeamRole,
} from "@/lib/actions/admin-team";
import { teamMemberStatus } from "@/lib/team/status";
import { loadTeamMembers } from "@/lib/team/members";
import { getNotificationHistory } from "@/lib/notifications";
import { getCurrentUser, loginWithCredentials } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { requestPasswordReset, resetPassword } from "@/lib/actions/password-reset";
import { recordSessionOutcome, rescheduleBooking } from "@/lib/actions/admin-booking-lifecycle";
import { deleteDeliverableItem, notifyClientPhotosReady, updateProjectStatus } from "@/lib/actions/admin-projects";
import { submitRetouchNote, toggleClientFavorite } from "@/lib/actions/vault";
import { studioNow } from "@/lib/slot-time";
import { saveShippingZones } from "@/lib/actions/admin-shipping";
import { recordInvoicePayment, sendInvoiceReminder } from "@/lib/actions/admin-invoices";
import { createServicePackage } from "@/lib/actions/admin-services";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { processInvoicePayment } from "@/lib/actions/checkout";
import { getProposalBySlugAndId, toggleProposalAddOn } from "@/lib/actions/proposals";
import { NextRequest } from "next/server";
import { getBookingDetails } from "@/lib/actions/admin-bookings";
import { loadAdminBookings } from "@/lib/bookings/admin-list";
import { loadAdminProjects } from "@/lib/projects/list";
import { visibleNavItems, type AdminNavEntry } from "@/components/admin/admin-nav-items";
import { NoAccess } from "@/components/admin/no-access";
import { POST as uploadDeliverables } from "@/app/api/deliverables/route";
import { POST as uploadFile } from "@/app/api/upload/route";
import AdminProjectsPage from "@/app/[tenantSlug]/admin/projects/page";
import ProjectVaultPage from "@/app/[tenantSlug]/vault/[projectId]/page";
import AdminBookingPage from "@/app/[tenantSlug]/admin/bookings/[bookingId]/page";
import AdminProjectPage from "@/app/[tenantSlug]/admin/projects/[projectId]/page";
import AdminClientPage from "@/app/[tenantSlug]/admin/clients/[clientId]/page";
import InventoryPage from "@/app/[tenantSlug]/admin/inventory/page";
import { loadClientDirectory, loadClientProfile } from "@/lib/client-directory";
import AdminCalendarPage from "@/app/[tenantSlug]/admin/calendar/page";
import AdminClientsPage from "@/app/[tenantSlug]/admin/clients/page";
import { quarantineGearItem, releaseGearFromMaintenance } from "@/lib/actions/gear";
import { projectPagePowers } from "@/lib/auth/page-powers";
import { findProp, provideReactGlobal } from "./react-tree";

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
      // A removed account's session ends outright, so the refusal is "sign in" rather than "forbidden".
      harness.assert(!!gone && gone.startsWith("UNAUTHENTICATED:"), `deactivated member refused as signed out: ${gone}`);
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

  // ---- Every admin action decides access through the access model ------------------------
  await harness.test("T24-ACCESS-10: every admin action checks access", async () => {
    const dir = path.join(process.cwd(), "lib", "actions");
    const files = (await fs.readdir(dir)).filter(
      (f) => /^admin-.*\.ts$/.test(f) || ["gear.ts", "logistics.ts", "print-orders.ts", "onboarding-guide.ts"].includes(f)
    );
    /** Exports that use another guard, and which one. */
    const OTHER_GUARD: Record<string, RegExp> = {
      // Any team member marks their own tour as seen.
      "onboarding-guide.ts#markTourSeen": /requireStaffBySlug\(/,
      // Also for the project's client (lib/auth/project-access checks the team's Production access).
      "logistics.ts#submitDigitalRelease": /requireRecordAccess\(/,
      // Owner-only through the file's assertOwner helper, which wraps requireOwner (checked below).
      "admin-payments.ts#saveGatewayCredentials": /assertOwner\(/,
      "admin-payments.ts#removeGatewayCredentials": /assertOwner\(/,
    };
    const payments = await fs.readFile(path.join(dir, "admin-payments.ts"), "utf8");
    harness.assert(/async function assertOwner[\s\S]*?await requireOwner\(/.test(payments), "admin-payments assertOwner wraps requireOwner");
    const unchecked: string[] = [];
    let total = 0;
    for (const file of files) {
      const src = await fs.readFile(path.join(dir, file), "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
      for (const node of sf.statements) {
        if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) continue;
        const mods = ts.getModifiers(node) ?? [];
        const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        const isAsync = mods.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        if (!exported || !isAsync) continue;
        total += 1;
        const key = `${file}#${node.name.text}`;
        const body = node.body.getText(sf);
        const ok = OTHER_GUARD[key] ? OTHER_GUARD[key].test(body) : /\b(requireAccess|requireOwnOrManage|requireTick|requireOwner)\(/.test(body);
        if (!ok) unchecked.push(key);
      }
    }
    harness.assert(total > 60, `Scanned ${total} actions`);
    harness.assert(unchecked.length === 0, "every action calls requireAccess, requireOwnOrManage, requireTick or requireOwner", `Unchecked: ${unchecked.join(", ")}`);

    const ownerRoleUsers: string[] = [];
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith(".ts")) continue;
      if ((await fs.readFile(path.join(dir, file), "utf8")).includes("OWNER_ROLES")) ownerRoleUsers.push(file);
    }
    harness.assert(ownerRoleUsers.length === 0, "no action references OWNER_ROLES", `Found in: ${ownerRoleUsers.join(", ")}`);
  });

  /** Refused: threw an AuthorizationError, or returned a failure that says so. */
  const refusedResult = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      const res = (await fn()) as { success?: boolean; error?: unknown; message?: unknown } | null;
      if (res && res.success === false && /FORBIDDEN|not allowed|don't have/i.test(`${String(res.error)} ${String(res.message)}`)) return null;
      return `not refused: ${JSON.stringify(res)}`;
    } catch (e) {
      return e instanceof AuthorizationError ? null : `threw ${String(e)}`;
    }
  };

  await harness.test("T24-ACCESS-11: a role without access is refused on the server", async () => {
    await withFixture(async (f) => {
      const none = accessJson({
        bookings: "NONE", galleries: "NONE", production: "NONE", printOrders: "NONE", clients: "NONE",
        proposals: "NONE", invoices: "NONE", services: "NONE", catalog: "NONE",
      });
      const member = await f.mkMember("none", await f.mkRole("Nothing", none));
      const s = sess(member, "lumina-cine");
      const t = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const invoice = await db.milestoneInvoice.findFirst({ where: { tenantId: f.lumina.id } });
      const zonesBefore = await db.shippingZone.count({ where: { tenantId: f.lumina.id } });
      const sku = `T24-NONE-${Date.now()}`;

      const calls: Array<[string, () => Promise<unknown>]> = [
        ["updateClientNotes", () => updateClientNotes({ ...t, clientId: client.id, notes: "T24 should not save" })],
        ["createGearItem", () => createGearItem({ ...t, name: "T24 lens", sku, category: "LENS" })],
        ["saveShippingZones", () => saveShippingZones({ ...t, zones: [] })],
        ["sendInvoiceReminder", () => sendInvoiceReminder({ ...t, invoiceId: invoice?.id ?? "does-not-exist" })],
      ];
      for (const [name, call] of calls) {
        const why = await refusedResult(() => withSession(s, call));
        harness.assert(why === null, `${name} refused`, why ?? "");
      }
      // Client records (vault, proposals, releases) check the team's area too.
      const project = await f.mkProject(f.lumina.id, "none", f.luminaOwner.id);
      for (const record of [{ area: "galleries" as const, projectId: project.id }, { area: "proposals" as const }, { area: "production" as const }]) {
        harness.assertEqual(await canAccessClientRecord(s, f.lumina.id, client.id, record), false, `no ${record.area} record access`);
        harness.assertEqual(await canAccessClientRecord(sess(f.luminaOwner, "lumina-cine"), f.lumina.id, client.id, record), true, `owner opens ${record.area}`);
      }

      const clientAfter = await db.user.findUniqueOrThrow({ where: { id: client.id } });
      harness.assertEqual(clientAfter.staffNotes, client.staffNotes, "client notes unchanged");
      harness.assertEqual(await db.inventoryItem.count({ where: { sku } }), 0, "no gear item created");
      harness.assertEqual(await db.shippingZone.count({ where: { tenantId: f.lumina.id } }), zonesBefore, "shipping zones unchanged");
    });
  });

  await harness.test("T24-ACCESS-12: ticks grant exactly the money powers", async () => {
    await withFixture(async (f) => {
      const member = await f.mkMember("prices", await f.mkRole("Pricer", accessJson(LEGACY_TEAM_ACCESS.areas, { setPrices: true })));
      const s = sess(member, "lumina-cine");
      const t = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const name = `T24 package ${Date.now()}`;
      try {
        const pkg = await withSession(s, () =>
          createServicePackage({
            ...t, name, category: "commercial", discipline: "PHOTOGRAPHY", price: 100, depositPrice: 50,
            turnaround: "1 week", description: "Made by a member with setPrices", deliverables: "Photos", isFeatured: false,
          })
        );
        harness.assertEqual(pkg.success, true, "setPrices can create a package", JSON.stringify(pkg));

        const missing = { ...t, invoiceId: "does-not-exist" };
        const record = await withSession(s, () => recordInvoicePayment({ ...missing, method: "CASH" }));
        harness.assert(record.success === false && /FORBIDDEN|don't have/.test(record.message), "recordInvoicePayment refused", JSON.stringify(record));
        const approve = await withSession(s, () => approvePaymentVerification(missing));
        harness.assert(approve.success === false && /FORBIDDEN|don't have/.test(String(approve.message)), "approvePaymentVerification refused", JSON.stringify(approve));

        // The owner reaches the lookup with the same input, so the refusals above came from the access check.
        const owner = sess(f.luminaOwner, "lumina-cine");
        const ownerRecord = await withSession(owner, () => recordInvoicePayment({ ...missing, method: "CASH" }));
        harness.assertEqual(ownerRecord.success === false ? ownerRecord.error : "ok", "NOT_FOUND", "owner gets past the check");
      } finally {
        await db.servicePackage.deleteMany({ where: { tenantId: f.lumina.id, name } });
      }
    });
  });

  // ---- Money and write paths reached through other actions ---------------------------------
  /** A CUSTOM invoice for a seeded lumina client, removed by the caller. */
  const mkInvoice = async (tenantId: string, clientId: string, tag: string, status: string) =>
    db.milestoneInvoice.create({
      data: {
        tenantId, invoiceNumber: `T24-${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, clientId,
        milestoneType: "CUSTOM", description: "T24", amount: 50, status, dueDate: new Date(Date.now() + 7 * 86400000),
        ...(status === "PENDING_VERIFICATION" ? { paymentMethod: "QR_CODE", paymentProofUrl: "/uploads/receipts/t24.jpg" } : {}),
      },
    });

  await harness.test("T24-ACCESS-13: recording a payment over a slip under review also needs approvePayments", async () => {
    await withFixture(async (f) => {
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const recorder = await f.mkMember("recorder", await f.mkRole("Recorder", accessJson(LEGACY_TEAM_ACCESS.areas, { recordPayments: true })));
      const both = await f.mkMember("both", await f.mkRole("Both", accessJson(LEGACY_TEAM_ACCESS.areas, { recordPayments: true, approvePayments: true })));
      const t = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const ids: string[] = [];
      try {
        const slip = await mkInvoice(f.lumina.id, client.id, "SLIP", "PENDING_VERIFICATION");
        ids.push(slip.id);
        const refused = await withSession(sess(recorder, "lumina-cine"), () => recordInvoicePayment({ ...t, invoiceId: slip.id, method: "CASH" }));
        harness.assertEqual(refused.success === false ? refused.error : "ok", "SLIP_PENDING", "recordPayments alone can't record over a slip");
        harness.assertEqual(
          refused.success === false ? refused.message : "",
          "A payment slip is waiting for review. Approve or reject it in Verification.",
          "message"
        );
        const after = await db.milestoneInvoice.findUniqueOrThrow({ where: { id: slip.id } });
        harness.assertEqual(after.status, "PENDING_VERIFICATION", "slip still under review");
        harness.assertEqual(after.paymentMethod, "QR_CODE", "payment method unchanged");

        const pending = await mkInvoice(f.lumina.id, client.id, "PEND", "PENDING");
        ids.push(pending.id);
        const recorded = await withSession(sess(recorder, "lumina-cine"), () => recordInvoicePayment({ ...t, invoiceId: pending.id, method: "CASH" }));
        harness.assertEqual(recorded.success, true, "recordPayments records a payment on an unpaid invoice", JSON.stringify(recorded));
        harness.assertEqual((await db.milestoneInvoice.findUniqueOrThrow({ where: { id: pending.id } })).status, "PAID", "recorded invoice is paid");

        const ok = await withSession(sess(both, "lumina-cine"), () => recordInvoicePayment({ ...t, invoiceId: slip.id, method: "CASH" }));
        harness.assertEqual(ok.success, true, "with approvePayments too, the slip can be recorded", JSON.stringify(ok));
        harness.assertEqual((await db.milestoneInvoice.findUniqueOrThrow({ where: { id: slip.id } })).status, "PAID", "slip invoice now paid");
      } finally {
        await db.milestoneInvoice.deleteMany({ where: { id: { in: ids } } });
      }
    });
  });

  await harness.test("T24-ACCESS-14: paying an invoice for a client needs recordPayments; the client still pays their own", async () => {
    await withFixture(async (f) => {
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const noTick = await f.mkMember("payer-no", await f.mkRole("Payer no", FULL_NO_TICKS));
      const withTick = await f.mkMember("payer-yes", await f.mkRole("Payer yes", accessJson(LEGACY_TEAM_ACCESS.areas, { recordPayments: true })));
      const ids: string[] = [];
      try {
        const inv = await mkInvoice(f.lumina.id, client.id, "PAY", "PENDING");
        ids.push(inv.id);
        const pay = { tenantId: f.lumina.id, tenantSlug: "lumina-cine", invoiceId: inv.id, paymentMethod: "QR_CODE" as const, paymentProofUrl: "/uploads/receipts/t24-team.jpg" };
        const refused = await withSession(sess(noTick, "lumina-cine"), () => processInvoicePayment(pay));
        harness.assert(refused.success === false && /FORBIDDEN/.test(String(refused.message)), "team without recordPayments refused", JSON.stringify(refused));
        const after = await db.milestoneInvoice.findUniqueOrThrow({ where: { id: inv.id } });
        harness.assertEqual(after.status, "PENDING", "invoice status unchanged");
        harness.assertEqual(after.paymentProofUrl, null, "no slip attached");

        const ok = await withSession(sess(withTick, "lumina-cine"), () => processInvoicePayment(pay));
        harness.assertEqual(ok.success, true, "team with recordPayments sends the slip", JSON.stringify(ok));
        harness.assertEqual((await db.milestoneInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PENDING_VERIFICATION", "slip under review");

        const own = await mkInvoice(f.lumina.id, client.id, "OWN", "PENDING");
        ids.push(own.id);
        const mine = await withSession(sess(client, "lumina-cine"), () => processInvoicePayment({ ...pay, invoiceId: own.id }));
        harness.assertEqual(mine.success, true, "the client pays their own invoice", JSON.stringify(mine));
      } finally {
        await db.milestoneInvoice.deleteMany({ where: { id: { in: ids } } });
      }
    });
  });

  await harness.test("T24-ACCESS-15: Proposals VIEW reads a proposal but only MANAGE (or its client) changes add-ons", async () => {
    await withFixture(async (f) => {
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const viewer = await f.mkMember("prop-view", await f.mkRole("Prop view", accessJson({ proposals: "VIEW" })));
      const manager = await f.mkMember("prop-manage", await f.mkRole("Prop manage", accessJson({ proposals: "MANAGE" })));
      const proposal = await db.proposal.create({
        data: {
          tenantId: f.lumina.id, clientId: client.id, studioId: f.luminaOwner.id, proposalNumber: `T24-${Date.now().toString(36)}-P`,
          title: "T24 proposal", discipline: "PHOTOGRAPHY", basePrice: 1000, totalPrice: 1000, depositAmount: 500,
          finalBalanceAmount: 500, contractTerms: "Standard terms for the T24 test proposal.", status: "SENT",
        },
      });
      try {
        const addOn = await db.proposalAddOn.create({ data: { proposalId: proposal.id, name: "Extra", description: "Extra hour", price: 50, unit: "fixed", isSelected: false } });
        const input = { proposalId: proposal.id, addOnId: addOn.id, isSelected: true };

        const read = await withSession(sess(viewer, "lumina-cine"), () => getProposalBySlugAndId("lumina-cine", proposal.id));
        harness.assertEqual(read?.id, proposal.id, "Proposals VIEW can read it");
        const refused = await withSession(sess(viewer, "lumina-cine"), () => toggleProposalAddOn(input));
        harness.assert(refused.success === false && /FORBIDDEN/.test(String(refused.error)), "Proposals VIEW can't change add-ons", JSON.stringify(refused));
        harness.assertEqual((await db.proposalAddOn.findUniqueOrThrow({ where: { id: addOn.id } })).isSelected, false, "add-on unchanged");

        const ok = await withSession(sess(manager, "lumina-cine"), () => toggleProposalAddOn(input));
        harness.assertEqual(ok.success, true, "Proposals MANAGE changes add-ons", JSON.stringify(ok));
        harness.assertEqual((await db.proposalAddOn.findUniqueOrThrow({ where: { id: addOn.id } })).isSelected, true, "add-on selected");

        const mine = await withSession(sess(client, "lumina-cine"), () => toggleProposalAddOn({ ...input, isSelected: false }));
        harness.assertEqual(mine.success, true, "the proposal's client changes their add-ons", JSON.stringify(mine));
      } finally {
        await db.proposalAddOn.deleteMany({ where: { proposalId: proposal.id } });
        await db.proposal.deleteMany({ where: { id: proposal.id } });
      }
    });
  });

  // ---- Pages, menu and "Only their own" lists ----------------------------------------------
  /** A member with bookings OWN and galleries OWN, assigned to one booking, plus work that isn't theirs. */
  const ownSetup = async (f: Fixture) => {
    const member = await f.mkMember("own", await f.mkRole("Own lists", accessJson({ bookings: "OWN", galleries: "OWN" })));
    const mine = await f.mkBooking(f.lumina.id, "own-mine");
    const other = await f.mkBooking(f.lumina.id, "own-other");
    await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: mine.id, userId: member.id } });
    const viaBooking = await f.mkProject(f.lumina.id, "own-via", f.luminaOwner.id, mine.id);
    const led = await f.mkProject(f.lumina.id, "own-led", member.id);
    const unrelated = await f.mkProject(f.lumina.id, "own-unrelated", f.luminaOwner.id, other.id);
    const access = await loadAccess(member);
    return { member, mine, other, viaBooking, led, unrelated, access };
  };

  await harness.test("T24-OWN-01: an Only-their-own member's lists hold only their work", async () => {
    await withFixture(async (f) => {
      const o = await ownSetup(f);
      const viewer = { id: o.member.id, access: o.access };

      const bookings = await loadAdminBookings(f.lumina.id, viewer);
      harness.assertEqual(JSON.stringify(bookings.map((b) => b.id)), JSON.stringify([o.mine.id]), "bookings: exactly the assigned one");

      const projects = (await loadAdminProjects(f.lumina.id, viewer, { money: false })).map((p) => p.id).sort();
      harness.assertEqual(JSON.stringify(projects), JSON.stringify([o.viaBooking.id, o.led.id].sort()), "projects: the assigned booking's and the led one");

      // VIEW and the owner see the whole studio.
      const ownerView = { id: f.luminaOwner.id, access: FULL_ACCESS };
      const allBookings = (await loadAdminBookings(f.lumina.id, ownerView)).map((b) => b.id);
      harness.assert(allBookings.includes(o.mine.id) && allBookings.includes(o.other.id), "owner sees every booking");
      const allProjects = (await loadAdminProjects(f.lumina.id, ownerView, { money: false })).map((p) => p.id);
      harness.assert([o.viaBooking.id, o.led.id, o.unrelated.id].every((id) => allProjects.includes(id)), "owner sees every project");
      const viewAccess = parseAccess(accessJson({ bookings: "VIEW", galleries: "VIEW" }));
      const viewBookings = (await loadAdminBookings(f.lumina.id, { id: o.member.id, access: viewAccess })).map((b) => b.id);
      harness.assert(viewBookings.includes(o.other.id), "bookings VIEW sees unassigned bookings");
      const none = await loadAdminBookings(f.lumina.id, { id: o.member.id, access: NO_ACCESS });
      harness.assertEqual(none.length, 0, "no bookings access: empty list");
    });
  });

  await harness.test("T24-OWN-02: they can't reach anyone else's work", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const o = await ownSetup(f);
      const s = sess(o.member, "lumina-cine");

      const theirs = await withSession(s, () => getBookingDetails({ tenantId: f.lumina.id, bookingId: o.mine.id }));
      harness.assertEqual(theirs.success, true, "their booking's details open", JSON.stringify(theirs));
      const others = await withSession(s, () => getBookingDetails({ tenantId: f.lumina.id, bookingId: o.other.id }));
      harness.assertEqual(others.success, false, "an unassigned booking's details are refused");

      harness.assertEqual(await canAccessProject(o.member, o.access, f.lumina.id, o.unrelated.id), false, "another gallery is closed");

      const upload = (projectId: string) => {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("files", new File(["x"], "a.png", { type: "image/png" }));
        return withSession(s, () => uploadDeliverables(new NextRequest("http://localhost:3000/api/deliverables", { method: "POST", body: form })));
      };
      harness.assertEqual((await upload(o.unrelated.id)).status, 403, "uploading to another project is refused");

      // The pages answer the same way.
      const bookingPage = await withSession(s, () =>
        AdminBookingPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", bookingId: o.other.id }) })
      );
      harness.assertEqual((bookingPage as { type?: unknown }).type, NoAccess, "unassigned booking page shows No access");
      const projectPage = await withSession(s, () =>
        AdminProjectPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: o.unrelated.id }) })
      );
      harness.assertEqual((projectPage as { type?: unknown }).type, NoAccess, "another project's page shows No access");
      const ownPage = await withSession(s, () =>
        AdminProjectPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: o.led.id }) })
      );
      harness.assert((ownPage as { type?: unknown }).type !== NoAccess, "their own project's page opens");
    });
  });

  // ---- Changing work: View is read-only, Only-their-own changes only theirs, Manage changes any ----
  /** A member at each level of Bookings and Galleries; a booking and gallery of the OWN member's, and someone else's. */
  const workSetup = async (f: Fixture) => {
    const view = await f.mkMember("work-view", await f.mkRole("Work view", accessJson({ bookings: "VIEW", galleries: "VIEW" })));
    const own = await f.mkMember("work-own", await f.mkRole("Work own", accessJson({ bookings: "OWN", galleries: "OWN" })));
    const manage = await f.mkMember("work-manage", await f.mkRole("Work manage", accessJson({ bookings: "MANAGE", galleries: "MANAGE" })));
    const mine = await f.mkBooking(f.lumina.id, "work-mine");
    const other = await f.mkBooking(f.lumina.id, "work-other");
    await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: mine.id, userId: own.id } });
    const ownProject = await f.mkProject(f.lumina.id, "work-own", f.luminaOwner.id, mine.id);
    const otherProject = await f.mkProject(f.lumina.id, "work-other", f.luminaOwner.id, other.id);
    return { view, own, manage, mine, other, ownProject, otherProject };
  };
  const addPhoto = async (projectId: string, title: string) => {
    const album = await db.clientDeliverable.create({
      data: {
        projectId, title: "T24 work", discipline: "PHOTOGRAPHY",
        items: { create: { title, itemType: "PHOTO", previewUrl: "https://example.test/p.jpg", downloadUrl: "https://example.test/m.jpg" } },
      },
      include: { items: true },
    });
    return album.items[0]!;
  };
  /** Allowed: returned success (anything else is reported). */
  const allowedResult = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      const res = (await fn()) as { success?: boolean } | null;
      return res?.success === true ? null : `not allowed: ${JSON.stringify(res)}`;
    } catch (e) {
      return `threw ${String(e)}`;
    }
  };

  await harness.test("T24-WORK-01: gallery work needs Only-their-own on their own gallery, or Manage; View is refused", async () => {
    await withFixture(async (f) => {
      const w = await workSetup(f);
      const t = f.lumina.id;
      const as = (u: Row, fn: () => Promise<unknown>) => () => withSession(sess(u, "lumina-cine"), fn);
      const project = (id: string) => db.project.findUniqueOrThrow({ where: { id } });

      // Change the stage.
      const stage = (u: Row, projectId: string) => as(u, () => updateProjectStatus({ tenantId: t, projectId, status: "POST_PRODUCTION" }));
      for (const [label, call] of [["View", stage(w.view, w.otherProject.id)], ["Own, someone else's", stage(w.own, w.otherProject.id)]] as const) {
        const why = await refusedResult(call);
        harness.assert(why === null, `updateProjectStatus refused: ${label}`, why ?? "");
      }
      harness.assertEqual((await project(w.otherProject.id)).status, "PRE_PRODUCTION", "the stage is unchanged after the refusals");
      harness.assertEqual(await allowedResult(stage(w.own, w.ownProject.id)), null, "updateProjectStatus: Own, their own");
      harness.assertEqual((await project(w.ownProject.id)).status, "POST_PRODUCTION", "their own gallery moved on");
      harness.assertEqual(await allowedResult(stage(w.manage, w.otherProject.id)), null, "updateProjectStatus: Manage, any");

      // Remove a photo.
      const otherPhoto = await addPhoto(w.otherProject.id, "other");
      const ownPhoto = await addPhoto(w.ownProject.id, "own");
      const remove = (u: Row, itemId: string) => as(u, () => deleteDeliverableItem({ tenantId: t, itemId }));
      for (const [label, call] of [["View", remove(w.view, otherPhoto.id)], ["Own, someone else's", remove(w.own, otherPhoto.id)]] as const) {
        const why = await refusedResult(call);
        harness.assert(why === null, `deleteDeliverableItem refused: ${label}`, why ?? "");
      }
      harness.assert(!!(await db.deliverableItem.findUnique({ where: { id: otherPhoto.id } })), "the photo is still there after the refusals");
      harness.assertEqual(await allowedResult(remove(w.own, ownPhoto.id)), null, "deleteDeliverableItem: Own, their own");
      harness.assertEqual(await allowedResult(remove(w.manage, otherPhoto.id)), null, "deleteDeliverableItem: Manage, any");
      harness.assertEqual(await db.deliverableItem.count({ where: { id: { in: [ownPhoto.id, otherPhoto.id] } } }), 0, "both removed by those allowed");

      // Tell the client the photos are ready.
      await addPhoto(w.otherProject.id, "other again");
      await addPhoto(w.ownProject.id, "own again");
      await db.project.updateMany({ where: { id: { in: [w.ownProject.id, w.otherProject.id] } }, data: { status: "PRE_PRODUCTION" } });
      const notify = (u: Row, projectId: string) => as(u, () => notifyClientPhotosReady({ tenantId: t, projectId }));
      for (const [label, call] of [["View", notify(w.view, w.otherProject.id)], ["Own, someone else's", notify(w.own, w.otherProject.id)]] as const) {
        const why = await refusedResult(call);
        harness.assert(why === null, `notifyClientPhotosReady refused: ${label}`, why ?? "");
      }
      harness.assertEqual((await project(w.otherProject.id)).status, "PRE_PRODUCTION", "no message sent, the stage is unchanged");
      harness.assertEqual(await allowedResult(notify(w.own, w.ownProject.id)), null, "notifyClientPhotosReady: Own, their own");
      harness.assertEqual(await allowedResult(notify(w.manage, w.otherProject.id)), null, "notifyClientPhotosReady: Manage, any");

      // Upload photos (/api/deliverables) and the file upload's deliverables folder (/api/upload).
      const upload = (u: Row, projectId: string) => {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("files", new File(["x"], "a.png", { type: "image/png" }));
        return withSession(sess(u, "lumina-cine"), () => uploadDeliverables(new NextRequest("http://localhost:3000/api/deliverables", { method: "POST", body: form })));
      };
      harness.assertEqual((await upload(w.view, w.otherProject.id)).status, 403, "/api/deliverables: View refused");
      harness.assertEqual((await upload(w.own, w.otherProject.id)).status, 403, "/api/deliverables: Own, someone else's refused");
      harness.assertEqual((await upload(w.own, w.ownProject.id)).status, 200, "/api/deliverables: Own, their own");
      harness.assertEqual((await upload(w.manage, w.otherProject.id)).status, 200, "/api/deliverables: Manage, any");

      const fileUpload = async (u: Row) => {
        const form = new FormData();
        form.append("folder", "deliverables");
        form.append("file", new File(["x"], "a.png", { type: "image/png" }));
        const res = await withSession(sess(u, "lumina-cine"), () => uploadFile(new NextRequest("http://localhost:3000/api/upload", { method: "POST", body: form })));
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        if (body.url) await fs.rm(path.join(process.cwd(), "public", body.url), { force: true });
        return res.status;
      };
      harness.assertEqual(await fileUpload(w.view), 403, "/api/upload deliverables folder: View refused");
      harness.assertEqual(await fileUpload(w.own), 201, "/api/upload deliverables folder: Own");
      harness.assertEqual(await fileUpload(w.manage), 201, "/api/upload deliverables folder: Manage");
    });
  });

  await harness.test("T24-WORK-02: marking a session done or no-show needs their own booking at Only-their-own, or Manage", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const w = await workSetup(f);
      const yesterday = new Date(Date.parse(`${studioNow().dateKey}T00:00:00Z`) - 86_400_000);
      const slotIds: string[] = [];
      try {
        // Both bookings confirmed, with a session that has already started.
        for (const b of [w.mine, w.other]) {
          const slot = await db.bookingSlot.create({
            data: { tenantId: f.lumina.id, date: yesterday, startTime: "10:00 AM", endTime: "11:00 AM", status: "BOOKED" },
          });
          slotIds.push(slot.id);
          await db.clientBooking.update({ where: { id: b.id }, data: { slotId: slot.id, status: "CONFIRMED" } });
        }
        const outcome = (u: Row, bookingId: string, o: "COMPLETED" | "NO_SHOW") => () =>
          withSession(sess(u, "lumina-cine"), () => recordSessionOutcome({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", bookingId, outcome: o }));
        const status = async (id: string) => (await db.clientBooking.findUniqueOrThrow({ where: { id } })).status;

        for (const [label, call] of [
          ["View, done", outcome(w.view, w.other.id, "COMPLETED")],
          ["View, no-show", outcome(w.view, w.other.id, "NO_SHOW")],
          ["Own, someone else's", outcome(w.own, w.other.id, "COMPLETED")],
        ] as const) {
          const why = await refusedResult(call);
          harness.assert(why === null, `recordSessionOutcome refused: ${label}`, why ?? "");
        }
        harness.assertEqual(await status(w.other.id), "CONFIRMED", "the booking is unchanged after the refusals");
        harness.assertEqual(await allowedResult(outcome(w.own, w.mine.id, "COMPLETED")), null, "recordSessionOutcome: Own, their own");
        harness.assertEqual(await status(w.mine.id), "COMPLETED", "their own session is done");
        harness.assertEqual(await allowedResult(outcome(w.manage, w.other.id, "NO_SHOW")), null, "recordSessionOutcome: Manage, any");
        harness.assertEqual(await status(w.other.id), "NO_SHOW", "Manage recorded the no-show");

        // The booking page offers the buttons only to those allowed, and "Create gallery" only at Galleries Manage.
        await db.clientBooking.updateMany({ where: { id: { in: [w.mine.id, w.other.id] } }, data: { status: "CONFIRMED" } });
        type Powers = { canRecordOutcome: boolean; canCreateGallery: boolean };
        const powers = async (u: Row, bookingId: string) =>
          findProp<Powers>(
            await withSession(sess(u, "lumina-cine"), () => AdminBookingPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", bookingId }) })),
            "actionPowers"
          );
        const viewPowers = await powers(w.view, w.other.id);
        harness.assert(!!viewPowers && !viewPowers.canRecordOutcome && !viewPowers.canCreateGallery, "View: no done / no-show, no Create gallery", JSON.stringify(viewPowers));
        const ownPowers = await powers(w.own, w.mine.id);
        harness.assert(!!ownPowers && ownPowers.canRecordOutcome && !ownPowers.canCreateGallery, "Own: done / no-show on their booking", JSON.stringify(ownPowers));
        const managePowers = await powers(w.manage, w.other.id);
        harness.assert(!!managePowers && managePowers.canRecordOutcome && managePowers.canCreateGallery, "Manage: both", JSON.stringify(managePowers));
      } finally {
        await db.clientBooking.updateMany({ where: { slotId: { in: slotIds } }, data: { slotId: null } });
        await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
      }
    });
  });

  await harness.test("T24-WORK-03: vault favourites and retouch notes: the client, or the team at Only-their-own (theirs) or Manage", async () => {
    await withFixture(async (f) => {
      const w = await workSetup(f);
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      await db.project.updateMany({ where: { id: { in: [w.ownProject.id, w.otherProject.id] } }, data: { clientId: client.id } });
      const otherPhoto = await addPhoto(w.otherProject.id, "vault other");
      const ownPhoto = await addPhoto(w.ownProject.id, "vault own");
      const fav = (u: Row, itemId: string) => () => withSession(sess(u, "lumina-cine"), () => toggleClientFavorite({ itemId, isFav: true }));
      const note = (u: Row, itemId: string) => () => withSession(sess(u, "lumina-cine"), () => submitRetouchNote({ itemId, note: "T24 note" }));
      const denied = async (fn: () => Promise<unknown>) => {
        const res = (await fn()) as { success: boolean; error?: string };
        return res.success === false && /FORBIDDEN/.test(res.error ?? "");
      };

      for (const [label, u, itemId] of [["View", w.view, otherPhoto.id], ["Own, someone else's", w.own, otherPhoto.id]] as const) {
        harness.assert(await denied(fav(u, itemId)), `favourite refused: ${label}`);
        harness.assert(await denied(note(u, itemId)), `retouch note refused: ${label}`);
      }
      const untouched = await db.deliverableItem.findUniqueOrThrow({ where: { id: otherPhoto.id } });
      harness.assert(!untouched.isClientFav && untouched.clientNotes === null, "the photo is unchanged after the refusals");
      // Reading the gallery stays open at View.
      const viewSess = sess(w.view, "lumina-cine");
      harness.assertEqual(await canAccessClientRecord(viewSess, f.lumina.id, client.id, { area: "galleries", projectId: w.otherProject.id }), true, "View still opens the gallery");

      harness.assertEqual(await allowedResult(fav(w.own, ownPhoto.id)), null, "favourite: Own, their own");
      harness.assertEqual(await allowedResult(note(w.manage, otherPhoto.id)), null, "retouch note: Manage, any");
      harness.assertEqual(await allowedResult(fav(client as Row, otherPhoto.id)), null, "favourite: the project's client");
      harness.assertEqual(await allowedResult(note(client as Row, otherPhoto.id)), null, "retouch note: the project's client");
      const after = await db.deliverableItem.findUniqueOrThrow({ where: { id: otherPhoto.id } });
      harness.assert(after.isClientFav && after.clientNotes === "T24 note", "the client's favourite and note are saved");
    });
  });

  /** Every href in the menu: top-level links and the items of each group. */
  const menuHrefs = (entries: AdminNavEntry[]) =>
    entries.flatMap((e) => (e.kind === "group" ? e.items.map((i) => i.href) : [e.href]));

  await harness.test("T24-MENU-01: the menu hides what they can't open", async () => {
    const crew = STARTER_ROLES.find((r) => r.name === "Crew")!.access;
    const crewMenu = visibleNavItems("lumina-cine", crew, false);
    const hrefs = menuHrefs(crewMenu);
    for (const hidden of ["invoices", "verification", "clients", "services", "settings", "calendar", "projects", "proposals"]) {
      harness.assert(!hrefs.includes(`/lumina-cine/admin/${hidden}`), `Crew menu has no ${hidden}`);
    }
    for (const shown of ["bookings", "inventory", "manual"]) {
      harness.assert(hrefs.includes(`/lumina-cine/admin/${shown}`), `Crew menu has ${shown}`);
    }
    harness.assert(hrefs.includes("/lumina-cine/admin"), "Crew menu has Overview");
    harness.assert(!crewMenu.some((e) => e.kind === "group" && e.id === "finance"), "the Finance group disappears when it's empty");
    harness.assert(!crewMenu.some((e) => e.kind === "group" && e.items.length === 0), "no empty groups");

    const ownerHrefs = menuHrefs(visibleNavItems("lumina-cine", FULL_ACCESS, true));
    for (const page of ["invoices", "verification", "clients", "services", "settings", "calendar", "projects", "frames", "cms", "print-orders"]) {
      harness.assert(ownerHrefs.includes(`/lumina-cine/admin/${page}`), `owner menu has ${page}`);
    }
    // Verification also opens with only the approvePayments tick.
    const approver = parseAccess(accessJson({}, { approvePayments: true }));
    const approverHrefs = menuHrefs(visibleNavItems("lumina-cine", approver, false));
    harness.assert(approverHrefs.includes("/lumina-cine/admin/verification"), "approvePayments shows Verification");
    harness.assert(!approverHrefs.includes("/lumina-cine/admin/invoices"), "but not Invoices");
    // Settings stays owner-only, even with every area.
    harness.assert(!menuHrefs(visibleNavItems("lumina-cine", FULL_ACCESS, false)).includes("/lumina-cine/admin/settings"), "Settings is owner-only");
  });

  await harness.test("T24-MENU-02: pages and components decide with the access model, not the owner role", async () => {
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = await fs.readFile(full, "utf8");
          if (/\bOWNER_ROLES\b|\bcurrentUserIsOwner\b|@\/lib\/auth\/owner\b/.test(src)) found.push(path.relative(process.cwd(), full));
        }
      }
    };
    await walk(path.join(process.cwd(), "app"));
    await walk(path.join(process.cwd(), "components"));
    harness.assert(found.length === 0, "no page or component uses OWNER_ROLES or currentUserIsOwner", `Found in: ${found.join(", ")}`);
    const ownerHelper = await fs.stat(path.join(process.cwd(), "lib", "auth", "owner.ts")).then(() => true, () => false);
    harness.assert(!ownerHelper, "lib/auth/owner.ts is removed");
  });

  // ---- Each part of a page follows its own area ---------------------------------------------
  /** Every element in a server-rendered tree whose props match. */
  const findElements = (node: unknown, match: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] => {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((n) => findElements(n, match));
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return [];
    return [...(match(props) ? [props] : []), ...findElements(props.children, match)];
  };
  const NO_MONEY = { bookings: "VIEW", galleries: "VIEW", clients: "VIEW", production: "VIEW" };
  const WITH_MONEY = { ...NO_MONEY, invoices: "VIEW", proposals: "VIEW" };

  await harness.test("T24-REDACT-01: booking money only with Invoices access", async () => {
    await withFixture(async (f) => {
      const deposit = await db.milestoneInvoice.findFirstOrThrow({
        where: { tenantId: f.lumina.id, milestoneType: "BOOKING_DEPOSIT", bookingId: { not: null }, booking: { sessionPrice: { not: null } } },
      });
      const bookingId = deposit.bookingId!;
      const noMoney = await f.mkMember("redact-b-no", await f.mkRole("Redact b no", accessJson(NO_MONEY)));
      const withMoney = await f.mkMember("redact-b-yes", await f.mkRole("Redact b yes", accessJson(WITH_MONEY)));

      const listed = (await loadAdminBookings(f.lumina.id, { id: noMoney.id, access: await loadAccess(noMoney) })).find((b) => b.id === bookingId)!;
      const popup = await withSession(sess(noMoney, "lumina-cine"), () => getBookingDetails({ tenantId: f.lumina.id, bookingId }));
      harness.assert(popup.success, "pop-up opens without Invoices access", JSON.stringify(popup));
      for (const [where, b] of [["list", listed], ["pop-up", popup.success ? popup.booking : null]] as const) {
        harness.assert(!!b, `${where}: booking found`);
        if (!b) continue;
        harness.assertEqual(b.money, false, `${where}: money flag off`);
        harness.assertEqual(b.sessionPrice, null, `${where}: no session price`);
        harness.assertEqual(b.depositAmount, 0, `${where}: no deposit amount`);
        harness.assertEqual(b.invoice, null, `${where}: no deposit invoice`);
        harness.assertEqual(b.balanceInvoice, null, `${where}: no balance invoice`);
        harness.assert(!JSON.stringify(b).includes(deposit.invoiceNumber), `${where}: invoice number absent`);
        harness.assertEqual(b.depositInvoiceStatus, deposit.status, `${where}: the status stays, for the stage`);
      }
      const page = await withSession(sess(noMoney, "lumina-cine"), () =>
        AdminBookingPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", bookingId }) })
      );
      const shown = findProp<{ money: boolean; invoice: unknown }>(page, "booking");
      harness.assert(shown?.money === false && shown.invoice === null, "booking page passes no money", JSON.stringify(shown?.invoice));

      const full = await withSession(sess(withMoney, "lumina-cine"), () => getBookingDetails({ tenantId: f.lumina.id, bookingId }));
      harness.assert(full.success && full.booking.money && full.booking.invoice?.invoiceNumber === deposit.invoiceNumber, "Invoices VIEW sees the invoice");
      harness.assert(full.success && full.booking.sessionPrice != null, "Invoices VIEW sees the session price");
    });
  });

  await harness.test("T24-REDACT-02: a project's budget, invoices and payment line only with Invoices access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const project = await db.project.findFirstOrThrow({ where: { tenantId: f.lumina.id, invoices: { some: {} } } });
      const noMoney = await f.mkMember("redact-p-no", await f.mkRole("Redact p no", accessJson(NO_MONEY)));
      const withMoney = await f.mkMember("redact-p-yes", await f.mkRole("Redact p yes", accessJson(WITH_MONEY)));
      const render = (u: Row) =>
        withSession(sess(u, "lumina-cine"), () => AdminProjectPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: project.id }) }));

      const hidden = await render(noMoney);
      harness.assertEqual(findProp(hidden, "money"), null, "no budget or invoices passed");
      harness.assertEqual(findProp(hidden, "payment"), null, "no payment line passed");
      const passed = findProp<Record<string, unknown>>(hidden, "project")!;
      harness.assert(!("budget" in passed) && !("invoices" in passed), "the project itself carries no budget or invoices");

      const shown = await render(withMoney);
      const money = findProp<{ budget: number; invoices: unknown[] } | null>(shown, "money");
      harness.assert(!!money && money.invoices.length > 0 && money.budget === project.budget, "Invoices VIEW gets budget and invoices");
      harness.assert(findProp(shown, "payment") !== null, "Invoices VIEW gets the payment line");
    });
  });

  await harness.test("T24-REDACT-03: a client's money only with Invoices access, proposals only with Proposals access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT", invoices: { some: {} } } });
      const hiddenProfile = (await loadClientProfile(f.lumina.id, client.id, { money: false, proposals: false }))!;
      harness.assertEqual(hiddenProfile.invoices.length, 0, "loader: no invoices");
      harness.assertEqual(hiddenProfile.money, null, "loader: no money totals");
      harness.assertEqual(hiddenProfile.proposals.length, 0, "loader: no proposals");
      harness.assert(hiddenProfile.projects.every((p) => p.budget === null), "loader: no project budgets");
      harness.assert(hiddenProfile.bookings.every((b) => b.sessionPrice === null && b.depositAmount === null), "loader: no booking prices");

      const noMoney = await f.mkMember("redact-c-no", await f.mkRole("Redact c no", accessJson(NO_MONEY)));
      const withMoney = await f.mkMember("redact-c-yes", await f.mkRole("Redact c yes", accessJson(WITH_MONEY)));
      const render = (u: Row) =>
        withSession(sess(u, "lumina-cine"), () => AdminClientPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", clientId: client.id }) }));
      const titles = (tree: unknown) => findElements(tree, (p) => typeof p.title === "string").map((p) => p.title);

      const hidden = await render(noMoney);
      harness.assert(!titles(hidden).includes("Invoices"), "no Invoices section", JSON.stringify(titles(hidden)));
      harness.assert(!titles(hidden).includes("Proposals"), "no Proposals section");
      harness.assertEqual(findProp(hidden, "canManage"), false, "contact card and notes are read-only at Clients VIEW");
      const shown = await render(withMoney);
      harness.assert(titles(shown).includes("Invoices") && titles(shown).includes("Proposals"), "both sections with access", JSON.stringify(titles(shown)));
    });
  });

  await harness.test("T24-VIEW-01: below MANAGE, pages show no edit controls", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const viewer = await f.mkMember("view-gear", await f.mkRole("Gear view", accessJson({ production: "VIEW", galleries: "VIEW" })));
      const manager = await f.mkMember("manage-gear", await f.mkRole("Gear manage", accessJson({ production: "MANAGE", galleries: "MANAGE" })));
      const gear = (u: Row) => withSession(sess(u, "lumina-cine"), () => InventoryPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }) }));
      harness.assertEqual(findProp(await gear(viewer), "canManage"), false, "Gear at Production VIEW: no edit controls");
      harness.assertEqual(findProp(await gear(manager), "canManage"), true, "Gear at Production MANAGE: edit controls");

      const project = await f.mkProject(f.lumina.id, "view-ws", f.luminaOwner.id);
      const workspace = (u: Row) =>
        withSession(sess(u, "lumina-cine"), () => AdminProjectPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId: project.id }) }));
      const asViewer = await workspace(viewer);
      for (const power of ["canEditGallery", "canChangeKind", "canManageProduction", "canOrderPrints"]) {
        harness.assertEqual(findProp(asViewer, power), false, `workspace at VIEW: ${power} off`);
      }
      const asManager = await workspace(manager);
      for (const power of ["canEditGallery", "canChangeKind", "canManageProduction"]) {
        harness.assertEqual(findProp(asManager, power), true, `workspace at MANAGE: ${power} on`);
      }

      // OWN works fully on their own project (the page has already checked it is theirs).
      const own = projectPagePowers(parseAccess(accessJson({ galleries: "OWN", production: "VIEW" })));
      harness.assertEqual(own.canEditGallery, true, "Galleries OWN edits their own gallery");
      harness.assertEqual(own.canChangeKind, false, "but the project type is Galleries MANAGE");
      harness.assertEqual(own.canManageProduction, false, "and shoot days need Production MANAGE");
      const owner = projectPagePowers(FULL_ACCESS);
      harness.assert(Object.values(owner).every(Boolean), "the owner has every power");
    });
  });

  await harness.test("T24-GEAR-01: Production VIEW flags gear for service; clearing it needs MANAGE", async () => {
    await withFixture(async (f) => {
      const crew = await f.mkMember("flag-view", await f.mkRole("Flag view", accessJson({ production: "VIEW" })));
      const lead = await f.mkMember("flag-manage", await f.mkRole("Flag manage", accessJson({ production: "MANAGE" })));
      const item = await db.inventoryItem.create({
        data: { tenantId: f.lumina.id, name: "T24 lens", sku: `T24-FLAG-${Date.now().toString(36)}`, category: "Lenses", discipline: "UNIVERSAL", condition: "EXCELLENT", status: "AVAILABLE" },
      });
      try {
        const t = { itemId: item.id, tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
        const flagged = await withSession(sess(crew, "lumina-cine"), () => quarantineGearItem({ ...t, condition: "MAINTENANCE_NEEDED" }));
        harness.assertEqual(flagged.success, true, "Production VIEW flags the item", JSON.stringify(flagged));
        harness.assertEqual((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).status, "MAINTENANCE", "item is in maintenance");

        const refused = await withSession(sess(crew, "lumina-cine"), () => releaseGearFromMaintenance({ ...t, condition: "EXCELLENT" }));
        harness.assert(refused.success === false && /FORBIDDEN|don't have/i.test(String(refused.message)), "Production VIEW can't clear it", JSON.stringify(refused));
        harness.assertEqual((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).status, "MAINTENANCE", "still in maintenance");

        const cleared = await withSession(sess(lead, "lumina-cine"), () => releaseGearFromMaintenance({ ...t, condition: "EXCELLENT" }));
        harness.assertEqual(cleared.success, true, "Production MANAGE clears it", JSON.stringify(cleared));
        harness.assertEqual((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).status, "AVAILABLE", "back in the fleet");

        const none = await f.mkMember("flag-none", await f.mkRole("Flag none", accessJson({ bookings: "MANAGE" })));
        const noFlag = await withSession(sess(none, "lumina-cine"), () => quarantineGearItem({ ...t, condition: "DAMAGED" }));
        harness.assertEqual(noFlag.success, false, "without Production access nobody flags");
      } finally {
        await db.inventoryItem.deleteMany({ where: { id: item.id } });
      }
    });
  });

  await harness.test("T24-REDACT-04: calendar rows show a booked session's price and deposit only with Invoices access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const priced = await db.clientBooking.findFirstOrThrow({
        where: { tenantId: f.lumina.id, slotId: { not: null }, sessionPrice: { not: null } },
      });
      const noMoney = await f.mkMember("cal-no", await f.mkRole("Cal no", accessJson({ bookings: "VIEW" })));
      const withMoney = await f.mkMember("cal-yes", await f.mkRole("Cal yes", accessJson({ bookings: "VIEW", invoices: "VIEW" })));
      type SlotRow = { id: string; price: number; booking?: { id: string; sessionPrice?: number | null; depositAmount?: number | null; moneyHidden?: boolean } | null };
      const slotsFor = async (u: Row) =>
        findProp<SlotRow[]>(
          await withSession(sess(u, "lumina-cine"), () => AdminCalendarPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }) })),
          "initialSlots"
        ) ?? [];

      const hidden = await slotsFor(noMoney);
      const booked = hidden.filter((s) => s.booking);
      harness.assert(booked.length > 0, "there are booked slots");
      harness.assert(
        booked.every((s) => s.booking!.sessionPrice == null && s.booking!.depositAmount == null && s.booking!.moneyHidden === true),
        "no booked price or deposit without Invoices access"
      );
      harness.assert(hidden.some((s) => typeof s.price === "number"), "the slot's own published fee stays");

      const shown = await slotsFor(withMoney);
      const row = shown.find((s) => s.booking?.id === priced.id);
      harness.assertEqual(row?.booking?.sessionPrice, priced.sessionPrice, "Invoices VIEW sees the booked price");
      harness.assertEqual(row?.booking?.moneyHidden, undefined, "and nothing is marked hidden");
    });
  });

  await harness.test("T24-REDACT-05: the Clients list shows Paid and Balance due only with Invoices access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const hiddenRows = await loadClientDirectory(f.lumina.id, { money: false });
      harness.assert(hiddenRows.length > 0, "the studio has clients");
      harness.assert(hiddenRows.every((r) => r.paid === null && r.outstanding === null), "loader: no totals without money");
      const shownRows = await loadClientDirectory(f.lumina.id, { money: true });
      harness.assert(shownRows.every((r) => typeof r.paid === "number" && typeof r.outstanding === "number"), "loader: totals with money");
      harness.assert(shownRows.some((r) => (r.paid ?? 0) > 0 || (r.outstanding ?? 0) > 0), "some client has money on record");

      const noMoney = await f.mkMember("dir-no", await f.mkRole("Dir no", accessJson({ clients: "VIEW" })));
      const withMoney = await f.mkMember("dir-yes", await f.mkRole("Dir yes", accessJson({ clients: "VIEW", invoices: "VIEW" })));
      const render = (u: Row) =>
        withSession(sess(u, "lumina-cine"), () => AdminClientsPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }) }));
      const hidden = await render(noMoney);
      harness.assertEqual(findProp(hidden, "showMoney"), false, "page: no money columns or Balance due filter");
      const passed = findProp<{ paid: number | null; outstanding: number | null }[]>(hidden, "clients") ?? [];
      harness.assert(passed.length > 0 && passed.every((r) => r.paid === null && r.outstanding === null), "page passes no totals");
      const shown = await render(withMoney);
      harness.assertEqual(findProp(shown, "showMoney"), true, "page: money columns with Invoices VIEW");
      const shownPassed = findProp<{ paid: number | null }[]>(shown, "clients") ?? [];
      harness.assert(shownPassed.every((r) => typeof r.paid === "number"), "page passes totals with Invoices VIEW");
    });
  });
  /** Every string and number in an element tree's children, joined: the text the page writes itself. */
  const textOf = (node: unknown): string => {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (!node || typeof node !== "object") return "";
    if (Array.isArray(node)) return node.map(textOf).join(" ");
    const props = (node as { props?: Record<string, unknown> }).props;
    return props ? textOf(props.children) : "";
  };

  await harness.test("T24-REDACT-06: the Galleries list shows budgets and paid status only with Invoices access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const project = await db.project.findFirstOrThrow({ where: { tenantId: f.lumina.id, budget: { gt: 0 } } });
      const everyone = { id: f.luminaOwner.id, access: FULL_ACCESS };
      const hiddenRow = (await loadAdminProjects(f.lumina.id, everyone, { tab: "all", money: false })).find((p) => p.id === project.id);
      harness.assert(!!hiddenRow, "loader: the project is listed");
      harness.assert(!!hiddenRow && !("budget" in hiddenRow) && !("isFinalBalancePaid" in hiddenRow), "loader: no budget or paid status");
      harness.assertEqual(hiddenRow?.money, null, "loader: no money without Invoices access");
      const shownRow = (await loadAdminProjects(f.lumina.id, everyone, { tab: "all", money: true })).find((p) => p.id === project.id);
      harness.assertEqual(shownRow?.money?.budget, project.budget, "loader: the budget with Invoices access");
      harness.assertEqual(shownRow?.money?.isFinalBalancePaid, project.isFinalBalancePaid, "loader: the paid status with Invoices access");

      const noMoney = await f.mkMember("glist-no", await f.mkRole("Glist no", accessJson({ galleries: "VIEW" })));
      const withMoney = await f.mkMember("glist-yes", await f.mkRole("Glist yes", accessJson({ galleries: "VIEW", invoices: "VIEW" })));
      const render = async (u: Row) =>
        textOf(
          await withSession(sess(u, "lumina-cine"), () =>
            AdminProjectsPage({ params: Promise.resolve({ tenantSlug: "lumina-cine" }), searchParams: Promise.resolve({ tab: "all" }) })
          )
        );
      const hidden = await render(noMoney);
      harness.assert(hidden.includes(project.title), "page: the list renders");
      harness.assert(!/Budget|Fully paid|Balance open/.test(hidden), "page: no Budget column or paid line without Invoices access");
      const shown = await render(withMoney);
      harness.assert(/Budget/.test(shown) && /Fully paid|Balance open/.test(shown), "page: Budget column and paid line with Invoices access");
    });
  });

  await harness.test("T24-REDACT-07: the client's gallery shows the balance to the team only with Invoices access", async () => {
    await provideReactGlobal();
    await withFixture(async (f) => {
      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const { id: projectId } = await f.mkProject(f.lumina.id, "vault-money", f.luminaOwner.id);
      await db.project.update({ where: { id: projectId }, data: { clientId: client.id, budget: 4000, isFinalBalancePaid: false } });
      const invoice = await db.milestoneInvoice.create({
        data: {
          tenantId: f.lumina.id, clientId: client.id, projectId, invoiceNumber: `T24-VLT-${Date.now().toString(36)}`,
          milestoneType: "FINAL_BALANCE_50", description: "T24 balance", amount: 2000, status: "PENDING", dueDate: new Date(Date.now() + 7 * 86400000),
        },
      });
      try {
        const noMoney = await f.mkMember("vault-no", await f.mkRole("Vault no", accessJson({ galleries: "VIEW" })));
        const withMoney = await f.mkMember("vault-yes", await f.mkRole("Vault yes", accessJson({ galleries: "VIEW", invoices: "VIEW" })));
        const render = (u: Row) =>
          withSession(sess(u, "lumina-cine"), () => ProjectVaultPage({ params: Promise.resolve({ tenantSlug: "lumina-cine", projectId }) }));
        type Shown = { budget: number; isFinalBalancePaid: boolean };

        const hidden = await render(noMoney);
        harness.assertEqual(findProp(hidden, "finalInvoice"), null, "team without Invoices access: no balance invoice");
        harness.assertEqual(findProp<Shown>(hidden, "project")?.budget, 0, "team without Invoices access: no budget");
        harness.assertEqual(findProp(hidden, "money"), false, "team without Invoices access: the balance isn't shown");
        harness.assert(!JSON.stringify(hidden).includes(invoice.invoiceNumber), "the invoice number is absent");

        const shown = await render(withMoney);
        harness.assertEqual(findProp<{ amount: number }>(shown, "finalInvoice")?.amount, 2000, "team with Invoices access: the balance");
        harness.assertEqual(findProp(shown, "money"), true, "team with Invoices access: the balance is shown");

        const own = await render(client as Row);
        harness.assertEqual(findProp<{ amount: number }>(own, "finalInvoice")?.amount, 2000, "the client sees their own balance");
        harness.assertEqual(findProp<Shown>(own, "project")?.budget, 4000, "the client gets their own budget");
        harness.assertEqual(findProp(own, "money"), true, "the client's balance is shown");
      } finally {
        await db.milestoneInvoice.deleteMany({ where: { id: invoice.id } });
      }
    });
  });

  await harness.test("T24-ROLE-01: the owner manages roles", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.luminaOwner, "lumina-cine");
      const name = `Editor ${Date.now()}`;
      const access = parseAccess(accessJson({ galleries: "MANAGE" }));
      const created = await withSession(owner, () => createTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: `  ${name}  `, access }));
      harness.assert(created.success, "the owner creates a role");
      if (!created.success) return;
      try {
        const stored = await db.teamRole.findUniqueOrThrow({ where: { id: created.roleId } });
        harness.assertEqual(stored.name, name, "the name is trimmed");
        harness.assertEqual(parseAccess(stored.access).areas.galleries, "MANAGE", "access is stored");

        const a = await f.mkMember("role-a", created.roleId);
        await f.mkMember("role-b", created.roleId);
        harness.assertEqual((await loadAccess(a)).areas.galleries, "MANAGE", "the member has the role's access");

        const updated = await withSession(owner, () =>
          updateTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", roleId: created.roleId, name, access: parseAccess(accessJson({ galleries: "VIEW" })) })
        );
        harness.assert(updated.success, "the owner updates the role");
        if (updated.success) harness.assertEqual(updated.affected, 2, "affected equals the linked members");
        harness.assertEqual((await loadAccess(a)).areas.galleries, "VIEW", "the member's next check reflects the change");
      } finally {
        await db.user.updateMany({ where: { teamRoleId: created.roleId }, data: { teamRoleId: null } });
        await db.teamRole.deleteMany({ where: { id: created.roleId } });
      }
    });
  });

  await harness.test("T24-ROLE-02: roles can't clash or vanish from under people", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.luminaOwner, "lumina-cine");
      const base = `Clash ${Date.now()}`;
      const roleId = await f.mkRole(base, accessJson({ bookings: "VIEW" }));
      const stored = await db.teamRole.findUniqueOrThrow({ where: { id: roleId } });
      const dup = await withSession(owner, () => createTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: stored.name.toUpperCase(), access: NO_ACCESS }));
      harness.assert(!dup.success && dup.error === "NAME_TAKEN", "a name that differs only by case is taken");

      const other = await withSession(owner, () => createTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: `Other ${base}`, access: NO_ACCESS }));
      harness.assert(other.success, "another name is fine");
      if (other.success) {
        const rename = await withSession(owner, () =>
          updateTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", roleId: other.roleId, name: stored.name.toLowerCase(), access: NO_ACCESS })
        );
        harness.assert(!rename.success && rename.error === "NAME_TAKEN", "renaming onto an existing name is refused");
        await db.teamRole.deleteMany({ where: { id: other.roleId } });
      }

      const empty = await withSession(owner, () => createTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: "   ", access: NO_ACCESS }));
      harness.assert(!empty.success, "a blank name is refused");

      const member = await f.mkMember("role-held", roleId);
      const del = await withSession(owner, () => deleteTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", roleId }));
      harness.assert(!del.success && del.error === "ROLE_IN_USE", "a role with people can't be deleted");
      if (!del.success) harness.assert(del.message.includes("1 person"), "the message counts the people");
      harness.assert(!!(await db.teamRole.findUnique({ where: { id: roleId } })), "the role is still there");

      const asMember = await withSession(sess(member, "lumina-cine"), () =>
        createTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: `Sneaky ${base}`, access: FULL_ACCESS })
      );
      harness.assert(!asMember.success, "a team member can't create roles");
      harness.assertEqual(await db.teamRole.count({ where: { name: `Sneaky ${base}` } }), 0, "nothing was written");

      await db.user.update({ where: { id: member.id }, data: { teamRoleId: null } });
      const gone = await withSession(owner, () => deleteTeamRole({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", roleId }));
      harness.assert(gone.success, "an unused role can be deleted");
    });
  });
  await harness.test("T24-ROLE-03: a studio can't delete its last role", async () => {
    await withFixture(async (f) => {
      const tag = Date.now().toString(36);
      const temp = await db.tenant.create({ data: { name: `T24 lone ${tag}`, slug: `t24-lone-${tag}` } });
      try {
        const only = await db.teamRole.create({ data: { tenantId: temp.id, name: "Only", access: "{}" } });
        const owner = { ...sess(f.luminaOwner, temp.slug), tenantId: temp.id };
        const res = await withSession(owner, () => deleteTeamRole({ tenantId: temp.id, tenantSlug: temp.slug, roleId: only.id }));
        harness.assert(!res.success && res.error === "LAST_ROLE", "deleting the only role is refused with LAST_ROLE");
        harness.assert(!!(await db.teamRole.findUnique({ where: { id: only.id } })), "the role still exists");
        await db.teamRole.create({ data: { tenantId: temp.id, name: "Second", access: "{}" } });
        const ok = await withSession(owner, () => deleteTeamRole({ tenantId: temp.id, tenantSlug: temp.slug, roleId: only.id }));
        harness.assert(ok.success, "with another role present the delete works");
      } finally {
        await db.tenant.delete({ where: { id: temp.id } });
      }
    });
  });

  // ---- Members: invite, edit, remove, bring back ------------------------------------------
  const PHOTOGRAPHER_ACCESS = accessJson({ bookings: "OWN", galleries: "OWN", production: "VIEW" });
  const PASSWORD = "Team-pass-123";
  const tokenOf = (inviteUrl: string) => new URL(inviteUrl).searchParams.get("token") ?? "";
  const cookieUser = async (cookie: string) =>
    withRequest(async (jar) => {
      jar.set(COOKIE_NAME, cookie);
      return getCurrentUser();
    });
  /** Removes every account a members test created (matched by the run tag in the email). */
  const dropInvited = (tag: string) => db.user.deleteMany({ where: { email: { contains: tag } } });

  await harness.test("T24-TEAM-01: invite creates a member who sets a password from the link", async () => {
    const now = new Date();
    harness.assertEqual(teamMemberStatus({ deactivatedAt: now, passwordHash: "x", passwordResetExpires: null }, now), "REMOVED", "removed wins");
    harness.assertEqual(teamMemberStatus({ deactivatedAt: null, passwordHash: "x", passwordResetExpires: null }, now), "ACTIVE", "password set: active");
    harness.assertEqual(teamMemberStatus({ deactivatedAt: null, passwordHash: null, passwordResetExpires: new Date(now.getTime() + 1000) }, now), "INVITED", "unexpired link: invited");
    harness.assertEqual(teamMemberStatus({ deactivatedAt: null, passwordHash: null, passwordResetExpires: new Date(now.getTime() - 1000) }, now), "LINK_EXPIRED", "expired link");
    harness.assertEqual(teamMemberStatus({ deactivatedAt: null, passwordHash: null, passwordResetExpires: null }, now), "LINK_EXPIRED", "no link");

    await withFixture(async (f) => {
      const tag = `t24inv${Date.now().toString(36)}`;
      const email = `${tag}@example.test`;
      try {
        const owner = sess(f.luminaOwner, "lumina-cine");
        const roleId = await f.mkRole("Invitee", accessJson({ bookings: "VIEW", galleries: "OWN" }));
        const inv = await withSession(owner, () =>
          inviteTeamMember({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: "  Aina Rahman ", email: `  ${email.toUpperCase()} `, roleId })
        );
        harness.assert(inv.success, "the owner invites", JSON.stringify(inv));
        if (!inv.success) return;
        const url = new URL(inv.inviteUrl);
        harness.assertEqual(url.searchParams.get("welcome"), "1", "the link opens in welcome mode");
        harness.assertEqual(url.pathname, "/lumina-cine/reset-password", "the link opens the studio's reset page");
        harness.assert(/^https?:\/\//.test(inv.inviteUrl), "the link is absolute");
        harness.assertEqual(url.searchParams.get("email"), email, "the link names the lowercased email");
        harness.assert(["SENT", "SKIPPED", "FAILED"].includes(inv.emailDelivery), "the email outcome is reported");
        const mail = getNotificationHistory(5).filter((n) => n.event === "TEAM_INVITE").pop();
        harness.assertEqual(mail?.recipientEmail, email, "an invite email was attempted");
        harness.assertEqual(mail?.emailSubject, `You're invited to join ${(await db.tenant.findUniqueOrThrow({ where: { id: f.lumina.id } })).name} on CineFlow`, "subject");
        harness.assert(!mail?.emailHtml.includes(tokenOf(inv.inviteUrl)), "the log never keeps the link");

        const row = await db.user.findUniqueOrThrow({ where: { id: inv.userId } });
        harness.assertEqual(row.email, email, "email is stored lowercase and trimmed");
        harness.assertEqual(row.name, "Aina Rahman", "name is trimmed");
        harness.assertEqual(row.role, "TEAM_MEMBER", "a team account");
        harness.assertEqual(row.teamRoleId, roleId, "holds the role");
        harness.assertEqual(row.passwordHash, null, "no password yet");
        const days = ((row.passwordResetExpires?.getTime() ?? 0) - Date.now()) / 86_400_000;
        harness.assert(days > 29.9 && days <= 30, "the link lasts 30 days", days.toFixed(2));
        harness.assertEqual(teamMemberStatus(row, new Date()), "INVITED", "status is Invited");

        const set = await resetPassword({ tenantSlug: "lumina-cine", email, token: tokenOf(inv.inviteUrl), password: PASSWORD });
        harness.assert(set.success, "the link sets the password", JSON.stringify(set));
        const after = await db.user.findUniqueOrThrow({ where: { id: inv.userId } });
        harness.assertEqual(teamMemberStatus(after, new Date()), "ACTIVE", "status is Active");
        harness.assertEqual(after.passwordResetToken, null, "the link works once");

        const login = await loginWithCredentials(email, PASSWORD, "lumina-cine");
        harness.assert(login.success && !!login.user, "they sign in", JSON.stringify(login));
        if (login.user) {
          const role = await db.teamRole.findUniqueOrThrow({ where: { id: roleId } });
          harness.assertEqual(JSON.stringify(await loadAccess(login.user)), JSON.stringify(parseAccess(role.access)), "their access is the role's");
        }

        const members = await loadTeamMembers(f.lumina.id);
        harness.assertEqual(members[0]?.isOwner, true, "the owner is listed first");
        const listed = members.find((m) => m.id === inv.userId);
        harness.assert(listed?.status === "ACTIVE" && listed.roleName.startsWith("Invitee"), "the member is listed with role and status");
      } finally {
        await dropInvited(tag);
      }
    });
  });

  await harness.test("T24-TEAM-02: invite refuses the wrong emails", async () => {
    await withFixture(async (f) => {
      const tag = `t24ref${Date.now().toString(36)}`;
      const email = `${tag}@example.test`;
      try {
        const owner = sess(f.luminaOwner, "lumina-cine");
        const roleId = await f.mkRole("Refuse", PHOTOGRAPHER_ACCESS);
        const base = { tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: "Daniel Lee", roleId };
        const invite = (e: string) => withSession(owner, () => inviteTeamMember({ ...base, email: e }));

        const own = await invite(f.luminaOwner.email.toUpperCase());
        harness.assert(!own.success && own.error === "EMAIL_IS_OWNER", "the owner's email is refused", JSON.stringify(own));
        const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
        const asClient = await invite(client.email);
        harness.assert(!asClient.success && asClient.error === "EMAIL_IS_CLIENT", "a client's email is refused");
        if (!asClient.success) harness.assertEqual(asClient.message, `${client.email} is a client of this studio. A client can't also be on the team.`, "client message");

        const first = await invite(email);
        harness.assert(first.success, "a new email is invited", JSON.stringify(first));
        const again = await invite(email);
        harness.assert(!again.success && again.error === "ALREADY_ON_TEAM", "inviting them again is refused");
        if (first.success) {
          await db.user.update({ where: { id: first.userId }, data: { passwordResetExpires: new Date(Date.now() - 1000) } });
          const expired = await invite(email);
          harness.assert(!expired.success && expired.error === "ALREADY_ON_TEAM", "an expired invite is still on the team (resend instead)");
          const removed = await withSession(owner, () => removeTeamMember({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", userId: first.userId }));
          harness.assert(removed.success, "removed");
          const back = await invite(email);
          harness.assert(!back.success && back.error === "REMOVED_MEMBER", "a removed member's email is refused");
          if (!back.success) harness.assertEqual(back.message, "Daniel Lee was removed. Bring them back from the list instead.", "removed message");
        }

        const member = await f.mkMember(`${tag}-m`, roleId);
        const sneaky = await withSession(sess(member, "lumina-cine"), () => inviteTeamMember({ ...base, email: `${tag}-x@example.test` }));
        harness.assert(!sneaky.success, "a team member can't invite");
        harness.assertEqual(await db.user.count({ where: { email: `${tag}-x@example.test` } }), 0, "nothing was written");

        await ensureStudioRoles(f.apex.id);
        const apexRole = await db.teamRole.findFirstOrThrow({ where: { tenantId: f.apex.id } });
        const apex = await withSession(sess(f.apexOwner, "apex-media"), () =>
          inviteTeamMember({ tenantId: f.apex.id, tenantSlug: "apex-media", name: "Daniel Lee", email, roleId: apexRole.id })
        );
        harness.assert(apex.success, "the same email can join another studio", JSON.stringify(apex));
        const foreignRole = await withSession(owner, () => inviteTeamMember({ ...base, email: `${tag}-y@example.test`, roleId: apexRole.id }));
        harness.assert(!foreignRole.success, "another studio's role can't be given");
      } finally {
        await dropInvited(tag);
      }
    });
  });

  await harness.test("T24-TEAM-03: extras add to the role", async () => {
    await withFixture(async (f) => {
      const tag = `t24ext${Date.now().toString(36)}`;
      try {
        const owner = sess(f.luminaOwner, "lumina-cine");
        const roleId = await f.mkRole("Photographer", PHOTOGRAPHER_ACCESS);
        const extra = parseAccess(accessJson({ bookings: "MANAGE" }));
        const inv = await withSession(owner, () =>
          inviteTeamMember({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", name: "Aina", email: `${tag}@example.test`, roleId, extraAccess: extra })
        );
        harness.assert(inv.success, "invited with extras", JSON.stringify(inv));
        if (!inv.success) return;
        const member = await db.user.findUniqueOrThrow({ where: { id: inv.userId } });
        const booking = await f.mkBooking(f.lumina.id, `${tag}`);
        const move = () =>
          withSession(sess(member, "lumina-cine"), () =>
            rescheduleBooking({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", bookingId: booking.id, newSlotId: "no-such-slot" })
          );
        const allowed = await move();
        harness.assert(!allowed.success && allowed.error === "SLOT_UNAVAILABLE", "with the extra, the move gets past the access check", JSON.stringify(allowed));

        const edited = await withSession(owner, () =>
          updateTeamMember({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", userId: member.id, name: "Aina R", roleId, extraAccess: null })
        );
        harness.assert(edited.success, "the owner edits the member", JSON.stringify(edited));
        const refused = await move();
        harness.assert(!refused.success && refused.message.startsWith("FORBIDDEN"), "without the extra it's refused", JSON.stringify(refused));
        const row = await db.user.findUniqueOrThrow({ where: { id: member.id } });
        harness.assertEqual(row.name, "Aina R", "the name changed");

        const sneaky = await withSession(sess(member, "lumina-cine"), () =>
          updateTeamMember({ tenantId: f.lumina.id, tenantSlug: "lumina-cine", userId: member.id, name: "Aina", roleId, extraAccess: FULL_ACCESS })
        );
        harness.assert(!sneaky.success, "a member can't give themselves more access");
        harness.assertEqual((await db.user.findUniqueOrThrow({ where: { id: member.id } })).extraAccess, null, "their extras are unchanged");
      } finally {
        await dropInvited(tag);
      }
    });
  });

  await harness.test("T24-TEAM-04: removing someone locks them out at once", async () => {
    await withFixture(async (f) => {
      const tag = `t24rm${Date.now().toString(36)}`;
      const email = `${tag}@example.test`;
      const slotIds: string[] = [];
      try {
        const owner = sess(f.luminaOwner, "lumina-cine");
        const roleId = await f.mkRole("Remove", PHOTOGRAPHER_ACCESS);
        const ids = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
        const inv = await withSession(owner, () => inviteTeamMember({ ...ids, name: "Sarah Tan", email, roleId }));
        harness.assert(inv.success, "invited");
        if (!inv.success) return;
        await resetPassword({ tenantSlug: "lumina-cine", email, token: tokenOf(inv.inviteUrl), password: PASSWORD });
        const login = await loginWithCredentials(email, PASSWORD, "lumina-cine");
        harness.assert(login.success && !!login.user, "signed in before removal");
        await new Promise((r) => setTimeout(r, 5));
        const oldCookie = await createSessionToken(login.user!);
        harness.assertEqual((await cookieUser(oldCookie))?.id, inv.userId, "the session works before removal");

        const today = studioNow().dateKey;
        const dayKey = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
        const future = await f.mkBooking(f.lumina.id, `${tag}-future`);
        await db.clientBooking.update({ where: { id: future.id }, data: { targetDate: dayKey(3), status: "CONFIRMED" } });
        const todays = await f.mkBooking(f.lumina.id, `${tag}-today`);
        await db.clientBooking.update({ where: { id: todays.id }, data: { targetDate: today, status: "CONFIRMED" } });
        // Shot already today: finished work keeps its name, whatever the date.
        const doneToday = await f.mkBooking(f.lumina.id, `${tag}-done-today`);
        await db.clientBooking.update({ where: { id: doneToday.id }, data: { targetDate: today, status: "COMPLETED" } });
        const past = await f.mkBooking(f.lumina.id, `${tag}-past`);
        await db.clientBooking.update({ where: { id: past.id }, data: { targetDate: dayKey(-3), status: "COMPLETED" } });
        const cancelled = await f.mkBooking(f.lumina.id, `${tag}-cancelled`);
        await db.clientBooking.update({ where: { id: cancelled.id }, data: { targetDate: dayKey(5), status: "CANCELLED" } });
        // The slot's date wins over targetDate: this one happened yesterday.
        const slot = await db.bookingSlot.create({
          data: { tenantId: f.lumina.id, date: new Date(`${dayKey(-1)}T00:00:00.000Z`), startTime: "10:00 AM", endTime: "11:00 AM", status: "BOOKED" },
        });
        slotIds.push(slot.id);
        const slotted = await f.mkBooking(f.lumina.id, `${tag}-slotted`);
        await db.clientBooking.update({ where: { id: slotted.id }, data: { slotId: slot.id, targetDate: dayKey(9), status: "COMPLETED" } });
        for (const b of [future, todays, doneToday, past, cancelled, slotted]) {
          await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: b.id, userId: inv.userId } });
        }

        const sneaky = await withSession(sess(login.user!, "lumina-cine"), () => removeTeamMember({ ...ids, userId: inv.userId }));
        harness.assert(!sneaky.success, "a member can't remove anyone");

        const removed = await withSession(owner, () => removeTeamMember({ ...ids, userId: inv.userId }));
        harness.assert(removed.success, "the owner removes them", JSON.stringify(removed));
        if (removed.success) harness.assertEqual(removed.unassigned, 2, "today's confirmed and the future booking lose the assignment");
        const left = await db.bookingAssignment.findMany({ where: { userId: inv.userId }, select: { bookingId: true } });
        harness.assertEqual(
          left.map((a) => a.bookingId).sort().join(","),
          [doneToday.id, past.id, cancelled.id, slotted.id].sort().join(","),
          "past, finished (even today) and cancelled assignments are kept"
        );

        harness.assertEqual(await cookieUser(oldCookie), null, "their existing session ends at once");
        const refused = await loginWithCredentials(email, PASSWORD, "lumina-cine");
        harness.assertEqual(refused.error, "ACCOUNT_REMOVED", "sign-in is refused as removed");
        const wrong = await loginWithCredentials(email, "Wrong-pass-999", "lumina-cine");
        harness.assertEqual(wrong.error, "INVALID_CREDENTIALS", "a wrong password doesn't reveal the removal");

        const unknown = await requestPasswordReset({ tenantSlug: "lumina-cine", email: `${tag}-nobody@example.test` });
        const reset = await requestPasswordReset({ tenantSlug: "lumina-cine", email });
        harness.assertEqual(JSON.stringify(reset), JSON.stringify(unknown), "the reset reply is the same as for an unknown email");
        const row = await db.user.findUniqueOrThrow({ where: { id: inv.userId } });
        harness.assertEqual(row.passwordResetToken, null, "no reset link is issued for a removed account");
        harness.assertEqual(teamMemberStatus(row, new Date()), "REMOVED", "status is Removed");
        harness.assert(!!row.deactivatedAt, "deactivatedAt is set");

        const resend = await withSession(owner, () => resendTeamInvite({ ...ids, userId: inv.userId }));
        harness.assert(!resend.success && resend.error === "REMOVED_MEMBER", "no new link for a removed member");

        const restored = await withSession(owner, () => restoreTeamMember({ ...ids, userId: inv.userId }));
        harness.assert(restored.success, "the owner brings them back", JSON.stringify(restored));
        harness.assertEqual(await cookieUser(oldCookie), null, "the old session stays ended");
        const back = await loginWithCredentials(email, PASSWORD, "lumina-cine");
        harness.assert(back.success, "they can sign in again", JSON.stringify(back));
        harness.assertEqual(await db.bookingAssignment.count({ where: { userId: inv.userId } }), 4, "assignments are not restored");
      } finally {
        await dropInvited(tag);
        await db.clientBooking.updateMany({ where: { slotId: { in: slotIds } }, data: { slotId: null } });
        await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
      }
    });
  });

  await harness.test("T24-TEAM-05: the owner's row can't be changed here", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.luminaOwner, "lumina-cine");
      const ids = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const roleId = await f.mkRole("Owner check", PHOTOGRAPHER_ACCESS);
      const rm = await withSession(owner, () => removeTeamMember({ ...ids, userId: f.luminaOwner.id }));
      harness.assert(!rm.success && rm.error === "CANNOT_CHANGE_OWNER", "the owner can't be removed", JSON.stringify(rm));
      const up = await withSession(owner, () => updateTeamMember({ ...ids, userId: f.luminaOwner.id, name: "X", roleId, extraAccess: null }));
      harness.assert(!up.success && up.error === "CANNOT_CHANGE_OWNER", "the owner can't be edited");
      const rs = await withSession(owner, () => resendTeamInvite({ ...ids, userId: f.luminaOwner.id }));
      harness.assert(!rs.success && rs.error === "CANNOT_CHANGE_OWNER", "no invite for the owner");
      const row = await db.user.findUniqueOrThrow({ where: { id: f.luminaOwner.id } });
      harness.assert(!row.deactivatedAt && row.name === f.luminaOwner.name && row.teamRoleId === null, "the owner is untouched");

      const client = await db.user.findFirstOrThrow({ where: { tenantId: f.lumina.id, role: "CLIENT" } });
      const onClient = await withSession(owner, () => removeTeamMember({ ...ids, userId: client.id }));
      harness.assert(!onClient.success && onClient.error === "NOT_FOUND", "a client isn't a team member");
      const apexMember = await db.user.findFirstOrThrow({ where: { tenantId: f.apex.id, role: { in: ["PHOTOGRAPHER", "CREW"] } } });
      const foreign = await withSession(owner, () => removeTeamMember({ ...ids, userId: apexMember.id }));
      harness.assert(!foreign.success && foreign.error === "NOT_FOUND", "another studio's member can't be touched");
      harness.assertEqual((await db.user.findUniqueOrThrow({ where: { id: apexMember.id } })).deactivatedAt, null, "they stay active");
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
