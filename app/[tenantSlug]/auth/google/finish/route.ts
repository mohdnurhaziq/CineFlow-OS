import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { GOOGLE_NONCE_COOKIE, bareHost, isCustomDomainHost, redeemHandoff } from "@/lib/auth/handoff";
import { requestHost, setLoginSessionCookie } from "@/lib/auth/token";
import { isSafeRelativePath, platformUrl } from "@/lib/domain-name";
import { tenantSlugForDomain } from "@/lib/tenant-domain";

export const dynamic = "force-dynamic";

/**
 * The studio's own domain end of "Continue with Google": the platform sent the browser here with a
 * one-time code. The code is good only for this domain, only once, and only for the browser that began
 * the sign-in (it holds the nonce its own page put in a cookie here, which the platform kept a hash of).
 * Anything wrong goes to this domain's sign-in page, having signed no one in.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await context.params;
  const host = bareHost(await requestHost());
  if (!(await isCustomDomainHost(host)) || (await tenantSlugForDomain(host)) !== tenantSlug) {
    return NextResponse.redirect(new URL(platformUrl("/login"), request.url));
  }
  const origin = `https://${host}`;
  const refuse = () => NextResponse.redirect(`${origin}/login`);

  const code = request.nextUrl.searchParams.get("code") ?? "";
  const nonce = request.cookies.get(GOOGLE_NONCE_COOKIE)?.value ?? "";
  if (!code || !nonce) return refuse();
  const handoff = await redeemHandoff(code, host, createHash("sha256").update(nonce).digest("hex"));
  if (!handoff) return refuse();
  if (!(await setLoginSessionCookie(handoff.loginId, handoff.activeUserId))) return refuse();

  const to = request.nextUrl.searchParams.get("to") ?? "";
  const res = NextResponse.redirect(`${origin}${isSafeRelativePath(to) ? to : "/"}`);
  res.cookies.set(GOOGLE_NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
