import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { appUrl } from "@/lib/domain-name";

/**
 * "Continue with Google": the OAuth 2.0 / OpenID Connect authorization-code flow with PKCE, written
 * against Google directly (no auth framework: its own sessions would fight ours). This file talks to
 * Google and checks what comes back; what to do with the person is decided in lib/auth/google-flow.ts.
 * Server-only, not a "use server" module.
 */

export type GoogleErrorCode = "cancelled" | "failed" | "unverified" | "linked_other" | "needs_invite" | "mismatch" | "closed" | "no_studio";

/** Why Google sign-in was refused, as a code for our own message (never Google's text). */
export class GoogleError extends Error {
  constructor(public code: GoogleErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GoogleError";
  }
}

export interface GoogleClaims {
  sub: string;
  /** Lowercase. */
  email: string;
  emailVerified: boolean;
  name: string | null;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** What the tests stand in for Google with: the token endpoint's answer, and the key set that signed it. */
export interface GoogleTestClient {
  exchange(params: { code: string; verifier: string }): Promise<{ id_token: string }>;
  keys: JWTVerifyGetKey;
}
let testClient: GoogleTestClient | null = null;
export function setGoogleClientForTests(client: GoogleTestClient | null): void {
  testClient = client;
}

let remoteKeys: JWTVerifyGetKey | undefined;
const googleKeys = () => testClient?.keys ?? (remoteKeys ??= createRemoteJWKSet(new URL(JWKS_URL)));

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

/** Whether Google sign-in is set up (both settings present). Read on each call so a change needs no restart of tests. */
export function googleConfigured(): boolean {
  return clientId() !== "" && clientSecret() !== "";
}

/** The one fixed callback address on the platform host, which must be listed in the Google Cloud client. */
export function googleCallbackUrl(): string {
  return `${appUrl().origin}/auth/google/callback`;
}

/** The secrets of one sign-in attempt: `state` and `nonce` come back from Google, `verifier` never leaves us until the code is exchanged. */
export function newGoogleFlow(): { state: string; verifier: string; challenge: string; nonce: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(24).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    nonce: randomBytes(24).toString("base64url"),
  };
}

export function googleAuthorizationUrl(flow: { state: string; challenge: string; nonce: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleCallbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: flow.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

async function exchange(code: string, verifier: string): Promise<{ id_token: string }> {
  if (testClient) return testClient.exchange({ code, verifier });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: googleCallbackUrl(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new GoogleError("failed");
  return (await res.json()) as { id_token: string };
}

/**
 * Trades the returned code for the person's Google identity: sends the PKCE verifier, then checks the
 * ID token's signature against Google's keys, its issuer, audience (our client id), expiry and nonce,
 * and that Google says the email is verified. Anything else throws a GoogleError.
 */
export async function exchangeGoogleCode(code: string, verifier: string, nonce: string): Promise<GoogleClaims> {
  if (!googleConfigured()) throw new GoogleError("failed");
  let idToken: string | undefined;
  try {
    idToken = (await exchange(code, verifier)).id_token;
  } catch {
    throw new GoogleError("failed");
  }
  if (!idToken) throw new GoogleError("failed");

  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, googleKeys(), { issuer: ISSUERS, audience: clientId(), algorithms: ["RS256"] }));
  } catch {
    throw new GoogleError("failed");
  }
  if (payload.nonce !== nonce) throw new GoogleError("failed");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || typeof payload.sub !== "string" || !payload.sub) throw new GoogleError("failed");
  if (payload.email_verified !== true) throw new GoogleError("unverified");
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
  return { sub: payload.sub, email, emailVerified: true, name };
}
