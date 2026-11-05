import { getCurrentUser } from "@/lib/auth/session";
import { OWNER_ROLES } from "@/lib/auth/guard";

/**
 * True when the signed-in user is the studio owner (or a platform super-admin). Pages use
 * it to hide owner-only controls (prices, payments); the server actions enforce the same
 * rule with requireOwner.
 */
export async function currentUserIsOwner(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && OWNER_ROLES.has(user.role);
}
