import { platformUrl } from "@/lib/domain-name";

/**
 * Client-side helpers for the custom-domain handoff (see lib/auth/handoff.ts). Plain module: safe in
 * client components. `target` and `returnPath` are paths on the studio's own domain.
 */

/** Where to send the browser after a sign-in on a studio's own domain: the platform signs it in too, then returns to `target`. */
export function handoffHref(code: string, target: string): string {
  const next = `${window.location.origin}${target}`;
  return `${platformUrl("/auth/handoff")}?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
}

/** Where to send the browser after signing out on a studio's own domain: the platform clears its cookie too, then returns to `returnPath`. */
export function signOutHref(via: string, returnPath: string): string {
  return `${via}?next=${encodeURIComponent(`${window.location.origin}${returnPath}`)}`;
}
