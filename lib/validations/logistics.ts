import { z } from "zod";

export const ToggleShotCompletionSchema = z.object({
  shotId: z.string().min(1, "Shot ID is required"),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
  tenantSlug: z.string().optional(),
});

export type ToggleShotCompletionInput = z.infer<typeof ToggleShotCompletionSchema>;

export const CreateShotItemSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  tenantSlug: z.string().optional(),
  sceneNumber: z.string().min(1, "Scene number is required"),
  shotNumber: z.string().min(1, "Shot number is required"),
  framing: z.string().min(1, "Framing is required"),
  cameraLens: z.string().min(1, "Camera / Lens is required"),
  lightingSetup: z.string().min(1, "Lighting setup is required"),
  description: z.string().min(1, "Description is required"),
  referenceImageUrl: z.string().optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional().default("PENDING"),
  sortOrder: z.number().int().optional(),
});

export type CreateShotItemInput = z.input<typeof CreateShotItemSchema>;

export const UpdateShotItemSchema = z.object({
  shotId: z.string().min(1, "Shot ID is required"),
  tenantSlug: z.string().optional(),
  sceneNumber: z.string().min(1, "Scene number is required").optional(),
  shotNumber: z.string().min(1, "Shot number is required").optional(),
  framing: z.string().min(1, "Framing is required").optional(),
  cameraLens: z.string().min(1, "Camera / Lens is required").optional(),
  lightingSetup: z.string().min(1, "Lighting setup is required").optional(),
  description: z.string().min(1, "Description is required").optional(),
  referenceImageUrl: z.string().optional().nullable(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateShotItemInput = z.input<typeof UpdateShotItemSchema>;

export const DeleteShotItemSchema = z.object({
  shotId: z.string().min(1, "Shot ID is required"),
  tenantSlug: z.string().optional(),
});

export type DeleteShotItemInput = z.infer<typeof DeleteShotItemSchema>;

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
