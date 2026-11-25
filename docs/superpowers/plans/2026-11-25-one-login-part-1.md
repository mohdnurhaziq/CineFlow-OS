# One Login, Part 1 (the login layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person, one login (email + password) across every studio where they are an owner, team member or client, built over today's per-studio accounts, with no switcher or Google yet (parts 2 and 3).

**Architecture:** A new `Login` row per proven email; each per-studio `User` may point to it (`loginId`). A linked session token carries the login and a list of the person's studio accounts; `getCurrentUser()` picks the account for the studio being visited (a header the middleware sets, else the host), so every existing caller keeps working. Proof of email (reset, invite and "confirm your email" links) is the only way a login is created; creating one joins the person's set-up accounts.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript (`noUncheckedIndexedAccess`), Prisma + SQLite, bcryptjs, our HMAC session tokens (`lib/auth/token.ts`), custom e2e harness (`pnpm test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-25-one-login-design.md` (read it; this plan implements its "Order of work" step 1).

## Global Constraints

- No auth framework. Keep `lib/auth/token.ts` HMAC tokens; old tokens (no `loginId`) stay valid until they expire.
- A `Login` is created only from proof: a password-reset link, a team-invite link (a reset link with `welcome=1`), a client invite link (`/register?invite=`), or a "confirm your email" link (a reset link with `join=1`). Never from a matching email alone.
- The login's password is always the one typed on the proof page; an unproven account's `passwordHash` is never copied to a login.
- Super-admin accounts (`role: "SUPER_ADMIN"`) are never linked and keep `/super-admin/login`.
- "Set up" = `passwordHash != null || loginId != null` (`hasSetUp`). Every check that read "has a `passwordHash`" uses it.
- Accounts a studio creates and the person hasn't taken up (no password, no login) are not linked until the person acts.
- Emails compare case-insensitively (legacy rows can be mixed case): store logins lowercase; find users with `lower(email)`.
- Joining clears the joined account's `passwordHash`, `inviteToken`, `inviteTokenExpires`, sets `isQuickCreated: false`, and `sessionsValidAfter = now`.
- Studios never see a person's other studios or roles; statuses look the same either way.
- Cancelled studios (`subscriptionStatus === "CANCELLED"`) are left out of a session's account list; paused ones stay.
- Copy is plain English, no em dashes; messages below are exact where quoted.
- No Claude attribution in commits. Rebuild Docker (`docker compose up -d --build app`) and check at phone width before saying a UI task is done.
- After code changes run `graphify update .`.
- Where this plan narrows the spec (all within "left to the builder"): reset and confirm links keep their tokens on `User` (the link is per studio), so `Login` has no reset fields; "confirm your email" is a reset link with `join=1`, so there is no separate confirmation record; on the platform host `getCurrentUser()` returns the token's active account as today (platform pages keep working) and `getCurrentLogin()` is the person; a studio missing from an old token's list sends the person to that studio's sign-in, which reissues the token.

## Review Focus

1. **Two studios in two tabs on subdomains:** each tab must stay signed in as its own studio's account. Pinned in Task 2 (`T41-SESSION-02`).
2. **Someone registered with your email before you proved it:** after you prove it, their password must no longer open anything. Pinned in Task 1 (`T41-JOIN-02`) and Task 4 (`T41-PROOF-03`).
3. **A pending team invite for an email that already has a login:** the studio must still see "Invited" and must not be able to assign them. Pinned in Task 3 (`T41-SETUP-02`).
4. **A removed team member, or a cancelled studio, in a linked session:** that studio must not let them in. Pinned in Task 2 (`T41-SESSION-04`).
5. **Signing in with an old studio password after joining:** it must fail with the normal message, while the login's password works. Pinned in Task 5 (`T41-SIGNIN-04`).

---

### Task 1: The `Login` model and joining

**Files:**
- Modify: `prisma/schema.prisma` (new `Login` model; `User.loginId` + relation + `@@index([loginId])`)
- Create: `prisma/migrations/20261126090000_logins/migration.sql`
- Create: `lib/auth/set-up.ts` (plain module, client-safe)
- Create: `lib/auth/login.ts` (server-only, not `"use server"`)
- Create: `tests/e2e/tier41-one-login.test.ts`, `tests/e2e/.t41-only.ts` (copy of `.t39-only.ts` for tier 41)
- Modify: `tests/e2e/runner.ts` (import and run `runTier41OneLoginTests` after tier 40)

**Interfaces:**
- Produces:
  - Prisma `Login { id String @id @default(cuid()); email String @unique; passwordHash String?; googleSub String? @unique; sessionsValidAfter DateTime?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; users User[] }`, `User.loginId String?` (relation `onDelete: SetNull`).
  - `hasSetUp(user: { passwordHash: string | null; loginId?: string | null }): boolean` in `lib/auth/set-up.ts`.
  - In `lib/auth/login.ts`:
    - `normalizeEmail(email: string): string`
    - `findLogin(email: string): Promise<Login | null>`
    - `type JoinedAccount = { userId: string; tenantId: string; tenantName: string; role: string }`
    - `createLoginFromProof(email: string, passwordHash: string | null, opts?: { takeUpUserId?: string }): Promise<{ login: Login; joined: JoinedAccount[] }>`: creates the login, links `takeUpUserId` (even if not set up), then joins every other set-up, non-super-admin, unlinked account with that email. Throws if a login already exists for the email.
    - `linkAccountToLogin(userId: string, loginId: string): Promise<void>`: one account, with the joining field changes from Global Constraints.
    - `sendJoinedEmail(email: string, joined: JoinedAccount[]): Promise<void>`: no-op for an empty list; else one `sendPlatformEmail` (`lib/notifications.ts`), subject `"One sign-in for all your CineFlow studios"`, listing each studio name and the line "Use the password you just set to sign in at any of them. Your old passwords for these studios no longer work." Never throws.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/tier41-one-login.test.ts` (`export async function runTier41OneLoginTests(harness: TestHarness)`, suite `"Tier 41", "One login"`). The seed has two studios, `lumina-cine` and `apex-media`. Add test helpers `makeStudio(slug: string)` (a throwaway `Tenant` with `name` and `slug`) and `makeUser(tenantId, email, role, opts?: { password?: string; inviteToken?: string })`; each test uses unique emails like `t41-<test>-<Date.now()>@example.com` and deletes its users, logins and throwaway studios in `finally`.
  - `T41-JOIN-01: creating a login links the person's set-up accounts and leaves pending ones alone`: users A (lumina, CLIENT, password set), B (apex, PHOTOGRAPHER, password set, email in MiXeD case), C (a `makeStudio` studio, CLIENT, no password, `inviteToken` set), S (SUPER_ADMIN, same email). Call `createLoginFromProof(email, hash)`. Assert: A and B have `loginId === login.id`, `passwordHash === null`, `sessionsValidAfter` set; C has `loginId === null` and keeps its `inviteToken`; S unchanged; `joined.length === 2`; `login.email === email.toLowerCase()`.
  - `T41-JOIN-02: a password set on an unproven account stops working once the email is proven`: A (CLIENT, passwordHash = bcrypt("attacker-pass")). `createLoginFromProof(email, bcrypt("owner-pass"))`. Assert `A.passwordHash === null` and `bcrypt.compareSync("owner-pass", login.passwordHash!)`.
  - `T41-JOIN-03: takeUpUserId links an account that isn't set up yet`: C (no password, pending). `createLoginFromProof(email, hash, { takeUpUserId: C.id })` → `C.loginId === login.id`, `C.inviteToken === null`.
  - `T41-JOIN-04: hasSetUp`: `hasSetUp({passwordHash: null, loginId: null}) === false`; `true` with either set.
  - `T41-JOIN-05: a second login for the same email is refused`: `createLoginFromProof` twice → second rejects.
  - `T41-JOIN-06: sendJoinedEmail sends one email naming the studios, and none for an empty list` (use `setSmtpTransportForTests` with a capturing transport, as tier 39 does).

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test:e2e` (first time, to build `prisma/test.db`); afterwards the tier alone: `DATABASE_URL=file:./test.db npx prisma migrate deploy && DATABASE_URL=file:./test.db npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t41-only.ts`
Expected: FAIL (module `@/lib/auth/login` not found).

- [ ] **Step 3: Add the model and migration.** Migration SQL: `CREATE TABLE "Login"` (columns above, unique indexes on `email` and `googleSub`), `ALTER TABLE "User" ADD COLUMN "loginId" TEXT REFERENCES "Login"("id") ON DELETE SET NULL ON UPDATE CASCADE`, `CREATE INDEX "User_loginId_idx" ON "User"("loginId")`. If SQLite refuses the `REFERENCES` on `ADD COLUMN`, generate the table-rebuild SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script --shadow-database-url file:./shadow.db` and use that. Run `npx prisma generate`.

- [ ] **Step 4: Implement `lib/auth/set-up.ts` and `lib/auth/login.ts`.** Find candidate users with `db.$queryRaw\`SELECT id FROM "User" WHERE lower(email) = ${normalized} AND role != 'SUPER_ADMIN' AND "loginId" IS NULL\``, then filter by `hasSetUp` (or `id === takeUpUserId`). Do the create + links in one `db.$transaction`.

- [ ] **Step 5: Run the tier, expect PASS.** Same command as Step 2.

- [ ] **Step 6: Commit**

```bash
git add prisma lib/auth/set-up.ts lib/auth/login.ts tests/e2e/tier41-one-login.test.ts tests/e2e/.t41-only.ts tests/e2e/runner.ts
git commit -m "feat(auth): logins for proven emails, joining a person's studio accounts"
```

---

### Task 2: A session that holds the person

**Files:**
- Modify: `lib/auth/token.ts` (payload, `createSessionToken`, `decodeSessionToken`, `isSessionRevoked`, new builders)
- Create: `lib/auth/request-studio.ts`
- Modify: `lib/auth/session.ts` (`getCurrentUser`, new `getCurrentLogin`)
- Modify: `middleware.ts` (`readSession` picks the account for the admin slug; sets `x-cineflow-studio` on every passed-through request)
- Modify: `tests/e2e/mocks/next-headers-stub.mjs` (`state.studio` → `x-cineflow-studio` header), `tests/e2e/mocks/session.ts` (`withStudio`, `withLoginSession`)
- Test: `tests/e2e/tier41-one-login.test.ts`

**Interfaces:**
- Consumes: `Login`, `User.loginId` (Task 1).
- Produces:
  - `SessionUser` gains optional `loginId?: string | null` (nothing else changes).
  - `interface SessionAccount { tenantSlug: string; userId: string; role: string }`.
  - `createSessionToken(user: SessionUser, accounts?: SessionAccount[]): Promise<string>` (payload adds `loginId` from `user.loginId` and `accounts` when given).
  - `decodeSessionToken(token)` returns `{ user: SessionUser; issuedAt: number; accounts: SessionAccount[] | null }`.
  - `liveAccounts(loginId: string): Promise<(SessionAccount & { user: SessionUser })[]>`: linked users not deactivated, tenant not CANCELLED, ordered by tenant name.
  - `setLoginSessionCookie(loginId: string, activeUserId: string): Promise<boolean>`: builds the token from `liveAccounts` with the active account as the top-level user; sets the cookie exactly as `setSessionCookie` does.
  - `isSessionRevoked(userId: string, issuedAt: number, loginId?: string | null): Promise<boolean>`: also true when `Login.sessionsValidAfter > issuedAt`, the login is gone, or the user's `loginId` no longer equals `loginId`.
  - `requestStudioSlug(): Promise<string | null>` in `lib/auth/request-studio.ts`: the `x-cineflow-studio` header, else `platformSubdomainSlug(host)`, else `tenantSlugForDomain(host)` (both from `lib/tenant-domain.ts`), else null.
  - `getCurrentUser(): Promise<SessionUser | null>`: stand-alone tokens as today. Linked tokens: if `requestStudioSlug()` names a studio, return that studio's account from the token list (re-read from the database and checked: still linked to this login, not deactivated, tenant slug matches, tenant not cancelled), else `null`; if no studio is known (platform host, API route), return the token's active account, checked the same way.
  - `getCurrentLogin(): Promise<{ loginId: string; email: string; accounts: SessionAccount[] } | null>` in `lib/auth/session.ts` (verified, not revoked).
  - Tests: `withStudio<T>(slug: string, fn: () => Promise<T>): Promise<T>`; `withLoginSession<T>(loginId: string, activeUserId: string, fn: () => Promise<T>): Promise<T>`.

- [ ] **Step 1: Write the failing tests** (add to tier 41; build a login with a `PHOTOGRAPHER` account at `lumina-cine` and a `CLIENT` account at `apex-media`, both with passwords, then `createLoginFromProof` joins them).
  - `T41-SESSION-01: the account follows the studio being visited`: `withLoginSession(login, luminaUser) + withStudio("apex-media", getCurrentUser)` → apex account (`role === "CLIENT"`, `tenantSlug === "apex-media"`); with `withStudio("lumina-cine")` → the lumina account; with a studio with no account → `null`; with no studio → the active (lumina) account.
  - `T41-SESSION-02: two studios in two tabs don't push each other out`: one token; alternate `withStudio("lumina-cine")` / `withStudio("apex-media")` three times; each returns its own account.
  - `T41-SESSION-03: middleware lets the team account into /admin of its own studio only`: `middleware(new NextRequest("http://localhost:3000/lumina-cine/admin", { headers: { host: "localhost:3000", cookie: \`${COOKIE_NAME}=${token}\` } }))` is not a redirect; `/apex-media/admin` redirects to `/apex-media/account` (client there); a third studio's `/admin` redirects to its login. The response for `/lumina-cine/book` carries request header `x-cineflow-studio: lumina-cine` (read `x-middleware-request-x-cineflow-studio`), and a spoofed incoming `x-cineflow-studio` on a platform path is removed.
  - `T41-SESSION-04: removed or cancelled ends access there, nowhere else`: set the lumina user `deactivatedAt` → `withStudio("lumina-cine")` gives `null`, apex still works; set apex tenant `CANCELLED` → `null` at apex (restore both).
  - `T41-SESSION-05: the login's sign-out-everywhere ends the session`: set `Login.sessionsValidAfter = now + 1s` → `getCurrentUser()` and `getCurrentLogin()` are `null`.
  - `T41-SESSION-06: old one-account tokens still work`: `withSession(existingLuminaOwner)` → `getCurrentUser()` returns it (no `loginId`).

- [ ] **Step 2: Run the tier, expect FAIL.**

- [ ] **Step 3: Implement** the token, `request-studio.ts`, `getCurrentUser`/`getCurrentLogin`, and the stub/helpers. In `middleware.ts`: copy request headers, `delete("x-cineflow-studio")`, set it to `resolvedTenantSlug` or to the first segment of `effectivePath` when that segment is not in `RESERVED_SLUGS`, and pass `{ request: { headers } }` to the `NextResponse.rewrite` and `NextResponse.next` calls. `readSession(request, slug)` returns the matching `accounts` entry's `role`/`tenantSlug` when the payload has `accounts`, else today's fields.

- [ ] **Step 4: Run the tier, expect PASS; then `pnpm typecheck` and the whole `pnpm test:e2e` (tier 33 covers the middleware).**

- [ ] **Step 5: Commit**

```bash
git add lib/auth middleware.ts tests/e2e
git commit -m "feat(auth): a session holds the person, and each studio sees its own account"
```

---

### Task 3: "Set up" means a password or a login

**Files:**
- Modify: `lib/team/status.ts` (`teamMemberStatus` input gains `loginId?: string | null`; ACTIVE when `hasSetUp`)
- Modify: `lib/client-directory.ts` (`clientAccountStatus` uses `hasSetUp`; both selects add `loginId: true`)
- Modify: `lib/team/members.ts:33` (select `loginId`), `lib/actions/admin-assignments.ts:42` (select `loginId`)
- Modify: `lib/bookings/confirmation-email.ts:28-32`, `lib/actions/admin-projects.ts:73-90` (select `loginId`; use `hasSetUp`)
- Modify: `lib/actions/admin-team.ts:163,266` (select `loginId`; `ALREADY_ACTIVE` when `hasSetUp`)
- Test: `tests/e2e/tier41-one-login.test.ts`

**Interfaces:**
- Consumes: `hasSetUp` (Task 1).

- [ ] **Step 1: Write the failing tests**
  - `T41-SETUP-01: a joined team member stays Active and assignable`: a lumina PHOTOGRAPHER with a password; `createLoginFromProof` joins it (password cleared). `teamMemberStatus(row) === "ACTIVE"`; `loadTeamMembers(lumina.id)` shows it ACTIVE; assigning it to a booking with `assignTeamMember` succeeds (follow tier 38's assignment fixture).
  - `T41-SETUP-02: a pending invite to an email with a login still looks like any invite`: the email has a login (from another studio); `inviteTeamMember` at lumina → status `"INVITED"`, `loginId === null`; `assignTeamMember` refuses it; `resendTeamInvite` works.
  - `T41-SETUP-03: a joined client is Registered and gets "Sign in" links`: `clientAccountStatus({ passwordHash: null, inviteToken: null, loginId: "x" }) === "REGISTERED"`; the proposal email for a linked client uses `linkLabel: "Sign in to review and sign"` (read via `getNotificationHistory`).

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run the tier and `pnpm typecheck`, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib tests/e2e/tier41-one-login.test.ts
git commit -m "feat(auth): an account joined to a login counts as set up everywhere"
```

---

### Task 4: Proof pages create or update the login

**Files:**
- Modify: `lib/actions/password-reset.ts` (`resetPassword`; new `sendOneLoginLink`)
- Modify: `app/[tenantSlug]/reset-password/page.tsx`, `components/auth/reset-password-form.tsx` (copy for `join=1` and for "you already have a sign-in")
- Modify: `lib/actions/client-auth.ts` (`registerClient` invite branch)
- Modify: `lib/notifications.ts` (new event `ONE_LOGIN_CONFIRM`, redacted in history like `PASSWORD_RESET`)
- Test: `tests/e2e/tier41-one-login.test.ts`, and update `tests/e2e/tier19-password-reset.test.ts` where it reads `passwordHash` after a reset

**Interfaces:**
- Consumes: `findLogin`, `createLoginFromProof`, `linkAccountToLogin`, `sendJoinedEmail` (Task 1); `setLoginSessionCookie` (Task 2).
- Produces:
  - `resetPassword(input)` (same input and result types). On a valid link: if the account is linked, set `Login.passwordHash` (and `Login.sessionsValidAfter = now` when the new password differs from the old); else if a login exists for the email, `linkAccountToLogin` and set its password the same way; else `createLoginFromProof(email, hash, { takeUpUserId: account.id })` and `sendJoinedEmail(email, joined without this account)`. The account's own reset/invite fields are cleared as today; it never keeps a `passwordHash` of its own.
  - `sendOneLoginLink(): Promise<{ success: true } | { success: false; message: string }>` (`"use server"`, in `lib/actions/password-reset.ts`): for the signed-in stand-alone account (`getCurrentUser()` with no `loginId`, not super-admin), issues a reset token (`issuePasswordReset`, 60 minutes) and sends `ONE_LOGIN_CONFIRM` with `studioUrl(slug, passwordResetPath(email, token)) + "&join=1"`; rate limit 3 per hour per account.
  - Reset page flags: `join=1` → heading "Use one sign-in for all your studios", button "Set my password"; when `findLogin(email)` exists and the link is valid → the line "You already have a CineFlow sign-in. Enter its password, or choose a new one."
  - `registerClient` with a valid `inviteToken`: proof. If a login exists, link the account and set the login's password to the typed one; else `createLoginFromProof(email, hash, { takeUpUserId })`. Sign in with `setLoginSessionCookie`.

- [ ] **Step 1: Write the failing tests**
  - `T41-PROOF-01: a reset link on a stand-alone account creates the login and joins the rest`: email with set-up accounts at lumina (CLIENT) and apex (PHOTOGRAPHER); `issuePasswordReset(lumina.id)` → `resetPassword({ tenantSlug: "lumina-cine", email, token, password: "new-pass-123" })` succeeds; a login exists with that password; both accounts linked with no `passwordHash`; one joined email went out naming the apex studio.
  - `T41-PROOF-02: a reset on a linked account changes the login's password and ends its sessions`: login exists; reset → `bcrypt.compareSync("other-pass-123", login.passwordHash)`; `login.sessionsValidAfter` set.
  - `T41-PROOF-03: the attacker's password never reaches the login`: apex CLIENT created by `registerClient` with the victim's email and `"attacker-pass1"`; the victim resets at lumina with `"victim-pass-1"` → login password is the victim's; the apex account's `passwordHash === null`; `loginWithCredentials(email, "attacker-pass1", "apex-media")` fails.
  - `T41-PROOF-04: a team invite link to someone with a login links the new account`: email has a login (apex); `inviteTeamMember` at lumina; `resetPassword` with that invite token and the login's current password → lumina account `loginId === login.id`; status ACTIVE; `login.sessionsValidAfter` unchanged (same password).
  - `T41-PROOF-05: a client invite link proves the email`: studio quick-creates a client (no password) and issues an invite; `registerClient({ ..., inviteToken })` → login created, account linked, session is a login session.
  - `T41-PROOF-06: sendOneLoginLink`: as a stand-alone lumina client → success and one `ONE_LOGIN_CONFIRM` notification whose link contains `join=1`; as a linked account → `success: false`.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run the tier, tier 19 and `pnpm typecheck`, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib app components tests/e2e
git commit -m "feat(auth): reset, invite and confirm links create or update the person's login"
```

---

### Task 5: Signing in, registering and studio sign-up with a login

**Files:**
- Modify: `lib/auth/session.ts` (`loginWithCredentials`)
- Create: `lib/actions/one-login.ts` (`"use server"`: `continueAsClient`)
- Modify: `components/auth/studio-login-form.tsx`, `components/auth/client-auth-panel.tsx` (handle `NO_ACCOUNT_HERE`)
- Create: `components/auth/one-login-invite.tsx` (client component, calls `sendOneLoginLink`)
- Modify: `app/[tenantSlug]/admin/page.tsx` (Overview) and `app/[tenantSlug]/account/page.tsx` (render the invite for stand-alone, non-super-admin accounts)
- Modify: `lib/actions/client-auth.ts` (`registerClient` without invite), `lib/actions/onboarding.ts` (`onboardStudio`)
- Test: `tests/e2e/tier41-one-login.test.ts`; update tests that expected sign-up to refuse an email used by staff elsewhere (search `tests/` for the onboarding uniqueness message)

**Interfaces:**
- Consumes: Tasks 1, 2 and 4.
- Produces:
  - `loginWithCredentials(email, password, tenantSlug?)` keeps its result type, adding `error: "NO_ACCOUNT_HERE"` and `user?.loginId`. With `tenantSlug`:
    1. this studio's account is linked → check the login's password; removed → `ACCOUNT_REMOVED`; sign in with `setLoginSessionCookie(loginId, account.id)`;
    2. this studio's account is stand-alone → as today (its own password);
    3. no account here: try the super-admin as today; else if a login exists and its password matches → `setLoginSessionCookie(loginId, firstLiveAccountId)` and return `{ success: false, error: "NO_ACCOUNT_HERE" }`; else `INVALID_CREDENTIALS`.
    Rate limiting unchanged; wrong passwords keep `INVALID_CREDENTIALS`.
  - `continueAsClient(tenantSlug: string): Promise<{ success: true; redirectTo: string } | { success: false; message: string }>`: needs `getCurrentLogin()`; refuses a cancelled studio; takes up this studio's passwordless CLIENT account for the email if one exists (`linkAccountToLogin`), refuses if a non-client account exists ("Ask the studio to invite you."), else creates a CLIENT `User` (name and phone from the person's most recent account) with `loginId` and no password; then `setLoginSessionCookie` and `redirectTo: signInTarget({ role: "CLIENT", tenantSlug })`.
  - Sign-in forms, on `NO_ACCOUNT_HERE`: show "You don't have an account with {studio name} yet." and a button "Continue as a client of {studio name}" calling `continueAsClient`.
  - `OneLoginInvite`: a dismissible card (remembered in `localStorage`, wrapped in try/catch): title "Use one sign-in for all your studios", text "Confirm your email and choose one password for every CineFlow studio you work with or book.", button "Email me a link" → `sendOneLoginLink`, then "Check your email."
  - `registerClient` without an invite: if `findLogin(email)` exists → the typed password must match the login's (`bcrypt.compareSync`); match → create the CLIENT account linked, sign in with `setLoginSessionCookie`; no match → `{ success: false, error: "EMAIL_EXISTS", message: "This email already has a CineFlow sign-in. Use its password, or reset it." }`. No login → as today, then `sendOneLoginLink`'s email to the new account (fire and forget).
  - `onboardStudio`: remove the rule refusing an owner email used by a non-client account elsewhere. If a login exists → the typed password must match it (else `error: "This email already has a CineFlow sign-in. Use its password."`); the owner is created linked with no `passwordHash`, signed in with `setLoginSessionCookie`. No login → as today.

- [ ] **Step 1: Write the failing tests**
  - `T41-SIGNIN-01: a linked account signs in with the login's password`: `withRequest` + `loginWithCredentials(email, loginPassword, "lumina-cine")` → success; the cookie's token decodes with `accounts` covering both studios.
  - `T41-SIGNIN-02: a removed linked account is refused`: `deactivatedAt` set → `ACCOUNT_REMOVED`.
  - `T41-SIGNIN-03: a login without an account here is offered "Continue as a client"`: right password at a third studio → `NO_ACCOUNT_HERE` and a login session; `continueAsClient(thatSlug)` → a CLIENT account linked, `redirectTo` ends `/account`; a wrong password → `INVALID_CREDENTIALS` and no cookie set.
  - `T41-SIGNIN-04: an old studio password stops working after joining`: an account's old password → `INVALID_CREDENTIALS`.
  - `T41-SIGNIN-05: continueAsClient never grants staff access`: the studio has a pending PHOTOGRAPHER invite for that email → refused with "Ask the studio to invite you." (the invite link is the only way in).
  - `T41-REG-01: registering at a new studio with a login`: right password → linked CLIENT and a login session; wrong password → `EMAIL_EXISTS` with the exact message above.
  - `T41-REG-02: a brand-new client still registers straight away`: no login → account works (stand-alone) and one `ONE_LOGIN_CONFIRM` email is queued.
  - `T41-REG-03: studio sign-up with an email that already has a login`: right password → owner linked (`passwordHash === null`); wrong → refused; and a person who is a PHOTOGRAPHER elsewhere (stand-alone) can now sign up their own studio.
  - `T41-UI-01: the invite card and the sign-in fallback are wired`: source checks that `admin/page.tsx` and `account/page.tsx` render `<OneLoginInvite` only when the user has no `loginId` and isn't a super-admin, and both sign-in forms handle `NO_ACCOUNT_HERE`.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run tier 41, then the whole `pnpm test:e2e` and `pnpm typecheck`, expect PASS.**

- [ ] **Step 5: Check it in the app.** `docker compose up -d --build app`; with Playwright at 390px and 1280px: sign in at one studio as a stand-alone client → the invite card shows → "Email me a link" → open the email in Mailpit (http://localhost:8025) → set the password → you are signed in at both studios in two tabs; sign in at a third studio → "Continue as a client" works.

- [ ] **Step 6: Commit**

```bash
git add lib components app tests/e2e
git commit -m "feat(auth): sign in, register and start a studio with one login"
```

---

### Task 6: A studio changing a linked client's email unlinks it

**Files:**
- Modify: `lib/actions/admin-clients.ts:45-95` (`updateClientDetails`)
- Test: `tests/e2e/tier41-one-login.test.ts`

**Interfaces:**
- Consumes: `User.loginId`.

- [ ] **Step 1: Write the failing test** `T41-EMAIL-01: a studio editing a linked client's email unlinks it`: linked CLIENT at lumina; `updateClientDetails` with a new email → `loginId === null`, `passwordHash === null`, `sessionsValidAfter` set; `getCurrentLogin()`'s account list (after `setLoginSessionCookie` is rebuilt) no longer has lumina; editing only the name leaves the link.

- [ ] **Step 2: Run, expect FAIL. Step 3: In the same transaction that changes the email, set `loginId: null, sessionsValidAfter: new Date()` when the account was linked. Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit, rebuild the graph, and push when the person asks**

```bash
git add lib/actions/admin-clients.ts tests/e2e/tier41-one-login.test.ts
git commit -m "feat(auth): a studio changing a linked client's email unlinks it"
graphify update .
```
