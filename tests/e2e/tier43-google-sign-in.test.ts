/**
 * Tier 43: one login, part 3 (docs/superpowers/specs/2026-11-25-one-login-design.md): Google sign-in.
 * Google itself is never called: tests sign ID tokens with a key of their own and hand the client a
 * matching key set.
 */

import { createHmac } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import bcrypt from "bcryptjs";
import nodemailer, { type Transporter } from "nodemailer";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { createLoginFromProof, findLogin } from "@/lib/auth/login";
import { COOKIE_NAME, decodeSessionToken } from "@/lib/auth/token";
import { accountHref } from "@/lib/auth/switcher";
import { type GoogleClaims } from "@/lib/auth/google";
import { FLOW_COOKIE, completeGoogleFlow } from "@/lib/auth/google-flow";
import { GET as GET_START } from "@/app/auth/google/start/route";
import { GET as GET_CALLBACK } from "@/app/auth/google/callback/route";
import { withRequest } from "./mocks/session";
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

  // ── Task 2: sign in or register with Google ─────────────────────────────────────────────
  const STAMP = Date.now().toString(36);
  let counter = 0;
  const emailFor = (label: string) => `t43-${label}-${STAMP}-${++counter}@example.test`;
  const createdEmails = new Set<string>();
  const createdStudios: string[] = [];
  const makeStudio = async (label: string, over: { subscriptionStatus?: string } = {}) => {
    const t = await db.tenant.create({ data: { name: `T43 ${label} ${STAMP}`, slug: `t43-${label}-${STAMP}-${++counter}`, ...over } });
    createdStudios.push(t.id);
    return t;
  };
  const makeUser = async (tenantId: string, email: string, role: string, opts: { password?: string; inviteToken?: string } = {}) => {
    createdEmails.add(email.toLowerCase());
    return db.user.create({
      data: {
        tenantId,
        name: `T43 ${role}`,
        email,
        role,
        passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : null,
        ...(opts.inviteToken ? { inviteToken: opts.inviteToken, inviteTokenExpires: new Date(Date.now() + 86_400_000) } : {}),
      },
    });
  };
  const cleanUp = async () => {
    const emails = [...createdEmails];
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.login.deleteMany({ where: { email: { in: emails } } });
    await db.tenant.deleteMany({ where: { id: { in: createdStudios } } });
    createdEmails.clear();
    createdStudios.length = 0;
  };
  harness.registerTeardown(cleanUp);
  const claims = (email: string, over: Partial<GoogleClaims> = {}): GoogleClaims => {
    createdEmails.add(email.toLowerCase());
    return { sub: `sub-${STAMP}-${++counter}`, email, emailVerified: true, name: "Test Person", ...over };
  };

  type Mail = { to: string; subject: string; html: string; text: string };
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_ADDRESS"] as const;
  const withInbox = async (fn: (inbox: Mail[]) => Promise<void>) => {
    const savedEnv = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
    for (const k of SMTP_KEYS) delete process.env[k];
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    const inbox: Mail[] = [];
    const json = nodemailer.createTransport({ jsonTransport: true });
    setSmtpTransportForTests({ sendMail: async (mail: Mail) => { inbox.push(mail); return json.sendMail(mail); } } as unknown as Transporter);
    try {
      await fn(inbox);
    } finally {
      setSmtpTransportForTests(json);
      for (const k of SMTP_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    }
  };
  const errorsAt = (r: { ok: boolean; redirectTo: string }, code: string) => !r.ok && r.redirectTo.includes(`/login?google=${code}`);

  await harness.test("T43-FLOW-01: a first-time Google user at a studio gets a linked client account and is signed in", async () => {
    try {
      const studio = await makeStudio("f1");
      const email = emailFor("f1");
      const c = claims(email);
      const out = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: studio.slug }, c), cookie: jar.get(COOKIE_NAME) }));
      harness.assert(out.r.ok === true, "Signed in", JSON.stringify(out.r));
      const login = await findLogin(email);
      harness.assert(login !== null && login.passwordHash === null && login.googleSub === c.sub, "A login with Google and no password");
      const account = await db.user.findFirstOrThrow({ where: { tenantId: studio.id, email } });
      harness.assert(account.role === "CLIENT" && account.name === "Test Person" && account.phone === null && account.passwordHash === null && account.loginId === login!.id, "A linked client account named from Google, with no phone and no password");
      harness.assertEqual((await decodeSessionToken(out.cookie ?? ""))?.user.id, account.id, "A login session with that account active");
      harness.assertEqual(out.r.redirectTo, accountHref(studio.slug, "CLIENT"), "On to the account page");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-FLOW-02: a login that already has another Google account is refused, and nothing is signed in", async () => {
    try {
      const studio = await makeStudio("f2");
      const email = emailFor("f2");
      createdEmails.add(email);
      await db.login.create({ data: { email, googleSub: "sub-A" } });
      const out = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: studio.slug }, claims(email, { sub: "sub-B" })), set: jar.has(COOKIE_NAME) }));
      harness.assert(errorsAt(out.r, "linked_other") && !out.set, "Refused with its own code, no session", JSON.stringify(out.r));
      harness.assertEqual((await findLogin(email))?.googleSub, "sub-A", "The login still has its own Google account");
      harness.assertEqual(await db.user.count({ where: { tenantId: studio.id, email } }), 0, "No account was made at the studio");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-FLOW-03: a staff account is never taken by signing in, a client account the studio made is", async () => {
    try {
      const staffStudio = await makeStudio("f3s");
      const clientStudio = await makeStudio("f3c");
      const email = emailFor("f3");
      const staff = await makeUser(staffStudio.id, email, "TEAM_MEMBER", { inviteToken: `t43-staff-${STAMP}` });
      const quick = await makeUser(clientStudio.id, email, "CLIENT", { inviteToken: `t43-client-${STAMP}` });
      const c = claims(email);
      const refused = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: staffStudio.slug }, c), set: jar.has(COOKIE_NAME) }));
      harness.assert(errorsAt(refused.r, "needs_invite") && !refused.set, "A pending staff invite: refused", JSON.stringify(refused.r));
      harness.assertEqual((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).loginId, null, "The staff account is untouched");
      const taken = await withRequest(() => completeGoogleFlow({ kind: "signin", studio: clientStudio.slug }, c));
      harness.assert(taken.ok === true, "A passwordless client account the studio made: taken up", JSON.stringify(taken));
      const after = await db.user.findUniqueOrThrow({ where: { id: quick.id } });
      harness.assert(after.loginId !== null && after.inviteToken === null, "…and joined to the login");
      harness.assertEqual(await db.user.count({ where: { tenantId: clientStudio.id, email } }), 1, "No duplicate");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-FLOW-04: an existing password login gains Google; a person with stand-alone accounts gets them joined", async () => {
    try {
      const a = await makeStudio("f4a");
      const b = await makeStudio("f4b");
      const emailA = emailFor("f4-pass");
      createdEmails.add(emailA);
      const hash = await bcrypt.hash("pass-1234", 4);
      const login = (await createLoginFromProof(emailA, hash)).login;
      const cA = claims(emailA);
      const okA = await withRequest(() => completeGoogleFlow({ kind: "signin", studio: a.slug }, cA));
      harness.assert(okA.ok === true, "Signed in", JSON.stringify(okA));
      const after = await db.login.findUniqueOrThrow({ where: { id: login.id } });
      harness.assert(after.googleSub === cA.sub && after.passwordHash === hash, "Google was added and the password kept");

      const emailB = emailFor("f4-alone");
      const one = await makeUser(a.id, emailB, "CLIENT", { password: "alone-1111" });
      const two = await makeUser(b.id, emailB, "CLIENT", { password: "alone-2222" });
      await withInbox(async (inbox) => {
        const okB = await withRequest(() => completeGoogleFlow({ kind: "signin", studio: null }, claims(emailB)));
        harness.assert(okB.ok === true && okB.redirectTo.endsWith("/studios"), "Signed in on the platform", JSON.stringify(okB));
        const [o2, t2] = await Promise.all([one, two].map((u) => db.user.findUniqueOrThrow({ where: { id: u.id } })));
        harness.assert(o2!.loginId !== null && o2!.passwordHash === null && t2!.loginId === o2!.loginId && t2!.passwordHash === null, "Both accounts joined, their passwords cleared");
        harness.assertEqual(inbox.filter((m) => m.to === emailB).length, 1, "One joined email");
      });
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-FLOW-05: the platform path: no studio, no login; a super-admin; a stand-alone account elsewhere", async () => {
    try {
      const nobody = emailFor("f5-nobody");
      const none = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: null }, claims(nobody)), set: jar.has(COOKIE_NAME) }));
      harness.assert(errorsAt(none.r, "no_studio") && !none.set, "No login and no account anywhere: nothing is created", JSON.stringify(none.r));
      harness.assertEqual(await findLogin(nobody), null, "…not even a login");
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const sup = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: null }, claims(superRow.email)), set: jar.has(COOKIE_NAME) }));
      harness.assert(errorsAt(sup.r, "failed") && !sup.set, "A super-admin's email never signs in this way", JSON.stringify(sup.r));
      harness.assertEqual(await findLogin(superRow.email), null, "…and no login is made for it");
      const studio = await makeStudio("f5");
      const alone = emailFor("f5-alone");
      await makeUser(studio.id, alone, "CLIENT", { password: "alone-3333" });
      const ok = await withRequest(() => completeGoogleFlow({ kind: "signin", studio: null }, claims(alone)));
      harness.assert(ok.ok === true && ok.redirectTo.endsWith("/studios"), "A stand-alone account elsewhere: a login, on to Your studios", JSON.stringify(ok));
    } finally {
      await cleanUp();
    }
  });

  const FLOW = FLOW_COOKIE;
  const startReq = (qs: string) => new NextRequest(`https://cineflow-os.my/auth/google/start?${qs}`);
  const callbackReq = (qs: string, cookie?: string) =>
    new NextRequest(`https://cineflow-os.my/auth/google/callback?${qs}`, cookie ? { headers: { cookie: `${FLOW}=${cookie}` } } : undefined);
  const googleSays = async (nonce: string, email: string) => {
    const token = await idToken({ email, nonce });
    let calls = 0;
    setGoogleClientForTests({ exchange: async () => { calls++; return { id_token: token }; }, keys });
    return () => calls;
  };

  await harness.test("T43-START-01: not configured: the start goes to the sign-in page and sets nothing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      const res = await GET_START(startReq("intent=signin&studio=lumina-cine"));
      harness.assert((res.headers.get("location") ?? "").endsWith("/login") && !res.cookies.get(FLOW), "To /login, no flow cookie");
    } finally {
      restoreEnv();
    }
  });

  await harness.test("T43-START-02: the start address and cookie; a bad studio goes nowhere near Google", async () => {
    try {
      configure();
      const studio = await makeStudio("s2");
      const res = await GET_START(startReq(`intent=signin&studio=${studio.slug}`));
      harness.assert((res.headers.get("location") ?? "").startsWith("https://accounts.google.com/o/oauth2/v2/auth?"), "To Google", res.headers.get("location") ?? "");
      const cookie = res.cookies.get(FLOW);
      harness.assert(!!cookie && cookie.httpOnly === true && cookie.sameSite === "lax" && cookie.path === "/auth/google" && cookie.maxAge === 600, "A short-lived HttpOnly Lax cookie for the Google paths only", JSON.stringify(cookie));
      const blob = openBlob<{ state: string; verifier: string; nonce: string; intent: { kind: string; studio: string } }>(cookie!.value);
      harness.assert(blob?.intent.kind === "signin" && blob.intent.studio === studio.slug, "It holds the intent");
      harness.assert(new URL(res.headers.get("location")!).searchParams.get("state") === blob!.state, "…and the state it sent");
      const cancelled = await makeStudio("s2c", { subscriptionStatus: "CANCELLED" });
      for (const qs of ["intent=signin&studio=no-such-studio-xyz", `intent=signin&studio=${cancelled.slug}`, "intent=signin&studio=https://evil.com", "intent=signin&studio=..%2F..%2Fx"]) {
        const bad = await GET_START(startReq(qs));
        harness.assert((bad.headers.get("location") ?? "").includes("/login?google=closed") && !bad.cookies.get(FLOW), `Refused: ${qs}`);
      }
    } finally {
      restoreEnv();
      await cleanUp();
    }
  });

  await harness.test("T43-CALLBACK-01: start, then callback: signed in, sent to the studio, flow cookie cleared", async () => {
    try {
      configure();
      const studio = await makeStudio("c1");
      const email = emailFor("c1");
      const start = await GET_START(startReq(`intent=signin&studio=${studio.slug}`));
      const cookie = start.cookies.get(FLOW)!.value;
      const flow = openBlob<{ state: string; nonce: string }>(cookie)!;
      await googleSays(flow.nonce, email);
      createdEmails.add(email);
      const out = await withRequest(async (jar) => ({ res: await GET_CALLBACK(callbackReq(`code=abc&state=${flow.state}`, cookie)), session: jar.get(COOKIE_NAME) }));
      harness.assert((out.res.headers.get("location") ?? "").endsWith(accountHref(studio.slug, "CLIENT")), "Sent to the studio's account page", out.res.headers.get("location") ?? "");
      harness.assert(!!out.session, "A session was set");
      harness.assertEqual(out.res.cookies.get(FLOW)?.value, "", "The flow cookie is cleared");
    } finally {
      restoreEnv();
      await cleanUp();
    }
  });

  await harness.test("T43-CALLBACK-02: nothing signs in without this browser's own flow", async () => {
    try {
      configure();
      const studio = await makeStudio("c2");
      const email = emailFor("c2");
      createdEmails.add(email);
      const start = await GET_START(startReq(`intent=signin&studio=${studio.slug}`));
      const cookie = start.cookies.get(FLOW)!.value;
      const flow = openBlob<{ state: string; nonce: string }>(cookie)!;
      const calls = await googleSays(flow.nonce, email);
      const tampered = `${cookie.slice(0, -2)}${cookie.endsWith("AA") ? "BB" : "AA"}`;
      const cases: Array<[string, () => Promise<Response>, string]> = [
        ["no flow cookie (a code replayed in another browser)", () => GET_CALLBACK(callbackReq(`code=abc&state=${flow.state}`)), "failed"],
        ["a different state", () => GET_CALLBACK(callbackReq("code=abc&state=another-state", cookie)), "failed"],
        ["no state", () => GET_CALLBACK(callbackReq("code=abc", cookie)), "failed"],
        ["a tampered flow cookie", () => GET_CALLBACK(callbackReq(`code=abc&state=${flow.state}`, tampered)), "failed"],
        ["no code", () => GET_CALLBACK(callbackReq(`state=${flow.state}`, cookie)), "failed"],
        ["the person cancelled", () => GET_CALLBACK(callbackReq(`error=access_denied&state=${flow.state}`, cookie)), "cancelled"],
        ["Google reported another error", () => GET_CALLBACK(callbackReq(`error=server_error&state=${flow.state}`, cookie)), "failed"],
      ];
      for (const [what, run, code] of cases) {
        const out = await withRequest(async (jar) => ({ res: await run(), set: jar.has(COOKIE_NAME) }));
        harness.assert((out.res.headers.get("location") ?? "").includes(`/login?google=${code}`) && !out.set, `${what}: refused (${code}), nothing signed in`, out.res.headers.get("location") ?? "");
      }
      harness.assertEqual(calls(), 0, "Google was never asked to exchange a code in any of those");
      harness.assertEqual(await findLogin(email), null, "No login was made");
    } finally {
      restoreEnv();
      await cleanUp();
    }
  });

  await harness.test("T43-UI-01: the buttons and messages are wired", async () => {
    const read = (f: string) => readFile(f, "utf8");
    const button = await read("components/auth/google-button.tsx");
    harness.assert(/Continue with Google/.test(button) && /min-h-11/.test(button), "A 'Continue with Google' button at least 44px tall");
    for (const f of ["components/auth/studio-login-form.tsx", "components/auth/client-auth-panel.tsx", "components/auth/platform-account-login-form.tsx"]) {
      const src = await read(f);
      harness.assert(/googleEnabled/.test(src) && /<GoogleButton\b/.test(src) && /googleErrorMessage\(/.test(src), `${f} shows the button only when enabled, and the messages`);
    }
    for (const f of ["app/[tenantSlug]/login/page.tsx", "app/[tenantSlug]/register/page.tsx", "app/(saas)/login/page.tsx"]) {
      harness.assert(/googleEnabled=\{googleConfigured\(\)\}/.test(await read(f)), `${f} passes whether Google is set up`);
    }
    harness.assert(/Ask the studio to invite you\./.test(await read("lib/auth/google-messages.ts")), "The messages are in plain words");
  });
}
