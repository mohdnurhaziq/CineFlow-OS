/**
 * Tier 43: one login, part 3 (docs/superpowers/specs/2026-11-25-one-login-design.md): Google sign-in.
 * Google itself is never called: tests sign ID tokens with a key of their own and hand the client a
 * matching key set.
 */

import { createHmac } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { TestHarness } from "./test-harness";
import {
  GoogleError,
  googleAuthorizationUrl,
  googleCallbackUrl,
  googleConfigured,
  exchangeGoogleCode,
  newGoogleFlow,
  setGoogleClientForTests,
} from "@/lib/auth/google";
import { openBlob, signBlob } from "@/lib/auth/signed-blob";
import { createHash } from "node:crypto";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "test-client-secret";

export async function runTier43GoogleSignInTests(harness: TestHarness) {
  harness.setSuite("Tier 43", "Google sign-in");

  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  const restoreEnv = () => {
    if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = saved.secret;
    setGoogleClientForTests(null);
  };
  harness.registerTeardown(async () => restoreEnv());
  const configure = () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET;
  };

  // Google's key, and someone else's.
  const good = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(good.publicKey)), kid: "k1", alg: "RS256", use: "sig" }] });

  type Claims = { sub?: string; email?: string | null; email_verified?: boolean; name?: string; nonce?: string; aud?: string; iss?: string; exp?: number | "10m"; key?: "good" | "other" };
  /** An ID token as Google would sign it, with whatever is wrong with it that the test wants. */
  const idToken = async (c: Claims = {}) => {
    const jwt = new SignJWT({
      ...(c.email === null ? {} : { email: c.email ?? "person@example.test" }),
      email_verified: c.email_verified ?? true,
      name: c.name ?? "Test Person",
      nonce: c.nonce ?? "nonce-1",
    })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject(c.sub ?? "google-sub-1")
      .setIssuer(c.iss ?? "https://accounts.google.com")
      .setAudience(c.aud ?? CLIENT_ID)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 300);
    jwt.setExpirationTime(c.exp ?? "10m");
    return jwt.sign((c.key === "other" ? other : good).privateKey);
  };
  const withToken = (token: string) =>
    setGoogleClientForTests({ exchange: async () => ({ id_token: token }), keys });

  await harness.test("T43-GOOGLE-01: the settings gate the feature, and the callback address is fixed", async () => {
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      harness.assertEqual(googleConfigured(), false, "Nothing set: off");
      process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
      harness.assertEqual(googleConfigured(), false, "Only the id: off");
      delete process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET;
      harness.assertEqual(googleConfigured(), false, "Only the secret: off");
      configure();
      harness.assertEqual(googleConfigured(), true, "Both set: on");
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").origin;
      harness.assertEqual(googleCallbackUrl(), `${origin}/auth/google/callback`, "The callback is on the platform host");
    } finally {
      restoreEnv();
    }
  });

  await harness.test("T43-GOOGLE-02: the ID token is checked", async () => {
    try {
      configure();
      withToken(await idToken());
      const claims = await exchangeGoogleCode("code", "verifier", "nonce-1");
      harness.assert(claims.sub === "google-sub-1" && claims.email === "person@example.test" && claims.emailVerified === true && claims.name === "Test Person", "A good token gives the claims", JSON.stringify(claims));
      const refused = async (what: string, c: Claims, code?: string) => {
        withToken(await idToken(c));
        let err: unknown = null;
        try {
          await exchangeGoogleCode("code", "verifier", "nonce-1");
        } catch (e) {
          err = e;
        }
        harness.assert(err instanceof GoogleError, `${what}: refused`, String(err));
        if (code) harness.assertEqual((err as GoogleError).code, code, `${what}: the reason`);
      };
      await refused("a wrong audience", { aud: "someone-elses-client" });
      await refused("a wrong issuer", { iss: "https://evil.example.com" });
      await refused("an expired token", { exp: Math.floor(Date.now() / 1000) - 60 });
      await refused("a wrong nonce", { nonce: "another-nonce" });
      await refused("a token signed by another key", { key: "other" });
      await refused("an unverified email", { email_verified: false }, "unverified");
      await refused("no email", { email: null });
      withToken(await idToken({ iss: "accounts.google.com" }));
      harness.assertEqual((await exchangeGoogleCode("code", "verifier", "nonce-1")).sub, "google-sub-1", "Google's other issuer spelling is accepted");
    } finally {
      restoreEnv();
    }
  });

  await harness.test("T43-GOOGLE-03: the authorization address", async () => {
    try {
      configure();
      const flow = newGoogleFlow();
      const url = new URL(googleAuthorizationUrl(flow));
      harness.assertEqual(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth", "Google's authorization endpoint");
      const q = url.searchParams;
      harness.assert(q.get("client_id") === CLIENT_ID && q.get("redirect_uri") === googleCallbackUrl() && q.get("response_type") === "code", "Client, callback and code flow");
      harness.assert(q.get("code_challenge_method") === "S256" && q.get("code_challenge") === flow.challenge, "PKCE with S256");
      harness.assert(q.get("state") === flow.state && q.get("nonce") === flow.nonce, "State and nonce");
      harness.assertEqual(q.get("scope"), "openid email profile", "Only the basic profile");
      harness.assertEqual(flow.challenge, createHash("sha256").update(flow.verifier).digest("base64url"), "The challenge is the verifier's SHA-256");
      const again = newGoogleFlow();
      harness.assert(again.state !== flow.state && again.verifier !== flow.verifier && again.nonce !== flow.nonce, "Every flow is different");
    } finally {
      restoreEnv();
    }
  });

  await harness.test("T43-GOOGLE-04: signed blobs", async () => {
    const blob = signBlob({ kind: "demo", n: 7 }, 60);
    harness.assertEqual(openBlob<{ kind: string; n: number }>(blob)?.n, 7, "A fresh blob opens");
    harness.assertEqual(openBlob(`${blob.slice(0, -1)}${blob.endsWith("A") ? "B" : "A"}`), null, "A changed signature opens nothing");
    const [payload] = blob.split(".");
    harness.assertEqual(openBlob(`${payload}.${createHmac("sha256", "another-secret").update(payload!).digest("base64url")}`), null, "Another secret opens nothing");
    harness.assertEqual(openBlob(signBlob({ n: 1 }, -5)), null, "An expired blob opens nothing");
    harness.assertEqual(openBlob("not-a-blob"), null, "Garbage opens nothing");
  });
}
