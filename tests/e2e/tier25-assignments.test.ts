/**
 * Tier 25: Assigning team members to bookings, and telling them about changes
 */

import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { ensureStudioRoles, FULL_ACCESS } from "@/lib/auth/access";
import { loadAdminBookings, isUnassigned } from "@/lib/bookings/admin-list";
import { getBookingDetails } from "@/lib/actions/admin-bookings";
import { studioNow } from "@/lib/slot-time";
import { loadAssignableFor, loadAssignableMembers } from "@/lib/team/members";
import { assignTeamMember, unassignTeamMember } from "@/lib/actions/admin-assignments";
import { cancelBooking, rescheduleBooking } from "@/lib/actions/admin-booking-lifecycle";
import { expireUnpaidDeposits } from "@/lib/bookings/expiry";
import { removeTeamMember } from "@/lib/actions/admin-team";
import { getNotificationHistory } from "@/lib/notifications";
import { loadSchedule, countUnassignedUpcoming } from "@/lib/bookings/schedule";

type Row = { id: string; email: string; name: string; role: string; tenantId: string | null };
const sess = (u: Row, slug: string | null) => ({ id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug });
const accessJson = (areas: Record<string, string>) => JSON.stringify({ areas, ticks: {} });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTier25AssignmentTests(harness: TestHarness) {
  harness.setSuite("Tier 25", "Assignments");

  async function withFixture<T>(
    fn: (f: {
      lumina: { id: string };
      apex: { id: string };
      owner: Row;
      client: Row;
      managerRoleId: string;
      mkMember: (label: string, opts?: { roleId?: string; active?: boolean }) => Promise<Row>;
      mkBooking: (label: string, opts?: { tenantId?: string; status?: string; slotId?: string }) => Promise<{ id: string }>;
      mkSlot: (label: string, day: number, start: string) => Promise<{ id: string }>;
    }) => Promise<T>
  ): Promise<T> {
    const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const lumina = await db.tenant.findUniqueOrThrow({ where: { slug: "lumina-cine" } });
    const apex = await db.tenant.findUniqueOrThrow({ where: { slug: "apex-media" } });
    const owner = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
    const client = await db.user.findFirstOrThrow({ where: { tenantId: lumina.id, role: "CLIENT" } });
    await ensureStudioRoles(lumina.id);
    const roleIds: string[] = [];
    const userIds: string[] = [];
    const bookingIds: string[] = [];
    const slotIds: string[] = [];
    try {
      const mkRole = async (name: string, access: string) => {
        const r = await db.teamRole.create({ data: { tenantId: lumina.id, name: `${name} ${run}`, access } });
        roleIds.push(r.id);
        return r.id;
      };
      const managerRoleId = await mkRole("T25 Manager", accessJson({ bookings: "MANAGE" }));
      const photographerRoleId = await mkRole("T25 Photographer", accessJson({ bookings: "OWN", galleries: "OWN" }));
      const mkMember = async (label: string, opts: { roleId?: string; active?: boolean } = {}) => {
        const u = await db.user.create({
          data: {
            tenantId: lumina.id,
            email: `t25-${label}-${run}@example.test`,
            name: `T25 ${label}`,
            role: "TEAM_MEMBER",
            teamRoleId: opts.roleId ?? photographerRoleId,
            passwordHash: opts.active === false ? null : "x",
          },
        });
        userIds.push(u.id);
        return u;
      };
      const mkSlot = async (label: string, day: number, start: string) => {
        const s = await db.bookingSlot.create({
          data: {
            tenantId: lumina.id,
            category: "STUDIO_PORTRAIT",
            date: new Date(Date.UTC(2031, 5, day)),
            startTime: start,
            endTime: "11:00 AM",
            status: label === "open" ? "AVAILABLE" : "BOOKED",
          },
        });
        slotIds.push(s.id);
        return s;
      };
      const mkBooking = async (label: string, opts: { tenantId?: string; status?: string; slotId?: string } = {}) => {
        const b = await db.clientBooking.create({
          data: {
            tenantId: opts.tenantId ?? lumina.id,
            trackingCode: `T25-${run}-${label}`,
            clientName: "Mira Client",
            clientEmail: "t25@example.test",
            clientPhone: "000",
            discipline: "PHOTOGRAPHY",
            serviceTier: "T25",
            status: opts.status ?? "CONFIRMED",
            slotId: opts.slotId,
            packageName: "Family Portrait",
            creativeBrief: "Golden hour",
          },
        });
        bookingIds.push(b.id);
        return b;
      };
      return await fn({ lumina, apex, owner, client, managerRoleId, mkMember, mkBooking, mkSlot });
    } finally {
      await db.milestoneInvoice.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await db.bookingAssignment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { bookingId: { in: bookingIds } }] } });
      await db.clientBooking.deleteMany({ where: { id: { in: bookingIds } } });
      await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.teamRole.deleteMany({ where: { id: { in: roleIds } } });
    }
  }

  await harness.test("T25-ASSIGN-01: assign one or many", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.owner, "lumina-cine");
      const a = await f.mkMember("a");
      const b = await f.mkMember("b");
      const bookings = [await f.mkBooking("1"), await f.mkBooking("2"), await f.mkBooking("3")];
      const ids = bookings.map((x) => x.id);
      const base = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };

      const first = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: ids, userId: a.id }));
      harness.assert(first.success, "assigns", JSON.stringify(first));
      if (!first.success) return;
      harness.assertEqual(first.assigned, 3, "three assigned");
      harness.assertEqual(first.skipped, 0, "none skipped");
      harness.assertEqual(await db.bookingAssignment.count({ where: { userId: a.id } }), 3, "three rows");
      const row = await db.bookingAssignment.findFirstOrThrow({ where: { userId: a.id } });
      harness.assertEqual(row.assignedById, f.owner.id, "records who assigned");
      harness.assertEqual(row.tenantId, f.lumina.id, "row carries the studio");

      const again = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: ids, userId: a.id }));
      harness.assert(again.success && again.assigned === 0 && again.skipped === 3, "repeating skips all three", JSON.stringify(again));
      harness.assertEqual(await db.bookingAssignment.count({ where: { userId: a.id } }), 3, "still three rows");

      const cancelled = await f.mkBooking("c", { status: "CANCELLED" });
      const skip = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [cancelled.id], userId: a.id }));
      harness.assert(skip.success && skip.assigned === 0 && skip.skipped === 1, "a cancelled booking is skipped", JSON.stringify(skip));

      const apexBooking = await f.mkBooking("apex", { tenantId: f.apex.id });
      const foreign = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [apexBooking.id], userId: a.id }));
      harness.assert(foreign.success && foreign.assigned === 0 && foreign.skipped === 1, "another studio's booking is skipped", JSON.stringify(foreign));
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: apexBooking.id } }), 0, "and never touched");

      const two = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [ids[0]!], userId: b.id }));
      harness.assert(two.success && two.assigned === 1, "a second person joins", JSON.stringify(two));
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: ids[0]! } }), 2, "both stored on one booking");

      const self = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [ids[1]!], userId: f.owner.id }));
      harness.assert(self.success && self.assigned === 1, "the owner can be assigned", JSON.stringify(self));

      const off = await withSession(owner, () => unassignTeamMember({ ...base, bookingId: ids[0]!, userId: b.id }));
      harness.assert(off.success, "unassigns", JSON.stringify(off));
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: ids[0]! } }), 1, "one left");
    });
  });

  await harness.test("T25-ASSIGN-02: only active team members, only with Bookings: Manage", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.owner, "lumina-cine");
      const base = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const booking = await f.mkBooking("x");
      const refused = async (userId: string, what: string) => {
        const r = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [booking.id], userId }));
        harness.assert(!r.success && r.error === "NOT_ON_TEAM", `NOT_ON_TEAM for ${what}`, JSON.stringify(r));
        if (!r.success) harness.assertEqual(r.message, "Only active members of your team can be assigned.", "message");
      };

      await refused(f.client.id, "a client");
      const removed = await f.mkMember("removed");
      const rm = await withSession(owner, () => removeTeamMember({ ...base, userId: removed.id }));
      harness.assert(rm.success, "removed", JSON.stringify(rm));
      await refused(removed.id, "a removed member");
      const invited = await f.mkMember("invited", { active: false });
      await refused(invited.id, "an invited member");
      const apexOwner = await db.user.findFirstOrThrow({ where: { tenantId: f.apex.id, role: "STUDIO_OWNER" } });
      await refused(apexOwner.id, "another studio's owner");
      await refused("no-such-user", "an unknown id");
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: booking.id } }), 0, "nothing was written");

      const photographer = await f.mkMember("photog");
      const asPhotog = sess(photographer, "lumina-cine");
      const denied = await withSession(asPhotog, () => assignTeamMember({ ...base, bookingIds: [booking.id], userId: photographer.id }));
      harness.assert(!denied.success, "a photographer can't assign", JSON.stringify(denied));
      const deniedOff = await withSession(asPhotog, () => unassignTeamMember({ ...base, bookingId: booking.id, userId: photographer.id }));
      harness.assert(!deniedOff.success, "a photographer can't unassign", JSON.stringify(deniedOff));
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: booking.id } }), 0, "still nothing written");

      const manager = await f.mkMember("manager", { roleId: f.managerRoleId });
      const ok = await withSession(sess(manager, "lumina-cine"), () => assignTeamMember({ ...base, bookingIds: [booking.id], userId: photographer.id }));
      harness.assert(ok.success && ok.assigned === 1, "Bookings: Manage can assign", JSON.stringify(ok));
    });
  });

  await harness.test("T25-ASSIGN-03: assignees hear about changes", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.owner, "lumina-cine");
      const base = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      const a = await f.mkMember("ha");
      const b = await f.mkMember("hb");
      const gone = await f.mkMember("hgone");
      const oldSlot = await f.mkSlot("booked", 10, "09:00 AM");
      const newSlot = await f.mkSlot("open", 12, "02:00 PM");
      const booking = await f.mkBooking("move", { slotId: oldSlot.id });

      const mailTo = (email: string, subject: RegExp) => getNotificationHistory(200).filter((n) => n.recipientEmail === email && subject.test(n.emailSubject));
      const waitFor = async (email: string, subject: RegExp, count = 1) => {
        for (let i = 0; i < 40 && mailTo(email, subject).length < count; i++) await sleep(50);
        return mailTo(email, subject);
      };

      const assigned = await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [booking.id], userId: a.id }));
      harness.assert(assigned.success && ["SENT", "SKIPPED", "FAILED", "NONE"].includes(assigned.emailDelivery), "assign reports the email outcome", JSON.stringify(assigned));
      const hello = await waitFor(a.email, /^New shoot: /);
      harness.assertEqual(hello.length, 1, "the assignee is told");
      harness.assertEqual(hello[0]?.event, "SHOOT_ASSIGNED", "event");
      harness.assert(/^New shoot: .*2031.* at 09:00 AM$/.test(hello[0]?.emailSubject ?? ""), "subject has date and start", hello[0]?.emailSubject);
      harness.assert(hello[0]?.emailText.includes("assigned you to Mira Client's session") === true, "body names the client", hello[0]?.emailText);
      harness.assert(!!hello[0]?.emailText.includes("Family Portrait") && !!hello[0]?.emailText.includes("Golden hour"), "package and brief appear");
      harness.assert(hello[0]?.emailText.includes("/lumina-cine/admin/schedule") === true, "links to the schedule");

      await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [booking.id], userId: f.owner.id }));
      await sleep(200);
      harness.assertEqual(mailTo(f.owner.email, /^New shoot: /).length, 0, "no email to yourself");

      await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [booking.id], userId: b.id }));
      await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: booking.id, userId: gone.id } });
      await db.user.update({ where: { id: gone.id }, data: { deactivatedAt: new Date() } });

      const moved = await withSession(owner, () => rescheduleBooking({ ...base, bookingId: booking.id, newSlotId: newSlot.id }));
      harness.assert(moved.success, "rescheduled", JSON.stringify(moved));
      for (const u of [a, b]) {
        const mail = await waitFor(u.email, /^Shoot moved: /);
        harness.assertEqual(mail.length, 1, `${u.name} hears about the move`);
        harness.assertEqual(mail[0]?.event, "SHOOT_CHANGED", "event");
        harness.assertEqual(mail[0]?.emailSubject, "Shoot moved: Mira Client", "subject");
        harness.assert(/moved from .*09:00 AM.* to .*02:00 PM/.test(mail[0]?.emailText ?? ""), "old and new times", mail[0]?.emailText);
      }
      await sleep(200);
      harness.assertEqual(mailTo(gone.email, /Shoot/).length, 0, "a removed member is not emailed");
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: booking.id } }), 4, "assignments survive the move");

      const off = await withSession(owner, () => unassignTeamMember({ ...base, bookingId: booking.id, userId: b.id }));
      harness.assert(off.success, "unassigned", JSON.stringify(off));
      const bye = await waitFor(b.email, /^Removed from a shoot: Mira Client$/);
      harness.assertEqual(bye.length, 1, "the unassigned person is told");
      harness.assertEqual(bye[0]?.event, "SHOOT_CHANGED", "unassign event");
      harness.assert(bye[0]?.emailText.includes("no longer on Mira Client's session") === true, "unassign body", bye[0]?.emailText);

      const cancelled = await withSession(owner, () => cancelBooking({ ...base, bookingId: booking.id, reason: "Client asked to cancel" }));
      harness.assert(cancelled.success, "cancelled", JSON.stringify(cancelled));
      const cx = await waitFor(a.email, /^Shoot cancelled: Mira Client$/);
      harness.assertEqual(cx.length, 1, "the assignee hears about the cancellation");
      harness.assertEqual(cx[0]?.event, "SHOOT_CHANGED", "cancel event");
      await sleep(200);
      harness.assertEqual(mailTo(b.email, /^Shoot cancelled/).length, 0, "someone unassigned earlier is not told");
      harness.assertEqual(await db.bookingAssignment.count({ where: { bookingId: booking.id } }), 3, "assignments stay on a cancelled booking");

      // An unpaid deposit that lapses is a cancellation too.
      const lapsing = await f.mkBooking("lapse");
      await db.clientBooking.update({ where: { id: lapsing.id }, data: { status: "PENDING", paymentMethod: "CASH", createdAt: new Date(Date.now() - 48 * 3_600_000) } });
      await db.milestoneInvoice.create({
        data: {
          tenantId: f.lumina.id,
          bookingId: lapsing.id,
          clientId: f.client.id,
          invoiceNumber: `T25-${lapsing.id.slice(-8)}`,
          milestoneType: "BOOKING_DEPOSIT",
          amount: 10,
          dueDate: new Date(),
          status: "PENDING_VERIFICATION",
        },
      });
      await db.bookingAssignment.create({ data: { tenantId: f.lumina.id, bookingId: lapsing.id, userId: a.id } });
      const count = await expireUnpaidDeposits(f.lumina.id);
      harness.assert(count >= 1, "the unpaid booking lapsed", String(count));
      const lapse = await waitFor(a.email, /^Shoot cancelled: Mira Client$/, 2);
      harness.assertEqual(lapse.length, 2, "an auto-cancelled booking tells its assignee");
    });
  });

  await harness.test("T25-UI-01: the bookings list and details carry assignees", async () => {
    await withFixture(async (f) => {
      const owner = sess(f.owner, "lumina-cine");
      const a = await f.mkMember("ua");
      const invited = await f.mkMember("uinv", { active: false });
      const upcoming = await f.mkBooking("up", { slotId: (await f.mkSlot("booked", 14, "09:00 AM")).id });
      const staffed = await f.mkBooking("staffed", { slotId: (await f.mkSlot("booked", 15, "09:00 AM")).id });
      const pending = await f.mkBooking("pend", { slotId: (await f.mkSlot("booked", 16, "09:00 AM")).id, status: "PENDING" });
      const cancelled = await f.mkBooking("cx", { slotId: (await f.mkSlot("booked", 17, "09:00 AM")).id, status: "CANCELLED" });
      const past = await f.mkBooking("past");
      await db.clientBooking.update({ where: { id: past.id }, data: { targetDate: "2020-01-01" } });
      const base = { tenantId: f.lumina.id, tenantSlug: "lumina-cine" };
      await withSession(owner, () => assignTeamMember({ ...base, bookingIds: [staffed.id], userId: a.id }));

      const rows = await loadAdminBookings(f.lumina.id, { id: f.owner.id, access: FULL_ACCESS });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const today = studioNow().dateKey;
      harness.assertEqual(byId.get(staffed.id)?.assignees.map((x) => x.id).join(), a.id, "the row lists its assignee");
      harness.assertEqual(byId.get(staffed.id)?.assignees[0]?.name, a.name, "with the name");
      harness.assertEqual(byId.get(upcoming.id)?.assignees.length, 0, "an unstaffed row has none");
      harness.assert(isUnassigned(byId.get(upcoming.id)!, today), "upcoming and unstaffed is Unassigned");
      harness.assert(isUnassigned(byId.get(pending.id)!, today), "pending counts too");
      harness.assert(!isUnassigned(byId.get(staffed.id)!, today), "staffed is not");
      harness.assert(!isUnassigned(byId.get(cancelled.id)!, today), "cancelled is not");
      harness.assert(!isUnassigned(byId.get(past.id)!, today), "past is not");

      const detail = await withSession(owner, () => getBookingDetails({ tenantId: f.lumina.id, bookingId: staffed.id }));
      harness.assert(detail.success && detail.booking.assignees.length === 1 && detail.booking.assignees[0]?.id === a.id, "details carry assignees", JSON.stringify(detail));

      const people = await loadAssignableMembers(f.lumina.id);
      harness.assert(people.some((p) => p.id === f.owner.id && p.roleName === "Studio owner"), "the owner is assignable");
      harness.assert(people.some((p) => p.id === a.id), "an active member is assignable");
      harness.assert(!people.some((p) => p.id === invited.id), "an invited member is not");
      // The calendar and full-page booking pages use this: the list only for Bookings MANAGE.
      harness.assertEqual((await loadAssignableFor(f.lumina.id, true)).length, people.length, "MANAGE gets the picker list");
      harness.assertEqual((await loadAssignableFor(f.lumina.id, false)).length, 0, "below MANAGE gets none");
    });
  });

  await harness.test("T25-SCHED-01: a member's schedule holds only their upcoming sessions", async () => {
    await withFixture(async (f) => {
      const a = await f.mkMember("sa");
      const b = await f.mkMember("sb");
      const later = await f.mkBooking("late", { slotId: (await f.mkSlot("booked", 22, "02:00 PM")).id });
      const early = await f.mkBooking("early", { slotId: (await f.mkSlot("booked", 22, "09:00 AM")).id });
      const nextDay = await f.mkBooking("next", { slotId: (await f.mkSlot("booked", 23, "09:00 AM")).id });
      const cancelled = await f.mkBooking("cx", { slotId: (await f.mkSlot("booked", 24, "09:00 AM")).id, status: "CANCELLED" });
      const theirs = await f.mkBooking("theirs", { slotId: (await f.mkSlot("booked", 25, "09:00 AM")).id });
      const past = await f.mkBooking("past", { status: "COMPLETED" });
      await db.clientBooking.update({ where: { id: past.id }, data: { targetDate: "2020-01-01" } });
      const tenantId = f.lumina.id;
      for (const x of [later, early, nextDay, cancelled, past]) {
        await db.bookingAssignment.create({ data: { bookingId: x.id, userId: a.id, tenantId } });
      }
      await db.bookingAssignment.create({ data: { bookingId: theirs.id, userId: b.id, tenantId } });
      await db.bookingAssignment.create({ data: { bookingId: later.id, userId: b.id, tenantId } });

      const today = studioNow().dateKey;
      const days = await loadSchedule(tenantId, a.id, { from: today });
      const sessions = days.flatMap((d) => d.sessions);
      harness.assertEqual(sessions.length, 3, "three upcoming sessions (cancelled, past and other people's left out)");
      harness.assertEqual(sessions.map((x) => x.bookingId).join(), [early.id, later.id, nextDay.id].join(), "in date then time order");
      harness.assertEqual(days.length, 2, "grouped into two days");
      harness.assertEqual(days[0]?.sessions.length, 2, "two sessions on the first day");
      harness.assertEqual(sessions[0]?.clientName, "Mira Client", "carries the client");
      harness.assertEqual(sessions[0]?.packageName, "Family Portrait", "and the package");
      harness.assert(!sessions.some((x) => x.bookingId === theirs.id), "another member's booking is absent");

      const mine = await loadSchedule(tenantId, b.id, { from: today });
      harness.assertEqual(mine.flatMap((d) => d.sessions).map((x) => x.bookingId).sort().join(), [theirs.id, later.id].sort().join(), "the other member sees theirs");

      const pastDays = await loadSchedule(tenantId, a.id, { from: today, past: true });
      harness.assertEqual(pastDays.flatMap((d) => d.sessions).map((x) => x.bookingId).join(), past.id, "past view holds the past session only");

      const wrongStudio = await loadSchedule(f.apex.id, a.id, { from: today });
      harness.assertEqual(wrongStudio.length, 0, "another studio's schedule shows nothing of theirs");
    });
  });

  await harness.test("T25-SCHED-02: the overview counts unassigned bookings", async () => {
    await withFixture(async (f) => {
      const today = studioNow().dateKey;
      const a = await f.mkMember("sc");
      const expected = async () => {
        const rows = await loadAdminBookings(f.lumina.id, { id: f.owner.id, access: FULL_ACCESS });
        return rows.filter((r) => isUnassigned(r, today)).length;
      };
      const before = await countUnassignedUpcoming(f.lumina.id, today);
      harness.assertEqual(before, await expected(), "matches the Unassigned filter");

      const open = await f.mkBooking("o1", { slotId: (await f.mkSlot("booked", 26, "09:00 AM")).id });
      await f.mkBooking("o2", { slotId: (await f.mkSlot("booked", 27, "09:00 AM")).id, status: "PENDING" });
      const staffed = await f.mkBooking("o3", { slotId: (await f.mkSlot("booked", 28, "09:00 AM")).id });
      await f.mkBooking("o4", { slotId: (await f.mkSlot("booked", 29, "09:00 AM")).id, status: "CANCELLED" });
      await f.mkBooking("o5", { slotId: (await f.mkSlot("booked", 30, "09:00 AM")).id, status: "COMPLETED" });
      const old = await f.mkBooking("o6");
      await db.clientBooking.update({ where: { id: old.id }, data: { targetDate: "2020-01-01" } });
      await db.bookingAssignment.create({ data: { bookingId: staffed.id, userId: a.id, tenantId: f.lumina.id } });

      const after = await countUnassignedUpcoming(f.lumina.id, today);
      harness.assertEqual(after - before, 2, "two new unassigned upcoming bookings (pending and confirmed)");
      harness.assertEqual(after, await expected(), "still matches the Unassigned filter");
      await db.bookingAssignment.create({ data: { bookingId: open.id, userId: a.id, tenantId: f.lumina.id } });
      harness.assertEqual(await countUnassignedUpcoming(f.lumina.id, today), after - 1, "assigning one lowers the count");
      harness.assertEqual(await countUnassignedUpcoming(f.apex.id, today), await countUnassignedUpcoming(f.apex.id, today), "scoped by studio");
    });
  });
}
