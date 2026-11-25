import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { googleAuthorizationUrl, googleConfigured, newGoogleFlow } from "@/lib/auth/google";
import { FLOW_COOKIE, signInPageFor, type FlowBlob, type FlowIntent } from "@/lib/auth/google-flow";
import { signBlob } from "@/lib/auth/signed-blob";
import { platformUrl } from "@/lib/domain-name";

export const dynamic = "force-dynamic";

const FLOW_SECONDS = 600;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Begins "Continue with Google": remembers the secrets of this attempt (state, PKCE verifier, nonce)
 * and why the person is signing in in a short-lived signed cookie that only the platform's Google
 * paths receive, then sends the browser to Google. Always on the platform host, where the callback is.
 * Without the Google settings, or with a studio that isn't there, it goes to a sign-in page instead.
 */
export async function GET(request: NextRequest) {
  const go = (to: string) => NextResponse.redirect(new URL(to, request.url));
  if (!googleConfigured()) return go(platformUrl("/login"));

  const params = request.nextUrl.searchParams;
  const kind = params.get("intent") ?? "signin";
  let intent: FlowIntent;
  if (kind === "signin") {
    const slug = params.get("studio");
    if (slug) {
      const studio = SLUG.test(slug) ? await db.tenant.findUnique({ where: { slug }, select: { subscriptionStatus: true } }) : null;
      if (!studio || studio.subscriptionStatus === "CANCELLED") return go(signInPageFor(null, "closed"));
    }
    intent = { kind: "signin", studio: slug || null };
  } else if (kind === "signup") {
    intent = { kind: "signup" };
  } else if (kind === "invite") {
    const slug = params.get("studio") ?? "";
    const email = (params.get("email") ?? "").trim().toLowerCase();
    const token = params.get("token") ?? "";
    const studio = SLUG.test(slug) ? await db.tenant.findUnique({ where: { slug }, select: { subscriptionStatus: true } }) : null;
    if (!studio || studio.subscriptionStatus === "CANCELLED") return go(signInPageFor(null, "closed"));
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || email.length > 254 || !token || token.length > 200) return go(signInPageFor(slug, "failed"));
    intent = { kind: "invite", studio: slug, email, token };
  } else {
    return go(platformUrl("/login"));
  }

  const flow = newGoogleFlow();
  const blob: FlowBlob = { state: flow.state, verifier: flow.verifier, nonce: flow.nonce, intent };
  const res = NextResponse.redirect(googleAuthorizationUrl(flow));
  res.cookies.set(FLOW_COOKIE, signBlob(blob, FLOW_SECONDS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth/google",
    maxAge: FLOW_SECONDS,
  });
  return res;
}
