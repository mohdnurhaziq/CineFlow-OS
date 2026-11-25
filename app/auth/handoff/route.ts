import { NextRequest, NextResponse } from "next/server";
import { redeemHandoff, safeHandoffReturn } from "@/lib/auth/handoff";
import { setLoginSessionCookie } from "@/lib/auth/token";
import { platformUrl } from "@/lib/domain-name";

export const dynamic = "force-dynamic";

const toSignIn = (request: NextRequest) => NextResponse.redirect(new URL(platformUrl("/login"), request.url));

/** A link never signs anyone in: only the POST a studio's own page sends. */
export async function GET(request: NextRequest) {
  return toSignIn(request);
}

/**
 * The platform end of the custom-domain handoff. The studio's own page posts a form with a one-time
 * code and where to return to; this signs the browser in on the platform host (the shared cookie), then
 * sends it back with a 303. It must be that studio's own page that posted it: the Origin header the
 * browser adds has to be the return address's own origin, and the code has to have been issued for that
 * domain. Otherwise a page someone else built could log a visitor into the builder's own account.
 * Anything wrong just goes to the platform sign-in page, and the code is never logged or echoed.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return toSignIn(request);
  }
  const code = String(form.get("code") ?? "");
  const back = await safeHandoffReturn(String(form.get("next") ?? ""));
  if (!back || !code) return toSignIn(request);
  const target = new URL(back);
  if (request.headers.get("origin") !== target.origin) return toSignIn(request);
  const handoff = await redeemHandoff(code, target.hostname);
  if (!handoff) return toSignIn(request);
  if (!(await setLoginSessionCookie(handoff.loginId, handoff.activeUserId))) return toSignIn(request);
  return NextResponse.redirect(back, 303);
}
