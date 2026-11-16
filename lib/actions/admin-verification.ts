"use server";

import { requireTick } from "@/lib/auth/access-guard";
import { applyInvoicePayment } from "@/lib/bookings/payment-approval";
import { db } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sendNotification, type NotificationResult } from "@/lib/notifications";
import { errorMessageOf } from "@/lib/action-error";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

const ApprovePaymentVerificationSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  notes: z.string().optional(),
});

export type ApprovePaymentVerificationInput = z.infer<typeof ApprovePaymentVerificationSchema>;

export async function approvePaymentVerification(input: ApprovePaymentVerificationInput) {
  try {
    const validated = ApprovePaymentVerificationSchema.parse(input);
    // The verifier is always the signed-in staff member, never a name sent by the browser.
    // Taking or refusing money needs the "approve payments" permission (the owner always has it).
    const staffName = (await requireTick(validated.tenantId, "approvePayments")).name;
    return await applyInvoicePayment(validated, staffName);
  } catch (err) {
    console.error("Error approving payment:", err);
    return {
      success: false,
      error: "APPROVE_FAILED",
      message: errorMessageOf(err) || "Failed to approve payment verification.",
    };
  }
}

const RejectPaymentVerificationSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  reason: z.string().min(3, "Please provide a valid rejection reason"),
});

export type RejectPaymentVerificationInput = z.infer<typeof RejectPaymentVerificationSchema>;

export async function rejectPaymentVerification(input: RejectPaymentVerificationInput) {
  try {
    const validated = RejectPaymentVerificationSchema.parse(input);
    // Taking or refusing money needs the "approve payments" permission (the owner always has it).
    const staffName = (await requireTick(validated.tenantId, "approvePayments")).name;
    const { invoiceId, tenantId, tenantSlug, reason } = validated;

    // Multi-tenant check
    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { client: true, tenant: { select: { name: true, currency: true } } },
    });

    if (!invoice) {
      return { success: false, error: "INVOICE_NOT_FOUND", message: "Invoice not found or does not belong to studio." };
    }

    if (invoice.status === "PAID") {
      return {
        success: false,
        error: "Cannot reject an invoice that has already been verified and marked as PAID",
        message: "Cannot reject an invoice that has already been verified and marked as PAID",
      };
    }

    if (invoice.status === "REJECTED") {
      return {
        success: false,
        error: "Invoice is already rejected",
        message: "Invoice is already rejected",
      };
    }

    if (invoice.status !== "PENDING_VERIFICATION" && invoice.status !== "PENDING") {
      return {
        success: false,
        error: `Cannot reject invoice in ${invoice.status} status`,
        message: `Invoice cannot be rejected in current status (${invoice.status})`,
      };
    }

    // The booking and its slot are kept: the client is asked for a new slip. If none
    // arrives within DEPOSIT_HOLD_HOURS of this rejection, expireUnpaidDeposits releases
    // the slot (see lib/bookings/expiry.ts).
    await db.milestoneInvoice.update({
      where: { id: invoiceId },
      data: {
        status: "REJECTED",
        verifiedBy: staffName,
        rejectedAt: new Date(),
        rejectionReason: reason,
        paymentReference: `${invoice.paymentReference || "REJECTED"} [Reason: ${reason}]`,
      },
    });

    safeRevalidate(`/${tenantSlug}/admin/verification`);
    safeRevalidate(`/${tenantSlug}/book`);

    // Dispatch rejection notification
    let notifResult: NotificationResult | null = null;
    if (invoice.client?.email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const reuploadUrl = `${appUrl}/${tenantSlug}/checkout?invoiceId=${invoice.id}`;

      try {
        notifResult = await sendNotification({
          event: "PAYMENT_REJECTED",
          studioName: invoice.tenant.name,
          studioSlug: tenantSlug,
          clientName: invoice.client.name,
          clientEmail: invoice.client.email,
          clientPhone: invoice.client.phone || undefined,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.tenant.currency,
          reason,
          reuploadUrl,
        });
      } catch (e) {
        console.error("Rejection notification dispatch failed:", e);
      }
    }

    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      rejectedBy: staffName,
      reason,
      whatsappUrl: notifResult?.whatsappUrl,
      whatsappMessage: notifResult?.whatsappMessage,
      clientName: invoice.client?.name,
      clientPhone: invoice.client?.phone,
    };
  } catch (err) {
    console.error("Error rejecting payment:", err);
    return {
      success: false,
      error: "REJECT_FAILED",
      message: errorMessageOf(err) || "Failed to reject payment verification.",
    };
  }
}
