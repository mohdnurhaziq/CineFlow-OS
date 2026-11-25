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
import { NextRequest, type NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setSmtpTransportForTests } from "@/lib/email/smtp";
import { createLoginFromProof, findLogin } from "@/lib/auth/login";
import { COOKIE_NAME, decodeSessionToken } from "@/lib/auth/token";
import { accountHref } from "@/lib/auth/switcher";
import { type GoogleClaims } from "@/lib/auth/google";
import { FLOW_COOKIE, completeGoogleFlow, SIGNUP_TICKET_COOKIE } from "@/lib/auth/google-flow";
import { GET as GET_START } from "@/app/auth/google/start/route";
import { GET as GET_CALLBACK } from "@/app/auth/google/callback/route";
import { withRequest } from "./mocks/session";
import { ensureStudioRoles } from "@/lib/auth/access";
import { teamMemberStatus } from "@/lib/team/status";
import { inviteTeamMember } from "@/lib/actions/admin-team";
import { resetPassword } from "@/lib/actions/password-reset";
import { withSession } from "./mocks/session";
import { onboardStudio, readGoogleTicket } from "@/lib/actions/onboarding";
import { APP_BASE_DOMAIN } from "@/lib/domain-name";
import { SHARED_COOKIE_NAME } from "@/lib/auth/token";
import { GOOGLE_NONCE_COOKIE } from "@/lib/auth/handoff";
import { beginGoogleReturn } from "@/lib/actions/one-login";
import { GET as GET_FINISH } from "@/app/[tenantSlug]/auth/google/finish/route";
import { withHost } from "./mocks/session";
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
      const sup = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signin", studio: null }, { sub: `sub-${STAMP}-super`, email: superRow.email, emailVerified: true, name: "Not The Admin" }), set: jar.has(COOKIE_NAME) }));
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
      harness.assert(/googleEnabled/.test(src) && /<Google(Sign[Ii]n)?Button\b/.test(src) && /googleErrorMessage\(/.test(src), `${f} shows the button only when enabled, and the messages`);
    }
    for (const f of ["app/[tenantSlug]/login/page.tsx", "app/[tenantSlug]/register/page.tsx", "app/(saas)/login/page.tsx"]) {
      harness.assert(/googleEnabled=\{googleConfigured\(\)\}/.test(await read(f)), `${f} passes whether Google is set up`);
    }
    harness.assert(/Ask the studio to invite you\./.test(await read("lib/auth/google-messages.ts")), "The messages are in plain words");
  });

  // ── Task 3: accepting a team invite with Google ─────────────────────────────────────────
  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
  /** A studio with an owner who can invite people: the invite link is what the studio sees. */
  const makeStudioWithOwner = async (label: string) => {
    const studio = await makeStudio(label);
    await ensureStudioRoles(studio.id);
    const roleId = (await db.teamRole.findFirstOrThrow({ where: { tenantId: studio.id } })).id;
    const o = await makeUser(studio.id, emailFor(`${label}-owner`), "STUDIO_OWNER", { password: "owner-pass-1" });
    const owner = { id: o.id, email: o.email, name: o.name, role: "STUDIO_OWNER", tenantId: studio.id, tenantSlug: studio.slug };
    const invite = async (email: string) => {
      createdEmails.add(email.toLowerCase());
      const res = (await withSession(owner, () => inviteTeamMember({ tenantId: studio.id, tenantSlug: studio.slug, name: "T43 Invitee", email, roleId }))) as { success: boolean; inviteUrl?: string };
      if (!res.success || !res.inviteUrl) throw new Error(`invite failed: ${JSON.stringify(res)}`);
      return tokenOf(res.inviteUrl);
    };
    return { studio, invite };
  };
  const pendingAccount = (studioId: string, email: string) => db.user.findFirstOrThrow({ where: { tenantId: studioId, email } });

  await harness.test("T43-INVITE-01: Google accepts an invite and proves the email", async () => {
    try {
      const { studio, invite } = await makeStudioWithOwner("i1");
      const elsewhere = await makeStudio("i1x");
      const email = emailFor("i1");
      const other = await makeUser(elsewhere.id, email, "CLIENT", { password: "alone-1111" });
      const token = await invite(email);
      const c = claims(email);
      const out = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token }, c), cookie: jar.get(COOKIE_NAME) }));
      harness.assert(out.r.ok === true, "Accepted", JSON.stringify(out.r));
      const login = await findLogin(email);
      harness.assert(login !== null && login.googleSub === c.sub && login.passwordHash === null, "A login with Google and no password");
      const account = await pendingAccount(studio.id, email);
      harness.assert(account.loginId === login!.id && account.passwordHash === null, "The team account is joined to it");
      harness.assertEqual(teamMemberStatus(account), "ACTIVE", "…and Active");
      const reuse = await resetPassword({ tenantSlug: studio.slug, email, token, password: "Another-pass-1234" });
      harness.assert(!reuse.success && reuse.error === "INVALID_LINK", "The invite link is used up");
      harness.assertEqual((await decodeSessionToken(out.cookie ?? ""))?.user.id, account.id, "Signed in as that account");
      const joined = await db.user.findUniqueOrThrow({ where: { id: other.id } });
      harness.assert(joined.loginId === login!.id && joined.passwordHash === null, "The person's other set-up account is joined too");
      harness.assertEqual(out.r.redirectTo, accountHref(studio.slug, account.role), "On to the team's page");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-INVITE-02: an invite for a different email is refused, and nothing changes", async () => {
    try {
      const { studio, invite } = await makeStudioWithOwner("i2");
      const email = emailFor("i2");
      const token = await invite(email);
      const wrong = emailFor("i2-wrong");
      const out = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token }, claims(wrong)), set: jar.has(COOKIE_NAME) }));
      harness.assert(!out.r.ok && out.r.code === "mismatch" && !out.set, "Refused as a mismatch, no session", JSON.stringify(out.r));
      harness.assert(out.r.redirectTo.includes("reset-password") && out.r.redirectTo.includes("google=mismatch"), "…back on the invite page with the reason", out.r.redirectTo);
      const account = await pendingAccount(studio.id, email);
      harness.assert(account.loginId === null && account.passwordResetToken !== null, "The account is still pending and the link still works");
      harness.assertEqual(await findLogin(email), null, "No login for the invited email");
      harness.assertEqual(await findLogin(wrong), null, "No login for the Google email");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-INVITE-03: an existing login joins without a password", async () => {
    try {
      const { studio, invite } = await makeStudioWithOwner("i3");
      const elsewhere = await makeStudio("i3x");
      const email = emailFor("i3");
      await makeUser(elsewhere.id, email, "CLIENT", { password: "alone-2222" });
      const hash = await bcrypt.hash("login-pass-1", 4);
      const login = (await createLoginFromProof(email, hash)).login;
      const token = await invite(email);
      const c = claims(email);
      const out = await withRequest(() => completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token }, c));
      harness.assert(out.ok === true, "Accepted", JSON.stringify(out));
      const after = await db.login.findUniqueOrThrow({ where: { id: login.id } });
      harness.assert(after.googleSub === c.sub && after.passwordHash === hash, "Google added, password kept");
      harness.assertEqual((await pendingAccount(studio.id, email)).loginId, login.id, "The account joined the existing login");
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-INVITE-04: a used or made-up token does nothing", async () => {
    try {
      const { studio, invite } = await makeStudioWithOwner("i4");
      const email = emailFor("i4");
      const token = await invite(email);
      const fake = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token: "made-up-token-value" }, claims(email)), set: jar.has(COOKIE_NAME) }));
      harness.assert(!fake.r.ok && fake.r.code === "failed" && !fake.set, "A made-up token: refused", JSON.stringify(fake.r));
      harness.assertEqual((await pendingAccount(studio.id, email)).loginId, null, "Nothing linked");
      const c = claims(email);
      const first = await withRequest(() => completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token }, c));
      harness.assert(first.ok === true, "The real token works once");
      const again = await withRequest(() => completeGoogleFlow({ kind: "invite", studio: studio.slug, email, token }, c));
      harness.assert(!again.ok && again.code === "failed", "…and not twice", JSON.stringify(again));
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-INVITE-05: the start link carries the invite only in the flow cookie", async () => {
    try {
      configure();
      const { studio, invite } = await makeStudioWithOwner("i5");
      const email = emailFor("i5");
      const token = await invite(email);
      const res = await GET_START(new NextRequest(`https://cineflow-os.my/auth/google/start?intent=invite&studio=${studio.slug}&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`));
      const location = res.headers.get("location") ?? "";
      harness.assert(location.startsWith("https://accounts.google.com/") && !location.includes(token) && !location.includes(encodeURIComponent(email)), "To Google, with neither the token nor the email in the address");
      const blob = openBlob<{ intent: { kind: string; studio: string; email: string; token: string } }>(res.cookies.get(FLOW_COOKIE)!.value);
      harness.assert(blob?.intent.kind === "invite" && blob.intent.token === token && blob.intent.email === email.toLowerCase(), "They are in the signed flow cookie");
      for (const qs of [`intent=invite&studio=no-such-studio-xyz&email=${encodeURIComponent(email)}&token=${token}`, `intent=invite&studio=${studio.slug}&email=not-an-email&token=${token}`, `intent=invite&studio=${studio.slug}&email=${encodeURIComponent(email)}`]) {
        const bad = await GET_START(new NextRequest(`https://cineflow-os.my/auth/google/start?${qs}`));
        harness.assert(!bad.cookies.get(FLOW_COOKIE) && (bad.headers.get("location") ?? "").includes("google="), `Refused: ${qs.slice(0, 60)}`);
      }
    } finally {
      restoreEnv();
      await cleanUp();
    }
  });

  await harness.test("T43-UI-02: the invite page offers it, on a team invite only", async () => {
    const page = await readFile("app/[tenantSlug]/reset-password/page.tsx", "utf8");
    harness.assert(/googleInviteHref\(/.test(page) && /googleConfigured\(\)/.test(page) && /googleError=/.test(page), "The page works out the Google link and the reason");
    const form = await readFile("components/auth/reset-password-form.tsx", "utf8");
    harness.assert(/welcome && googleHref/.test(form) && /<Google(Sign[Ii]n)?Button\b/.test(form) && /googleErrorMessage\(/.test(form), "The form shows the button only on a team invite, and the reason");
  });

  // ── Task 4: starting a studio with Google ───────────────────────────────────────────────
  /** Runs `fn` in one request that has just come back from Google for a sign-up: the ticket cookie is in the jar. */
  const googleOwner = async <T,>(c: GoogleClaims, fn: (jar: Map<string, string>) => Promise<T>): Promise<T> =>
    withRequest(async (jar) => {
      await completeGoogleFlow({ kind: "signup" }, c);
      return fn(jar);
    });
  const signupInput = (slug: string, email: string, extra: Record<string, unknown> = {}) => ({
    name: `T43 ${slug}`, slug, discipline: "HYBRID", currency: "MYR", ownerName: "T43 Owner", ownerEmail: email, ...extra,
  });
  const withSignupOpen = async <T,>(fn: (slugs: string[]) => Promise<T>): Promise<T> => {
    const savedCode = process.env.STUDIO_SIGNUP_CODE;
    delete process.env.STUDIO_SIGNUP_CODE;
    const slugs: string[] = [];
    try {
      return await fn(slugs);
    } finally {
      if (savedCode === undefined) delete process.env.STUDIO_SIGNUP_CODE;
      else process.env.STUDIO_SIGNUP_CODE = savedCode;
      for (const slug of slugs) {
        const t = await db.tenant.findUnique({ where: { slug } });
        if (!t) continue;
        (await db.user.findMany({ where: { tenantId: t.id }, select: { email: true } })).forEach((u) => createdEmails.add(u.email.toLowerCase()));
        await db.tenant.delete({ where: { id: t.id } }).catch(() => undefined);
      }
      await cleanUp();
    }
  };
  const newSlug = (slugs: string[], label: string) => {
    const slug = `t43-${label}-${STAMP}-${++counter}`;
    slugs.push(slug);
    return slug;
  };

  await harness.test("T43-SIGNUP-01: Google starts a studio: the ticket is a cookie, not in the address; nothing created yet", async () => {
    try {
      const email = emailFor("su1");
      const c = claims(email, { name: "Maya Lin" });
      const out = await withRequest(async (jar) => {
        const { result, calls } = await withHost("localhost", () => completeGoogleFlow({ kind: "signup" }, c));
        const value = jar.get(SIGNUP_TICKET_COOKIE) ?? "";
        const setCall = calls.find((x) => x.op === "set" && x.args[0] === SIGNUP_TICKET_COOKIE);
        const good = await readGoogleTicket();
        const tries: Array<[string, string | null]> = [
          ["a changed ticket", `${value.slice(0, -2)}${value.endsWith("AA") ? "BB" : "AA"}`],
          ["an expired ticket", signBlob({ kind: "signup-ticket", email, name: null, sub: "x" }, -5)],
          ["the flow cookie's kind of blob", signBlob({ state: "s", verifier: "v", nonce: "n", intent: { kind: "signup" } }, 60)],
          ["garbage", "garbage"],
          ["no cookie", null],
        ];
        const bad: Array<[string, unknown]> = [];
        for (const [label, v] of tries) {
          if (v === null) jar.delete(SIGNUP_TICKET_COOKIE);
          else jar.set(SIGNUP_TICKET_COOKIE, v);
          bad.push([label, await readGoogleTicket()]);
        }
        return { result, value, setCall, good, bad, session: jar.has(COOKIE_NAME) };
      });
      harness.assert(out.result.ok === true && out.result.redirectTo.includes("/create-studio?google=ready"), "On to the sign-up wizard", JSON.stringify(out.result));
      harness.assert(out.value !== "" && !(out.result.ok && out.result.redirectTo.includes(out.value)), "The ticket is not in the address", out.result.ok ? out.result.redirectTo : "");
      const opts = (out.setCall?.args[2] ?? {}) as { httpOnly?: boolean; sameSite?: string; maxAge?: number };
      harness.assert(opts.httpOnly === true && opts.sameSite === "lax" && (opts.maxAge ?? 0) <= 900, "The ticket cookie is httpOnly, lax and short-lived", JSON.stringify(opts));
      harness.assert(!out.session && (await findLogin(email)) === null && (await db.user.count({ where: { email } })) === 0, "Nothing is created yet: no session, no login, no account");
      harness.assert(out.good?.email === email && out.good.name === "Maya Lin", "The cookie gives the email and name", JSON.stringify(out.good));
      for (const [label, got] of out.bad) harness.assertEqual(got, null, `${label} gives nothing`);
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const sup = await withRequest(async (jar) => ({ r: await completeGoogleFlow({ kind: "signup" }, { sub: `sub-${STAMP}-su`, email: superRow.email, emailVerified: true, name: "X" }), has: jar.has(SIGNUP_TICKET_COOKIE) }));
      harness.assert(!sup.r.ok && sup.r.redirectTo.includes("/create-studio?google=failed") && !sup.has, "A super-admin's email gets no ticket", JSON.stringify(sup.r));
    } finally {
      await cleanUp();
    }
  });

  await harness.test("T43-SIGNUP-02: the ticket creates the owner joined to a Google login, with no password, and is used up", async () => {
    await withSignupOpen(async (slugs) => {
      const email = emailFor("su2");
      const c = claims(email, { name: "Maya Lin" });
      const slug = newSlug(slugs, "own");
      const second = newSlug(slugs, "own2");
      const out = await googleOwner(c, async (jar) => {
        const res = (await onboardStudio(signupInput(slug, "someone-else@example.test", { googleSignup: true }) as never)) as { success?: boolean; error?: string };
        const session = jar.get(COOKIE_NAME);
        const left = jar.has(SIGNUP_TICKET_COOKIE);
        const again = (await onboardStudio(signupInput(second, "someone-else@example.test", { googleSignup: true }) as never)) as { success?: boolean; error?: string };
        return { res, session, left, again };
      });
      harness.assert(out.res.success === true, "The studio is created without a password", JSON.stringify(out.res));
      const owner = await db.user.findFirstOrThrow({ where: { tenant: { slug }, role: "STUDIO_OWNER" } });
      harness.assertEqual(owner.email, email, "The owner's email is the one Google confirmed, not the one typed");
      const login = await findLogin(email);
      harness.assert(login !== null && owner.loginId === login.id && owner.passwordHash === null, "The owner has no password and is joined to the login");
      harness.assert(login!.googleSub === c.sub && login!.passwordHash === null, "The login holds the Google account");
      harness.assertEqual((await decodeSessionToken(out.session ?? ""))?.user.loginId, login!.id, "Signed in as a login session");
      harness.assert(!out.left, "The ticket cookie is gone once the studio exists");
      harness.assert(out.again.success !== true && /Google/.test(out.again.error ?? "") && (await db.tenant.count({ where: { slug: second } })) === 0, "A second studio from the same ticket is refused", JSON.stringify(out.again));
    });
  });

  await harness.test("T43-SIGNUP-03: existing logins, stand-alone accounts and a super-admin", async () => {
    await withSignupOpen(async (slugs) => {
      const owner = (c: GoogleClaims, slug: string, email: string) =>
        googleOwner(c, () => onboardStudio(signupInput(slug, email, { googleSignup: true }) as never)) as Promise<{ success?: boolean; error?: string }>;
      // (a) the email already has a password login: the owner joins it, no password needed
      const emailA = emailFor("su3a");
      const hash = await bcrypt.hash("login-pass-1", 4);
      const loginA = (await createLoginFromProof(emailA, hash)).login;
      const cA = claims(emailA);
      const slugA = newSlug(slugs, "a");
      const a = await owner(cA, slugA, emailA);
      harness.assert(a.success === true, "An existing login: the studio is created", JSON.stringify(a));
      const afterA = await db.login.findUniqueOrThrow({ where: { id: loginA.id } });
      harness.assert(afterA.googleSub === cA.sub && afterA.passwordHash === hash, "Google was added and the password kept");
      harness.assertEqual((await db.user.findFirstOrThrow({ where: { tenant: { slug: slugA }, role: "STUDIO_OWNER" } })).loginId, loginA.id, "The owner joined that login");
      // (b) a login that already has another Google account
      const emailB = emailFor("su3b");
      createdEmails.add(emailB);
      await db.login.create({ data: { email: emailB, googleSub: "sub-other" } });
      const slugB = newSlug(slugs, "b");
      const b = await owner(claims(emailB, { sub: "sub-new" }), slugB, emailB);
      harness.assert(b.success !== true && b.error === "This email is already linked to a different Google account.", "Refused with the exact message", JSON.stringify(b));
      harness.assertEqual(await db.tenant.count({ where: { slug: slugB } }), 0, "…and no studio was created");
      // (c) stand-alone accounts elsewhere get joined
      const other = await makeStudio("su3c");
      const emailC = emailFor("su3c");
      const alone = await makeUser(other.id, emailC, "CLIENT", { password: "alone-3333" });
      await withInbox(async (inbox) => {
        const slugC = newSlug(slugs, "c");
        const c3 = await owner(claims(emailC), slugC, emailC);
        harness.assert(c3.success === true, "Created", JSON.stringify(c3));
        const joined = await db.user.findUniqueOrThrow({ where: { id: alone.id } });
        harness.assert(joined.loginId !== null && joined.passwordHash === null, "The stand-alone account elsewhere is joined");
        harness.assertEqual(inbox.filter((m) => m.to === emailC).length, 1, "One joined email");
      });
      // (d) a ticket made by hand for a super-admin's email
      const superRow = await db.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
      const slugD = newSlug(slugs, "d");
      const forged = signBlob({ kind: "signup-ticket", email: superRow.email, name: "X", sub: "sub-forged" }, 60);
      const d = (await withRequest((jar) => {
        jar.set(SIGNUP_TICKET_COOKIE, forged);
        return onboardStudio(signupInput(slugD, superRow.email, { googleSignup: true }) as never);
      })) as { success?: boolean };
      harness.assert(d.success !== true && (await db.tenant.count({ where: { slug: slugD } })) === 0, "A super-admin's email can never own a studio");
      harness.assertEqual(await findLogin(superRow.email), null, "…and no login is made for it");
    });
  });

  await harness.test("T43-SIGNUP-04: no ticket and no password, a bad ticket, or a ticket sent in the request, creates nothing", async () => {
    await withSignupOpen(async (slugs) => {
      const slug = newSlug(slugs, "np");
      const none = (await withRequest(() => onboardStudio(signupInput(slug, emailFor("su4")) as never))) as { success?: boolean; error?: string };
      harness.assert(none.success !== true && /password/i.test(none.error ?? ""), "Without a ticket the password is still required", JSON.stringify(none));
      const bad = (await withRequest((jar) => {
        jar.set(SIGNUP_TICKET_COOKIE, "garbage");
        return onboardStudio(signupInput(slug, emailFor("su4b"), { googleSignup: true }) as never);
      })) as { success?: boolean; error?: string };
      harness.assert(bad.success !== true && /Google/.test(bad.error ?? ""), "A bad ticket is refused with a Google message", JSON.stringify(bad));
      // a ticket someone read out of a log or an address is no use without the browser's own cookie
      const email = emailFor("su4c");
      const stolen = await googleOwner(claims(email), async (jar) => jar.get(SIGNUP_TICKET_COOKIE) ?? "");
      const replay = (await withRequest(() => onboardStudio(signupInput(slug, email, { googleTicket: stolen, googleSignup: true }) as never))) as { success?: boolean; error?: string };
      harness.assert(replay.success !== true && /Google/.test(replay.error ?? ""), "A ticket sent in the request instead of the cookie is refused", JSON.stringify(replay));
      harness.assertEqual(await db.tenant.count({ where: { slug } }), 0, "No studio was created");
      harness.assertEqual(await findLogin(email), null, "…and nothing was linked");
    });
  });

  await harness.test("T43-SIGNUP-05: the start link for sign-up", async () => {
    try {
      configure();
      const res = await GET_START(new NextRequest("https://cineflow-os.my/auth/google/start?intent=signup"));
      harness.assert((res.headers.get("location") ?? "").startsWith("https://accounts.google.com/"), "To Google");
      harness.assertEqual(openBlob<{ intent: { kind: string } }>(res.cookies.get(FLOW_COOKIE)!.value)?.intent.kind, "signup", "The flow cookie says sign-up");
    } finally {
      restoreEnv();
    }
  });

  await harness.test("T43-UI-03: the wizard", async () => {
    const page = await readFile("app/(saas)/create-studio/page.tsx", "utf8");
    harness.assert(/sessionStorage\.setItem/.test(page) && /sessionStorage\.getItem/.test(page), "The wizard's answers are saved before Google opens and restored after");
    harness.assert(/<GoogleButton\b/.test(page) && /intent=signup/.test(page), "Step 3 has the Google button");
    harness.assert(/readGoogleTicket\(\)/.test(page) && /readOnly/.test(page) && /Signed in with Google/.test(page), "The ticket fills and locks the owner's email, and the password field gives way");
    harness.assert(/googleSignup: true/.test(page) && !/googleTicket/.test(page) && /googleErrorMessage\(/.test(page), "The wizard only says it came from Google (the ticket stays in its cookie), and Google's reasons are shown");
    harness.assert(/googleAvailable\(\)/.test(page), "The button shows only when Google is set up");
  });

  // ── Task 5: coming back to a studio's own domain ────────────────────────────────────────
  const withProd = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const prev = { s: process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS, u: process.env.NEXT_PUBLIC_APP_URL };
    process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://cineflow-os.my";
    try {
      return await fn();
    } finally {
      if (prev.s === undefined) delete process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS;
      else process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS = prev.s;
      if (prev.u === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev.u;
    }
  };
  const PLATFORM = APP_BASE_DOMAIN;
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  const domainStudio = async (label: string) => {
    const domain = `cd-${label}-${STAMP}.example.test`;
    const studio = await db.tenant.create({ data: { name: `T43 ${label} ${STAMP}`, slug: `t43-${label}-${STAMP}-${++counter}`, customDomain: domain } });
    createdStudios.push(studio.id);
    return { studio, domain };
  };
  const finishReq = (domain: string, code: string, to: string, nonce?: string) =>
    new NextRequest(`https://${domain}/auth/google/finish?code=${encodeURIComponent(code)}&to=${encodeURIComponent(to)}`, nonce ? { headers: { cookie: `${GOOGLE_NONCE_COOKIE}=${nonce}` } } : undefined);
  const finishCtx = (studio: { slug: string }) => ({ params: Promise.resolve({ tenantSlug: studio.slug }) });

  /** The whole trip: the studio's page begins, the platform starts Google and takes the answer, and a code goes back. */
  const googleTripFrom = async (studio: { slug: string }, domain: string, email: string, returnTo?: string, nonceOverride?: string) => {
    const begun = await withRequest(async (jar) => {
      const { result, calls } = await withHost(domain, () => beginGoogleReturn());
      return { result, jarNonce: jar.get(GOOGLE_NONCE_COOKIE), calls };
    });
    const nonce = nonceOverride ?? begun.result?.nonce ?? "";
    const qs = new URLSearchParams({ intent: "signin", studio: studio.slug, returnTo: returnTo ?? begun.result?.returnTo ?? "", nonce });
    const start = await GET_START(new NextRequest(`https://cineflow-os.my/auth/google/start?${qs.toString()}`));
    const cookie = start.cookies.get(FLOW_COOKIE)!.value;
    const flow = openBlob<{ state: string; nonce: string; ret?: { to: string; nonceHash: string } }>(cookie)!;
    await googleSays(flow.nonce, email);
    createdEmails.add(email);
    const back = await withRequest(async (jar) => {
      const { result, calls } = await withHost(PLATFORM, () => GET_CALLBACK(callbackReq(`code=abc&state=${flow.state}`, cookie)));
      return { res: result as NextResponse, calls, shared: jar.get(SHARED_COOKIE_NAME) };
    });
    return { begun, nonce, flow, back };
  };

  await harness.test("T43-RETURN-01: the whole return to a studio's own domain", async () => {
    try {
      await withProd(async () => {
        configure();
        const { studio, domain } = await domainStudio("r1");
        const email = emailFor("r1");
        const trip = await googleTripFrom(studio, domain, email);
        harness.assert(trip.begun.result?.returnTo === `https://${domain}/` && !!trip.nonce, "The studio's page got a return address and a nonce", JSON.stringify(trip.begun.result));
        harness.assert(trip.begun.calls.some((c) => c.op === "set" && c.args[0] === GOOGLE_NONCE_COOKIE), "…and set the nonce cookie on its own host");
        harness.assert(trip.flow.ret?.to === `https://${domain}/` && trip.flow.ret.nonceHash === sha(trip.nonce) && !JSON.stringify(trip.flow).includes(trip.nonce), "The flow cookie keeps the return address and only a hash of the nonce");
        const location = trip.back.res.headers.get("location") ?? "";
        harness.assert(location.startsWith(`https://${domain}/auth/google/finish?code=`) && location.includes("to=%2Faccount"), "The platform sends the browser back to the studio's own domain with a code", location);
        harness.assert(!!trip.back.shared, "…having set the platform's shared cookie too");
        const code = new URL(location).searchParams.get("code")!;
        const fin = await withRequest(async (jar) => {
          const { result } = await withHost(domain, () => GET_FINISH(finishReq(domain, code, "/account", trip.nonce), finishCtx(studio)));
          return { res: result as NextResponse, session: jar.get(COOKIE_NAME) };
        });
        harness.assertEqual(fin.res.headers.get("location"), `https://${domain}/account`, "Finished: on to the destination on that domain");
        const decoded = await decodeSessionToken(fin.session ?? "");
        harness.assert(decoded?.user.loginId !== undefined && decoded.user.tenantSlug === studio.slug, "This host's own cookie holds the person's login session");
        harness.assertEqual(fin.res.cookies.get(GOOGLE_NONCE_COOKIE)?.value, "", "The nonce cookie is cleared");
      });
    } finally {
      restoreEnv();
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T43-RETURN-02: a lured or replayed return does nothing", async () => {
    try {
      await withProd(async () => {
        configure();
        const a = await domainStudio("r2a");
        const b = await domainStudio("r2b");
        const issue = async () => {
          const trip = await googleTripFrom(a.studio, a.domain, emailFor("r2"));
          return { code: new URL(trip.back.res.headers.get("location")!).searchParams.get("code")!, nonce: trip.nonce };
        };
        const finish = async (domain: string, studio: { slug: string }, code: string, to: string, nonce?: string) =>
          withRequest(async (jar) => {
            const { result } = await withHost(domain, () => GET_FINISH(finishReq(domain, code, to, nonce), finishCtx(studio)));
            return { res: result as NextResponse, set: jar.has(COOKIE_NAME) };
          });
        const refused = (r: { res: NextResponse; set: boolean }, domain: string) => r.res.headers.get("location") === `https://${domain}/login` && !r.set;

        const one = await issue();
        harness.assert(refused(await finish(a.domain, a.studio, one.code, "/account"), a.domain), "No nonce cookie (a link sent to someone else): refused");
        harness.assert(refused(await finish(a.domain, a.studio, one.code, "/account", "another-browsers-nonce"), a.domain), "Another browser's nonce: refused");
        harness.assert(!refused(await finish(a.domain, a.studio, one.code, "/account", one.nonce), a.domain), "…none of those used the code up: the right browser still can");
        harness.assert(refused(await finish(a.domain, a.studio, one.code, "/account", one.nonce), a.domain), "A second use: refused");

        const two = await issue();
        harness.assert(refused(await finish(b.domain, b.studio, two.code, "/account", two.nonce), b.domain), "Another studio's domain: refused");
        await db.signInHandoff.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
        harness.assert(refused(await finish(a.domain, a.studio, two.code, "/account", two.nonce), a.domain), "An expired code: refused");

        for (const to of ["https://evil.com/x", "//evil.com/x", "/\\evil.com", "javascript:alert(1)"]) {
          const three = await issue();
          const r = await finish(a.domain, a.studio, three.code, to, three.nonce);
          harness.assertEqual(r.res.headers.get("location"), `https://${a.domain}/`, `A bad destination (${to}) goes to the studio's home instead`);
        }
      });
    } finally {
      restoreEnv();
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T43-RETURN-03: a bad return address is dropped, and the person lands on the studio's subdomain address", async () => {
    try {
      await withProd(async () => {
        configure();
        const a = await domainStudio("r3a");
        const b = await domainStudio("r3b");
        const bad: Array<[string, string]> = [
          ["another site", "https://evil.com/"],
          ["a studio's subdomain", `https://${a.studio.slug}.${PLATFORM}/`],
          ["another studio's own domain", `https://${b.domain}/`],
          ["an address with a port", `https://${a.domain}:8443/`],
        ];
        for (const [what, returnTo] of bad) {
          const trip = await googleTripFrom(a.studio, a.domain, emailFor("r3"), returnTo, "some-nonce");
          harness.assert(trip.flow.ret === undefined, `${what}: dropped from the flow cookie`);
          harness.assertEqual(trip.back.res.headers.get("location"), accountHref(a.studio.slug, "CLIENT"), `${what}: the person lands on the studio's subdomain address`);
        }
      });
    } finally {
      restoreEnv();
      await db.signInHandoff.deleteMany({});
      await cleanUp();
    }
  });

  await harness.test("T43-RETURN-04: only a studio's own domain begins a return; a failure comes back to that domain's sign-in", async () => {
    try {
      await withProd(async () => {
        configure();
        const { studio, domain } = await domainStudio("r4");
        for (const host of [`${studio.slug}.${PLATFORM}`, PLATFORM, "unknown-site.example.test"]) {
          const out = await withRequest(async () => withHost(host, () => beginGoogleReturn()));
          harness.assertEqual(out.result, null, `${host}: nothing to begin`);
        }
        const start = await GET_START(new NextRequest(`https://cineflow-os.my/auth/google/start?${new URLSearchParams({ intent: "signin", studio: studio.slug, returnTo: `https://${domain}/`, nonce: "n1" }).toString()}`));
        const cookie = start.cookies.get(FLOW_COOKIE)!.value;
        const flow = openBlob<{ state: string }>(cookie)!;
        const out = await withRequest(async () => GET_CALLBACK(callbackReq(`error=access_denied&state=${flow.state}`, cookie)));
        harness.assertEqual(out.headers.get("location"), `https://${domain}/login?google=cancelled`, "The person who cancelled comes back to the studio's own sign-in page");
      });
      const off = await withRequest(async () => withHost("whatever.example.test", () => beginGoogleReturn()));
      harness.assertEqual(off.result, null, "With studio subdomains off: nothing to begin");
    } finally {
      restoreEnv();
      await cleanUp();
    }
  });

  await harness.test("T43-UI-04: the buttons on a studio's own pages begin the return", async () => {
    const button = await readFile("components/auth/google-sign-in-button.tsx", "utf8");
    harness.assert(/beginGoogleReturn\(/.test(button) && /returnTo/.test(button) && /nonce/.test(button), "The button asks the studio's page for a return address and nonce");
    for (const f of ["components/auth/studio-login-form.tsx", "components/auth/client-auth-panel.tsx", "components/auth/reset-password-form.tsx"]) {
      harness.assert(/<GoogleSignInButton\b/.test(await readFile(f, "utf8")), `${f} uses it`);
    }
  });
}
