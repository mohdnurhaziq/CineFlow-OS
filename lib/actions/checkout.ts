"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";
import { findOrCreateGuestClient, getSessionClient } from "@/lib/clients";
import { env } from "@/lib/env";
import { createBill, toSen } from "@/lib/payments/toyyibpay";
import { getGatewayCredentials, releaseAbandonedOnlineBooking, ONLINE_HOLD_MINUTES } from "@/lib/payments/settle";
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

    // A signed-in client books under their own account details.
    const sessionClient = await getSessionClient(tenantId);

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

    // Card payments go through the studio's Toyyibpay account. Without one, card is
    // only available as a simulation (dev/test) and is refused in production.
    let creds: ReturnType<typeof getGatewayCredentials> = null;
    if (paymentMethod === "CARD") {
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      creds = tenant ? getGatewayCredentials(tenant) : null;
      if (!creds && process.env.ALLOW_SIMULATED_CARD_PAYMENTS !== "true") {
        return {
          success: false,
          error: "CARD_UNAVAILABLE",
          message: "Online payment is not set up for this studio. Please choose QR or cash.",
        };
      }
      if (creds && toSen(slot.depositRequired) < 100) {
        return { success: false, error: "AMOUNT_TOO_LOW", message: "Online payment requires a deposit of at least RM 1.00." };
      }
    }
    const online = paymentMethod === "CARD" && creds !== null;

    const isCard = paymentMethod === "CARD" && !online; // simulated card: settles instantly
    const invoiceStatus = isCard ? "PAID" : online ? "PENDING" : "PENDING_VERIFICATION";
    const slotStatus = isCard ? "BOOKED" : online ? "HELD" : "PENDING_VERIFICATION";
    const bookingStatus = isCard ? "CONFIRMED" : "PENDING";

    // 3. Execute Atomic Transaction
    const result = await db.$transaction(async (tx) => {
      // Signed-in client account wins; otherwise fall back to the legacy guest path.
      const user =
        sessionClient ??
        (await findOrCreateGuestClient(tx, {
          tenantId,
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
        }));

      // Proactively disassociate any cancelled booking still referencing this slot to prevent @unique collision
      await tx.clientBooking.updateMany({
        where: { slotId: slot.id, status: "CANCELLED" },
        data: { slotId: null },
      });
      // An unpaid online booking whose hold lapsed must not block the slot.
      await releaseAbandonedOnlineBooking(tx, slot.id);

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
            : online
              ? trackingCode // links the invoice to its booking until the gateway settles it
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
          clientName: user.name,
          clientEmail: user.email,
          clientPhone: user.phone ?? clientPhone,
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
          heldUntil: online ? new Date(Date.now() + ONLINE_HOLD_MINUTES * 60_000) : null,
          heldBySessionId: online ? sessionId : null,
        },
      });

      return { booking, invoice };
    });

    safeRevalidate(`/${tenantSlug}/book`);
    safeRevalidate(`/${tenantSlug}/admin/verification`);

    if (online && creds) {
      const bill = await createBill(creds, {
        reference: result.invoice.invoiceNumber,
        name: "Booking Deposit",
        description: `Deposit ${result.booking.trackingCode}`,
        amountMyr: slot.depositRequired,
        payer: { name: result.booking.clientName, email: result.booking.clientEmail, phone: result.booking.clientPhone },
        returnUrl: `${env.NEXT_PUBLIC_APP_URL}/${tenantSlug}/checkout/payment-return`,
        callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/api/payments/toyyibpay/callback`,
        expiryMinutes: ONLINE_HOLD_MINUTES,
      });
      if (!bill.ok) {
        // Undo: free the slot and drop the unpaid booking so the client can retry or pick another method.
        await db.$transaction(async (tx) => {
          await tx.clientBooking.update({ where: { id: result.booking.id }, data: { status: "CANCELLED", slotId: null } });
          await tx.milestoneInvoice.update({ where: { id: result.invoice.id }, data: { status: "OVERDUE" } });
          await tx.bookingSlot.update({ where: { id: slot.id }, data: { status: "AVAILABLE", heldUntil: null, heldBySessionId: null } });
        });
        safeRevalidate(`/${tenantSlug}/book`);
        return { success: false, error: "GATEWAY_ERROR", message: bill.error };
      }
      await db.milestoneInvoice.update({ where: { id: result.invoice.id }, data: { gatewayBillCode: bill.billCode } });
      return {
        success: true,
        bookingId: result.booking.id,
        trackingCode: result.booking.trackingCode,
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        status: invoiceStatus,
        paymentMethod,
        amount: slot.depositRequired,
        paymentUrl: bill.paymentUrl,
      };
    }

    // Dispatch automated booking confirmation notification
    const notifyEmail = result.booking.clientEmail;
    if (notifyEmail) {
      sendNotification({
        event: "BOOKING_CONFIRMED",
        studioName: tenantSlug,
        studioSlug: tenantSlug,
        clientName: result.booking.clientName,
        clientEmail: notifyEmail,
        clientPhone: result.booking.clientPhone || undefined,
        packageName: "Studio Production Session",
        slotDate: slot.date ? new Date(slot.date).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Scheduled Date",
        startTime: slot.startTime,
        endTime: slot.endTime,
        depositAmount: slot.depositRequired,
        currency: "MYR",
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

    if (paymentMethod === "CARD") {
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
      const creds = tenant ? getGatewayCredentials(tenant) : null;
      if (creds) {
        const bill = await createBill(creds, {
          reference: invoice.invoiceNumber,
          name: invoice.milestoneType === "FINAL_BALANCE_50" ? "Final Balance" : "Invoice Payment",
          description: `Invoice ${invoice.invoiceNumber}`,
          amountMyr: invoice.amount,
          payer: { name: invoice.client.name, email: invoice.client.email, phone: invoice.client.phone ?? "" },
          returnUrl: `${env.NEXT_PUBLIC_APP_URL}/${tenantSlug}/checkout/payment-return`,
          callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/api/payments/toyyibpay/callback`,
        });
        if (!bill.ok) return { success: false, error: "GATEWAY_ERROR", message: bill.error };
        await db.milestoneInvoice.update({
          where: { id: invoice.id },
          data: { gatewayBillCode: bill.billCode, paymentMethod: "CARD" },
        });
        return {
          success: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: "PENDING",
          unlockedDownloads: false,
          paymentMethod,
          paymentUrl: bill.paymentUrl,
        };
      }
      if (process.env.ALLOW_SIMULATED_CARD_PAYMENTS !== "true") {
        return {
          success: false,
          error: "CARD_UNAVAILABLE",
          message: "Online payment is not set up for this studio. Please choose QR or cash.",
        };
      }
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
