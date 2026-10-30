import { z } from "zod";

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
  paymentProofUrl: z.string().optional(),
  paymentReference: z.string().optional(),
  cardDetails: z
    .object({
      cardNumber: z.string().optional(),
      cardExp: z.string().optional(),
      cardCvc: z.string().optional(),
      cardholderName: z.string().optional(),
    })
    .optional(),
});

export type ProcessBookingCheckoutInput = z.infer<typeof ProcessBookingCheckoutSchema>;

export const ProcessInvoicePaymentSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  invoiceId: z.string().min(1, "Invoice ID is required"),
  paymentMethod: z.enum(["CARD", "QR_CODE", "CASH"]),
  paymentProofUrl: z.string().optional(),
  paymentReference: z.string().optional(),
  cardDetails: z
    .object({
      cardNumber: z.string().optional(),
      cardExp: z.string().optional(),
      cardCvc: z.string().optional(),
      cardholderName: z.string().optional(),
    })
    .optional(),
});

export type ProcessInvoicePaymentInput = z.infer<typeof ProcessInvoicePaymentSchema>;
