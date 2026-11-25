import { platformUrl } from "@/lib/domain-name";

/**
 * Where the "Continue with Google" button goes: always the platform host, where the Google callback
 * is. `studio` is the studio the person is signing in to (null on the platform's own sign-in page).
 * Plain module: safe in client components.
 */
export function googleStartHref(studio: string | null): string {
  const query = new URLSearchParams({ intent: "signin", ...(studio ? { studio } : {}) });
  return `${platformUrl("/auth/google/start")}?${query.toString()}`;
}
