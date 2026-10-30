import { z } from "zod";

export const CreateSingleSlotSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  date: z.string().min(1, "Date is required"), // YYYY-MM-DD
  startTime: z.string().min(1, "Start time is required"), // e.g. "10:00 AM"
  endTime: z.string().min(1, "End time is required"), // e.g. "11:30 AM"
  category: z.string().default("STUDIO_PORTRAIT"),
  campaignTitle: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be non-negative").default(0),
  depositRequired: z.coerce.number().min(0, "Deposit must be non-negative").default(50),
  status: z.enum(["AVAILABLE", "BLOCKED"]).default("AVAILABLE"),
});

export type CreateSingleSlotInput = z.infer<typeof CreateSingleSlotSchema>;

export const UpdateBookingSlotSchema = z.object({
  id: z.string().min(1, "Slot ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  category: z.string().optional(),
  campaignTitle: z.string().optional().nullable(),
  price: z.coerce.number().min(0).optional(),
  depositRequired: z.coerce.number().min(0).optional(),
  status: z.enum(["AVAILABLE", "HELD", "PENDING_VERIFICATION", "BOOKED", "BLOCKED"]).optional(),
});

export type UpdateBookingSlotInput = z.infer<typeof UpdateBookingSlotSchema>;

export const BatchGenerateSlotsSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  startDate: z.string().min(1, "Start date is required"), // YYYY-MM-DD
  endDate: z.string().min(1, "End date is required"), // YYYY-MM-DD
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1, "Select at least one day"), // 0=Sun, 6=Sat
  dayStartTime: z.string().min(1, "Day start time is required"), // e.g. "09:00 AM"
  dayEndTime: z.string().min(1, "Day end time is required"), // e.g. "06:00 PM"
  slotDurationMinutes: z.coerce.number().min(15, "Slot duration must be at least 15 mins"),
  bufferMinutes: z.coerce.number().min(0).default(0),
  category: z.string().min(1, "Category is required"),
  campaignTitle: z.string().optional().nullable(),
  price: z.coerce.number().min(0).default(0),
  depositRequired: z.coerce.number().min(0).default(50),
  skipConflicts: z.boolean().default(true),
});

export type BatchGenerateSlotsInput = z.infer<typeof BatchGenerateSlotsSchema>;

export const ForceReleaseSlotSchema = z.object({
  slotId: z.string().min(1, "Slot ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type ForceReleaseSlotInput = z.infer<typeof ForceReleaseSlotSchema>;

export const ToggleBlockSlotSchema = z.object({
  slotId: z.string().min(1, "Slot ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type ToggleBlockSlotInput = z.infer<typeof ToggleBlockSlotSchema>;

export const DeleteBookingSlotSchema = z.object({
  slotId: z.string().min(1, "Slot ID is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
});

export type DeleteBookingSlotInput = z.infer<typeof DeleteBookingSlotSchema>;

export const BatchDeleteSlotsSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  slotIds: z.array(z.string()).min(1, "Select at least one slot to delete"),
});

export type BatchDeleteSlotsInput = z.infer<typeof BatchDeleteSlotsSchema>;
