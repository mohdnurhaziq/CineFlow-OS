/**
 * Tier 16: admin onboarding guide.
 * - Setup checklist status is computed from the studio's real data (6 steps).
 * - Only the studio's owner can close the checklist; any staff member can mark the tour seen,
 *   and only on their own account.
 */
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { getSetupChecklist } from "@/lib/onboarding/checklist";
import { dismissSetupChecklist, markTourSeen } from "@/lib/actions/onboarding-guide";
import { readFileSync } from "node:fs";
import { markClientTourSeen } from "@/lib/actions/client-tour";

type Row = { id: string; email: string; name: string; role: string; tenantId: string | null };
const as = (u: Row, tenantSlug: string | null) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  tenantId: u.tenantId,
  tenantSlug,
});

export async function runTier16OnboardingGuideTests(harness: TestHarness) {
  harness.setSuite("Tier 16", "Admin Onboarding Guide");

  const run = Date.now().toString(36);
  const slug = `t16-studio-${run}`;
  const tenant = await db.tenant.create({ data: { name: "T16 Studio", slug } });
  harness.registerTeardown(async () => {
    await db.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  });
  const ownerRow = await db.user.create({
    data: { tenantId: tenant.id, email: `t16-owner-${run}@example.test`, name: "T16 Owner", role: "STUDIO_OWNER" },
  });
  const crewRow = await db.user.create({
    data: { tenantId: tenant.id, email: `t16-crew-${run}@example.test`, name: "T16 Crew", role: "CREW" },
  });
  const owner = as(ownerRow, slug);
  const crew = as(crewRow, slug);

  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  const apexOwnerRow = apex ? await db.user.findFirst({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } }) : null;
  const superRow = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!apexOwnerRow || !superRow) throw new Error("Seed apex-media owner and super admin are required");
  const otherOwner = as(apexOwnerRow, "apex-media");
  const superAdmin = as(superRow, null);

  // ── Checklist status ────────────────────────────────────────────────────────
  await harness.test("T16-CHECKLIST-01: a new studio starts with 0 of 6 steps, in order", async () => {
    const c = await getSetupChecklist(tenant.id);
    harness.assertEqual(c.total, 6, "Checklist has 6 steps");
    harness.assertEqual(c.doneCount, 0, "Nothing done on a new studio");
    harness.assertEqual(c.allDone, false, "Not all done");
    harness.assertDeepEqual(
      c.steps.map((s) => s.id),
      ["brand", "services", "availability", "payments", "showcase", "firstBooking"],
      "Steps are in the documented order",
    );
  });

  await harness.test("T16-CHECKLIST-02: each step ticks itself off from real data", async () => {
    const done = async (id: string) => (await getSetupChecklist(tenant.id)).steps.find((s) => s.id === id)?.done;

    await db.tenant.update({ where: { id: tenant.id }, data: { logoUrl: "   " } });
    harness.assertEqual(await done("brand"), false, "A blank logo URL does not count");
    await db.tenant.update({ where: { id: tenant.id }, data: { logoUrl: "/uploads/logos/t16.png" } });
    harness.assertEqual(await done("brand"), true, "Brand done once a logo is set");

    await db.servicePackage.create({
      data: { tenantId: tenant.id, name: "Portrait", discipline: "PHOTOGRAPHY", price: 100, description: "d", deliverables: "x", turnaround: "1 week" },
    });
    harness.assertEqual(await done("services"), true, "Services done with 1 package");

    const slot = await db.bookingSlot.create({
      data: { tenantId: tenant.id, date: new Date(), startTime: "10:00 AM", endTime: "11:00 AM" },
    });
    harness.assertEqual(await done("availability"), true, "Availability done with 1 slot");

    await db.tenant.update({ where: { id: tenant.id }, data: { bankDetails: "Maybank 123" } });
    harness.assertEqual(await done("payments"), true, "Payments done with only bank details");
    await db.tenant.update({ where: { id: tenant.id }, data: { bankDetails: null, toyyibpaySecretEnc: "enc" } });
    harness.assertEqual(await done("payments"), true, "Payments done with only Toyyibpay");
    await db.tenant.update({ where: { id: tenant.id }, data: { toyyibpaySecretEnc: null, qrCodeUrl: "/uploads/qrcodes/q.png" } });
    harness.assertEqual(await done("payments"), true, "Payments done with only a QR code");

    await db.showcaseItem.create({
      data: { tenantId: tenant.id, title: "Work", clientName: "C", discipline: "PHOTOGRAPHY", coverImageUrl: "/x.jpg" },
    });
    harness.assertEqual(await done("showcase"), true, "Showcase done with 1 item");

    harness.assertEqual((await getSetupChecklist(tenant.id)).allDone, false, "Not all done before the first booking");
    await db.clientBooking.create({
      data: {
        tenantId: tenant.id, trackingCode: `T16-${run}`, clientName: "Client", clientEmail: "c@example.test",
        clientPhone: "+60123", discipline: "PHOTOGRAPHY", serviceTier: "Portrait", slotId: slot.id,
      },
    });
    const c = await getSetupChecklist(tenant.id);
    harness.assertEqual(c.doneCount, 6, "All 6 steps done");
    harness.assertEqual(c.allDone, true, "allDone once every step is done");
  });

  // ── Close the checklist ─────────────────────────────────────────────────────
  await harness.test("T16-DISMISS-01: only this studio's owner can close the checklist", async () => {
    const byNobody = await withSession(null, () => dismissSetupChecklist(slug));
    harness.assertEqual(byNobody.success, false, "Signed-out caller refused");

    const byCrew = await withSession(crew, () => dismissSetupChecklist(slug));
    harness.assertEqual(byCrew.success, false, "Crew refused");
    const crewAfter = await db.user.findUnique({ where: { id: crewRow.id } });
    harness.assertEqual(crewAfter?.onboardingChecklistDismissedAt ?? null, null, "Crew row unchanged");

    const byOther = await withSession(otherOwner, () => dismissSetupChecklist(slug));
    harness.assertEqual(byOther.success, false, "Another studio's owner refused");

    const bySuper = await withSession(superAdmin, () => dismissSetupChecklist(slug));
    harness.assertEqual(bySuper.success, false, "Super admin has no checklist to close");

    const byOwner = await withSession(owner, () => dismissSetupChecklist(slug));
    harness.assertEqual(byOwner.success, true, "Owner can close it");
    const ownerAfter = await db.user.findUnique({ where: { id: ownerRow.id } });
    harness.assert(ownerAfter?.onboardingChecklistDismissedAt instanceof Date, "Owner row records the close");
  });

  // ── Tour seen ───────────────────────────────────────────────────────────────
  await harness.test("T16-TOUR-01: any staff member marks the tour seen on their own account only", async () => {
    const byNobody = await withSession(null, () => markTourSeen(slug));
    harness.assertEqual(byNobody.success, false, "Signed-out caller refused");

    const byOther = await withSession(otherOwner, () => markTourSeen(slug));
    harness.assertEqual(byOther.success, false, "Another studio's owner refused");

    const byCrew = await withSession(crew, () => markTourSeen(slug));
    harness.assertEqual(byCrew.success, true, "Crew can mark the tour seen");
    const crewAfter = await db.user.findUnique({ where: { id: crewRow.id } });
    harness.assert(crewAfter?.onboardingTourSeenAt instanceof Date, "Crew row records the tour");
    const ownerAfter = await db.user.findUnique({ where: { id: ownerRow.id } });
    harness.assertEqual(ownerAfter?.onboardingTourSeenAt ?? null, null, "Owner row untouched by crew's call");

    const superBefore = superRow.onboardingTourSeenAt;
    const bySuper = await withSession(superAdmin, () => markTourSeen(slug));
    harness.assertEqual(bySuper.success, true, "Super admin can mark the tour seen");
    const superAfter = await db.user.findUnique({ where: { id: superRow.id } });
    harness.assert(superAfter?.onboardingTourSeenAt instanceof Date, "Super admin row records the tour");
    await db.user.update({ where: { id: superRow.id }, data: { onboardingTourSeenAt: superBefore } });
  });

  // ── Tour wording matches the screens ────────────────────────────────────────
  await harness.test("T16-GUIDE-01: the tour describes the account menu and optional prints as they are now", async () => {
    const tour = readFileSync("components/admin/onboarding/dashboard-tour.tsx", "utf8");
    harness.assert(/Switch between your studios/.test(tour) && /sign out/i.test(tour), "The account stop says you can switch studios and sign out");
    harness.assert(!/Sign out here\./.test(tour), "The old 'Sign out here' wording is gone");
    harness.assert(/frames and prints, if you offer them/.test(tour), "The catalog stop says frames and prints are optional");
  });

  // ── The customer's tour ─────────────────────────────────────────────────────
  await harness.test("T16-CLIENTTOUR-01: a client marks the tour seen on their own account, in their own studio only", async () => {
    const clientRow = await db.user.create({
      data: { tenantId: tenant.id, email: `t16-client-${run}@example.test`, name: "T16 Client", role: "CLIENT" },
    });
    const otherClientRow = await db.user.create({
      data: { tenantId: tenant.id, email: `t16-client2-${run}@example.test`, name: "T16 Client Two", role: "CLIENT" },
    });
    const client = as(clientRow, slug);

    const byNobody = await withSession(null, () => markClientTourSeen(slug));
    harness.assertEqual(byNobody.success, false, "Signed-out caller refused");
    const byStaff = await withSession(crew, () => markClientTourSeen(slug));
    harness.assertEqual(byStaff.success, false, "Staff have their own tour: refused here");
    const apexClientRow = await db.user.findFirst({ where: { tenant: { slug: "apex-media" }, role: "CLIENT" } });
    if (apexClientRow) {
      const elsewhere = await withSession(as(apexClientRow, "apex-media"), () => markClientTourSeen(slug));
      harness.assertEqual(elsewhere.success, false, "A client of another studio refused");
    }

    const ok = await withSession(client, () => markClientTourSeen(slug));
    harness.assertEqual(ok.success, true, "The client can mark it seen");
    const after = await db.user.findUnique({ where: { id: clientRow.id } });
    harness.assert(after?.onboardingTourSeenAt instanceof Date, "Their row records the tour");
    const otherAfter = await db.user.findUnique({ where: { id: otherClientRow.id } });
    harness.assertEqual(otherAfter?.onboardingTourSeenAt ?? null, null, "Another client's row is untouched");
  });

  await harness.test("T16-CLIENTTOUR-02: the customer tour is wired into the client portal", async () => {
    const tour = readFileSync("components/account/client-tour.tsx", "utf8");
    for (const anchor of ["client-kpis", "client-tab-projects", "client-tab-bookings", "client-tab-invoices", "client-book", "client-account"]) {
      harness.assert(tour.includes(`"${anchor}"`), `The tour has a stop for ${anchor}`);
    }
    harness.assert(/markClientTourSeen/.test(tour) && /tour/.test(tour), "It records that the client has seen the tour");
    harness.assert(/data-tour=\{`client-tab-\$\{tab\.id\}`\}/.test(readFileSync("components/account/client-nav-bar.tsx", "utf8")), "Every portal tab carries its tour anchor");
    const header = readFileSync("components/account/client-account-header.tsx", "utf8");
    harness.assert(/data-tour="client-book"/.test(header) && /data-tour="client-account"/.test(header), "The Book button and the account menu carry their anchors");
    harness.assert(/data-tour="client-kpis"/.test(readFileSync("components/account/client-dashboard.tsx", "utf8")), "The overview's summary cards carry their anchor");
    const page = readFileSync("app/[tenantSlug]/account/page.tsx", "utf8");
    harness.assert(/<ClientTour\b/.test(page) && /onboardingTourSeenAt/.test(page), "The account page starts it for a client who hasn't seen it");
    harness.assert(/confirmed/.test(page.slice(page.indexOf("<ClientTour"))) || /!confirmation/.test(page), "…but not over a booking confirmation");
    harness.assert(/tour=1/.test(readFileSync("components/account/client-user-nav.tsx", "utf8")), "The account menu can replay it");
  });
}
