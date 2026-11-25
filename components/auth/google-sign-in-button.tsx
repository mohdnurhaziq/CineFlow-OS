"use client";

import { GoogleButton } from "@/components/auth/google-button";
import { beginGoogleReturn } from "@/lib/actions/one-login";

/**
 * "Continue with Google" for a studio's own pages. On a studio's own domain it first sets a nonce in a
 * cookie there and adds it, with the domain's address, to the start link, so the sign-in can come back
 * to this domain and to this browser only. Anywhere else it is the plain link.
 */
export function GoogleSignInButton({ href, label }: { href: string; label?: string }) {
  const go = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    let target = href;
    try {
      const begun = await beginGoogleReturn();
      if (begun) {
        const url = new URL(href, window.location.origin);
        url.searchParams.set("returnTo", begun.returnTo);
        url.searchParams.set("nonce", begun.nonce);
        target = url.toString();
      }
    } catch {
      // Without a return the person still signs in; they land on the studio's subdomain address.
    }
    window.location.href = target;
  };
  return <GoogleButton href={href} label={label} onClick={go} />;
}
