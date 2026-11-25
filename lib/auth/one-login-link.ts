import { sendNotification } from "@/lib/notifications";
import { PASSWORD_RESET_TTL_MINUTES, issuePasswordReset, passwordResetPath } from "@/lib/auth/password-reset";
import { studioUrl } from "@/lib/domain-name";

/**
 * Emails a stand-alone account the "use one sign-in for all your studios" link: a one-time reset
 * link (worded for choosing one password) that proves the email. Server-only, not a "use server"
 * module. Never throws: a failed send is logged.
 */
export async function emailOneLoginLink(
  user: { id: string; email: string; name: string },
  tenant: { name: string; slug: string }
): Promise<boolean> {
  try {
    const token = await issuePasswordReset(user.id);
    const res = await sendNotification(
      {
        event: "ONE_LOGIN_CONFIRM",
        studioName: tenant.name,
        studioSlug: tenant.slug,
        clientName: user.name,
        clientEmail: user.email,
        confirmUrl: `${studioUrl(tenant.slug, passwordResetPath(user.email, token))}&join=1`,
        expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
      "EMAIL"
    );
    if (res.emailDelivery !== "SENT") {
      console.error(`One-sign-in email for ${tenant.slug} not sent (${res.emailDelivery}): ${res.emailError ?? "no email provider configured"}`);
    }
    return res.emailDelivery === "SENT";
  } catch (err) {
    console.error("One-sign-in email failed:", err);
    return false;
  }
}
