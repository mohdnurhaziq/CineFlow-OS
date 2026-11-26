import { sendNotification } from "@/lib/notifications";
import { PASSWORD_RESET_TTL_MINUTES, issuePasswordReset, passwordResetPath } from "@/lib/auth/password-reset";
import { studioUrl } from "@/lib/domain-name";
import { formatStudioDate } from "@/lib/slot-time";

/**
 * The email a new studio owner gets: where their admin and booking page are, and when the trial
 * ends. An account whose email isn't proven yet (`confirmEmail`) also gets a one-time link that
 * proves it. Server-only, not a "use server" module. Never throws: a failed send is logged and
 * the studio is created all the same.
 */
export async function sendStudioWelcome(
  owner: { id: string; email: string; name: string },
  studio: { name: string; slug: string; trialEndsAt: Date },
  opts: { confirmEmail: boolean }
): Promise<boolean> {
  try {
    const confirmUrl = opts.confirmEmail
      ? `${studioUrl(studio.slug, passwordResetPath(owner.email, await issuePasswordReset(owner.id)))}&join=1`
      : undefined;
    const res = await sendNotification(
      {
        event: "STUDIO_WELCOME",
        studioName: studio.name,
        studioSlug: studio.slug,
        clientName: owner.name,
        clientEmail: owner.email,
        adminUrl: studioUrl(studio.slug, "/admin"),
        bookingUrl: studioUrl(studio.slug, "/book"),
        trialEndsOn: formatStudioDate(studio.trialEndsAt),
        confirmUrl,
        confirmExpiresMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
      "EMAIL"
    );
    if (res.emailDelivery !== "SENT") {
      console.error(`Welcome email for ${studio.slug} not sent (${res.emailDelivery}): ${res.emailError ?? "no email provider configured"}`);
    }
    return res.emailDelivery === "SENT";
  } catch (err) {
    console.error("Welcome email failed:", err);
    return false;
  }
}
