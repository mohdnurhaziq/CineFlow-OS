import type { AccessLevel } from "@/lib/auth/access";

/**
 * Which link to the booking's gallery its Actions show, matching what the gallery page allows:
 * - "upload": they can work on it (Galleries MANAGE, or Only their own on a booking assigned to them)
 * - "open": they can only look (Galleries VIEW)
 * - null: the gallery would show No access, so no link
 *
 * Pure, so the booking pop-up (a client component) can use it. Not a "use server" module.
 */
export function bookingGalleryLink(
  galleries: AccessLevel,
  viewerId: string,
  assigneeIds: string[]
): "upload" | "open" | null {
  if (galleries === "MANAGE") return "upload";
  if (galleries === "VIEW") return "open";
  if (galleries === "OWN") return assigneeIds.includes(viewerId) ? "upload" : null;
  return null;
}
