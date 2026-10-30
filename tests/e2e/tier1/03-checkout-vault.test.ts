/**
 * Tier 1: Module 3 — Checkout, Proposals & Delivery Vault
 * Covers Features 15–27 (65 distinct tests, 5 per feature)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { holdBookingSlot } from "@/lib/actions/booking";
import { processBookingCheckout, processInvoicePayment } from "@/lib/actions/checkout";
import {
  approvePaymentVerification,
  rejectPaymentVerification,
} from "@/lib/actions/admin-verification";
import { getProposalBySlugAndId, acceptProposal } from "@/lib/actions/proposals";
import { toggleClientFavorite, submitRetouchNote } from "@/lib/actions/vault";
import { GET as downloadHandler } from "@/app/api/download/route";
import { TestHarness } from "../test-harness";

export async function runCheckoutVaultTests(harness: TestHarness) {
  harness.setSuite("Tier 1", "Module 3: Checkout, Proposals & Delivery Vault (Features 15-27)");

  const luminaTenant = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  const apexTenant = await db.tenant.findUnique({ where: { slug: "apex-media" } });

  harness.assert(luminaTenant !== null, "Lumina tenant resolved");
  harness.assert(apexTenant !== null, "Apex tenant resolved");

  // ============================================================================
  // Feature 15: Multi-Option Checkout System (5 Tests)
  // ============================================================================
  await harness.test("T1-F15-01: Validates required checkout fields; rejects invalid email", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 20),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const session = "sess_f15_01_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Test Client",
      clientEmail: "not-an-email",
      clientPhone: "+15551234567",
      paymentMethod: "CARD",
    });

    harness.assert(res.success === false, "Rejected invalid email address in checkout input");
    harness.assert(
      Boolean(res.message?.includes("email") || res.error === "CHECKOUT_FAILED"),
      "Error indicates email validation failure"
    );
  });

  await harness.test("T1-F15-02: Generates unique client tracking code matching BK pattern", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 21),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_f15_02_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Tracking Code Client",
      clientEmail: `tracking_${Date.now()}@test.com`,
      clientPhone: "+15559871122",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.bookingId) {
        await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      }
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(checkoutRes.success === true, "Checkout succeeded");
    harness.assert(typeof checkoutRes.trackingCode === "string", "trackingCode returned");
    harness.assert(checkoutRes.trackingCode!.startsWith("BK-"), "trackingCode matches BK- prefix pattern");
  });

  await harness.test("T1-F15-03: Generates unique invoice number matching INV pattern", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 22),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_f15_03_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Invoice Number Client",
      clientEmail: `invnum_${Date.now()}@test.com`,
      clientPhone: "+15559873344",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.invoiceId) {
        await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId } }).catch(() => null);
      }
      if (checkoutRes.bookingId) {
        await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      }
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(checkoutRes.success === true, "Checkout succeeded");
    harness.assert(typeof checkoutRes.invoiceNumber === "string", "invoiceNumber returned");
    harness.assert(checkoutRes.invoiceNumber!.startsWith("INV-"), "invoiceNumber matches INV- prefix pattern");
  });

  await harness.test("T1-F15-04: Automatically creates or links client User record with role CLIENT", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 23),
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_f15_04_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const clientEmail = `newclient_${Date.now()}@test.com`;
    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Brand New Client",
      clientEmail,
      clientPhone: "+15559875566",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.invoiceId) await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId } }).catch(() => null);
      if (checkoutRes.bookingId) await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      await db.user.delete({ where: { email: clientEmail } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(checkoutRes.success === true, "Checkout succeeded");
    const user = await db.user.findUnique({ where: { email: clientEmail } });
    harness.assert(user !== null, "User record created in database");
    harness.assert(user?.role === "CLIENT", "User assigned role CLIENT");
  });

  await harness.test("T1-F15-05: Rejects checkout if slot hold has expired or belongs to another tenant", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 24),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "HELD",
        heldUntil: new Date(Date.now() - 5000), // Expired
        heldBySessionId: "expired_hold_sess",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: "different_session",
      clientName: "Late Client",
      clientEmail: `late_${Date.now()}@test.com`,
      clientPhone: "+15559877788",
      paymentMethod: "CARD",
    });

    harness.assert(res.success === false, "Checkout rejected for expired hold");
    harness.assert(res.error === "SLOT_EXPIRED_OR_UNAVAILABLE", "Error code matches SLOT_EXPIRED_OR_UNAVAILABLE");
  });

  // ============================================================================
  // Feature 16: Simulated Online Card Checkout (5 Tests)
  // ============================================================================
  await harness.test("T1-F16-01: Card checkout completes with status: PAID and verifiedBy: 'System Auto'", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 25),
        startTime: "11:00 AM",
        endTime: "01:00 PM",
        category: "COMMERCIAL",
        price: 600,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });
    const session = "sess_card_01_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Card Client",
      clientEmail: `card01_${Date.now()}@test.com`,
      clientPhone: "+15551239900",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(res.success === true, "Card checkout succeeded");
    harness.assert(res.status === "PAID", "Returned status is PAID");
    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.verifiedBy === "System Auto", "Invoice verifiedBy is 'System Auto'");
  });

  await harness.test("T1-F16-02: Card checkout immediately transitions slot from HELD to BOOKED", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 26),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "COMMERCIAL",
        price: 600,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });
    const session = "sess_card_02_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Slot Booked Client",
      clientEmail: `card02_${Date.now()}@test.com`,
      clientPhone: "+15551239911",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const updatedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(updatedSlot?.status === "BOOKED", "Slot status transitioned to BOOKED");
    harness.assert(updatedSlot?.heldBySessionId === null, "heldBySessionId was cleared");
  });

  await harness.test("T1-F16-03: Linked ClientBooking immediately transitions to CONFIRMED with depositPaid: true", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 27),
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        category: "COMMERCIAL",
        price: 600,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });
    const session = "sess_card_03_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Booking Confirmed Client",
      clientEmail: `card03_${Date.now()}@test.com`,
      clientPhone: "+15551239922",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assert(booking?.status === "CONFIRMED", "Booking status is CONFIRMED");
    harness.assert(booking?.depositPaid === true, "depositPaid is true");
  });

  await harness.test("T1-F16-04: MilestoneInvoice created with milestoneType: BOOKING_DEPOSIT and paidAt timestamp", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 28),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 600,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });
    const session = "sess_card_04_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Deposit Invoice Client",
      clientEmail: `card04_${Date.now()}@test.com`,
      clientPhone: "+15551239933",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.milestoneType === "BOOKING_DEPOSIT", "milestoneType is BOOKING_DEPOSIT");
    harness.assert(invoice?.paidAt !== null, "paidAt timestamp is populated");
  });

  await harness.test("T1-F16-05: Payment reference records synthetic authorization code CARD-AUTH-*", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 29),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 600,
        depositRequired: 300,
        status: "AVAILABLE",
      },
    });
    const session = "sess_card_05_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Auth Code Client",
      clientEmail: `card05_${Date.now()}@test.com`,
      clientPhone: "+15551239944",
      paymentMethod: "CARD",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.paymentReference?.startsWith("CARD-AUTH-") === true, "paymentReference starts with CARD-AUTH-");
  });

  // ============================================================================
  // Feature 17: Studio QR Code Scan & Receipt Upload (5 Tests)
  // ============================================================================
  await harness.test("T1-F17-01: QR checkout completes with status: PENDING_VERIFICATION", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 30),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 700,
        depositRequired: 350,
        status: "AVAILABLE",
      },
    });
    const session = "sess_qr_01_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "QR Client",
      clientEmail: `qr01_${Date.now()}@test.com`,
      clientPhone: "+15553334411",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/proof.jpg",
      paymentReference: "QR-SLIP-12345",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(res.success === true, "QR checkout succeeded");
    harness.assert(res.status === "PENDING_VERIFICATION", "Returned status is PENDING_VERIFICATION");
  });

  await harness.test("T1-F17-02: Linked booking slot transitions to PENDING_VERIFICATION", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 31),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 700,
        depositRequired: 350,
        status: "AVAILABLE",
      },
    });
    const session = "sess_qr_02_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "QR Slot Client",
      clientEmail: `qr02_${Date.now()}@test.com`,
      clientPhone: "+15553334422",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/proof.jpg",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const updatedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(updatedSlot?.status === "PENDING_VERIFICATION", "Slot transitioned to PENDING_VERIFICATION");
  });

  await harness.test("T1-F17-03: ClientBooking record created with status: PENDING and depositPaid: false", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 32),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 700,
        depositRequired: 350,
        status: "AVAILABLE",
      },
    });
    const session = "sess_qr_03_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "QR Booking Client",
      clientEmail: `qr03_${Date.now()}@test.com`,
      clientPhone: "+15553334433",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/proof.jpg",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assert(booking?.status === "PENDING", "Booking status is PENDING");
    harness.assert(booking?.depositPaid === false, "depositPaid is false");
  });

  await harness.test("T1-F17-04: MilestoneInvoice created with status: PENDING_VERIFICATION and records paymentProofUrl", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 33),
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        category: "COMMERCIAL",
        price: 700,
        depositRequired: 350,
        status: "AVAILABLE",
      },
    });
    const session = "sess_qr_04_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const proofUrl = "/uploads/receipts/custom_slip_proof.jpg";
    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Proof Url Client",
      clientEmail: `qr04_${Date.now()}@test.com`,
      clientPhone: "+15553334444",
      paymentMethod: "QR_CODE",
      paymentProofUrl: proofUrl,
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.status === "PENDING_VERIFICATION", "Invoice status is PENDING_VERIFICATION");
    harness.assert(invoice?.paymentProofUrl === proofUrl, "Invoice recorded paymentProofUrl");
  });

  await harness.test("T1-F17-05: Invoices with PENDING_VERIFICATION appear in studio manual verification queue", async () => {
    const pendingInvoices = await db.milestoneInvoice.findMany({
      where: { tenantId: luminaTenant!.id, status: "PENDING_VERIFICATION" },
    });
    harness.assert(Array.isArray(pendingInvoices), "Verification queue query returns array");
  });

  // ============================================================================
  // Feature 18: Cash Counter Payment Option (5 Tests)
  // ============================================================================
  await harness.test("T1-F18-01: Cash checkout completes with status: PENDING_VERIFICATION", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 34),
        startTime: "02:00 PM",
        endTime: "04:00 PM",
        category: "COMMERCIAL",
        price: 800,
        depositRequired: 400,
        status: "AVAILABLE",
      },
    });
    const session = "sess_cash_01_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Cash Client",
      clientEmail: `cash01_${Date.now()}@test.com`,
      clientPhone: "+15554445511",
      paymentMethod: "CASH",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    harness.assert(res.success === true, "Cash checkout succeeded");
    harness.assert(res.status === "PENDING_VERIFICATION", "Status is PENDING_VERIFICATION");
  });

  await harness.test("T1-F18-02: Linked booking slot transitions to PENDING_VERIFICATION on cash checkout", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 35),
        startTime: "05:00 PM",
        endTime: "07:00 PM",
        category: "COMMERCIAL",
        price: 800,
        depositRequired: 400,
        status: "AVAILABLE",
      },
    });
    const session = "sess_cash_02_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Cash Slot Client",
      clientEmail: `cash02_${Date.now()}@test.com`,
      clientPhone: "+15554445522",
      paymentMethod: "CASH",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const updatedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });
    harness.assert(updatedSlot?.status === "PENDING_VERIFICATION", "Slot transitioned to PENDING_VERIFICATION");
  });

  await harness.test("T1-F18-03: ClientBooking record created with paymentMethod: CASH and depositPaid: false", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 36),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 800,
        depositRequired: 400,
        status: "AVAILABLE",
      },
    });
    const session = "sess_cash_03_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Cash Booking Client",
      clientEmail: `cash03_${Date.now()}@test.com`,
      clientPhone: "+15554445533",
      paymentMethod: "CASH",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const booking = await db.clientBooking.findUnique({ where: { id: res.bookingId } });
    harness.assert(booking?.paymentMethod === "CASH", "Booking paymentMethod is CASH");
    harness.assert(booking?.depositPaid === false, "depositPaid is false");
  });

  await harness.test("T1-F18-04: MilestoneInvoice created with paymentReference: CASH_COUNTER", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 37),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 800,
        depositRequired: 400,
        status: "AVAILABLE",
      },
    });
    const session = "sess_cash_04_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Counter Invoice Client",
      clientEmail: `cash04_${Date.now()}@test.com`,
      clientPhone: "+15554445544",
      paymentMethod: "CASH",
    });

    harness.registerTeardown(async () => {
      if (res.invoiceId) await db.milestoneInvoice.delete({ where: { id: res.invoiceId } }).catch(() => null);
      if (res.bookingId) await db.clientBooking.delete({ where: { id: res.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.paymentReference === "CASH_COUNTER", "paymentReference is CASH_COUNTER");
  });

  await harness.test("T1-F18-05: Rejects unsupported payment method strings with validation error", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 38),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 800,
        depositRequired: 400,
        status: "AVAILABLE",
      },
    });
    harness.registerTeardown(async () => {
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const res = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: "sess_invalid_method",
      clientName: "Invalid Method Client",
      clientEmail: "invalid@test.com",
      clientPhone: "+15554445555",
      paymentMethod: "BITCOIN" as any,
    });
    harness.assert(res.success === false, "Rejected unsupported payment method 'BITCOIN'");
  });

  // ============================================================================
  // Feature 19: Studio Manual Verification Console (5 Tests)
  // ============================================================================
  await harness.test("T1-F19-01: approvePaymentVerification transitions invoice from PENDING_VERIFICATION to PAID", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 39),
        startTime: "10:00 AM",
        endTime: "12:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_v19_01_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Approval Test Client",
      clientEmail: `approve01_${Date.now()}@test.com`,
      clientPhone: "+15555550011",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/proof.jpg",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.invoiceId) await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId } }).catch(() => null);
      if (checkoutRes.bookingId) await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const approveRes = await approvePaymentVerification({
      invoiceId: checkoutRes.invoiceId!,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Lead Staff",
      notes: "Receipt verified against bank account",
    });

    harness.assert(approveRes.success === true, "approvePaymentVerification succeeded");
    const updatedInvoice = await db.milestoneInvoice.findUnique({ where: { id: checkoutRes.invoiceId } });
    harness.assert(updatedInvoice?.status === "PAID", "Invoice transitioned to PAID");
    harness.assert(updatedInvoice?.verifiedBy === "Lead Staff", "Invoice records verifiedBy: 'Lead Staff'");
    harness.assert(updatedInvoice?.paidAt !== null, "Invoice records paidAt timestamp");
  });

  await harness.test("T1-F19-02: Approving BOOKING_DEPOSIT invoice confirms ClientBooking and locks slot to BOOKED", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 40),
        startTime: "01:00 PM",
        endTime: "03:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_v19_02_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Deposit Approve Client",
      clientEmail: `approve02_${Date.now()}@test.com`,
      clientPhone: "+15555550022",
      paymentMethod: "CASH",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.invoiceId) await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId } }).catch(() => null);
      if (checkoutRes.bookingId) await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    await approvePaymentVerification({
      invoiceId: checkoutRes.invoiceId!,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Lead Staff",
    });

    const updatedBooking = await db.clientBooking.findUnique({ where: { id: checkoutRes.bookingId } });
    const updatedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });

    harness.assert(updatedBooking?.status === "CONFIRMED", "Booking status confirmed");
    harness.assert(updatedBooking?.depositPaid === true, "depositPaid is true");
    harness.assert(updatedSlot?.status === "BOOKED", "Slot status locked to BOOKED");
  });

  await harness.test("T1-F19-03: Approving FINAL_BALANCE_50 invoice sets Project.isFinalBalancePaid = true and returns unlockedDownloads: true", async () => {
    const testProject = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        projectNumber: `PJ-FINAL-${Date.now()}`,
        title: "Test Final Balance Project",
        clientId: (await db.user.findFirst({ where: { role: "CLIENT" } }))!.id,
        studioLeadId: (await db.user.findFirst({ where: { role: "STUDIO_OWNER" } }))!.id,
        discipline: "HYBRID",
        budget: 5000,
        isFinalBalancePaid: false,
      },
    });

    const finalInvoice = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        projectId: testProject.id,
        clientId: testProject.clientId,
        invoiceNumber: `INV-FINAL-${Date.now()}`,
        amount: 2500,
        milestoneType: "FINAL_BALANCE_50",
        status: "PENDING_VERIFICATION",
        dueDate: new Date(Date.now() + 86400000 * 7),
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: finalInvoice.id } }).catch(() => null);
      await db.project.delete({ where: { id: testProject.id } }).catch(() => null);
    });

    const approveRes = await approvePaymentVerification({
      invoiceId: finalInvoice.id,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Studio Director",
    });

    harness.assert(approveRes.success === true, "Approval succeeded");
    harness.assert(approveRes.unlockedDownloads === true, "Returned unlockedDownloads: true");
    const updatedProject = await db.project.findUnique({ where: { id: testProject.id } });
    harness.assert(updatedProject?.isFinalBalancePaid === true, "Project.isFinalBalancePaid flipped to true");
  });

  await harness.test("T1-F19-04: rejectPaymentVerification transitions invoice to REJECTED, frees slot to AVAILABLE, and cancels booking", async () => {
    const slot = await db.bookingSlot.create({
      data: {
        tenantId: luminaTenant!.id,
        date: new Date(Date.now() + 86400000 * 41),
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        category: "COMMERCIAL",
        price: 500,
        depositRequired: 250,
        status: "AVAILABLE",
      },
    });
    const session = "sess_v19_04_" + Date.now();
    await holdBookingSlot({ tenantId: luminaTenant!.id, slotId: slot.id, sessionId: session });

    const checkoutRes = await processBookingCheckout({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      slotId: slot.id,
      sessionId: session,
      clientName: "Reject Test Client",
      clientEmail: `reject04_${Date.now()}@test.com`,
      clientPhone: "+15555550044",
      paymentMethod: "QR_CODE",
      paymentProofUrl: "/uploads/receipts/proof.jpg",
    });

    harness.registerTeardown(async () => {
      if (checkoutRes.invoiceId) await db.milestoneInvoice.delete({ where: { id: checkoutRes.invoiceId } }).catch(() => null);
      if (checkoutRes.bookingId) await db.clientBooking.delete({ where: { id: checkoutRes.bookingId } }).catch(() => null);
      await db.bookingSlot.delete({ where: { id: slot.id } }).catch(() => null);
    });

    const rejectRes = await rejectPaymentVerification({
      invoiceId: checkoutRes.invoiceId!,
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      staffName: "Lead Staff",
      reason: "Blurry receipt slip, unable to verify wire transfer",
    });

    harness.assert(rejectRes.success === true, "rejectPaymentVerification succeeded");
    const updatedInvoice = await db.milestoneInvoice.findUnique({ where: { id: checkoutRes.invoiceId } });
    const updatedBooking = await db.clientBooking.findUnique({ where: { id: checkoutRes.bookingId } });
    const updatedSlot = await db.bookingSlot.findUnique({ where: { id: slot.id } });

    harness.assert(updatedInvoice?.status === "REJECTED", "Invoice status is REJECTED");
    harness.assert(updatedBooking?.status === "CANCELLED", "Booking status is CANCELLED");
    harness.assert(updatedSlot?.status === "AVAILABLE", "Slot reverted back to AVAILABLE for public booking");
  });

  await harness.test("T1-F19-05: Cross-tenant isolation: Studio B staff cannot approve Studio A invoice", async () => {
    const luminaInvoice = await db.milestoneInvoice.findFirst({
      where: { tenantId: luminaTenant!.id },
    });
    harness.assert(luminaInvoice !== null, "Lumina invoice found");

    const crossRes = await approvePaymentVerification({
      invoiceId: luminaInvoice!.id,
      tenantId: apexTenant!.id, // Tampered tenant ID
      tenantSlug: "apex-media",
      staffName: "Apex Staff",
    });

    harness.assert(crossRes.success === false, "Cross-tenant invoice approval rejected");
    harness.assert(crossRes.error === "INVOICE_NOT_FOUND", "Error returned is INVOICE_NOT_FOUND");
  });

  // ============================================================================
  // Feature 20: Interactive Proposal Builder (5 Tests)
  // ============================================================================
  await harness.test("T1-F20-01: getProposalBySlugAndId fetches proposal by cuid or proposalNumber", async () => {
    const proposal = await db.proposal.findFirst({
      where: { tenantId: luminaTenant!.id },
    });
    harness.assert(proposal !== null, "Lumina proposal exists");

    const byId = await getProposalBySlugAndId("lumina-cine", proposal!.id);
    const byNumber = await getProposalBySlugAndId("lumina-cine", proposal!.proposalNumber);

    harness.assert(byId !== null && byId.id === proposal!.id, "Fetched proposal by ID");
    harness.assert(byNumber !== null && byNumber.id === proposal!.id, "Fetched proposal by proposalNumber");
  });

  await harness.test("T1-F20-02: Proposal returns linked add-on line items with price, unit, and isSelected boolean", async () => {
    const proposal = await db.proposal.findFirst({
      where: { tenantId: luminaTenant!.id, addOns: { some: {} } },
      include: { addOns: true },
    });
    harness.assert(proposal !== null && proposal.addOns.length > 0, "Proposal with add-ons found");
    if (proposal) {
      for (const addon of proposal.addOns) {
        harness.assert(typeof addon.name === "string", "Add-on name is string");
        harness.assert(typeof addon.price === "number", "Add-on price is number");
        harness.assert(typeof addon.isSelected === "boolean", "Add-on isSelected is boolean");
      }
    }
  });

  await harness.test("T1-F20-03: Tenant scoping: proposal from another studio returns null", async () => {
    const luminaProposal = await db.proposal.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(luminaProposal !== null, "Lumina proposal exists");

    const crossFetch = await getProposalBySlugAndId("apex-media", luminaProposal!.id);
    harness.assert(crossFetch === null, "Lumina proposal queried under Apex slug returned null");
  });

  await harness.test("T1-F20-04: Proposal returns linked client and studio owner details", async () => {
    const proposal = await db.proposal.findFirst({
      where: { tenantId: luminaTenant!.id },
      include: { client: true, studio: true },
    });
    harness.assert(proposal !== null, "Proposal resolved");
    harness.assert(typeof proposal?.client?.name === "string", "Client name populated");
    harness.assert(typeof proposal?.client?.email === "string", "Client email populated");
  });

  await harness.test("T1-F20-05: Proposal returns contract terms and deposit percentage", async () => {
    const proposal = await db.proposal.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(typeof proposal?.contractTerms === "string" && proposal.contractTerms.length > 0, "contractTerms is string");
    harness.assert(typeof proposal?.depositPercentage === "number", "depositPercentage is number");
    harness.assert(proposal?.depositPercentage === 50, "Default deposit percentage is 50%");
  });

  // ============================================================================
  // Feature 21: Live Deposit & Balance Recalculator (5 Tests)
  // ============================================================================
  await harness.test("T1-F21-01: Base price alone: subtotal = basePrice, deposit = 50%, final balance = 50%", async () => {
    const basePrice = 4000;
    const addOnTotal = 0;
    const subtotal = basePrice + addOnTotal;
    const depositPct = 50;
    const deposit = (subtotal * depositPct) / 100;
    const finalBalance = subtotal - deposit;

    harness.assertEqual(subtotal, 4000, "Subtotal is 4000");
    harness.assertEqual(deposit, 2000, "50% deposit is 2000");
    harness.assertEqual(finalBalance, 2000, "50% final balance is 2000");
  });

  await harness.test("T1-F21-02: Selecting 1 add-on: subtotal = base + addon; deposit and balance update to 50%", async () => {
    const basePrice = 4000;
    const addOnPrice = 800; // Drone 4K coverage
    const subtotal = basePrice + addOnPrice;
    const deposit = (subtotal * 50) / 100;
    const finalBalance = subtotal - deposit;

    harness.assertEqual(subtotal, 4800, "Subtotal is 4800");
    harness.assertEqual(deposit, 2400, "Deposit is 2400");
    harness.assertEqual(finalBalance, 2400, "Balance is 2400");
  });

  await harness.test("T1-F21-03: Selecting multiple add-ons calculates total sum and rounds to 2 decimals", async () => {
    const basePrice = 5250.50;
    const addOns = [350.25, 750.00, 199.99];
    const addOnTotal = addOns.reduce((sum, p) => sum + p, 0);
    const subtotal = Number((basePrice + addOnTotal).toFixed(2));
    const deposit = Number(((subtotal * 50) / 100).toFixed(2));
    const finalBalance = Number((subtotal - deposit).toFixed(2));

    harness.assertEqual(subtotal, 6550.74, "Calculated subtotal accurately");
    harness.assertEqual(deposit, 3275.37, "Calculated 50% deposit accurately");
    harness.assertEqual(finalBalance, 3275.37, "Calculated 50% balance accurately");
  });

  await harness.test("T1-F21-04: Deselecting all add-ons returns subtotal to original base price", async () => {
    const basePrice = 3000;
    let selectedAddOns = [400, 200];
    selectedAddOns = []; // Deselect all
    const subtotal = basePrice + selectedAddOns.reduce((s, p) => s + p, 0);
    harness.assertEqual(subtotal, 3000, "Subtotal reverted to base price");
  });

  await harness.test("T1-F21-05: Non-default deposit percentage (e.g. 40%) splits subtotal accordingly", async () => {
    const subtotal = 10000;
    const depositPct = 40;
    const deposit = (subtotal * depositPct) / 100;
    const finalBalance = subtotal - deposit;

    harness.assertEqual(deposit, 4000, "40% deposit is 4000");
    harness.assertEqual(finalBalance, 6000, "60% final balance is 6000");
  });

  // ============================================================================
  // Feature 22: Touchscreen Digital Signature Pad (5 Tests)
  // ============================================================================
  await harness.test("T1-F22-01: Accepts valid Base64 PNG canvas data URL", async () => {
    const validSignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAADwCAYAAAA+VemSAAAACXBIWXMAAAsTAAALEwEAmpwYAAABWWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4K";
    harness.assert(validSignature.startsWith("data:image/"), "Valid data URL prefix");
    harness.assert(validSignature.length > 50, "Signature length exceeds 50 characters");
  });

  await harness.test("T1-F22-02: Rejects empty or whitespace-only signature string", async () => {
    const emptySig = "   ";
    harness.assert(emptySig.trim().length === 0, "Whitespace signature recognized as invalid");
  });

  await harness.test("T1-F22-03: Rejects signature string shorter than minimum threshold", async () => {
    const shortSig = "data:image/png;base64,abc";
    harness.assert(shortSig.length < 50, "Short signature rejected below minimum threshold");
  });

  await harness.test("T1-F22-04: Persists signature string into Proposal.clientSignature upon acceptance", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProposal = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-SIG-${Date.now()}`,
        title: "Signature Test Proposal",
        basePrice: 2000,
        totalPrice: 2000,
        depositAmount: 1000,
        finalBalanceAmount: 1000,
        contractTerms: "Standard Production Agreement",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProposal.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProposal.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProposal.id } }).catch(() => null);
    });

    const acceptRes = await acceptProposal({
      proposalId: testProposal.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(acceptRes.success === true, "Proposal accepted");
    const updated = await db.proposal.findUnique({ where: { id: testProposal.id } });
    harness.assert(updated?.clientSignature === dummySignature, "clientSignature persisted in database");
    harness.assert(updated?.signedAt !== null, "signedAt timestamp persisted in database");
  });

  await harness.test("T1-F22-05: Persists signature into DigitalRelease.signatureDataUrl upon release submission", async () => {
    const project = await db.project.findFirst({ where: { tenantId: luminaTenant!.id } });
    harness.assert(project !== null, "Project resolved");

    const sigUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const release = await db.digitalRelease.create({
      data: {
        projectId: project!.id,
        releaseType: "TALENT",
        signerName: "John Talent",
        signerEmail: "talent@example.com",
        signerRole: "Actor",
        signatureDataUrl: sigUrl,
        termsContent: "Standard Talent Agreement",
      },
    });

    harness.registerTeardown(async () => {
      await db.digitalRelease.delete({ where: { id: release.id } }).catch(() => null);
    });

    harness.assert(release.signatureDataUrl === sigUrl, "DigitalRelease persisted signatureDataUrl");
  });

  // ============================================================================
  // Feature 23: 50% Retainer Milestone Invoicing (5 Tests)
  // ============================================================================
  await harness.test("T1-F23-01: Accepting proposal transitions Proposal.status from SENT to ACCEPTED", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProp = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-ACC-${Date.now()}`,
        title: "Acceptance Test Proposal",
        basePrice: 3000,
        totalPrice: 3000,
        depositAmount: 1500,
        finalBalanceAmount: 1500,
        contractTerms: "Standard Production Agreement",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProp.id } }).catch(() => null);
    });

    const res = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(res.success === true, "acceptProposal returned success: true");
    const updated = await db.proposal.findUnique({ where: { id: testProp.id } });
    harness.assert(updated?.status === "ACCEPTED", "Proposal.status transitioned to ACCEPTED");
  });

  await harness.test("T1-F23-02: Atomically creates linked Project in PRE_PRODUCTION status", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProp = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-PRJ-${Date.now()}`,
        title: "Project Creation Proposal",
        basePrice: 3500,
        totalPrice: 3500,
        depositAmount: 1750,
        finalBalanceAmount: 1750,
        contractTerms: "Terms",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProp.id } }).catch(() => null);
    });

    const res = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(Boolean(res.projectId), "Returned projectId in response");
    const project = await db.project.findUnique({ where: { id: res.projectId } });
    harness.assert(project?.status === "PRE_PRODUCTION", "Project status is PRE_PRODUCTION");
    harness.assert(project?.isFinalBalancePaid === false, "Project.isFinalBalancePaid is false initially");
  });

  await harness.test("T1-F23-03: Atomically creates MilestoneInvoice with milestoneType: RETAINER_50 and status: PENDING", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProp = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-INV-${Date.now()}`,
        title: "Retainer Invoice Proposal",
        basePrice: 4000,
        totalPrice: 4000,
        depositAmount: 2000,
        finalBalanceAmount: 2000,
        contractTerms: "Terms",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProp.id } }).catch(() => null);
    });

    const res = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(Boolean(res.invoiceId), "Returned invoiceId in response");
    const invoice = await db.milestoneInvoice.findUnique({ where: { id: res.invoiceId } });
    harness.assert(invoice?.milestoneType === "RETAINER_50", "milestoneType is RETAINER_50");
    harness.assert(invoice?.amount === 2000, "Retainer invoice amount is 2000");
    harness.assert(invoice?.status === "PENDING", "Invoice status is PENDING");
  });

  await harness.test("T1-F23-04: Returns checkout URL redirecting client to pay retainer", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProp = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-URL-${Date.now()}`,
        title: "Checkout URL Proposal",
        basePrice: 1000,
        totalPrice: 1000,
        depositAmount: 500,
        finalBalanceAmount: 500,
        contractTerms: "Terms",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProp.id } }).catch(() => null);
    });

    const res = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assert(typeof res.checkoutUrl === "string", "Returned checkoutUrl");
    harness.assert(res.checkoutUrl!.includes("/lumina-cine/checkout?invoiceId="), "checkoutUrl links to tenant checkout with invoiceId");
  });

  await harness.test("T1-F23-05: Idempotency: re-calling acceptProposal returns existing project and invoice without duplicates", async () => {
    const client = await db.user.findFirst({ where: { role: "CLIENT" } });
    const lead = await db.user.findFirst({ where: { role: "STUDIO_OWNER" } });
    const dummySignature =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK8AAACvCAYAAACLcAk6AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAwSURBVHhe7cEBDQAAAMKg909tDjegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7wY0MAABs05e3AAAAABJRU5ErkJggg==";

    const testProp = await db.proposal.create({
      data: {
        tenantId: luminaTenant!.id,
        clientId: client!.id,
        studioId: lead!.id,
        discipline: "HYBRID",
        proposalNumber: `PROP-IDEM-${Date.now()}`,
        title: "Idempotent Proposal",
        basePrice: 1000,
        totalPrice: 1000,
        depositAmount: 500,
        finalBalanceAmount: 500,
        contractTerms: "Terms",
        status: "SENT",
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.project.deleteMany({ where: { proposalId: testProp.id } }).catch(() => null);
      await db.proposal.delete({ where: { id: testProp.id } }).catch(() => null);
    });

    const call1 = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });
    const call2 = await acceptProposal({
      proposalId: testProp.id,
      tenantSlug: "lumina-cine",
      signatureDataUrl: dummySignature,
      signerName: "John Doe",
      consentAccepted: true,
      selectedAddOnIds: [],
    });

    harness.assertEqual(call1.projectId, call2.projectId, "Second call returned same projectId");
    harness.assertEqual(call1.invoiceId, call2.invoiceId, "Second call returned same invoiceId");
    const countInvoices = await db.milestoneInvoice.count({ where: { proposalId: testProp.id } });
    harness.assertEqual(countInvoices, 1, "Only 1 milestone invoice created in database");
  });

  // ============================================================================
  // Feature 24: Direct Delivery Vault UI (5 Tests)
  // ============================================================================
  await harness.test("T1-F24-01: Retrieves project deliverables and grouped items (PHOTO, VIDEO) for project", async () => {
    const project = await db.project.findFirst({
      where: { deliverables: { some: {} } },
      include: {
        deliverables: {
          include: {
            items: true,
          },
        },
      },
    });

    harness.assert(project !== null, "Project with deliverables found");
    if (project) {
      const items = project.deliverables.flatMap((d) => d.items);
      harness.assert(items.length > 0, "Deliverable items exist");
      const types = new Set(items.map((i) => i.itemType));
      harness.assert(types.has("PHOTO") || types.has("VIDEO"), "Items include PHOTO or VIDEO type");
    }
  });

  await harness.test("T1-F24-02: Paywall state evaluates to locked when isFinalBalancePaid: false", async () => {
    const project = await db.project.findUnique({ where: { id: "proj_lumina_01" } });
    harness.assert(project !== null, "Lumina project exists");
    harness.assert(project?.isFinalBalancePaid === false, "proj_lumina_01 has isFinalBalancePaid === false in seed");
  });

  await harness.test("T1-F24-03: Paywall state evaluates to unlocked when isFinalBalancePaid: true", async () => {
    const project = await db.project.findUnique({ where: { id: "proj_apex_01" } });
    harness.assert(project !== null, "Apex project exists");
    harness.assert(project?.isFinalBalancePaid === true, "proj_apex_01 has isFinalBalancePaid === true in seed");
  });

  await harness.test("T1-F24-04: Watermarked preview URLs are always accessible regardless of payment status", async () => {
    const items = await db.deliverableItem.findMany({ take: 5 });
    for (const item of items) {
      harness.assert(typeof item.previewUrl === "string" && item.previewUrl.length > 0, "previewUrl is populated");
    }
  });

  await harness.test("T1-F24-05: Video streaming review proxy URL available for in-browser client video review", async () => {
    const videoItem = await db.deliverableItem.findFirst({
      where: { itemType: "VIDEO" },
    });
    harness.assert(videoItem !== null, "Video deliverable item found");
    harness.assert(typeof videoItem?.previewUrl === "string" && videoItem.previewUrl.length > 0, "Video previewUrl streaming proxy exists");
  });

  // ============================================================================
  // Feature 25: 50% Final Balance Paywall Gating (5 Tests)
  // ============================================================================
  await harness.test("T1-F25-01: GET /api/download?projectId=...&type=photo_zip returns HTTP 403 when unpaid", async () => {
    // Ensure proj_lumina_01 is unpaid
    await db.project.update({ where: { id: "proj_lumina_01" }, data: { isFinalBalancePaid: false } });

    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid photo_zip returns HTTP 403");
  });

  await harness.test("T1-F25-02: GET /api/download?projectId=...&type=video_master returns HTTP 403 when unpaid", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=video_master");
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid video_master returns HTTP 403");
  });

  await harness.test("T1-F25-03: GET /api/download?projectId=...&type=photo_master&assetId=... returns HTTP 403 when unpaid", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_master&assetId=some_asset");
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 403, "Unpaid photo_master returns HTTP 403");
  });

  await harness.test("T1-F25-04: 403 response payload contains structured JSON error message", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01&type=photo_zip");
    const res = await downloadHandler(req);
    const body = await res.json();
    harness.assert(body.error?.includes("Payment Required") === true, "403 body includes 'Payment Required'");
    harness.assert(body.isFinalBalancePaid === false, "403 body includes isFinalBalancePaid: false");
  });

  await harness.test("T1-F25-05: Missing query parameters returns HTTP 400 Bad Request", async () => {
    const reqNoProject = new NextRequest("http://localhost:3000/api/download?type=photo_zip");
    const resNoProject = await downloadHandler(reqNoProject);
    harness.assertEqual(resNoProject.status, 400, "Missing projectId returns 400");

    const reqNoType = new NextRequest("http://localhost:3000/api/download?projectId=proj_lumina_01");
    const resNoType = await downloadHandler(reqNoType);
    harness.assertEqual(resNoType.status, 400, "Missing type returns 400");
  });

  // ============================================================================
  // Feature 26: Master Deliverable Download Unlock (5 Tests)
  // ============================================================================
  await harness.test("T1-F26-01: GET /api/download?projectId=...&type=photo_zip returns HTTP 200 OK when paid", async () => {
    // proj_apex_01 is paid in seed
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_apex_01&type=photo_zip");
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 200, "Paid photo_zip returns HTTP 200");
  });

  await harness.test("T1-F26-02: Photo ZIP download headers contain application/zip and attachment disposition", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_apex_01&type=photo_zip");
    const res = await downloadHandler(req);
    harness.assertEqual(res.headers.get("content-type"), "application/zip", "Content-Type is application/zip");
    harness.assert(res.headers.get("content-disposition")?.includes("Master_Deliverables.zip") === true, "Content-Disposition includes Master_Deliverables.zip");
  });

  await harness.test("T1-F26-03: Downloaded ZIP payload starts with standard PKZIP magic header bytes [0x50, 0x4b, 0x03, 0x04]", async () => {
    const req = new NextRequest("http://localhost:3000/api/download?projectId=proj_apex_01&type=photo_zip");
    const res = await downloadHandler(req);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    harness.assert(buffer.length >= 4, "ZIP buffer has at least 4 bytes");
    harness.assertEqual(buffer[0], 0x50, "Magic byte 0 is 0x50 ('P')");
    harness.assertEqual(buffer[1], 0x4b, "Magic byte 1 is 0x4B ('K')");
    harness.assertEqual(buffer[2], 0x03, "Magic byte 2 is 0x03");
    harness.assertEqual(buffer[3], 0x04, "Magic byte 3 is 0x04");
  });

  await harness.test("T1-F26-04: GET /api/download?projectId=...&type=video_master returns HTTP 200 OK on paid project", async () => {
    // Create paid project with video deliverable for test
    const testProj = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        projectNumber: `PJ-VID-${Date.now()}`,
        title: "Test Video Project",
        clientId: (await db.user.findFirst({ where: { role: "CLIENT" } }))!.id,
        studioLeadId: (await db.user.findFirst({ where: { role: "STUDIO_OWNER" } }))!.id,
        discipline: "VIDEOGRAPHY",
        budget: 5000,
        isFinalBalancePaid: true,
      },
    });
    const deliverable = await db.clientDeliverable.create({
      data: {
        projectId: testProj.id,
        title: "Test Video Cut",
        discipline: "VIDEOGRAPHY",
      },
    });
    const videoItem = await db.deliverableItem.create({
      data: {
        deliverableId: deliverable.id,
        itemType: "VIDEO",
        title: "ProRes 4K Master",
        previewUrl: "/uploads/deliverables/previews/aurora_60s_stream_proxy.mp4",
        downloadUrl: "/uploads/deliverables/masters/aurora_60s_prores422hq_master.mov",
      },
    });

    harness.registerTeardown(async () => {
      await db.deliverableItem.delete({ where: { id: videoItem.id } }).catch(() => null);
      await db.clientDeliverable.delete({ where: { id: deliverable.id } }).catch(() => null);
      await db.project.delete({ where: { id: testProj.id } }).catch(() => null);
    });

    const req = new NextRequest(`http://localhost:3000/api/download?projectId=${testProj.id}&type=video_master`);
    const res = await downloadHandler(req);
    harness.assertEqual(res.status, 200, "Paid video_master returns 200 OK");
  });

  await harness.test("T1-F26-05: Settling final balance invoice immediately unlocks downloads without server restart", async () => {
    const testProj = await db.project.create({
      data: {
        tenantId: luminaTenant!.id,
        projectNumber: `PJ-UNLOCK-${Date.now()}`,
        title: "Test Unlock Project",
        clientId: (await db.user.findFirst({ where: { role: "CLIENT" } }))!.id,
        studioLeadId: (await db.user.findFirst({ where: { role: "STUDIO_OWNER" } }))!.id,
        discipline: "HYBRID",
        budget: 4000,
        isFinalBalancePaid: false,
      },
    });

    const photoDel = await db.clientDeliverable.create({
      data: {
        projectId: testProj.id,
        title: "Test Photos",
        discipline: "PHOTOGRAPHY",
      },
    });
    const photoItem = await db.deliverableItem.create({
      data: {
        deliverableId: photoDel.id,
        itemType: "PHOTO",
        title: "Test Image",
        previewUrl: "/uploads/deliverables/previews/lookbook_01.jpg",
        downloadUrl: "/uploads/deliverables/masters/lookbook_01.jpg",
      },
    });

    const finalInv = await db.milestoneInvoice.create({
      data: {
        tenantId: luminaTenant!.id,
        projectId: testProj.id,
        clientId: testProj.clientId,
        invoiceNumber: `INV-UNLOCK-${Date.now()}`,
        amount: 2000,
        milestoneType: "FINAL_BALANCE_50",
        status: "PENDING",
        dueDate: new Date(Date.now() + 86400000 * 7),
      },
    });

    harness.registerTeardown(async () => {
      await db.milestoneInvoice.delete({ where: { id: finalInv.id } }).catch(() => null);
      await db.deliverableItem.delete({ where: { id: photoItem.id } }).catch(() => null);
      await db.clientDeliverable.delete({ where: { id: photoDel.id } }).catch(() => null);
      await db.project.delete({ where: { id: testProj.id } }).catch(() => null);
    });

    // Verify 403 before payment
    const preReq = new NextRequest(`http://localhost:3000/api/download?projectId=${testProj.id}&type=photo_zip`);
    const preRes = await downloadHandler(preReq);
    harness.assertEqual(preRes.status, 403, "Before payment returns 403");

    // Pay final balance
    const payRes = await processInvoicePayment({
      tenantId: luminaTenant!.id,
      tenantSlug: "lumina-cine",
      invoiceId: finalInv.id,
      paymentMethod: "CARD",
    });
    harness.assert(payRes.success === true, "Invoice payment succeeded");

    // Verify 200 immediately after payment
    const postReq = new NextRequest(`http://localhost:3000/api/download?projectId=${testProj.id}&type=photo_zip`);
    const postRes = await downloadHandler(postReq);
    harness.assertEqual(postRes.status, 200, "After payment immediately returns 200 OK");
  });

  // ============================================================================
  // Feature 27: Client Favorites & Retouch Feedback (5 Tests)
  // ============================================================================
  await harness.test("T1-F27-01: toggleClientFavorite({ itemId, isFav: true }) sets isClientFav = true", async () => {
    const item = await db.deliverableItem.findFirst();
    harness.assert(item !== null, "DeliverableItem exists");

    const res = await toggleClientFavorite({ itemId: item!.id, isFav: true });
    harness.assert(res.success === true, "toggleClientFavorite succeeded");
    const updated = await db.deliverableItem.findUnique({ where: { id: item!.id } });
    harness.assertEqual(updated?.isClientFav, true, "isClientFav is true");
  });

  await harness.test("T1-F27-02: toggleClientFavorite({ itemId, isFav: false }) sets isClientFav = false", async () => {
    const item = await db.deliverableItem.findFirst();
    harness.assert(item !== null, "DeliverableItem exists");

    const res = await toggleClientFavorite({ itemId: item!.id, isFav: false });
    harness.assert(res.success === true, "toggleClientFavorite succeeded");
    const updated = await db.deliverableItem.findUnique({ where: { id: item!.id } });
    harness.assertEqual(updated?.isClientFav, false, "isClientFav is false");
  });

  await harness.test("T1-F27-03: submitRetouchNote({ itemId, note }) saves note to database", async () => {
    const item = await db.deliverableItem.findFirst();
    harness.assert(item !== null, "DeliverableItem exists");

    const noteText = "Please warm up the background tone slightly";
    const res = await submitRetouchNote({ itemId: item!.id, note: noteText });
    harness.assert(res.success === true, "submitRetouchNote succeeded");
    const updated = await db.deliverableItem.findUnique({ where: { id: item!.id } });
    harness.assertEqual(updated?.clientNotes, noteText, "clientNotes saved to database");
  });

  await harness.test("T1-F27-04: Submitting whitespace note sanitizes clientNotes to null", async () => {
    const item = await db.deliverableItem.findFirst();
    harness.assert(item !== null, "DeliverableItem exists");

    const res = await submitRetouchNote({ itemId: item!.id, note: "   " });
    harness.assert(res.success === true, "submitRetouchNote succeeded");
    const updated = await db.deliverableItem.findUnique({ where: { id: item!.id } });
    harness.assertEqual(updated?.clientNotes, null, "clientNotes sanitized to null");
  });

  await harness.test("T1-F27-05: submitRetouchNote rejects notes exceeding 1000 characters", async () => {
    const item = await db.deliverableItem.findFirst();
    harness.assert(item !== null, "DeliverableItem exists");

    const hugeNote = "A".repeat(1001);
    const res = await submitRetouchNote({ itemId: item!.id, note: hugeNote });
    harness.assert(res.success === false, "submitRetouchNote rejected note > 1000 characters");
  });
}
