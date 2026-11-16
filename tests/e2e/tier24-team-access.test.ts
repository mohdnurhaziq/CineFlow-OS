/**
 * Tier 24: Team, roles, access and shoot assignments
 * - Schema: team roles, per-person extras and booking assignments are stored
 */

import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
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
import { canAccessClientRecord } from "@/lib/auth/project-access";
import { updateClientNotes } from "@/lib/actions/admin-clients";
import { createGearItem } from "@/lib/actions/gear";
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
        const ok = OTHER_GUARD[key] ? OTHER_GUARD[key].test(body) : /\b(requireAccess|requireTick|requireOwner)\(/.test(body);
        if (!ok) unchecked.push(key);
      }
    }
    harness.assert(total > 60, `Scanned ${total} actions`);
    harness.assert(unchecked.length === 0, "every action calls requireAccess, requireTick or requireOwner", `Unchecked: ${unchecked.join(", ")}`);

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

      const projects = (await loadAdminProjects(f.lumina.id, viewer)).map((p) => p.id).sort();
      harness.assertEqual(JSON.stringify(projects), JSON.stringify([o.viaBooking.id, o.led.id].sort()), "projects: the assigned booking's and the led one");

      // VIEW and the owner see the whole studio.
      const ownerView = { id: f.luminaOwner.id, access: FULL_ACCESS };
      const allBookings = (await loadAdminBookings(f.lumina.id, ownerView)).map((b) => b.id);
      harness.assert(allBookings.includes(o.mine.id) && allBookings.includes(o.other.id), "owner sees every booking");
      const allProjects = (await loadAdminProjects(f.lumina.id, ownerView)).map((p) => p.id);
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
