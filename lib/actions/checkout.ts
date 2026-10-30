"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";
import {
  ProcessBookingCheckoutSchema,
  type ProcessBookingCheckoutInput,
  ProcessInvoicePaymentSchema,
  type ProcessInvoicePaymentInput,
} from "@/lib/validations/checkout";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function processBookingCheckout(input: ProcessBookingCheckoutInput) {
  try {
    const validated = ProcessBookingCheckoutSchema.parse(input);
    const {
      tenantId,
      tenantSlug,
      slotId,
      sessionId,
      clientName,
      clientEmail,
      clientPhone,
      creativeBrief,
      paymentMethod,
      paymentProofUrl,
      paymentReference,
    } = validated;

    // 1. Verify Slot Hold Ownership
    const slot = await db.bookingSlot.findUnique({
      where: { id: slotId },
    });

    if (!slot || slot.tenantId !== tenantId) {
      return { success: false, error: "SLOT_NOT_FOUND", message: "Booking slot was not found." };
    }

    const now = new Date();
    const isHeldByMe =
      slot.status === "HELD" &&
      slot.heldBySessionId === sessionId &&
      slot.heldUntil !== null &&
      slot.heldUntil > now;
    const isAvailable = slot.status === "AVAILABLE";

    if (!isHeldByMe && !isAvailable) {
      return {
        success: false,
        error: "SLOT_EXPIRED_OR_UNAVAILABLE",
        message: "Your slot hold has expired or this slot was claimed by another client.",
      };
    }

    // 2. Generate Tracking Code & Invoice Number
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const trackingCode = `BK-${tenantSlug.toUpperCase().slice(0, 4)}-${Date.now().toString(36).toUpperCase()}-${randomHex}`;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const isCard = paymentMethod === "CARD";
    const invoiceStatus = isCard ? "PAID" : "PENDING_VERIFICATION";
    const slotStatus = isCard ? "BOOKED" : "PENDING_VERIFICATION";
    const bookingStatus = isCard ? "CONFIRMED" : "PENDING";

    // 3. Execute Atomic Transaction
    const result = await db.$transaction(async (tx) => {
      // Find or create User
      let user = await tx.user.findUnique({ where: { email: clientEmail } });
      if (!user) {
        user = await tx.user.create({
          data: {
            tenantId,
            name: clientName,
            email: clientEmail,
            phone: clientPhone,
            role: "CLIENT",
            isQuickCreated: true,
          },
        });
      }

      // Proactively disassociate any cancelled booking still referencing this slot to prevent @unique collision
      await tx.clientBooking.updateMany({
        where: { slotId: slot.id, status: "CANCELLED" },
        data: { slotId: null },
      });

      // Create MilestoneInvoice
      const invoice = await tx.milestoneInvoice.create({
        data: {
          tenantId,
          invoiceNumber,
          clientId: user.id,
          milestoneType: "BOOKING_DEPOSIT",
          amount: slot.depositRequired,
          status: invoiceStatus,
          paymentMethod,
          paymentProofUrl: paymentProofUrl || null,
          paymentReference: isCard
            ? `CARD-AUTH-${Math.random().toString(16).substring(2, 10).toUpperCase()}`
            : (paymentReference || (paymentMethod === "CASH" ? "CASH_COUNTER" : "QR_SLIP_UPLOAD")),
          verifiedBy: isCard ? "System Auto" : null,
          dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
          paidAt: isCard ? new Date() : null,
        },
      });

      // Create ClientBooking
      const booking = await tx.clientBooking.create({
        data: {
          tenantId,
          trackingCode,
          category: slot.category,
          clientName,
          clientEmail,
          clientPhone,
          discipline: "PHOTOGRAPHY",
          serviceTier: slot.campaignTitle || "STANDARD",
          targetDate: slot.date instanceof Date ? slot.date.toISOString().split("T")[0] : String(slot.date).split("T")[0],
          creativeBrief: creativeBrief || null,
          status: bookingStatus,
          depositPaid: isCard,
          depositAmount: slot.depositRequired,
          paymentMethod,
          slotId: slot.id,
          userId: user.id,
        },
      });

      // Update BookingSlot status
      await tx.bookingSlot.update({
        where: { id: slot.id },
        data: {
          status: slotStatus,
          heldUntil: null,
          heldBySessionId: null,
        },
      });

      return { booking, invoice };
    });

    safeRevalidate(`/${tenantSlug}/book`);
    safeRevalidate(`/${tenantSlug}/admin/verification`);

    // Dispatch automated booking confirmation notification
    if (clientEmail) {
      sendNotification({
        event: "BOOKING_CONFIRMED",
        studioName: tenantSlug,
        studioSlug: tenantSlug,
        clientName,
        clientEmail,
        clientPhone: clientPhone || undefined,
        packageName: "Studio Production Session",
        slotDate: slot.date ? new Date(slot.date).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Scheduled Date",
        startTime: slot.startTime,
        endTime: slot.endTime,
        depositAmount: slot.depositRequired,
        currency: "USD",
      }).catch((e) => console.error("Notification dispatch failed:", e));
    }

    return {
      success: true,
      bookingId: result.booking.id,
      trackingCode: result.booking.trackingCode,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      status: invoiceStatus,
      paymentMethod,
      amount: slot.depositRequired,
    };
  } catch (err: any) {
    console.error("Error in processBookingCheckout:", err);
    return {
      success: false,
      error: "CHECKOUT_FAILED",
      message: err.message || "Failed to process checkout",
    };
  }
}

export async function processInvoicePayment(input: ProcessInvoicePaymentInput) {
  try {
    const { tenantId, tenantSlug, invoiceId, paymentMethod, paymentProofUrl, paymentReference } =
      ProcessInvoicePaymentSchema.parse(input);

    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { client: true, project: true },
    });

    if (!invoice) {
      return { success: false, error: "INVOICE_NOT_FOUND", message: "Invoice not found or does not belong to studio." };
    }

    if (invoice.status === "PAID") {
      return { success: false, error: "ALREADY_PAID", message: "Invoice is already paid." };
    }

    const isCard = paymentMethod === "CARD";
    const status = isCard ? "PAID" : "PENDING_VERIFICATION";
    let unlockedDownloads = false;

    await db.$transaction(async (tx) => {
      await tx.milestoneInvoice.update({
        where: { id: invoiceId },
        data: {
          status,
          paymentMethod,
          paymentProofUrl: paymentProofUrl || invoice.paymentProofUrl,
          paymentReference: isCard
            ? `CARD-AUTH-${Math.random().toString(16).substring(2, 10).toUpperCase()}`
            : (paymentReference || invoice.paymentReference),
          verifiedBy: isCard ? "System Auto" : null,
          paidAt: isCard ? new Date() : null,
        },
      });

      // If paying final balance with card, immediately unlock project paywall
      if (isCard && invoice.milestoneType === "FINAL_BALANCE_50" && invoice.projectId) {
        await tx.project.update({
          where: { id: invoice.projectId },
          data: { isFinalBalancePaid: true },
        });
        unlockedDownloads = true;
      }

      // If paying booking deposit with card, confirm any linked booking & slot
      if (isCard && invoice.milestoneType === "BOOKING_DEPOSIT") {
        const booking = await tx.clientBooking.findFirst({
          where: {
            tenantId,
            userId: invoice.clientId,
            status: "PENDING",
          },
        });

        if (booking) {
          await tx.clientBooking.update({
            where: { id: booking.id },
            data: { status: "CONFIRMED", depositPaid: true },
          });

          if (booking.slotId) {
            await tx.bookingSlot.update({
              where: { id: booking.slotId },
              data: {
                status: "BOOKED",
                heldUntil: null,
                heldBySessionId: null,
              },
            });
          }
        }
      }
    });

    safeRevalidate(`/${tenantSlug}/admin/verification`);
    if (invoice.projectId) {
      safeRevalidate(`/${tenantSlug}/vault/${invoice.projectId}`);
    }

    return {
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status,
      unlockedDownloads,
      paymentMethod,
    };
  } catch (err: any) {
    console.error("Error in processInvoicePayment:", err);
    return { success: false, error: "PAYMENT_FAILED", message: err.message || "Failed to process invoice payment." };
  }
}
