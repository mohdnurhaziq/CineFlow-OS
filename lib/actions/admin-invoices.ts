"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner, requireStaff } from "@/lib/auth/guard";
import { actionErrorMessage } from "@/lib/action-error";
import { nextInvoiceNumber } from "@/lib/bookings/billing";
import { resolveInvoiceBooking } from "@/lib/bookings/invoice-booking";
import { approvePaymentVerification } from "@/lib/actions/admin-verification";
import { sendNotification } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";

/**
 * Invoice actions for the studio. Taking, cancelling or issuing money is the owner's call;
 * any staff member can send a payment reminder.
 */

type Result = { success: true; invoiceId?: string; invoiceNumber?: string } | { success: false; error: string; message: string };
const fail = (error: string, message: string): Result => ({ success: false, error, message });

const UNPAID = ["PENDING", "OVERDUE", "PENDING_VERIFICATION", "REJECTED"];

function revalidate(tenantSlug: string, invoiceId?: string) {
  const paths = [`/${tenantSlug}/admin/invoices`, `/${tenantSlug}/admin`, `/${tenantSlug}/admin/bookings`, `/${tenantSlug}/account`];
  if (invoiceId) paths.push(`/${tenantSlug}/admin/invoices/${invoiceId}`);
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // non-request context
    }
  }
}

const Base = z.object({ tenantId: z.string().min(1), tenantSlug: z.string().min(1), invoiceId: z.string().min(1) });

// ---------------------------------------------------------------------------
// Record a payment received outside the app (cash at the desk, bank transfer)
// ---------------------------------------------------------------------------

const RecordSchema = Base.extend({
  method: z.enum(["CASH", "BANK_TRANSFER", "QR_CODE", "CARD"]),
  reference: z.string().trim().max(120).optional(),
});

export async function recordInvoicePayment(input: z.input<typeof RecordSchema>): Promise<Result> {
  try {
    const data = RecordSchema.parse(input);
    await requireOwner(data.tenantId);
    const invoice = await db.milestoneInvoice.findFirst({ where: { id: data.invoiceId, tenantId: data.tenantId } });
    if (!invoice) return fail("NOT_FOUND", "Invoice not found.");
    if (!UNPAID.includes(invoice.status)) return fail("NOT_UNPAID", "This invoice is already paid or cancelled.");

    await db.milestoneInvoice.update({
      where: { id: invoice.id },
      data: { paymentMethod: data.method, ...(data.reference ? { paymentReference: data.reference } : {}) },
    });
    // Same effects as approving a slip: confirm the booking, issue the balance, unlock the vault.
    const res = await approvePaymentVerification({ invoiceId: invoice.id, tenantId: data.tenantId, tenantSlug: data.tenantSlug });
    if (!res.success) return fail(res.error ?? "RECORD_FAILED", res.message ?? "Could not record the payment.");
    revalidate(data.tenantSlug, invoice.id);
    return { success: true };
  } catch (err) {
    return fail("RECORD_FAILED", actionErrorMessage(err, "Could not record the payment."));
  }
}

// ---------------------------------------------------------------------------
// Void
// ---------------------------------------------------------------------------

const VoidSchema = Base.extend({ reason: z.string().trim().min(3, "Give a short reason.").max(300) });

export async function voidInvoice(input: z.input<typeof VoidSchema>): Promise<Result> {
  try {
    const data = VoidSchema.parse(input);
    const session = await requireOwner(data.tenantId);
    const invoice = await db.milestoneInvoice.findFirst({ where: { id: data.invoiceId, tenantId: data.tenantId } });
    if (!invoice) return fail("NOT_FOUND", "Invoice not found.");
    if (!UNPAID.includes(invoice.status)) return fail("NOT_UNPAID", "Only unpaid invoices can be cancelled.");
    if (invoice.milestoneType === "BOOKING_DEPOSIT") {
      const booking = await resolveInvoiceBooking(db, invoice);
      if (booking && (booking.status === "PENDING" || booking.status === "CONFIRMED")) {
        return fail("BOOKING_ACTIVE", "This is the deposit for a booking that is still active. Cancel the booking instead (Bookings).");
      }
    }
    await db.milestoneInvoice.update({
      where: { id: invoice.id },
      data: { status: "VOID", verifiedBy: `Cancelled by ${session.name}: ${data.reason}` },
    });
    revalidate(data.tenantSlug, invoice.id);
    return { success: true };
  } catch (err) {
    return fail("VOID_FAILED", actionErrorMessage(err, "Could not cancel the invoice."));
  }
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

export async function sendInvoiceReminder(input: z.input<typeof Base>): Promise<Result> {
  try {
    const data = Base.parse(input);
    await requireStaff(data.tenantId);
    const invoice = await db.milestoneInvoice.findFirst({
      where: { id: data.invoiceId, tenantId: data.tenantId },
      include: { client: true, tenant: { select: { name: true, slug: true, currency: true } } },
    });
    if (!invoice) return fail("NOT_FOUND", "Invoice not found.");
    if (!["PENDING", "OVERDUE", "REJECTED"].includes(invoice.status)) {
      return fail("NOTHING_DUE", "There is nothing for the client to pay on this invoice right now.");
    }
    if (!invoice.client.email) return fail("NO_EMAIL", "This client has no email address.");
    const due = invoice.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    await sendNotification({
      event: "STUDIO_UPDATE",
      studioName: invoice.tenant.name,
      studioSlug: invoice.tenant.slug,
      clientName: invoice.client.name,
      clientEmail: invoice.client.email,
      clientPhone: invoice.client.phone || undefined,
      headline: `Invoice ${invoice.invoiceNumber} is due`,
      message: `A reminder that invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.tenant.currency, invoice.amount)} is due on ${due}.`,
      linkUrl: `${env.NEXT_PUBLIC_APP_URL}/${invoice.tenant.slug}/account/invoices/${invoice.id}`,
      linkLabel: "View and pay",
    });
    return { success: true };
  } catch (err) {
    return fail("REMIND_FAILED", actionErrorMessage(err, "Could not send the reminder."));
  }
}

// ---------------------------------------------------------------------------
// New invoice
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  clientId: z.string().min(1, "Choose a client."),
  description: z.string().trim().min(3, "Say what the invoice is for.").max(200),
  amount: z.coerce.number().positive("Enter an amount above zero."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
  notifyClient: z.boolean().default(true),
});

export async function createInvoice(input: z.input<typeof CreateSchema>): Promise<Result> {
  try {
    const data = CreateSchema.parse(input);
    await requireOwner(data.tenantId);
    const client = await db.user.findFirst({ where: { id: data.clientId, tenantId: data.tenantId, role: "CLIENT" } });
    if (!client) return fail("CLIENT_NOT_FOUND", "Client not found.");
    const due = new Date(`${data.dueDate}T00:00:00.000Z`);
    if (due.getTime() < new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime()) {
      return fail("DUE_IN_PAST", "The due date can't be in the past.");
    }

    const invoice = await db.$transaction(async (tx) =>
      tx.milestoneInvoice.create({
        data: {
          tenantId: data.tenantId,
          invoiceNumber: await nextInvoiceNumber(tx, data.tenantId),
          clientId: client.id,
          milestoneType: "CUSTOM",
          description: data.description,
          amount: Math.round(data.amount * 100) / 100,
          status: "PENDING",
          dueDate: due,
        },
      })
    );
    revalidate(data.tenantSlug, invoice.id);
    if (data.notifyClient) {
      await sendInvoiceReminder({ tenantId: data.tenantId, tenantSlug: data.tenantSlug, invoiceId: invoice.id }).catch(() => null);
    }
    return { success: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
  } catch (err) {
    return fail("CREATE_FAILED", actionErrorMessage(err, "Could not create the invoice."));
  }
}
