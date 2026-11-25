import { platformUrl } from "@/lib/domain-name";

/**
 * Where the "Continue with Google" button goes: always the platform host, where the Google callback
 * is. `studio` is the studio the person is signing in to (null on the platform's own sign-in page).
 * Plain module: safe in client components.
 */
/** The "Accept with Google" button on a team invite page: the invite travels in this address to our platform host only. */
export function googleInviteHref(studio: string, email: string, token: string): string {
  const query = new URLSearchParams({ intent: "invite", studio, email, token });
  return `${platformUrl("/auth/google/start")}?${query.toString()}`;
}

export function googleStartHref(studio: string | null): string {
  const query = new URLSearchParams({ intent: "signin", ...(studio ? { studio } : {}) });
  return `${platformUrl("/auth/google/start")}?${query.toString()}`;
}
