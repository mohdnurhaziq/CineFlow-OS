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
import { deleteBookingSlot, cleanupExpiredHolds, createSingleBookingSlot, updateBookingSlot } from "@/lib/actions/admin-calendar";
import { createServicePackage, deleteCampaignCategory } from "@/lib/actions/admin-services";
import { createBookingForCustomer } from "@/lib/actions/admin-bookings";
import { updateStudioSettings } from "@/lib/actions/admin-settings";
import { getStudioAnalytics } from "@/lib/actions/admin-analytics";
import { getPlatformMetrics, getAllTenantsSummary } from "@/lib/actions/super-admin";
import { toggleShotCompletion, submitDigitalRelease } from "@/lib/actions/logistics";
import { acceptProposal, getProposalBySlugAndId, toggleProposalAddOn } from "@/lib/actions/proposals";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { registerClient } from "@/lib/actions/client-auth";
import { createPrintOrder } from "@/lib/actions/visualizer";
import { processInvoicePayment } from "@/lib/actions/checkout";
import { issueClientInvite } from "@/lib/auth/invite";
import { GET as downloadHandler } from "@/app/api/download/route";
import { NextRequest } from "next/server";
import { loose } from "./result-helpers";
import type { UpdateStudioSettingsInput } from "@/lib/validations/admin-settings";

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
  "password-reset.requestPasswordReset": "forgot password (signed out; rate-limited, same reply for any email)",
  "password-reset.resetPassword": "forgot password (needs the one-time emailed token; rate-limited)",
};

const GUARD_RE = /await (requireStaff|requireOwner|requireSuperAdmin|requireStaffBySlug|assertOwner|requireRecordAccess|requireItemAccess)\(|await getCurrentUser\(\)/;

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
    // Records owned by this run's clients (signing a proposal also creates a project and invoice).
    const t10Client = { client: { email: { startsWith: `t10-owner-client-${run}` } } };
    await db.milestoneInvoice.deleteMany({ where: t10Client });
    await db.project.deleteMany({ where: t10Client });
    await db.proposal.deleteMany({ where: t10Client });
    await db.user.deleteMany({ where: { email: { startsWith: "t10-" } } });
  });

  type UserRow = { id: string; email: string; name: string; role: string; tenantId: string | null };
  const as = (u: UserRow | null, slug: string | null): Who =>
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
  // A refused action returns null (guard throws are caught as null by some callers) or a failure result.
  const denied = (res: unknown) => {
    if (res === null) return true;
    const r = res as { success?: boolean; message?: unknown; error?: unknown } | undefined;
    return !!r && r.success === false && /UNAUTHENTICATED|FORBIDDEN/.test(String(r.message ?? r.error));
  };

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
        approvePaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
      );
      harness.assert(denied(a), `Approve denied for ${label}`, JSON.stringify(a));
      const r = await withSession(who, () =>
        rejectPaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine", reason: "Receipt looks forged" })
      );
      harness.assert(denied(r), `Reject denied for ${label}`, JSON.stringify(r));
    }
    const after = await db.milestoneInvoice.findUnique({ where: { id: invoice.id } });
    harness.assertEqual(after?.status, "PENDING_VERIFICATION", "Invoice untouched");
  });

  await harness.test("T10-VER-02: another studio's owner cannot use their own tenantId to reach this invoice", async () => {
    const res = await withSession(apexOwner, () =>
      approvePaymentVerification({ invoiceId: invoice.id, tenantId: apex.id, tenantSlug: "apex-media" })
    );
    harness.assertEqual(res.success, false, "Cross-tenant invoice rejected");
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: invoice.id } }))?.status, "PENDING_VERIFICATION", "Still pending");
  });

  await harness.test("T10-VER-03: only the studio owner can approve; crew are refused", async () => {
    const crew = await withSession(luminaCrew, () =>
      approvePaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assert(denied(crew), "Crew cannot approve a payment", JSON.stringify(crew));
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: invoice.id } }))?.status, "PENDING_VERIFICATION", "Still pending after crew attempt");
    const res = await withSession(luminaOwner, () =>
      approvePaymentVerification({ invoiceId: invoice.id, tenantId: lumina.id, tenantSlug: "lumina-cine" })
    );
    harness.assertEqual(res.success, true, "Approved by the owner", JSON.stringify(res));
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: invoice.id } }))?.status, "PAID", "Invoice PAID");
  });

  // ---- Owner-only money: prices and recorded payments -----------------------------------
  await harness.test("T10-OWN-01: crew can't change package prices or delete categories", async () => {
    const pkg = await withSession(luminaCrew, () =>
      createServicePackage({
        tenantId: lumina.id, tenantSlug: "lumina-cine", name: "Crew price", category: "commercial", discipline: "PHOTOGRAPHY",
        price: 10, depositPrice: 5, turnaround: "1 day", description: "Should be refused", deliverables: "None", isFeatured: false,
      })
    );
    harness.assert(denied(pkg), "Crew cannot create a package", JSON.stringify(pkg));
    const cat = await db.campaignCategory.findFirst({ where: { tenantId: lumina.id } });
    const del = await withSession(luminaCrew, () => deleteCampaignCategory({ id: cat!.id, tenantId: lumina.id, tenantSlug: "lumina-cine" }));
    harness.assert(denied(del), "Crew cannot delete a category", JSON.stringify(del));
  });

  await harness.test("T10-OWN-02: crew slots are priced by packages; crew can't set or change a slot fee", async () => {
    const day = new Date(Date.now() + 86400000 * 200).toISOString().slice(0, 10);
    const priced = await withSession(luminaCrew, () =>
      createSingleBookingSlot({ tenantId: lumina.id, tenantSlug: "lumina-cine", date: day, startTime: "09:00 AM", endTime: "10:00 AM", category: "commercial", price: 999, depositRequired: 1, status: "AVAILABLE" })
    );
    harness.assert(priced.success === true, "Crew can open a slot in a category with packages", JSON.stringify(priced));
    if (priced.success && priced.slot) {
      harness.assertEqual(priced.slot.price, 0, "Fee sent by crew is ignored: priced by the package");
      const raise = await withSession(luminaCrew, () => updateBookingSlot({ id: priced.slot!.id, tenantId: lumina.id, tenantSlug: "lumina-cine", price: 500 }));
      harness.assertEqual(raise.error, "OWNER_ONLY", "Crew cannot change the fee");
      const move = await withSession(luminaCrew, () => updateBookingSlot({ id: priced.slot!.id, tenantId: lumina.id, tenantSlug: "lumina-cine", startTime: "09:30 AM", endTime: "10:30 AM" }));
      harness.assert(move.success === true, "Crew can still move the slot", JSON.stringify(move));
      await db.bookingSlot.delete({ where: { id: priced.slot.id } });
    }
    const unpriced = await withSession(luminaCrew, () =>
      createSingleBookingSlot({ tenantId: lumina.id, tenantSlug: "lumina-cine", date: day, startTime: "01:00 PM", endTime: "02:00 PM", category: "no-packages-here", price: 100, depositRequired: 50, status: "AVAILABLE" })
    );
    harness.assertEqual(unpriced.error, "OWNER_PRICING_REQUIRED", "No packages for the category: crew must ask the owner");
  });

  await harness.test("T10-OWN-03: crew can book a customer as awaiting payment, not as paid", async () => {
    const slot = await db.bookingSlot.create({
      data: { tenantId: lumina.id, date: new Date(Date.now() + 86400000 * 201), startTime: "09:00 AM", endTime: "10:00 AM", category: "EDITORIAL", price: 100, depositRequired: 50, status: "AVAILABLE" },
    });
    try {
      const base: Parameters<typeof createBookingForCustomer>[0] = { tenantId: lumina.id, tenantSlug: "lumina-cine", slotId: slot.id, newClient: { name: "T10 Walk-in", email: `t10-walkin-${run}@example.test`, phone: "0123456789" }, discipline: "PHOTOGRAPHY", paymentMethod: "CASH" };
      const paid = await withSession(luminaCrew, () => createBookingForCustomer({ ...base, paymentStatus: "PAID" }));
      harness.assertEqual(paid.success, false, "Crew cannot record a payment as received");
      harness.assertEqual((await db.bookingSlot.findUnique({ where: { id: slot.id } }))?.status, "AVAILABLE", "Slot untouched");
    } finally {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    }
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
    const payload: Parameters<typeof updateStudioSettings>[0] = {
      tenantId: lumina.id,
      tenantSlug: "lumina-cine",
      name: lumina.name,
      newSlug: lumina.slug,
      customDomain: lumina.customDomain,
      discipline: lumina.discipline as UpdateStudioSettingsInput["discipline"],
      tagline: lumina.tagline,
      bio: lumina.bio,
      logoUrl: lumina.logoUrl,
      brandColor: lumina.brandColor ?? "#f59e0b",
      currency: lumina.currency as UpdateStudioSettingsInput["currency"],
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
      const res = await withSession(who, () => toggleShotCompletion({ shotId: shot.id, status: target }));
      harness.assert(denied(res), `Shot toggle denied for ${label}`, JSON.stringify(res));
    }
    harness.assertEqual((await db.shotItem.findUnique({ where: { id: shot.id } }))?.status, shot.status, "Shot unchanged");
    const ok = await withSession(luminaCrew, () => toggleShotCompletion({ shotId: shot.id, status: target }));
    harness.assertEqual(ok.success, true, "Studio crew can toggle", JSON.stringify(ok));
    await withSession(luminaCrew, () => toggleShotCompletion({ shotId: shot.id, status: shot.status as Parameters<typeof toggleShotCompletion>[0]["status"] }));
  });

  // ---- Client records: proposals, vault, releases, downloads need a signed-in owner ------
  const recordClientRow = await db.user.create({
    data: { tenantId: lumina.id, email: `t10-owner-client-${run}@example.test`, name: "T10 Record Client", role: "CLIENT" },
  });
  const recordClient = as(recordClientRow, "lumina-cine");
  const sig = `data:image/png;base64,${"A".repeat(80)}`;
  const newProposal = (n: number) =>
    db.proposal.create({
      data: {
        tenantId: lumina.id, clientId: recordClientRow.id, studioId: luminaOwner!.id, proposalNumber: `T10-${run}-P${n}`,
        title: "T10 proposal", discipline: "PHOTOGRAPHY", basePrice: 1000, totalPrice: 1000, depositAmount: 500,
        finalBalanceAmount: 500, contractTerms: "Standard terms for the T10 test proposal.", status: "SENT",
      },
    });
  const signInput = (proposalId: string): Parameters<typeof acceptProposal>[0] => ({
    proposalId, tenantSlug: "lumina-cine", signatureDataUrl: sig, signerName: "T10 Record Client", consentAccepted: true, selectedAddOnIds: [],
  });

  await harness.test("T10-REC-01: only the addressed client, signed in, can sign a proposal", async () => {
    const prop = await newProposal(1);
    for (const [label, who] of [...outsiders, ["the studio owner", luminaOwner] as [string, Who], ["studio crew", luminaCrew] as [string, Who]]) {
      const res = await withSession(who, () => acceptProposal(signInput(prop.id)));
      harness.assert(denied(res), `Signing denied for ${label}`, JSON.stringify(res));
    }
    harness.assertEqual((await db.proposal.findUnique({ where: { id: prop.id } }))?.status, "SENT", "Proposal still unsigned");
    const ok = await withSession(recordClient, () => acceptProposal(signInput(prop.id)));
    harness.assertEqual(ok.success, true, "The proposal's client signs it", JSON.stringify(ok));
  });

  await harness.test("T10-REC-02: proposal reads and add-on changes need the client or studio staff", async () => {
    const prop = await newProposal(2);
    const addOn = await db.proposalAddOn.create({ data: { proposalId: prop.id, name: "Extra", description: "Extra hour", price: 50, unit: "fixed", isSelected: false } });
    for (const [label, who] of outsiders) {
      const read = await withSession(who, () => getProposalBySlugAndId("lumina-cine", prop.proposalNumber));
      harness.assert(read === null, `Proposal hidden from ${label}`);
      const t = await withSession(who, () => toggleProposalAddOn({ proposalId: prop.id, addOnId: addOn.id, isSelected: true }));
      harness.assert(denied(t), `Add-on change denied for ${label}`, JSON.stringify(t));
    }
    const read = await withSession(recordClient, () => getProposalBySlugAndId("lumina-cine", prop.id));
    harness.assert(read?.id === prop.id, "Client can read their proposal");
    harness.assert(!("passwordHash" in (read?.client ?? {})), "Client row is trimmed (no password hash)");
    const staffRead = await withSession(luminaCrew, () => getProposalBySlugAndId("lumina-cine", prop.id));
    harness.assert(staffRead?.id === prop.id, "Studio staff can read it");
  });

  const project = await db.project.create({
    data: {
      tenantId: lumina.id, clientId: recordClientRow.id, studioLeadId: luminaOwner!.id, projectNumber: `T10-${run}-PRJ`, title: "T10 project",
      category: "COMMERCIAL", discipline: "PHOTOGRAPHY", budget: 1000, isFinalBalancePaid: true,
      deliverables: { create: { title: "T10 gallery", discipline: "PHOTOGRAPHY", items: { create: { title: "T10 photo", itemType: "PHOTO", previewUrl: "/x.jpg", downloadUrl: "/x.jpg" } } } },
    },
    include: { deliverables: { include: { items: true } } },
  });
  const itemId = project.deliverables[0]!.items[0]!.id;

  await harness.test("T10-REC-03: vault favourites and retouch notes need the project's client or staff", async () => {
    for (const [label, who] of outsiders) {
      const f = await withSession(who, () => toggleClientFavorite({ itemId, isFav: true }));
      harness.assert(denied(f), `Favourite denied for ${label}`, JSON.stringify(f));
      const n = await withSession(who, () => submitRetouchNote({ itemId, note: "Brighten" }));
      harness.assert(denied(n), `Retouch note denied for ${label}`, JSON.stringify(n));
    }
    const item = await db.deliverableItem.findUnique({ where: { id: itemId } });
    harness.assertEqual(item?.isClientFav, false, "Item untouched");
    const ok = await withSession(recordClient, () => toggleClientFavorite({ itemId, isFav: true }));
    harness.assertEqual(ok.success, true, "Project client can favourite", JSON.stringify(ok));
  });

  await harness.test("T10-REC-04: releases need a signed-in client or staff, and record who collected them", async () => {
    const input: Parameters<typeof submitDigitalRelease>[0] = {
      projectId: project.id, tenantSlug: "lumina-cine", releaseType: "TALENT", signerName: "Talent", signerEmail: "talent@example.test",
      termsContent: "Standard likeness release terms for the T10 test.", signatureDataUrl: sig,
    };
    for (const [label, who] of outsiders) {
      const r = await withSession(who, () => submitDigitalRelease(input));
      harness.assert(denied(r), `Release denied for ${label}`, JSON.stringify(r));
    }
    const ok = await withSession(luminaCrew, () => submitDigitalRelease(input));
    harness.assertEqual(ok.success, true, "Studio crew collects a release", JSON.stringify(ok));
    const row = await db.digitalRelease.findUnique({ where: { id: ok.releaseId } });
    harness.assertEqual(row?.collectedById, luminaCrew!.id, "Collector id recorded");
    harness.assertEqual(row?.collectedByName, luminaCrew!.name, "Collector name recorded");
  });

  await harness.test("T10-REC-05: master downloads need the project's client or staff", async () => {
    const url = `http://localhost:3000/api/download?projectId=${project.id}&type=photo_master&assetId=${itemId}`;
    const anon = await withSession(null, () => downloadHandler(new NextRequest(url)));
    harness.assertEqual(anon.status, 401, "Signed out: 401");
    const other = await withSession(client, () => downloadHandler(new NextRequest(url)));
    harness.assertEqual(other.status, 404, "Another client: 404");
    const otherStudio = await withSession(apexOwner, () => downloadHandler(new NextRequest(url)));
    harness.assertEqual(otherStudio.status, 404, "Another studio's owner: 404");
    const mine = await withSession(recordClient, () => downloadHandler(new NextRequest(url)));
    harness.assert(mine.status !== 401 && mine.status !== 404 && mine.status !== 403, `Project client passes the access check (got ${mine.status})`);
  });

  await harness.test("T10-REC-06: a studio-created client sets a password with the emailed invite only", async () => {
    const invited = await db.user.create({
      data: { tenantId: lumina.id, email: `t10-invited-${run}@example.test`, name: "Invited", role: "CLIENT", isQuickCreated: true },
    });
    const token = await issueClientInvite(invited.id);
    const base = { tenantSlug: "lumina-cine", name: "Invited Client", email: invited.email, phone: "+60123456789", password: "a-strong-pass" };
    const none = loose(await withSession(null, () => registerClient(base)));
    harness.assertEqual(none.error, "CLAIM_REQUIRED", "No proof: refused");
    const wrong = loose(await withSession(null, () => registerClient({ ...base, inviteToken: "not-the-token" })));
    harness.assertEqual(wrong.error, "CLAIM_INVALID", "Wrong invite: refused");
    const ok = await withSession(null, () => registerClient({ ...base, inviteToken: token }));
    harness.assertEqual(ok.success, true, "Correct invite: password set", JSON.stringify(ok));
    const after = await db.user.findUnique({ where: { id: invited.id } });
    harness.assert(!!after?.passwordHash && after.inviteToken === null, "Invite used up");
    const again = await withSession(null, () => registerClient({ ...base, inviteToken: token }));
    harness.assertEqual(again.success, false, "Invite can't be reused");
  });

  await harness.test("T10-REC-07: print orders need a sign-in, and a client is billed as themselves", async () => {
    const size = await db.printSize.findFirst({ where: { tenantId: lumina.id } });
    const frame = await db.frameDesign.findFirst({ where: { tenantId: lumina.id } });
    if (!size || !frame) {
      harness.assert(true, "No seeded print catalog (skipped)");
      return;
    }
    type PrintOrderInput = Parameters<typeof createPrintOrder>[0];
    const order = (extra: Partial<PrintOrderInput> = {}): PrintOrderInput => ({
      tenantId: lumina.id, tenantSlug: "lumina-cine", printSizeId: size.id, frameDesignId: frame.id,
      matBoardType: "NONE", orientation: "PORTRAIT", photoUrl: "/x.jpg",
      clientName: "Someone Else", clientEmail: `t10-victim-${run}@example.test`, ...extra,
    });
    const anon = await withSession(null, () => createPrintOrder(order()));
    harness.assert(denied(anon), "Signed out: refused", JSON.stringify(anon));
    const cross = await withSession(apexOwner, () => createPrintOrder(order()));
    harness.assert(denied(cross), "Another studio's owner: refused", JSON.stringify(cross));
    const peek = await withSession(client, () => createPrintOrder(order({ projectId: project.id })));
    harness.assert(denied(peek), "A client can't attach another client's project", JSON.stringify(peek));

    const mine = await withSession(recordClient, () => createPrintOrder(order({ projectId: project.id })));
    harness.assertEqual(mine.success, true, "Client orders for themselves", JSON.stringify(mine));
    const inv = await db.milestoneInvoice.findUnique({ where: { id: mine.invoiceId } });
    harness.assertEqual(inv?.clientId, recordClientRow.id, "Billed to the signed-in client, not the typed email");
    harness.assert(!(await db.user.findFirst({ where: { email: `t10-victim-${run}@example.test` } })), "No account made for the typed email");

    const counter = await withSession(luminaCrew, () => createPrintOrder(order({ clientEmail: `t10-counter-${run}@example.test` })));
    harness.assertEqual(counter.success, true, "Staff can order for a client", JSON.stringify(counter));
    const staffEmail = await withSession(luminaCrew, () => createPrintOrder(order({ clientEmail: luminaOwner!.email })));
    harness.assertEqual(staffEmail.success, false, "Staff can't bill a team member");
    await db.milestoneInvoice.deleteMany({ where: { id: { in: [mine.invoiceId, counter.invoiceId].filter((id): id is string => !!id) } } });
  });

  await harness.test("T10-REC-08: only the invoice's client or studio staff can pay it", async () => {
    const inv = await db.milestoneInvoice.create({
      data: {
        tenantId: lumina.id, invoiceNumber: `T10-${run}-PAY`, clientId: recordClientRow.id, milestoneType: "PRINT_FRAME_ORDER",
        amount: 80, status: "PENDING", dueDate: new Date(Date.now() + 86400000),
      },
    });
    const pay: Parameters<typeof processInvoicePayment>[0] = { tenantId: lumina.id, tenantSlug: "lumina-cine", invoiceId: inv.id, paymentMethod: "QR_CODE", paymentProofUrl: "/uploads/receipts/t10.jpg" };
    for (const [label, who] of outsiders) {
      const r = await withSession(who, () => processInvoicePayment(pay));
      harness.assert(denied(r), `Payment denied for ${label}`, JSON.stringify(r));
    }
    harness.assertEqual((await db.milestoneInvoice.findUnique({ where: { id: inv.id } }))?.status, "PENDING", "Invoice untouched");
    const ok = await withSession(recordClient, () => processInvoicePayment(pay));
    harness.assertEqual(ok.success, true, "Its client sends a slip", JSON.stringify(ok));
  });
}
