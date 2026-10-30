import { z } from "zod";

export const CreatePrintOrderSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  projectId: z.string().optional().nullable(),
  printSizeId: z.string().min(1, "Print size is required"),
  frameDesignId: z.string().min(1, "Frame design is required"),
  matBoardType: z.enum(["NONE", "WHITE_2INCH", "OFFWHITE_2INCH", "OFF_WHITE_2INCH"]).default("WHITE_2INCH"),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]).default("LANDSCAPE"),
  photoUrl: z.string().min(1, "Photo URL is required"),
  photoTitle: z.string().optional().nullable(),
  clientName: z.string().min(2, "Client name must be at least 2 characters"),
  clientEmail: z.string().email("Valid client email is required"),
  clientPhone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreatePrintOrderInput = z.infer<typeof CreatePrintOrderSchema>;
