import { z } from "zod";

// Card details are deliberately not part of these schemas: card payments happen on
// the payment gateway's hosted page, never through this application.

/**
 * A payment slip is a file uploaded here (/api/upload into receipts), never an outside link: staff
 * open it to confirm a payment, so it mustn't point anywhere else.
 */
const PaymentProofUrl = z
  .string()
  .regex(/^\/uploads\/receipts\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/, "Please upload the payment slip again.")
  .optional();

export const ProcessBookingCheckoutSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  slotId: z.string().min(1, "Slot ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  clientName: z.string().min(2, "Full name must be at least 2 characters"),
  clientEmail: z.string().email("Valid email address is required"),
  clientPhone: z.string().min(6, "Valid mobile number is required"),
  creativeBrief: z.string().optional(),
  paymentMethod: z.enum(["CARD", "QR_CODE", "CASH"]),
  paymentProofUrl: PaymentProofUrl,
  paymentReference: z.string().optional(),
  /** Service package the client chose (required when the studio offers packages for the slot). */
  packageId: z.string().optional(),
});

export type ProcessBookingCheckoutInput = z.input<typeof ProcessBookingCheckoutSchema>;

export const ProcessInvoicePaymentSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  invoiceId: z.string().min(1, "Invoice ID is required"),
  paymentMethod: z.enum(["CARD", "QR_CODE", "CASH"]),
  paymentProofUrl: PaymentProofUrl,
  paymentReference: z.string().optional(),
});

export type ProcessInvoicePaymentInput = z.input<typeof ProcessInvoicePaymentSchema>;
