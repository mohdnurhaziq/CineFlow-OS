import { z } from "zod";

export const SignProposalSchema = z.object({
  proposalId: z.string().min(1, "Proposal ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  signatureDataUrl: z.string().min(50, "Valid digital signature is required"),
  signerName: z.string().min(2, "Signer name must be at least 2 characters"),
  signerTitle: z.string().optional(),
  selectedAddOnIds: z.array(z.string()).default([]),
  consentAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the production terms and milestone payment schedule",
    }),
  }),
});

export type SignProposalInput = z.infer<typeof SignProposalSchema>;

export const ToggleAddOnSchema = z.object({
  proposalId: z.string().min(1, "Proposal ID is required"),
  addOnId: z.string().min(1, "Add-on ID is required"),
  isSelected: z.boolean(),
});

export type ToggleAddOnInput = z.infer<typeof ToggleAddOnSchema>;
