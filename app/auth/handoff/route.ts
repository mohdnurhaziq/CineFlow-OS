import { NextRequest, NextResponse } from "next/server";
import { redeemHandoff, safeHandoffReturn } from "@/lib/auth/handoff";
import { setLoginSessionCookie } from "@/lib/auth/token";
import { platformUrl } from "@/lib/domain-name";

export const dynamic = "force-dynamic";

/**
 * The platform end of the custom-domain handoff: a one-time code from a sign-in on a studio's own
 * domain signs the browser in on the platform host (the shared cookie), then sends it back to that
 * studio. Anything wrong (a used, expired or made-up code, or a return address that isn't a studio's
 * own domain) just goes to the platform sign-in page. The code is never logged or echoed.
 */
export async function GET(request: NextRequest) {
  const toSignIn = () => NextResponse.redirect(new URL(platformUrl("/login"), request.url));
  const back = await safeHandoffReturn(request.nextUrl.searchParams.get("next") ?? "");
  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!back || !code) return toSignIn();
  const handoff = await redeemHandoff(code);
  if (!handoff) return toSignIn();
  if (!(await setLoginSessionCookie(handoff.loginId, handoff.activeUserId))) return toSignIn();
  return NextResponse.redirect(back);
}
