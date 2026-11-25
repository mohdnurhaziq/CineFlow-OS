# One Login, Part 3 (Google sign-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Continue with Google" beside email and password, for signing in and registering: on a studio's sign-in and client sign-up, on the platform `/login`, when accepting a team invite, and when starting a studio. Google proves the email, so it also creates or joins the person's one login.

**Architecture:** The standard OAuth 2.0 / OpenID Connect authorization-code flow with PKCE, written by hand against Google (no auth framework). Everything starts and ends on the platform host (`/auth/google/start`, `/auth/google/callback`), where a short-lived signed flow cookie binds the browser to its own `state`, PKCE verifier and nonce. What to do after Google is decided in one place (`completeGoogleFlow`) from the Google claims and the intent kept in that cookie; it ends by setting the same login session part 1 built. The Google ID token is verified with `jose`.

**Tech Stack:** Next.js 15 App Router, TypeScript (`noUncheckedIndexedAccess`), Prisma + SQLite, `jose` (new dependency, ID-token and JWKS checks), the e2e harness (`pnpm test:e2e`; single tier: `DATABASE_URL=file:./test.db npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t43-only.ts`, after `prisma migrate deploy`).

**Spec:** `docs/superpowers/specs/2026-11-25-one-login-design.md` ("Google sign-in", "Signing in", "Registering", "Joining accounts", "The rule that keeps it safe"). Earlier plans: part 1 and part 2 in `docs/superpowers/plans/`.

## Global Constraints

- Fixed callback on the platform host: `${NEXT_PUBLIC_APP_URL origin}/auth/google/callback` (production `https://cineflow-os.my/...`, staging `https://staging.cineflow-os.my/...`, dev `http://localhost:3000/...`).
- Settings `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, both optional in `lib/env.ts`. Without them every Google button is hidden and `/auth/google/*` redirect to the platform sign-in page; nothing else changes.
- Checks that must all pass or the sign-in is refused: the flow cookie exists and its `state` equals the returned `state` (constant time); the PKCE verifier is sent to Google; the ID token's signature (Google's JWKS), `iss` (`https://accounts.google.com` or `accounts.google.com`), `aud` (our client id), `exp`, `nonce` (equals the flow's) and `email_verified === true`.
- A Google-verified email is proof of the email (spec rule). A team invite link still is not: accepting an invite with Google needs the Google email to equal the invite's email.
- Linking rules: find the login by `googleSub`, else by the verified email (then set its `googleSub`); a login that already has a *different* `googleSub` is refused (`linked_other`); no login for the email: create one (`createLoginFromProof(email, null)`, which joins the person's set-up accounts and sends the joined email, then set `googleSub`). Never a staff account without an invite (`needs_invite`). A super-admin's email never signs in this way.
- A Google user at a studio is signed in to their account there, or gets a linked client account (the same rules as `continueAsClient`: take up a passwordless client account the studio made; refuse a non-client account). Phone is left empty (a studio asks for it at booking, as today).
- Errors never show Google's raw text. Failures redirect to one of our own sign-in pages with `?google=<code>`; the codes and messages are in `lib/auth/google-messages.ts` (Task 2).
- Copy is plain English, no em dashes. No Claude attribution in commits. Rebuild Docker (`docker compose up -d --build app`) and check at phone width before saying a UI task is done. After code changes run `graphify update .`.

## Review Focus

1. **Callback CSRF:** a callback with no flow cookie, a different `state`, or a code from another browser's flow signs nobody in. Pinned in Task 2 (`T43-CALLBACK-02`).
2. **ID-token checks:** a wrong audience, issuer, nonce, an expired token, an unverified email, or a bad signature is refused. Pinned in Task 1 (`T43-GOOGLE-02`).
3. **Account takeover through linking:** a login that already has another Google account, a staff-only account at a studio, and an invite for a different email are all refused. Pinned in Tasks 2 and 3 (`T43-FLOW-02`, `T43-FLOW-03`, `T43-INVITE-02`).
4. **Redirects:** the studio name or return address in the start link can't send anyone to another site; errors only go to our own pages. Pinned in Task 2 (`T43-START-02`) and Task 5.
5. **Custom-domain return replay and lure:** the return code works once, only for the browser that started the flow, and only on that studio's domain. Pinned in Task 5 (`T43-RETURN-02`).

---

### Task 1: The Google client, the signed flow cookie, and the settings

**Files:**
- Modify: `package.json` / `pnpm-lock.yaml` (`pnpm add jose`), `lib/env.ts` (optional `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), `.env.example` (documented, commented out), `docs/07_DEPLOYMENT_AND_CONFIGURATION_GUIDE.md` (a "Google sign-in" section: the Google Cloud steps below, the three redirect addresses, the two settings, how to test)
- Create: `lib/auth/signed-blob.ts`, `lib/auth/google.ts` (both server-only, not `"use server"`), `tests/e2e/tier43-google-sign-in.test.ts` (exports `runTier43GoogleSignInTests`), `tests/e2e/.t43-only.ts` (copy of `.t42-only.ts`); register tier 43 in `tests/e2e/runner.ts` after tier 42.

**Interfaces:**
- Consumes: `env` (`lib/env.ts`), `appUrl()` (`lib/domain-name.ts`), `AUTH_SECRET`.
- Produces:
  - `signBlob(payload: object, ttlSeconds: number): string` and `openBlob<T>(blob: string): T | null` (HMAC-SHA256 over the JSON with an `exp`; null when the signature is wrong or it has expired).
  - `type GoogleErrorCode = "cancelled" | "failed" | "unverified" | "linked_other" | "needs_invite" | "mismatch" | "closed"`, `class GoogleError extends Error { code: GoogleErrorCode }`.
  - `interface GoogleClaims { sub: string; email: string; emailVerified: boolean; name: string | null }`.
  - `googleConfigured(): boolean` (both settings present); `googleCallbackUrl(): string`.
  - `newGoogleFlow(): { state: string; verifier: string; challenge: string; nonce: string }` (random; `challenge` = base64url SHA-256 of `verifier`).
  - `googleAuthorizationUrl(flow: { state: string; challenge: string; nonce: string }): string` (`https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `scope=openid email profile`, `code_challenge_method=S256`, `prompt=select_account`).
  - `exchangeGoogleCode(code: string, verifier: string, nonce: string): Promise<GoogleClaims>`: POSTs to `https://oauth2.googleapis.com/token`, verifies the ID token as in Global Constraints, throws `GoogleError("failed")` (or `"unverified"` for `email_verified !== true`).
  - `setGoogleClientForTests(client: { exchange(params: { code: string; verifier: string }): Promise<{ id_token: string }>; keys: import("jose").JWTVerifyGetKey } | null): void`.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/tier43-google-sign-in.test.ts` (suite `"Tier 43", "Google sign-in"`; generate an RSA key pair with `jose`'s `generateKeyPair("RS256")`, sign test ID tokens with `SignJWT`, serve them through `setGoogleClientForTests` with `createLocalJWKSet`; set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env for the tests and restore).
  - `T43-GOOGLE-01: the settings gate the feature`: `googleConfigured()` false with either setting missing, true with both; `googleCallbackUrl()` equals `${NEXT_PUBLIC_APP_URL origin}/auth/google/callback`.
  - `T43-GOOGLE-02: the ID token is checked`: a good token returns `{ sub, email, emailVerified: true, name }`; each of these throws `GoogleError`: wrong `aud`, wrong `iss`, expired, wrong `nonce`, signed by another key, `email_verified: false` (code `unverified`), no `email`.
  - `T43-GOOGLE-03: the authorization address`: contains `client_id`, our callback as `redirect_uri`, `code_challenge_method=S256`, the flow's `state` and `nonce`, `openid email profile`; the `challenge` is the SHA-256 of the `verifier`; two flows differ.
  - `T43-GOOGLE-04: signed blobs`: round trip; a changed byte, another secret, or an expired `exp` gives null.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** (`pnpm add jose` first; fetch with `cache: "no-store"` and an 8 s timeout; Google's JWKS at `https://www.googleapis.com/oauth2/v3/certs` via `createRemoteJWKSet`, replaced by the test client's `keys`). **Step 4: Run tier 43 and `pnpm typecheck`, expect PASS.**
- [ ] **Step 5: Write the deploy section.** In `docs/07_...`: (1) Google Cloud Console, create or pick a project; (2) APIs & Services > OAuth consent screen > External, app name "CineFlow OS", support and developer email, scopes `openid`, `email`, `profile`, then **Publish app** (a test-mode app only allows listed test users and expires their access after 7 days); (3) Credentials > Create credentials > OAuth client ID > Web application; (4) Authorized redirect URIs: the three callback addresses above (production, staging, and `http://localhost:3000/auth/google/callback`; separate clients per environment are fine, each with its own); no JavaScript origins needed; (5) copy the Client ID and Client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in that environment's `.env`, rebuild; (6) check: the "Continue with Google" button appears on `/login`.
- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib .env.example docs tests/e2e
git commit -m "feat(auth): the Google client, a signed flow cookie, and the settings"
```

---

### Task 2: Sign in or register with Google (studio, client sign-up, platform)

**Files:**
- Create: `lib/auth/google-flow.ts` (server-only), `lib/auth/google-messages.ts` (plain), `app/auth/google/start/route.ts`, `app/auth/google/callback/route.ts`, `components/auth/google-button.tsx`
- Modify: `lib/auth/login.ts` (add `takeUpClientAccount`), `lib/actions/one-login.ts` (`continueAsClient` uses it), `components/auth/studio-login-form.tsx`, `components/auth/client-auth-panel.tsx`, `components/auth/platform-account-login-form.tsx` (a Google button and a `?google=` message), `app/[tenantSlug]/login/page.tsx`, `app/[tenantSlug]/register/page.tsx`, `app/(saas)/login/page.tsx` (pass `googleEnabled={googleConfigured()}`; read `?google=`)
- Test: `tests/e2e/tier43-google-sign-in.test.ts`

**Interfaces:**
- Consumes: Task 1; `createLoginFromProof`, `findLogin`, `sendJoinedEmail`, `linkAccountToLogin` (`lib/auth/login.ts`); `liveAccounts`, `setLoginSessionCookie` (`lib/auth/token.ts`); `accountHref` (`lib/auth/switcher.ts`); `platformUrl`, `studioUrl`, `studioSubdomainsOn` (`lib/domain-name.ts`).
- Produces:
  - `type FlowIntent = { kind: "signin"; studio: string | null } | { kind: "invite"; studio: string; email: string; token: string } | { kind: "signup" }` (Tasks 3 and 4 add the last two cases' behaviour).
  - `googleErrorMessage(code: GoogleErrorCode): string`. Exact: cancelled "You cancelled Google sign-in."; failed "Google sign-in didn't work. Please try again."; unverified "Google couldn't confirm that email address."; linked_other "This email is already linked to a different Google account."; needs_invite "Ask the studio to invite you."; mismatch "Use the Google account for the email the invite was sent to."; closed "This studio isn't available."
  - `takeUpClientAccount(login: { id: string; email: string }, tenant: { id: string }, profile: { name: string | null }): Promise<{ ok: true; userId: string; name: string } | { ok: false; code: "needs_invite" | "closed" }>` (the logic of `continueAsClient` for an existing or new client account; `profile.name` is the new account's name, falling back to the person's latest account name, then the email).
  - `completeGoogleFlow(intent: FlowIntent, claims: GoogleClaims): Promise<{ ok: true; redirectTo: string } | { ok: false; code: GoogleErrorCode; redirectTo: string }>`: for `signin`, the login rules in Global Constraints, then: no studio → `liveAccounts(login.id)[0]` active and `redirectTo` = `platformUrl("/studios")` (a login with no accounts: still `/studios`, which says "You're not with any studio yet."); a studio → the login's account there, else `takeUpClientAccount`; `redirectTo` = `accountHref(slug, role)`. Failures return our own sign-in page with `?google=<code>` (`platformUrl("/login")` or the studio's login address).
  - `GET /auth/google/start?intent=signin&studio=<slug>`: not configured → redirect `platformUrl("/login")`; an unknown or cancelled studio slug → `platformUrl("/login?google=closed")`; else sets the flow cookie `cineflow_google_flow` (HttpOnly, SameSite=Lax, path `/auth/google`, 10 minutes, `Secure` in production, value `signBlob({ state, verifier, nonce, intent }, 600)`) and 302s to `googleAuthorizationUrl`.
  - `GET /auth/google/callback?code=&state=&error=`: `error` present (the person pressed cancel) → back to the sign-in page with `?google=cancelled`; no cookie, wrong or missing `state`, bad blob → `?google=failed` and nothing else happens; else `exchangeGoogleCode`, `completeGoogleFlow`, delete the flow cookie, 302 to `redirectTo`. The flow cookie is deleted on every outcome; a code is never logged.
  - `<GoogleButton href: string label?: string />`: a link styled as a button, "Continue with Google" with the Google "G" mark, at least 44px tall.

- [ ] **Step 1: Write the failing tests** (tier 43; build people with `createLoginFromProof` as in tier 42; call the route handlers directly with `NextRequest`, flow cookie in the jar via `withRequest`; fake Google through `setGoogleClientForTests`):
  - `T43-FLOW-01: a first-time Google user at a studio gets a linked client account and is signed in`: no login, no account → `completeGoogleFlow({kind:"signin", studio}, claims)` creates a login (`passwordHash` null, `googleSub` set), a CLIENT account (name from Google, phone null, no password) joined to it, a login session with that account active, `redirectTo` = `accountHref(slug, "CLIENT")`.
  - `T43-FLOW-02: a login that already has another Google account is refused, and nothing is created`: login with `googleSub: "A"`; claims `sub: "B"` same email → `{ ok: false, code: "linked_other" }`, no session, `googleSub` still "A".
  - `T43-FLOW-03: a staff account is never taken by signing in`: a studio with a pending TEAM_MEMBER invite for the email and no client account → `{ ok: false, code: "needs_invite" }`, the account untouched, no session; a passwordless CLIENT account the studio made is taken up (joined) instead.
  - `T43-FLOW-04: an existing password login gains Google, and stand-alone accounts join`: a login with a password and a stand-alone account elsewhere (same email) plus a person with no login but stand-alone accounts in two studios → the first gets `googleSub` set and keeps its password; the second gets a login whose accounts are joined (their passwords cleared) and one joined email goes out.
  - `T43-FLOW-05: the platform path`: `studio: null` → `redirectTo` ends `/studios`; a super-admin's email → refused (`failed`), no session; a person with only a stand-alone account elsewhere gets a login and `/studios` lists it.
  - `T43-START-01: not configured`: `GET start` redirects to `/login` and sets no cookie.
  - `T43-START-02: the start address`: configured, `studio=<real slug>` → 302 to `accounts.google.com`, the flow cookie set with those attributes; an unknown studio, a cancelled studio, or `studio=https://evil.com` → `/login?google=closed`, no cookie.
  - `T43-CALLBACK-01: the happy path`: start, then callback with the matching `state` and a fake token → 302 to the studio page, session set, flow cookie deleted.
  - `T43-CALLBACK-02: nothing signs in without the browser's own flow`: no cookie; a cookie with another state; a tampered cookie; a code replayed after the cookie was deleted; `error=access_denied` → each redirects to a sign-in page with `?google=failed` (or `cancelled`), sets no session, and does not call the fake exchange.
  - `T43-UI-01: the buttons`: source checks that the three forms render `<GoogleButton` only when `googleEnabled`, that the three pages pass `googleEnabled={googleConfigured()}`, and that each form shows `googleErrorMessage(` for `?google=`.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** (extract `takeUpClientAccount` from `continueAsClient` first and run tier 41 and 42 green before adding Google code). **Step 4: Run tier 43 and the whole `pnpm test:e2e`, expect PASS.**
- [ ] **Step 5: Check it in the app** with Google settings unset (no button anywhere; `/auth/google/start` goes to `/login`) and, if the person has set them, with real Google at 390px and 1280px: register at a studio, sign in again, platform `/login`.
- [ ] **Step 6: Commit**

```bash
git add lib app components tests/e2e
git commit -m "feat(auth): sign in or register with Google"
```

---

### Task 3: Accepting a team invite with Google

**Files:**
- Modify: `lib/auth/google-flow.ts` (`invite` intent), `app/auth/google/start/route.ts` (accept `intent=invite`), `app/[tenantSlug]/reset-password/page.tsx`, `components/auth/reset-password-form.tsx` (a Google button on a team invite, `welcome=1`, valid link)
- Test: `tests/e2e/tier43-google-sign-in.test.ts`

**Interfaces:**
- Consumes: Task 2; `findStudioAccount`, `resetTokenMatches` (`lib/auth/password-reset.ts`); `hasSetUp`.
- Produces: `completeGoogleFlow` for `{ kind: "invite", studio, email, token }`: the pending staff account of that studio for `email` must exist, not be set up, and `resetTokenMatches(account, token)`; the Google email must equal `email` (case-insensitively), else `{ ok: false, code: "mismatch" }`. Then the login rules (find or create), `linkAccountToLogin(account.id, login.id)`, the invite token used up (reset and invite fields cleared), a login session with that account active, `redirectTo` = `accountHref(slug, role)`. A used or expired token or an unknown account → `failed`. The start route accepts `intent=invite&studio=&email=&token=` and puts them in the flow cookie only (never in the Google address); the invite page's Google link carries them in its own address, to our platform host only.

- [ ] **Step 1: Write the failing tests**
  - `T43-INVITE-01: Google accepts an invite and proves the email`: a pending TEAM_MEMBER invite (`inviteTeamMember` as the studio owner; token from `inviteUrl`) and Google claims for the same email, no login yet → a login is created with `googleSub`, the account is linked and Active (`teamMemberStatus`), the token no longer works (`resetPassword` with it gives `INVALID_LINK`), session active for that account, the person's other set-up accounts joined.
  - `T43-INVITE-02: an invite for a different email is refused`: Google claims for another address → `{ ok: false, code: "mismatch" }`; the account still pending; the token still valid; no login created; no session.
  - `T43-INVITE-03: an existing login joins without a password`: the email already has a login (password, no Google) → the account links to it, `googleSub` is set, the password stays.
  - `T43-INVITE-04: a used or made-up token`: `failed`, nothing linked.
  - `T43-UI-02: the invite page offers it`: source check that the reset page passes `googleEnabled` and the invite details to the form and the form renders the Google button only when `welcome` and enabled.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run tier 43 and the whole `pnpm test:e2e`, expect PASS.**
- [ ] **Step 5: Commit**

```bash
git add lib app components tests/e2e
git commit -m "feat(auth): accept a team invite with Google"
```

---

### Task 4: Starting a studio with Google

**Files:**
- Modify: `lib/auth/google-flow.ts` (`signup` intent), `app/auth/google/callback/route.ts`, `lib/validations/onboarding.ts` (`password` optional, new `googleTicket`), `lib/actions/onboarding.ts` (`onboardStudio` accepts a ticket; new `readGoogleTicket`), `app/(saas)/create-studio/page.tsx`
- Test: `tests/e2e/tier43-google-sign-in.test.ts`; adjust `tests/e2e/tier41-one-login.test.ts` / `tier39` only if their sign-up assertions break.

**Interfaces:**
- Consumes: Task 2; `createLoginFromProof`, `findLogin`, `verifyLoginPassword`; `setLoginSessionCookie`.
- Produces:
  - Callback for `{ kind: "signup" }`: no login is created yet; it makes `ticket = signBlob({ email, name, sub }, 900)` and redirects to `platformUrl("/create-studio?google=" + ticket)`.
  - `readGoogleTicket(ticket: string): Promise<{ email: string; name: string | null } | null>` (`"use server"` in `lib/actions/onboarding.ts`; null for a bad or expired ticket).
  - `OnboardStudioInput` gains `googleTicket?: string`; `password` is required only when there is no `googleTicket`. `onboardStudio` with a valid ticket: the owner's email is the ticket's (a different `ownerEmail` is replaced); the login is found by `googleSub`, else the email (set its `googleSub`; refuse a different one with "This email is already linked to a different Google account."), else created via `createLoginFromProof(email, null)` (joined accounts, joined email); the owner account is created joined to it with no password; the session is a login session. A super-admin's email is still refused.
  - The wizard: step 3 gets "Continue with Google" (when configured) which saves the wizard's fields to `sessionStorage` (try/catch) and goes to `/auth/google/start?intent=signup`; coming back with `?google=<ticket>` the page restores the saved fields, reads the ticket, fills and locks the owner name and email, hides the password field with "Signed in with Google", and step 3 is valid without a password; `?google=failed|cancelled|...` shows `googleErrorMessage`.

- [ ] **Step 1: Write the failing tests**
  - `T43-SIGNUP-01: Google starts a studio`: `completeGoogleFlow({kind:"signup"}, claims)` returns a redirect to `/create-studio?google=<ticket>` and creates nothing; `readGoogleTicket` returns the email and name; a changed ticket or an expired one returns null.
  - `T43-SIGNUP-02: a ticket creates the owner joined to a Google login`: `onboardStudio({ ...input, googleTicket })` without a password → the studio exists, the owner has no password and a `loginId`, the login has `googleSub`, `passwordHash` null, the session is a login session; a different `ownerEmail` in the input is ignored.
  - `T43-SIGNUP-03: existing logins`: the email already has a password login → the owner joins it (no password needed, Google proved the email), `googleSub` set; a login with another `googleSub` → refused with the exact message; a person with stand-alone accounts elsewhere → they are joined and the joined email goes out; a super-admin email → refused.
  - `T43-SIGNUP-04: no ticket and no password`: refused with the existing password message (the schema still requires one).
  - `T43-UI-03: the wizard`: source checks for the sessionStorage save and restore, the Google button in step 3, and the locked fields.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run tier 43, tier 39, tier 41 and the whole `pnpm test:e2e`, expect PASS.**
- [ ] **Step 5: Check it in the app at 390px and 1280px** (wizard state survives the round trip; with Google unset the step is unchanged), **then commit**

```bash
git add lib app components tests/e2e
git commit -m "feat(auth): start a studio with Google"
```

---

### Task 5: Coming back to a studio's own domain

**Files:**
- Modify: `prisma/schema.prisma` (`SignInHandoff.nonceHash String?`), create `prisma/migrations/20261127090000_handoff_nonce/migration.sql`, `lib/auth/handoff.ts` (`issueHandoff(..., nonceHash?)`, `redeemHandoff(..., nonceHash?)`), `lib/auth/google-flow.ts` and `app/auth/google/start/route.ts`/`callback/route.ts` (carry `returnTo` and `nonceHash`), `lib/actions/one-login.ts` (new `beginGoogleReturn`), the three Google buttons (use it on a custom domain)
- Create: `app/[tenantSlug]/auth/google/finish/route.ts`
- Test: `tests/e2e/tier43-google-sign-in.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `isCustomDomainHost`, `safeHandoffReturn`, `issueHandoff`, `redeemHandoff` (part 2).
- Produces:
  - `beginGoogleReturn(): Promise<{ returnTo: string; nonce: string } | null>` (`"use server"`, on a studio's own domain only, else null): sets a host-only HttpOnly cookie `cineflow_google_nonce` (value a random nonce, 10 minutes) on that domain and returns `returnTo` (`https://<this host>/`) and the nonce. The Google button on a custom domain calls it, then goes to `/auth/google/start?...&returnTo=&nonce=` on the platform; on every other host it stays a plain link.
  - The start route: a `returnTo` that fails `safeHandoffReturn` is dropped (the person lands on the studio's subdomain address instead, signed in there); a valid one goes in the flow cookie with `nonceHash = sha256(nonce)`.
  - The callback, after `completeGoogleFlow` succeeds and the flow has a valid `returnTo`: sets the platform's shared cookie as usual, then issues `issueHandoff(loginId, activeUserId, returnTo host, nonceHash)` and redirects to `${returnTo origin}/auth/google/finish?code=<code>&to=<redirectTo path>`.
  - `GET /auth/google/finish?code=&to=` on the studio's domain (the file is `app/[tenantSlug]/auth/google/finish/route.ts`; the middleware rewrites the studio's own host to it): requires the cookie `cineflow_google_nonce`; `redeemHandoff(code, this host, sha256(cookie))` ok → `setLoginSessionCookie(loginId, activeUserId)` (this host's own cookie), delete the nonce cookie, 303 to `to` when it is a safe path (`isSafeRelativePath`) else `/`; anything wrong → the studio's own `/login` with no session. `redeemHandoff` with a `nonceHash` on the row requires the same hash.

- [ ] **Step 1: Write the failing tests** (as in tier 42: set a studio's `customDomain`, subdomains on, `withHost`):
  - `T43-RETURN-01: the whole return`: `beginGoogleReturn()` under the studio's host sets the cookie and returns the nonce; start with that `returnTo` and `nonce`; callback with a fake Google token → 302 to `https://<domain>/auth/google/finish?code=…`, the platform's shared cookie set; `finish` under that host with the nonce cookie → the host-only session cookie set and a 303 to the destination.
  - `T43-RETURN-02: a lured or replayed return does nothing`: the same `finish` link opened without the nonce cookie, with another browser's nonce, a second time, after expiry, or on another studio's domain → the studio's `/login`, no session; `to=https://evil.com` and `to=//evil.com` → `/`.
  - `T43-RETURN-03: a bad return address is dropped`: `returnTo` of another site or of a studio's subdomain → the callback sends the person to the studio's subdomain address instead (still signed in there).
  - `T43-RETURN-04: other hosts are unchanged`: `beginGoogleReturn()` on a subdomain or the platform returns null.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** (migration by hand, then `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code` and `prisma generate`). **Step 4: Run tier 43, tier 42, tier 33 and the whole `pnpm test:e2e`, expect PASS.**
- [ ] **Step 5: Commit; rebuild the graph**

```bash
git add prisma lib app components tests/e2e
git commit -m "feat(auth): Google sign-in comes back to a studio's own domain"
graphify update .
```
