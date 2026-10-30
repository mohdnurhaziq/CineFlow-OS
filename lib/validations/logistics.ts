import { z } from "zod";

export const ToggleShotCompletionSchema = z.object({
  shotId: z.string().min(1, "Shot ID is required"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  tenantSlug: z.string().optional(),
});

export type ToggleShotCompletionInput = z.infer<typeof ToggleShotCompletionSchema>;

export const SubmitDigitalReleaseSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  tenantSlug: z.string().optional(),
  releaseType: z.enum(["TALENT", "LOCATION"]),
  signerName: z.string().min(2, "Signer name must be at least 2 characters"),
  signerEmail: z.string().email("Invalid email address"),
  signerPhone: z.string().optional().nullable(),
  signerRole: z.string().optional().nullable(),
  termsContent: z.string().min(10, "Terms content must be provided"),
  signatureDataUrl: z.string().min(20, "Signature canvas data is required"),
  notes: z.string().optional().nullable(),
});

export type SubmitDigitalReleaseInput = z.infer<typeof SubmitDigitalReleaseSchema>;
