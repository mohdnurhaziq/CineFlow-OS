"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SIGNED_OUT_PARAM } from "@/lib/auth/signed-out";

/**
 * Confirms a sign-out: when the URL carries `?signedOut=1` (see signedOutHref), shows
 * "You've been signed out" and strips the flag so a refresh or a shared link doesn't repeat it.
 */
export function SignedOutNotice() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const shown = useRef(false);
  const signedOut = searchParams.get(SIGNED_OUT_PARAM) === "1";

  useEffect(() => {
    if (!signedOut || shown.current) return;
    shown.current = true;
    toast.success("You've been signed out", {
      id: "signed-out",
      description: "You can sign in again any time.",
      // A little longer than the default: it appears right as a new page loads.
      duration: 6000,
    });
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete(SIGNED_OUT_PARAM);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [signedOut, searchParams, pathname, router]);

  return null;
}
