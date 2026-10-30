import { z } from "zod";

// ==============================================================================
// 1. INVENTORY ITEM SCHEMAS
// ==============================================================================

export const CreateGearItemSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  sku: z.string().min(2, "SKU must be at least 2 characters"),
  serialNumber: z.string().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "UNIVERSAL"]).default("UNIVERSAL"),
  condition: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "MAINTENANCE_NEEDED", "DAMAGED"])
    .default("EXCELLENT"),
  status: z
    .enum(["AVAILABLE", "ON_SHOOT", "RESERVED", "MAINTENANCE"])
    .default("AVAILABLE"),
  dailyRate: z.number().nonnegative().optional().nullable(),
  location: z.string().optional().nullable(),
});

export type CreateGearItemInput = z.input<typeof CreateGearItemSchema>;

export const UpdateGearItemSchema = z.object({
  id: z.string().min(1, "Item ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2).optional(),
  sku: z.string().min(2).optional(),
  serialNumber: z.string().optional().nullable(),
  category: z.string().optional(),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "UNIVERSAL"]).optional(),
  condition: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "MAINTENANCE_NEEDED", "DAMAGED"])
    .optional(),
  status: z
    .enum(["AVAILABLE", "ON_SHOOT", "RESERVED", "MAINTENANCE"])
    .optional(),
  dailyRate: z.number().nonnegative().optional().nullable(),
  location: z.string().optional().nullable(),
});

export type UpdateGearItemInput = z.infer<typeof UpdateGearItemSchema>;

// ==============================================================================
// 2. KIT BUNDLE & BOM SCHEMAS
// ==============================================================================

export const KitBundleItemInputSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  quantity: z.number().int().positive().default(1),
});

export const CreateKitBundleSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2, "Bundle name must be at least 2 characters"),
  description: z.string().min(2, "Description is required"),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]),
  dailyRate: z.number().nonnegative().optional().nullable(),
  items: z.array(KitBundleItemInputSchema).min(1, "At least one item is required in a kit bundle"),
});

export type CreateKitBundleInput = z.infer<typeof CreateKitBundleSchema>;

export const UpdateKitBundleSchema = z.object({
  id: z.string().min(1, "Bundle ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]).optional(),
  dailyRate: z.number().nonnegative().optional().nullable(),
  items: z.array(KitBundleItemInputSchema).optional(),
});

export type UpdateKitBundleInput = z.infer<typeof UpdateKitBundleSchema>;

// ==============================================================================
// 3. EQUIPMENT RESERVATION SCHEMAS
// ==============================================================================

export const CreateReservationSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  projectId: z.string().min(1, "Project is required"),
  itemId: z.string().min(1, "Gear item is required"),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// ==============================================================================
// 4. PRE/POST-SHOOT INSPECTION SCHEMAS
// ==============================================================================

export const LogPreShootInspectionSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  reservationId: z.string().min(1, "Reservation ID is required"),
  inspectorName: z.string().min(2, "Inspector name is required"),
  condition: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "MAINTENANCE_NEEDED"])
    .default("EXCELLENT"),
  notes: z.string().optional().nullable(),
  sensorVerified: z.boolean().default(true),
  mediaFormatted: z.boolean().default(true),
  batteriesCharged: z.boolean().default(true),
});

export type LogPreShootInspectionInput = z.input<typeof LogPreShootInspectionSchema>;

export const LogPostShootInspectionSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  reservationId: z.string().min(1, "Reservation ID is required"),
  inspectorName: z.string().min(2, "Inspector name is required"),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "MAINTENANCE_NEEDED", "DAMAGED"]),
  damageFlag: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

export type LogPostShootInspectionInput = z.input<typeof LogPostShootInspectionSchema>;
