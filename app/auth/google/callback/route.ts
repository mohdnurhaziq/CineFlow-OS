import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleError, exchangeGoogleCode, type GoogleErrorCode } from "@/lib/auth/google";
import { FLOW_COOKIE, completeGoogleFlow, intentBackUrl, signInPageFor, type FlowBlob } from "@/lib/auth/google-flow";
import { openBlob } from "@/lib/auth/signed-blob";
import { issueHandoff } from "@/lib/auth/handoff";

export const dynamic = "force-dynamic";

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Where Google sends the browser back to. Only a browser that holds the flow cookie it was given at
 * the start, whose `state` matches, gets any further: a code carried to another browser does nothing.
 * Every outcome clears the cookie and goes to one of our own pages; the code is never logged or echoed.
 */
export async function GET(request: NextRequest) {
  const done = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    res.cookies.set(FLOW_COOKIE, "", { path: "/auth/google", maxAge: 0 });
    return res;
  };

  const raw = request.cookies.get(FLOW_COOKIE)?.value;
  const flow = raw ? openBlob<FlowBlob>(raw) : null;
  if (!flow) return done(signInPageFor(null, "failed"));
  // Begun on a studio's own domain: failures come back to that domain's own sign-in page.
  const back = (code: GoogleErrorCode) => done(flow.ret ? `${new URL(flow.ret.to).origin}/login?google=${code}` : intentBackUrl(flow.intent, code));

  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  if (!state || !sameText(state, flow.state)) return back("failed");
  const error = params.get("error");
  if (error) return back(error === "access_denied" ? "cancelled" : "failed");
  const code = params.get("code");
  if (!code) return back("failed");

  let claims;
  try {
    claims = await exchangeGoogleCode(code, flow.verifier, flow.nonce);
  } catch (err) {
    return back(err instanceof GoogleError ? err.code : "failed");
  }
  const out = await completeGoogleFlow(flow.intent, claims);
  // Begun on a studio's own domain: the platform's cookie is set now; a one-time code, good only for the
  // browser that holds the nonce, carries the sign-in back to that domain's own cookie.
  if (out.ok && flow.ret && out.loginId && out.userId) {
    const returnTo = new URL(flow.ret.to);
    const code = await issueHandoff(out.loginId, out.userId, returnTo.hostname, flow.ret.nonceHash);
    const target = new URL(out.redirectTo, returnTo);
    return done(`${returnTo.origin}/auth/google/finish?code=${encodeURIComponent(code)}&to=${encodeURIComponent(`${target.pathname}${target.search}`)}`);
  }
  return done(out.redirectTo);
}
