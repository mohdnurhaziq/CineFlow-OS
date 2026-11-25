import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { safeHandoffReturn } from "@/lib/auth/handoff";
import { requestHost, sessionCookieFor } from "@/lib/auth/token";
import { platformUrl } from "@/lib/domain-name";

export const dynamic = "force-dynamic";

const toHome = (request: NextRequest) => NextResponse.redirect(new URL(platformUrl("/"), request.url));

/** A link never signs anyone out: only the POST a studio's own page sends. */
export async function GET(request: NextRequest) {
  return toHome(request);
}

/**
 * The platform end of signing out on a studio's own domain: that host's own cookie is already gone,
 * and this clears the shared platform cookie too (a cookie can only be deleted from its own host),
 * then returns to the studio. Like the handoff it must be that studio's own page that posted it
 * (the Origin header is the return address's origin), so no other site can sign visitors out.
 * Anything wrong leaves the cookie alone and goes to the platform home.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return toHome(request);
  }
  const back = await safeHandoffReturn(String(form.get("next") ?? ""));
  if (!back || request.headers.get("origin") !== new URL(back).origin) return toHome(request);
  const cookie = sessionCookieFor(await requestHost());
  const store = await cookies();
  if (cookie.domain) store.delete({ name: cookie.name, domain: cookie.domain, path: "/" });
  else store.delete(cookie.name);
  return NextResponse.redirect(back, 303);
}
