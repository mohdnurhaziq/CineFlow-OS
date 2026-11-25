import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { safeHandoffReturn } from "@/lib/auth/handoff";
import { requestHost, sessionCookieFor } from "@/lib/auth/token";
import { platformUrl } from "@/lib/domain-name";

export const dynamic = "force-dynamic";

/**
 * The platform end of signing out on a studio's own domain: that host's own cookie is already gone,
 * and this clears the shared platform cookie too (a cookie can only be deleted from its own host),
 * then returns to the studio. A bad return address goes to the platform home instead.
 */
export async function GET(request: NextRequest) {
  const cookie = sessionCookieFor(await requestHost());
  const store = await cookies();
  if (cookie.domain) store.delete({ name: cookie.name, domain: cookie.domain, path: "/" });
  else store.delete(cookie.name);
  const back = await safeHandoffReturn(request.nextUrl.searchParams.get("next") ?? "");
  return NextResponse.redirect(back ?? new URL(platformUrl("/"), request.url));
}
