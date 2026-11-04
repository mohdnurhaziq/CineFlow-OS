import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { onInvoicePaid } from "@/lib/bookings/billing";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { sendNotification } from "@/lib/notifications";
import { findSuccessfulPayment, toSen, type ToyyibpayCredentials } from "@/lib/payments/toyyibpay";

/**
 * Settlement of online (Toyyibpay) invoices. Not a "use server" module: it must
 * never be callable from the browser. The browser redirect and the gateway
 * callback only tell us WHICH bill to look at; whether it is paid is always
 * decided by a server-to-server lookup with the studio's own credentials.
 */

export const ONLINE_HOLD_MINUTES = 30;

export function getGatewayCredentials(tenant: {
  toyyibpaySecretEnc: string | null;
  toyyibpayCategoryCode: string | null;
}): ToyyibpayCredentials | null {
  const secretKey = decryptSecret(tenant.toyyibpaySecretEnc);
  const categoryCode = tenant.toyyibpayCategoryCode?.trim();
  if (!secretKey || !categoryCode) return null;
  return { secretKey, categoryCode };
}

export type SettleOutcome =
  | { status: "PAID"; invoiceId: string; invoiceNumber: string; tenantSlug: string; trackingCode?: string; unlockedDownloads: boolean; refundRequired: boolean; alreadySettled: boolean }
  | { status: "NOT_PAID"; reason: string }
  | { status: "MISMATCH"; reason: string }
  | { status: "NOT_FOUND" };

/** Settles the invoice that owns `billCode`, if (and only if) the gateway confirms payment. */
export async function settleToyyibpayBill(billCode: string): Promise<SettleOutcome> {
  if (!billCode || typeof billCode !== "string" || billCode.length > 64) return { status: "NOT_FOUND" };

  const invoice = await db.milestoneInvoice.findUnique({
    where: { gatewayBillCode: billCode },
    include: { tenant: true },
  });
  if (!invoice) return { status: "NOT_FOUND" };

  const base = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    tenantSlug: invoice.tenant.slug,
  };

  if (invoice.status === "PAID") {
    return { status: "PAID", ...base, unlockedDownloads: false, refundRequired: false, alreadySettled: true };
  }

  const creds = getGatewayCredentials(invoice.tenant);
  if (!creds) return { status: "NOT_PAID", reason: "Studio payment gateway is not configured." };

  const paid = await findSuccessfulPayment(creds, billCode);
  if (!paid) return { status: "NOT_PAID", reason: "Payment has not been confirmed by the gateway." };

  if (paid.externalReference !== invoice.invoiceNumber) {
    console.error(`Toyyibpay settle: reference mismatch for ${invoice.invoiceNumber}`);
    return { status: "MISMATCH", reason: "Payment reference does not match this invoice." };
  }
  if (toSen(paid.amountMyr) !== toSen(invoice.amount)) {
    console.error(`Toyyibpay settle: amount mismatch for ${invoice.invoiceNumber} (paid ${paid.amountMyr}, due ${invoice.amount})`);
    return { status: "MISMATCH", reason: "Amount paid does not match the invoice amount." };
  }

  const gatewayRef = paid.invoiceNo ? `TOYYIBPAY-${paid.invoiceNo}` : `TOYYIBPAY-${billCode}`;

  const result = await db.$transaction(async (tx) => {
    // Exactly one concurrent settler wins this update; the rest see count 0.
    const won = await tx.milestoneInvoice.updateMany({
      where: { id: invoice.id, status: { not: "PAID" } },
      data: { status: "PAID", paymentMethod: "CARD", paymentReference: gatewayRef, verifiedBy: "Toyyibpay", paidAt: new Date() },
    });
    if (won.count === 0) return { alreadySettled: true, refundRequired: false, unlockedDownloads: false, booking: null as any, slot: null as any };

    let refundRequired = false;
    let unlockedDownloads = false;
    let booking: any = null;
    let slot: any = null;

    if (invoice.milestoneType === "FINAL_BALANCE_50" && invoice.projectId) {
      await tx.project.update({ where: { id: invoice.projectId }, data: { isFinalBalancePaid: true } });
      unlockedDownloads = true;
    }

    // Retainer paid online: issue the project's final balance invoice.
    if (invoice.milestoneType === "RETAINER_50") {
      await onInvoicePaid(tx, invoice);
    }

    if (invoice.milestoneType === "BOOKING_DEPOSIT") {
      // Resolved from the invoice as it was before this update overwrote paymentReference.
      const linked = await resolveInvoiceBooking(tx, invoice);
      booking = linked
        ? await tx.clientBooking.findUnique({ where: { id: linked.id }, include: { slot: true } })
        : null;
      const confirmed = booking
        ? await tx.clientBooking.updateMany({
            where: { id: booking.id, status: "PENDING", slotId: { not: null } },
            data: { status: "CONFIRMED", depositPaid: true },
          })
        : { count: 0 };

      if (booking && confirmed.count === 1 && booking.slotId) {
        slot = booking.slot;
        await tx.bookingSlot.update({
          where: { id: booking.slotId },
          data: { status: "BOOKED", heldUntil: null, heldBySessionId: null },
        });
        // Deposit paid online: issue the balance invoice.
        await onInvoicePaid(tx, { ...invoice, bookingId: booking.id });
      } else {
        // The slot hold lapsed and someone else took the slot: money received, nothing to give.
        refundRequired = true;
        await tx.milestoneInvoice.update({
          where: { id: invoice.id },
          data: { verifiedBy: "Toyyibpay - REFUND REQUIRED (slot no longer available)" },
        });
      }
    }

    return { alreadySettled: false, refundRequired, unlockedDownloads, booking, slot };
  });

  if (!result.alreadySettled && result.booking && !result.refundRequired && result.booking.clientEmail) {
    sendNotification({
      event: "BOOKING_CONFIRMED",
      studioName: invoice.tenant.name,
      studioSlug: invoice.tenant.slug,
      clientName: result.booking.clientName,
      clientEmail: result.booking.clientEmail,
      clientPhone: result.booking.clientPhone || undefined,
      packageName: "Studio Production Session",
      slotDate: result.slot?.date ? new Date(result.slot.date).toLocaleDateString("en-US", { dateStyle: "medium" }) : "Scheduled Date",
      startTime: result.slot?.startTime ?? "",
      endTime: result.slot?.endTime ?? "",
      depositAmount: invoice.amount,
      currency: "MYR",
    }).catch((e) => console.error("Notification dispatch failed:", e));
  }

  return {
    status: "PAID",
    ...base,
    trackingCode: result.booking?.trackingCode,
    unlockedDownloads: result.unlockedDownloads,
    refundRequired: result.refundRequired,
    alreadySettled: result.alreadySettled,
  };
}

/**
 * Cancels an abandoned online booking that still occupies `slotId` so the slot
 * can be re-booked. Safe to call inside a transaction. A later payment for the
 * cancelled booking is settled as "refund required".
 */
export async function releaseAbandonedOnlineBooking(tx: Pick<typeof db, "clientBooking" | "milestoneInvoice">, slotId: string) {
  const stale = await tx.clientBooking.findFirst({
    where: { slotId, status: "PENDING", paymentMethod: "CARD" },
  });
  if (!stale) return false;
  await tx.clientBooking.update({ where: { id: stale.id }, data: { status: "CANCELLED", slotId: null } });
  await tx.milestoneInvoice.updateMany({
    where: {
      tenantId: stale.tenantId,
      status: "PENDING",
      OR: [{ bookingId: stale.id }, { paymentReference: stale.trackingCode }],
    },
    data: { status: "OVERDUE" },
  });
  return true;
}
