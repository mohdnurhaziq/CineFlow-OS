"use server";

import { requireOwner } from "@/lib/auth/guard";

import { db } from "@/lib/db";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { onInvoicePaid } from "@/lib/bookings/billing";
import { provisionProjectForBooking } from "@/lib/bookings/project-promotion";
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
    // Taking or refusing money is the owner's call.
    const staffName = (await requireOwner(validated.tenantId)).name;
    const { invoiceId, tenantId, tenantSlug, notes } = validated;

    // Multi-tenant isolation check
    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { client: true, project: true, tenant: { select: { name: true, currency: true } } },
    });

    if (!invoice) {
      return { success: false, error: "INVOICE_NOT_FOUND", message: "Invoice not found or does not belong to studio." };
    }

    if (invoice.status === "PAID") {
      return { success: false, error: "ALREADY_VERIFIED", message: "Invoice has already been marked as PAID." };
    }
    if (invoice.status === "VOID") {
      return { success: false, error: "INVOICE_VOID", message: "This invoice was cancelled and can no longer be approved." };
    }

    let unlockedDownloads = false;

    await db.$transaction(async (tx) => {
      // 1. Update Invoice to PAID
      await tx.milestoneInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "PAID",
          verifiedBy: staffName,
          paidAt: new Date(),
          paymentReference: notes
            ? `${invoice.paymentReference || "MANUAL_VERIFICATION"} | Note: ${notes}`
            : invoice.paymentReference,
        },
      });

      // 2. If milestone is BOOKING_DEPOSIT, confirm booking and set slot to BOOKED
      if (invoice.milestoneType === "BOOKING_DEPOSIT") {
        // Exactly the booking this deposit pays for, never "the client's latest pending one".
        const linked = await resolveInvoiceBooking(tx, invoice);
        const booking = linked && ["PENDING", "PENDING_VERIFICATION"].includes(linked.status) ? linked : null;

        if (booking) {
          await tx.clientBooking.update({
            where: { id: booking.id },
            data: {
              status: "CONFIRMED",
              depositPaid: true,
            },
          });
          // Deposit paid: issue the balance invoice for the rest of the session price.
          await onInvoicePaid(tx, { ...invoice, bookingId: booking.id });

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

          // If this booking qualifies as a project (e.g. Wedding, Commercial, Event), auto-provision a Project
          // Every confirmed booking gets its gallery (a Session or Production project).
          await provisionProjectForBooking(tx, booking.id);
        }
      }

      // Retainer paid: issue the project's final balance invoice.
      if (invoice.milestoneType === "RETAINER_50") {
        await onInvoicePaid(tx, invoice);
      }

      // 3. If milestone is FINAL_BALANCE_50, unlock project paywall
      if (invoice.milestoneType === "FINAL_BALANCE_50" && invoice.projectId) {
        await tx.project.update({
          where: { id: invoice.projectId },
          data: { isFinalBalancePaid: true },
        });
        unlockedDownloads = true;
      }

      // 4. If milestone is BOOKING_BALANCE and the project is linked, unlock project paywall
      if (invoice.milestoneType === "BOOKING_BALANCE") {
        const projectId =
          invoice.projectId ??
          (invoice.bookingId
            ? (await tx.project.findFirst({ where: { bookingId: invoice.bookingId }, select: { id: true } }))?.id
            : null);
        if (projectId) {
          await tx.project.update({
            where: { id: projectId },
            data: { isFinalBalancePaid: true },
          });
          unlockedDownloads = true;
        }
      }
    });

    safeRevalidate(`/${tenantSlug}/admin/verification`);
    safeRevalidate(`/${tenantSlug}/admin/projects`);
    safeRevalidate(`/${tenantSlug}/admin/bookings`);
    safeRevalidate(`/${tenantSlug}/book`);
    if (invoice.projectId) {
      safeRevalidate(`/${tenantSlug}/vault/${invoice.projectId}`);
    }

    // Dispatch automated transactional notifications
    let notifResult: NotificationResult | null = null;
    if (invoice.client?.email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const receiptUrl = `${appUrl}/${tenantSlug}/account/invoices/${invoice.id}`;
      const vaultUrl = invoice.projectId ? `${appUrl}/${tenantSlug}/vault/${invoice.projectId}` : undefined;

      try {
        notifResult = await sendNotification({
          event: "PAYMENT_APPROVED",
          studioName: invoice.tenant.name,
          studioSlug: tenantSlug,
          clientName: invoice.client.name,
          clientEmail: invoice.client.email,
          clientPhone: invoice.client.phone || undefined,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.tenant.currency,
          milestoneType: invoice.milestoneType,
          projectTitle: invoice.project?.title || "Production Project",
          projectId: invoice.projectId || undefined,
          invoiceId: invoice.id,
          receiptUrl,
        });
      } catch (e) {
        console.error("Payment notification dispatch failed:", e);
      }

      // If this was a booking deposit, also dispatch a booking confirmation
      if (invoice.milestoneType === "BOOKING_DEPOSIT") {
        try {
          const linked = await resolveInvoiceBooking(db, invoice);
          if (linked) {
            const slot = linked.slotId ? await db.bookingSlot.findUnique({ where: { id: linked.slotId } }) : null;
            const slotDate = slot?.date
              ? new Date(slot.date).toLocaleDateString("en-US", { dateStyle: "medium" })
              : (linked.targetDate ?? "Scheduled Date");
            const bookingUrl = `${appUrl}/${tenantSlug}/account`;

            await sendNotification({
              event: "BOOKING_CONFIRMED",
              studioName: invoice.tenant.name,
              studioSlug: tenantSlug,
              clientName: invoice.client.name,
              clientEmail: invoice.client.email,
              clientPhone: invoice.client.phone || undefined,
              packageName: linked.packageName || "Studio Production Session",
              slotDate,
              startTime: slot?.startTime ?? "",
              endTime: slot?.endTime ?? "",
              depositAmount: invoice.amount,
              currency: invoice.tenant.currency,
              trackingCode: linked.trackingCode,
              bookingUrl,
            });
          }
        } catch (e) {
          console.error("Booking confirmed notification dispatch failed:", e);
        }
      }

      // Paid before the photos are uploaded: nothing to download yet. The studio's
      // "photos ready" message tells the client once the gallery is filled.
      const hasFiles =
        unlockedDownloads && invoice.projectId
          ? (await db.deliverableItem.count({ where: { deliverable: { projectId: invoice.projectId } } })) > 0
          : false;
      if (unlockedDownloads && invoice.projectId && vaultUrl && hasFiles) {
        sendNotification({
          event: "VAULT_UNLOCKED",
          studioName: invoice.tenant.name,
          studioSlug: tenantSlug,
          clientName: invoice.client.name,
          clientEmail: invoice.client.email,
          clientPhone: invoice.client.phone || undefined,
          projectTitle: invoice.project?.title || "Production Project",
          vaultUrl,
        }).catch((e) => console.error("Notification dispatch failed:", e));
      }
    }

    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      unlockedDownloads,
      verifiedBy: staffName,
      whatsappUrl: notifResult?.whatsappUrl,
      whatsappMessage: notifResult?.whatsappMessage,
      clientName: invoice.client?.name,
      clientPhone: invoice.client?.phone,
    };
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
    // Taking or refusing money is the owner's call.
    const staffName = (await requireOwner(validated.tenantId)).name;
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
