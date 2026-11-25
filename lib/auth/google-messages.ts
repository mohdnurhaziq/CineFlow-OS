import type { GoogleErrorCode } from "@/lib/auth/google";

/**
 * What a sign-in page says when "Continue with Google" came back with a reason (`?google=<code>`).
 * Our own words, never Google's. Plain module: safe in client components.
 */
const MESSAGES: Record<GoogleErrorCode, string> = {
  cancelled: "You cancelled Google sign-in.",
  failed: "Google sign-in didn't work. Please try again.",
  unverified: "Google couldn't confirm that email address.",
  linked_other: "This email is already linked to a different Google account.",
  needs_invite: "Ask the studio to invite you.",
  mismatch: "Use the Google account for the email the invite was sent to.",
  closed: "This studio isn't available.",
  no_studio: "You're not with any studio yet. Start your own, or open a studio's website to book it.",
};

export function googleErrorMessage(code: string | null | undefined): string | null {
  return code && Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code as GoogleErrorCode] : null;
}
