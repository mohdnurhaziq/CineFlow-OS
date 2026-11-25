import { attemptCount, countAttempt, isRateLimited } from "@/lib/rate-limit";

/** Failed sign-ins for one email from everywhere in an hour before only fresh addresses may try. */
const SIGN_IN_FAILURE_CEILING = 100;

/**
 * Whether this sign-in attempt is refused:
 *   - 10 tries per email per visitor in 10 minutes (per email alone when the IP is unknown);
 *   - after 100 failures for the email from everywhere in an hour (a guess spread over many
 *     addresses), only addresses that haven't failed for it may try, so the real owner signing in
 *     from their usual place still gets in.
 * `scope` keeps studio and platform sign-in apart. Counts this attempt.
 */
export function signInBlocked(scope: string, email: string, ip: string | null): boolean {
  if (isRateLimited(ip ? `${scope}:${email}:${ip}` : `${scope}:${email}`, 10)) return true;
  return (
    !!ip &&
    attemptCount(`${scope}-fail:${email}`) >= SIGN_IN_FAILURE_CEILING &&
    attemptCount(`${scope}-fail:${email}:${ip}`) > 0
  );
}

/** Records a failed sign-in for the ceiling in signInBlocked. */
export function signInFailed(scope: string, email: string, ip: string | null): void {
  if (!ip) return;
  countAttempt(`${scope}-fail:${email}`, 60 * 60 * 1000);
  countAttempt(`${scope}-fail:${email}:${ip}`, 60 * 60 * 1000);
}
