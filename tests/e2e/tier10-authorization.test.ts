/**
 * Tier 10: Server-action authorization
 *
 * Every export of a "use server" module is a public HTTP endpoint (callable by
 * POSTing its action ID to any route), so middleware's /admin page guard does
 * not protect it. These tests prove staff-only actions enforce authorization
 * themselves, and a static check keeps every new action classified.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { TestHarness } from "./test-harness";
import { withSession } from "./mocks/session";
import { approvePaymentVerification, rejectPaymentVerification } from "@/lib/actions/admin-verification";
import { deleteBookingSlot, cleanupExpiredHolds } from "@/lib/actions/admin-calendar";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { getStudioAnalytics } from "@/lib/actions/admin-analytics";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { toggleShotCompletion } from "@/lib/actions/logistics";

/** Actions that are intentionally callable by clients or the public, with the reason. */
const PUBLIC_ACTIONS: Record<string, string> = {
  "client-auth.registerClient": "client sign-up",
  "booking.holdBookingSlot": "public booking flow",
  "booking.releaseBookingSlot": "public booking flow (session-scoped)",
  "booking.getTenantBookingSlots": "public slot grid",
  "booking.createClientBooking": "public booking flow",
  "onboarding.checkSlugAvailability": "public studio sign-up",
  "onboarding.onboardStudio": "public studio sign-up",
  "my-booking.lookupMyBooking": "tracking-code lookup",
  "checkout.processBookingCheckout": "client checkout",
  "checkout.processInvoicePayment": "client checkout",
  "proposals.getProposalBySlugAndId": "client proposal link",
  "proposals.acceptProposal": "client proposal link",
  "proposals.toggleProposalAddOn": "client proposal link",
  "vault.toggleClientFavorite": "client vault link",
  "vault.submitRetouchNote": "client vault link",
  "visualizer.createPrintOrder": "client print order",
  "logistics.submitDigitalRelease": "talent/location release link",
};

const GUARD_RE = /await (requireStaff|requireOwner|requireSuperAdmin|requireStaffBySlug|assertOwner)\(|await getCurrentUser\(\)/;

type Who = { id: string; email: string; name: string; role: string; tenantId: string | null; tenantSlug: string | null } | null;

export async function runTier10AuthorizationTests(harness: TestHarness) {
  harness.setSuite("Tier 10", "Server-Action Authorization");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apex = await db.tenant.findUnique({ where: { slug: "apex-media" } });
  if (!lumina || !apex) throw new Error("Seed tenants lumina-cine / apex-media are required");

  const run = Date.now().toString(36);
  const slotIds: string[] = [];
  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { invoiceNumber: { startsWith: `T10-${run}` } } });
    await db.bookingSlot.deleteMany({ where: { id: { in: slotIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: "t10-" } } });
  });

  const as = (u: any, slug: string | null): Who =>
    u ? { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: slug } : null;
  const luminaOwner = as(await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } }), "lumina-cine");
  const apexOwner = as(await db.user.findFirst({ where: { tenantId: apex.id, role: "STUDIO_OWNER" } }), "apex-media");
  const luminaCrewRow = await db.user.findFirst({
    where: { tenantId: lumina.id, role: { in: ["CREW", "PHOTOGRAPHER", "VIDEOGRAPHER"] } },
  });
  const luminaCrew =
    as(luminaCrewRow, "lumina-cine") ??
    as(
      await db.user.create({ data: { tenantId: lumina.id, email: `t10-crew-${run}@example.test`, name: "T10 Crew", role: "CREW" } }),
      "lumina-cine"
    );
  const client = as(
    await db.user.create({ data: { tenantId: lumina.id, email: `t10-client-${run}@example.test`, name: "T10 Client", role: "CLIENT" } }),
    "lumina-cine"
  );
  if (!luminaOwner || !apexOwner) throw new Error("Seed owners are required");

  const outsiders: Array<[string, Who]> = [
    ["anonymous", null],
    ["a signed-in client", client],
    ["another studio's owner", apexOwner],
  ];
  const denied = (res: any) =>
    res === null || (res && res.success === false && /UNAUTHENTICATED|FORBIDDEN/.test(String(res.message ?? res.error)));

  // ---- Static: every server action is guarded or explicitly public ------------------
  await harness.test("T10-STATIC-01: every exported server action is guarded or on the public allowlist", async () => {
    const dir = path.join(process.cwd(), "lib", "actions");
    const unguarded: string[] = [];
    let total = 0;
    for (const file of await fs.readdir(dir)) {
      if (!file.endsWith(".ts")) continue;
      const src = await fs.readFile(path.join(dir, file), "utf8");
      if (!/^["']use server["']/.test(src.trimStart())) continue;
      const mod = file.replace(/\.ts$/, "");
      const re = /^export async function (\w+)/gm;
      const starts = [...src.matchAll(re)];
      starts.forEach((m, i) => {
        total += 1;
        const body = src.slice(m.index!, i + 1 < starts.length ? starts[i + 1]!.index : src.length);
        const key = `${mod}.${m[1]}`;
        if (!GUARD_RE.test(body) && !PUBLIC_ACTIONS[key]) unguarded.push(key);
      });
    }
    harness.assert(total > 40, `Scanned ${total} server actions`);
    harness.assert(unguarded.length === 0, "No unguarded, unclassified server actions", `Unguarded: ${unguarded.join(", ")}`);
  });

  // ---- Payment verification (marks invoices paid / unlocks vaults) --------------------
  const invoice = await db.milestoneInvoice.create({
    data: {
      tenantId: lumina.id,
      invoiceNumber: `T10-${run}-1`,
      clientId: client!.id,
      milestoneType: "PRINT_FRAME_ORDER",
      amount: 120,
      status: "PENDING_VERIFICATION",
      paymentMethod: "QR_CODE",
      dueDate: new Date(Date.now() + 86400000),
    },
  });

  await harness.test("T10-VER-01: outsiders cannot approve or reject a payment", async () => {
    for (const [label, who] of outsiders) {
      const a = await withSession(who, () =>
        approvePaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine", staffName: "Mallory" })
      );
      harness.assert(denied(a), `Approve denied for ${label}`, JSON.stringify(a));
      const r = await withSession(who, () =>
        rejectPaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine", staffName: "Mallory", reason: "Receipt looks forged" })
      );
      harness.assert(denied(r), `Reject denied for ${label}`, JSON.stringify(r));
    }
    const after = await db.milestoneInvoice.findUnique({ where: { id: invoice.id } });
    harness.assertEqual(after?.status, "PENDING_VERIFICATION", "Invoice untouched");
  });

  await harness.test("T10-VER-02: another studio's owner cannot use their own tenantId to reach this invoice", async () => {
    const res = await withSession(apexOwner, () =>
      approvePaymentVerification({ invoiceId: invoice.id, tenantId: apex.id, tenantSlug: "apex-media", staffName: "Mallory" })
    );
    harness.assertEqual(res.success, false, "Cross-tenant invoice rejected");
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: invoice.id } }))?.status, "PENDING_VERIFICATION", "Still pending");
  });

  await harness.test("T10-VER-03: the studio's own staff can approve", async () => {
    const res = await withSession(luminaCrew, () =>
      approvePaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine", staffName: "Crew" })
    );
    harness.assertEqual(res.success, true, "Approved by own staff", JSON.stringify(res));
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: invoice.id } }))?.status, "PAID", "Invoice PAID");
  });

  // ---- Calendar CRUD -------------------------------------------------------------------
  await harness.test("T10-CAL-01: outsiders cannot delete a studio's slots; its owner can", async () => {
    const slot = await db.bookingSlot.create({
      data: { tenantId: lumina.id, date: new Date(Date.now() + 86400000 * 40), startTime: "1:00 PM", endTime: "2:00 PM", status: "AVAILABLE" },
    });
    slotIds.push(slot.id);
    for (const [label, who] of outsiders) {
      const res = await withSession(who, () => deleteBookingSlot({ slotId: slot.id, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
      harness.assert(denied(res), `Delete denied for ${label}`, JSON.stringify(res));
    }
    harness.assert(!!(await db.bookingSlot.findUnique({ where: { id: slot.id } })), "Slot still exists");
    const ok = await withSession(luminaOwner, () => deleteBookingSlot({ slotId: slot.id, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
    harness.assertEqual(ok.success, true, "Owner can delete", JSON.stringify(ok));
    const swept = await withSession(null, () => cleanupExpiredHolds(lumina.id, "lumina-cine"));
    harness.assert(denied(swept), "cleanupExpiredHolds denied for anonymous");
  });

  // ---- Studio settings (bank details, slug, branding) ----------------------------------
  await harness.test("T10-SET-01: only the owner can change studio settings; crew and outsiders cannot", async () => {
    const payload: any = {
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      name: lumina.name,
      newSlug: lumina.slug,
      customDomain: lumina.customDomain,
      discipline: lumina.discipline,
      tagline: lumina.tagline,
      bio: lumina.bio,
      logoUrl: lumina.logoUrl,
      brandColor: lumina.brandColor ?? "#f59e0b",
      currency: lumina.currency,
      qrCodeUrl: lumina.qrCodeUrl,
      bankDetails: "ATTACKER BANK 0000",
    };
    for (const [label, who] of [...outsiders, ["the studio's crew", luminaCrew] as [string, Who]]) {
      const res = await withSession(who, () => updateStudioSettings(payload));
      harness.assert(denied(res), `Settings denied for ${label}`, JSON.stringify(res));
    }
    const after = await db.tenant.findUnique({ where: { id: lumina.id } });
    harness.assertEqual(after?.bankDetails, lumina.bankDetails, "Bank details unchanged");
    const ok = await withSession(luminaOwner, () => updateStudioSettings({ ...payload, bankDetails: lumina.bankDetails }));
    harness.assertEqual(ok.success, true, "Owner can save settings", JSON.stringify(ok));
  });

  // ---- Read-only admin data ------------------------------------------------------------
  await harness.test("T10-READ-01: studio analytics and platform metrics are not readable by outsiders", async () => {
    for (const [label, who] of outsiders) {
      const a = await withSession(who, () => getStudioAnalytics("lumina-cine"));
      harness.assert(a === null, `Analytics hidden from ${label}`);
    }
    harness.assert((await withSession(luminaOwner, () => getStudioAnalytics("lumina-cine"))) !== null, "Owner sees analytics");
    for (const [label, who] of [...outsiders, ["a studio owner", luminaOwner] as [string, Who]]) {
      let threw = false;
      try {
        await withSession(who, () => getPlatformMetrics());
      } catch {
        threw = true;
      }
      harness.assert(threw, `Platform metrics refused for ${label}`);
      let threw2 = false;
      try {
        await withSession(who, () => getAllTenantsSummary());
      } catch {
        threw2 = true;
      }
      harness.assert(threw2, `Tenant list refused for ${label}`);
    }
  });

  // ---- On-set shot list ----------------------------------------------------------------
  await harness.test("T10-SHOT-01: shot status can only be changed by the owning studio's staff", async () => {
    const shot = await db.shotItem.findFirst({ where: { project: { tenantId: lumina.id } } });
    if (!shot) {
      harness.assert(true, "No seeded shot items (skipped)");
      return;
    }
    const target = shot.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    for (const [label, who] of outsiders) {
      const res = await withSession(who, () => toggleShotCompletion({ shotId: shot.id, status: target as any }));
      harness.assert(denied(res), `Shot toggle denied for ${label}`, JSON.stringify(res));
    }
    harness.assertEqual((await db.shotItem.findUnique({ where: { id: shot.id } }))?.status, shot.status, "Shot unchanged");
    const ok = await withSession(luminaCrew, () => toggleShotCompletion({ shotId: shot.id, status: target as any }));
    harness.assertEqual(ok.success, true, "Studio crew can toggle", JSON.stringify(ok));
    await withSession(luminaCrew, () => toggleShotCompletion({ shotId: shot.id, status: shot.status as any }));
  });
}
