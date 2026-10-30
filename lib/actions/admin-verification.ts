"use server";

import { db } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export const ApprovePaymentVerificationSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  staffName: z.string().min(1, "Staff member name is required"),
  notes: z.string().optional(),
});

export type ApprovePaymentVerificationInput = z.infer<typeof ApprovePaymentVerificationSchema>;

export async function approvePaymentVerification(input: ApprovePaymentVerificationInput) {
  try {
    const validated = ApprovePaymentVerificationSchema.parse(input);
    const { invoiceId, tenantId, tenantSlug, staffName, notes } = validated;

    // Multi-tenant isolation check
    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { client: true, project: true },
    });

    if (!invoice) {
      return { success: false, error: "INVOICE_NOT_FOUND", message: "Invoice not found or does not belong to studio." };
    }

    if (invoice.status === "PAID") {
      return { success: false, error: "ALREADY_VERIFIED", message: "Invoice has already been marked as PAID." };
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
        const booking = await tx.clientBooking.findFirst({
          where: {
            tenantId,
            userId: invoice.clientId,
            status: { in: ["PENDING", "PENDING_VERIFICATION"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (booking) {
          await tx.clientBooking.update({
            where: { id: booking.id },
            data: {
              status: "CONFIRMED",
              depositPaid: true,
            },
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

      // 3. If milestone is FINAL_BALANCE_50, unlock project paywall
      if (invoice.milestoneType === "FINAL_BALANCE_50" && invoice.projectId) {
        await tx.project.update({
          where: { id: invoice.projectId },
          data: { isFinalBalancePaid: true },
        });
        unlockedDownloads = true;
      }
    });

    safeRevalidate(`/${tenantSlug}/admin/verification`);
    safeRevalidate(`/${tenantSlug}/book`);
    if (invoice.projectId) {
      safeRevalidate(`/${tenantSlug}/vault/${invoice.projectId}`);
    }

    // Dispatch automated transactional notifications
    if (invoice.client?.email) {
      sendNotification({
        event: "PAYMENT_APPROVED",
        studioName: tenantSlug,
        studioSlug: tenantSlug,
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
        clientPhone: invoice.client.phone || undefined,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: "USD",
        milestoneType: invoice.milestoneType,
        projectTitle: invoice.project?.title || "Production Project",
        projectId: invoice.projectId || undefined,
      }).catch((e) => console.error("Notification dispatch failed:", e));

      if (unlockedDownloads && invoice.projectId) {
        sendNotification({
          event: "VAULT_UNLOCKED",
          studioName: tenantSlug,
          studioSlug: tenantSlug,
          clientName: invoice.client.name,
          clientEmail: invoice.client.email,
          clientPhone: invoice.client.phone || undefined,
          projectTitle: invoice.project?.title || "Production Project",
          vaultUrl: `/${tenantSlug}/vault/${invoice.projectId}`,
        }).catch((e) => console.error("Notification dispatch failed:", e));
      }
    }

    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      unlockedDownloads,
      verifiedBy: staffName,
    };
  } catch (err: any) {
    console.error("Error approving payment:", err);
    return {
      success: false,
      error: "APPROVE_FAILED",
      message: err.message || "Failed to approve payment verification.",
    };
  }
}

export const RejectPaymentVerificationSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  staffName: z.string().min(1, "Staff member name is required"),
  reason: z.string().min(3, "Please provide a valid rejection reason"),
});

export type RejectPaymentVerificationInput = z.infer<typeof RejectPaymentVerificationSchema>;

export async function rejectPaymentVerification(input: RejectPaymentVerificationInput) {
  try {
    const validated = RejectPaymentVerificationSchema.parse(input);
    const { invoiceId, tenantId, tenantSlug, staffName, reason } = validated;

    // Multi-tenant check
    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { client: true },
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

    await db.$transaction(async (tx) => {
      // 1. Mark Invoice as REJECTED
      await tx.milestoneInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "REJECTED",
          verifiedBy: staffName,
          paymentReference: `${invoice.paymentReference || "REJECTED"} [Reason: ${reason}]`,
        },
      });

      // 2. If BOOKING_DEPOSIT, cancel booking and release slot back to AVAILABLE
      if (invoice.milestoneType === "BOOKING_DEPOSIT") {
        const booking = await tx.clientBooking.findFirst({
          where: {
            tenantId,
            userId: invoice.clientId,
            status: { in: ["PENDING", "PENDING_VERIFICATION"] },
          },
          orderBy: { createdAt: "desc" },
        });

        if (booking) {
          const slotToRelease = booking.slotId;
          await tx.clientBooking.update({
            where: { id: booking.id },
            data: {
              status: "CANCELLED",
              slotId: null, // Defect CF-M3-01: Disassociate slotId so released slot can be re-booked without @unique collision
            },
          });

          if (slotToRelease) {
            await tx.bookingSlot.update({
              where: { id: slotToRelease },
              data: {
                status: "AVAILABLE",
                heldUntil: null,
                heldBySessionId: null,
              },
            });
          }
        }
      }
    });

    safeRevalidate(`/${tenantSlug}/admin/verification`);
    safeRevalidate(`/${tenantSlug}/book`);

    // Dispatch rejection notification
    if (invoice.client?.email) {
      sendNotification({
        event: "PAYMENT_REJECTED",
        studioName: tenantSlug,
        studioSlug: tenantSlug,
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
        clientPhone: invoice.client.phone || undefined,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: "USD",
        reason,
        reuploadUrl: `/${tenantSlug}/checkout?invoice=${invoice.id}`,
      }).catch((e) => console.error("Notification dispatch failed:", e));
    }

    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      rejectedBy: staffName,
      reason,
    };
  } catch (err: any) {
    console.error("Error rejecting payment:", err);
    return {
      success: false,
      error: "REJECT_FAILED",
      message: err.message || "Failed to reject payment verification.",
    };
  }
}
