export const StudioDiscipline = {
  PHOTOGRAPHY: "PHOTOGRAPHY",
  VIDEOGRAPHY: "VIDEOGRAPHY",
  HYBRID: "HYBRID",
} as const;
export type StudioDiscipline = typeof StudioDiscipline[keyof typeof StudioDiscipline];

export const SubscriptionTier = {
  STARTER: "STARTER",
  PRO: "PRO",
  STUDIO_UNLIMITED: "STUDIO_UNLIMITED",
} as const;
export type SubscriptionTier = typeof SubscriptionTier[keyof typeof SubscriptionTier];

export const SubscriptionStatus = {
  ACTIVE: "ACTIVE",
  TRIALING: "TRIALING",
  CANCELLED: "CANCELLED",
} as const;
export type SubscriptionStatus = typeof SubscriptionStatus[keyof typeof SubscriptionStatus];

export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STUDIO_OWNER: "STUDIO_OWNER",
  PHOTOGRAPHER: "PHOTOGRAPHER",
  VIDEOGRAPHER: "VIDEOGRAPHER",
  CREW: "CREW",
  CLIENT: "CLIENT",
} as const;
export type UserRole = typeof UserRole[keyof typeof UserRole];

export const SlotStatus = {
  AVAILABLE: "AVAILABLE",
  HELD: "HELD",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  BOOKED: "BOOKED",
  BLOCKED: "BLOCKED",
} as const;
export type SlotStatus = typeof SlotStatus[keyof typeof SlotStatus];

export const BookingStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const;
export type BookingStatus = typeof BookingStatus[keyof typeof BookingStatus];

export const MilestoneType = {
  RETAINER_50: "RETAINER_50",
  FINAL_BALANCE_50: "FINAL_BALANCE_50",
  PRINT_FRAME_ORDER: "PRINT_FRAME_ORDER",
  BOOKING_DEPOSIT: "BOOKING_DEPOSIT",
} as const;
export type MilestoneType = typeof MilestoneType[keyof typeof MilestoneType];

export const InvoiceStatus = {
  PENDING: "PENDING",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  REJECTED: "REJECTED",
  VOID: "VOID",
} as const;
export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus];

export const ProjectStage = {
  PRE_PRODUCTION: "PRE_PRODUCTION",
  PRODUCTION: "PRODUCTION",
  POST_PRODUCTION: "POST_PRODUCTION",
  IN_REVIEW: "IN_REVIEW",
  DELIVERED: "DELIVERED",
} as const;
export type ProjectStage = typeof ProjectStage[keyof typeof ProjectStage];

export const PaymentMethod = {
  CARD: "CARD",
  QR_CODE: "QR_CODE",
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
} as const;
export type PaymentMethod = typeof PaymentMethod[keyof typeof PaymentMethod];

export const ProposalStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
} as const;
export type ProposalStatus = typeof ProposalStatus[keyof typeof ProposalStatus];

export const ReleaseType = {
  TALENT: "TALENT",
  LOCATION: "LOCATION",
} as const;
export type ReleaseType = typeof ReleaseType[keyof typeof ReleaseType];

export const DeliverableStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  ARCHIVED: "ARCHIVED",
} as const;
export type DeliverableStatus = typeof DeliverableStatus[keyof typeof DeliverableStatus];

export const DeliverableItemType = {
  PHOTO: "PHOTO",
  VIDEO: "VIDEO",
} as const;
export type DeliverableItemType = typeof DeliverableItemType[keyof typeof DeliverableItemType];

export const InventoryCondition = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  MAINTENANCE_NEEDED: "MAINTENANCE_NEEDED",
  DAMAGED: "DAMAGED",
} as const;
export type InventoryCondition = typeof InventoryCondition[keyof typeof InventoryCondition];

export const InventoryStatus = {
  AVAILABLE: "AVAILABLE",
  ON_SHOOT: "ON_SHOOT",
  RESERVED: "RESERVED",
  MAINTENANCE: "MAINTENANCE",
} as const;
export type InventoryStatus = typeof InventoryStatus[keyof typeof InventoryStatus];

export const ReservationStatus = {
  RESERVED: "RESERVED",
  CHECKED_OUT: "CHECKED_OUT",
  RETURNED: "RETURNED",
} as const;
export type ReservationStatus = typeof ReservationStatus[keyof typeof ReservationStatus];

export const ShotStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type ShotStatus = typeof ShotStatus[keyof typeof ShotStatus];
