import { db } from "@/lib/db";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { InvoiceNotPayableError, onInvoicePaid, updatePayableInvoice } from "@/lib/bookings/billing";
import { provisionProjectForBooking } from "@/lib/bookings/project-promotion";
import { revalidatePath } from "next/cache";
import { sendNotification, type NotificationResult } from "@/lib/notifications";
import { formatSlotDate } from "@/lib/slot-time";
import { studioUrl } from "@/lib/domain-name";
import { clientInvite } from "@/lib/bookings/calendar-invites";
import { notifyShootConfirmed } from "@/lib/bookings/assignment-emails";

/**
 * Marks an invoice paid and applies what follows from it (booking confirmed, balance issued,
 * vault unlocked, client notified). No access check: the calling action does that
 * (approvePaymentVerification needs "approve payments", recordInvoicePayment "record payments").
 *
 * Not a "use server" module.
 */

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function applyInvoicePayment(
  validated: { invoiceId: string; tenantId: string; tenantSlug: string; notes?: string },
  staffName: string
) {
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
  // The booking this payment confirmed, if any: its shooters get the shoot in their calendar.
  let confirmedBookingId: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      // 1. Update Invoice to PAID, unless it was paid or cancelled since the checks above.
      await updatePayableInvoice(tx, invoiceId, {
        status: "PAID",
        verifiedBy: staffName,
        paidAt: new Date(),
        paymentReference: notes
          ? `${invoice.paymentReference || "MANUAL_VERIFICATION"} | Note: ${notes}`
          : invoice.paymentReference,
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
          confirmedBookingId = booking.id;
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
      // Print order paid: the order moves on to NEW.
      if (invoice.milestoneType === "RETAINER_50" || invoice.milestoneType === "PRINT_FRAME_ORDER") {
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
  } catch (e) {
    if (e instanceof InvoiceNotPayableError) {
      return e.status === "VOID"
        ? { success: false, error: "INVOICE_VOID", message: "This invoice was cancelled and can no longer be approved." }
        : { success: false, error: "ALREADY_VERIFIED", message: "Invoice has already been marked as PAID." };
    }
    throw e;
  }

  safeRevalidate(`/${tenantSlug}/admin/verification`);
  safeRevalidate(`/${tenantSlug}/admin/projects`);
  safeRevalidate(`/${tenantSlug}/admin/bookings`);
  safeRevalidate(`/${tenantSlug}/book`);
  if (invoice.projectId) {
    safeRevalidate(`/${tenantSlug}/vault/${invoice.projectId}`);
  }

  if (confirmedBookingId) await notifyShootConfirmed(confirmedBookingId);

  // Dispatch automated transactional notifications
  let notifResult: NotificationResult | null = null;
  if (invoice.client?.email) {
    const receiptUrl = studioUrl(tenantSlug, `/account/invoices/${invoice.id}`);
    const vaultUrl = invoice.projectId ? studioUrl(tenantSlug, `/vault/${invoice.projectId}`) : undefined;

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
            ? formatSlotDate(slot.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
            : (linked.targetDate ?? "Scheduled Date");
          const bookingUrl = studioUrl(tenantSlug, "/account");

          await sendNotification({
            event: "BOOKING_CONFIRMED",
            studioName: invoice.tenant.name,
            studioSlug: tenantSlug,
            // The booking's contact, as every other confirmation and every later update (a move, a
            // cancel) uses: the calendar event and its updates land in the same inbox.
            clientName: linked.clientName || invoice.client.name,
            clientEmail: linked.clientEmail || invoice.client.email,
            clientPhone: linked.clientPhone || invoice.client.phone || undefined,
            packageName: linked.packageName || "Studio session",
            slotDate,
            startTime: slot?.startTime ?? "",
            endTime: slot?.endTime ?? "",
            depositAmount: invoice.amount,
            currency: invoice.tenant.currency,
            trackingCode: linked.trackingCode,
            bookingUrl,
            // The session goes into the client's calendar (Gmail adds it to Google Calendar).
            calendar: (await clientInvite(linked.id, "REQUEST")) ?? undefined,
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
}
