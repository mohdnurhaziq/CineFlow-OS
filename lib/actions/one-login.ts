"use server";

import { db } from "@/lib/db";
import { getCurrentLogin } from "@/lib/auth/session";
import { linkAccountToLogin } from "@/lib/auth/login";
import { hasSetUp } from "@/lib/auth/set-up";
import { signInTarget } from "@/lib/auth/sign-in-target";
import { setLoginSessionCookie } from "@/lib/auth/token";

/**
 * "Continue as a client of this studio" for a signed-in login with no account there: takes up the
 * client account the studio already made for the email, or creates a linked one (clients can
 * register themselves anyway). Never gives staff access: that only ever comes from an invite.
 */
export async function continueAsClient(
  tenantSlug: string
): Promise<{ success: true; redirectTo: string; name: string } | { success: false; message: string }> {
  const me = await getCurrentLogin();
  if (!me) return { success: false, message: "Please sign in first." };

  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, subscriptionStatus: true } });
  if (!tenant || tenant.subscriptionStatus === "CANCELLED") return { success: false, message: "Studio not found." };

  // Legacy rows can be mixed case, so match on lower(email).
  const found = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE "tenantId" = ${tenant.id} AND lower(email) = ${me.email}`;
  const existing = found[0] ? await db.user.findUnique({ where: { id: found[0].id } }) : null;

  let userId: string;
  let name: string;
  if (existing) {
    if (existing.role !== "CLIENT" || existing.deactivatedAt) return { success: false, message: "Ask the studio to invite you." };
    if (existing.loginId !== me.loginId) {
      // An account with its own password was never proven to be this person's.
      if (hasSetUp(existing)) return { success: false, message: "This studio already has an account for this email. Ask the studio to help you sign in." };
      await linkAccountToLogin(existing.id, me.loginId);
    }
    userId = existing.id;
    name = existing.name;
  } else {
    const prior = await db.user.findFirst({ where: { loginId: me.loginId }, orderBy: { createdAt: "desc" }, select: { name: true, phone: true } });
    const created = await db.user.create({
      data: { tenantId: tenant.id, name: prior?.name ?? me.email, email: me.email, phone: prior?.phone ?? null, role: "CLIENT", loginId: me.loginId },
    });
    userId = created.id;
    name = created.name;
  }

  await setLoginSessionCookie(me.loginId, userId);
  return { success: true, redirectTo: signInTarget({ role: "CLIENT", tenantSlug: tenant.slug }), name };
}
