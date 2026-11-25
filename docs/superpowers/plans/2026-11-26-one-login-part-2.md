# One Login, Part 2 (switcher, platform sign-in, custom domains) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person signed in with their one login can switch between their studios from the account menu, sign in on a platform page, sign out everywhere, and keep working across a studio's own custom domain.

**Architecture:** Part 1 already gives a login session listing the person's live accounts (`getCurrentLogin()`, `liveAccounts()`), and each studio picks its own account from it. This part adds read-only views over that list (the switcher and a "Your studios" page), one new server action (sign out everywhere), a platform sign-in action, and a short-lived single-use handoff that carries a sign-in begun on a studio's own domain over to the platform host.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript (`noUncheckedIndexedAccess`), Prisma + SQLite, Radix dropdown menu (already used), the e2e harness (`pnpm test:e2e`; single tier: `npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t41-only.ts` with `DATABASE_URL=file:./test.db`, after `prisma migrate deploy`).

**Spec:** `docs/superpowers/specs/2026-11-25-one-login-design.md` (sections "The switcher", "Signing out", "Signing in" platform bullet, "Order of work" step 2). Part 1 plan: `docs/superpowers/plans/2026-11-25-one-login-part-1.md`.

## Global Constraints

- The switcher shows only when the login has more than one live account. Each row: studio name and role ("Owner", the team role's name, or "Client"); the current row is marked.
- A switcher link goes where `signInTarget` says (Overview for owners, My schedule for team, the account page for clients). With studio subdomains on it is the studio's `<slug>.cineflow-os.my` address (`studioUrl`), even for a studio with a custom domain; with them off it is the path.
- Removed accounts and cancelled studios never appear (`liveAccounts` already drops them); paused studios stay listed.
- "Sign out" ends this browser's session (the shared cookie for the platform and every studio subdomain, and the current host's cookie). "Sign out everywhere" sets `Login.sessionsValidAfter` (a stand-alone account: `User.sessionsValidAfter`) and ends this browser's session too.
- Platform sign-in is `/login`, then `/studios` ("Your studios"). It never reveals whether an email has a login: a wrong password, an unknown email and a stand-alone-only email give the same answer. It shares the sign-in rate limits (`verifyLoginPassword`). Super-admins keep `/super-admin/login`.
- Handoff: single use, valid 60 seconds, only the SHA-256 of the code is stored; it carries a sign-in begun on a studio's own custom domain to the platform host and back. `next` must be a studio's own custom-domain address (looked up with `tenantSlugForDomain`) with a safe path; anything else is refused.
- Copy is plain English, no em dashes. Messages quoted below are exact.
- No Claude attribution in commits. Rebuild Docker (`docker compose up -d --build app`) and check at phone width before saying a UI task is done. After code changes run `graphify update .`.

## Review Focus

1. **Handoff replay and open redirect:** a used, expired or made-up code does nothing; `next` pointing at another site, a studio without that custom domain, `javascript:`, `//evil.com`, or a path with a backslash is refused. Pinned in Task 4 (`T42-HANDOFF-02`, `T42-HANDOFF-03`).
2. **A removed or cancelled studio in the switcher:** it must not be listed, and a stale link to it must not let the person in. Pinned in Task 1 (`T42-SWITCH-02`).
3. **Sign out on a shared computer:** after signing out on a custom domain the shared platform cookie must be gone too. Pinned in Task 4 (`T42-SIGNOUT-01`).
4. **Sign out everywhere:** every other session of the login ends, stand-alone accounts too, and signing in again right after works. Pinned in Task 1 (`T42-OUT-01`, `T42-OUT-02`).
5. **Platform sign-in enumeration:** an unknown email, a wrong password, a stand-alone-only email and a super-admin's email all return the same error. Pinned in Task 3 (`T42-PLATFORM-02`).

---

### Task 1: The switcher's data and sign out everywhere

**Files:**
- Create: `lib/auth/switcher.ts` (server-only, not `"use server"`)
- Modify: `lib/actions/one-login.ts` (add `signOutEverywhere`)
- Create: `tests/e2e/tier42-one-login-switcher.test.ts` (exports `runTier42OneLoginSwitcherTests`) and `tests/e2e/.t42-only.ts` (a copy of `.t41-only.ts` for tier 42); register it in `tests/e2e/runner.ts` after tier 41.
- Modify: `tests/e2e/tier10-authorization.test.ts` (add `"one-login.signOutEverywhere"` to `PUBLIC_ACTIONS`, reason: "one sign-in: signs the current person out everywhere (checks the session itself)").

**Interfaces:**
- Consumes: `getCurrentLogin()`, `getCurrentUser()`, `logoutAction()` (`lib/auth/session.ts`), `liveAccounts()` (`lib/auth/token.ts`), `signInTarget()`, `studioUrl()`, `studioSubdomainsOn()` (`lib/domain-name.ts`).
- Produces:
  - `interface SwitcherEntry { tenantSlug: string; tenantName: string; roleLabel: string; href: string; current: boolean }`
  - `accountHref(slug: string, role: string): string`: `signInTarget({ role, tenantSlug: slug })`, made absolute with `studioUrl(slug, target)` when `studioSubdomainsOn()`.
  - `loadSwitcher(currentSlug: string | null): Promise<SwitcherEntry[]>`: `[]` when there is no login session; otherwise every live account, ordered by studio name, `current` true for `currentSlug`. Role labels as in Global Constraints (team role name from `User.teamRoleId`, "Team" if none).
  - `signOutEverywhere(): Promise<{ success: true } | { success: false; message: string }>` in `lib/actions/one-login.ts` (`"use server"`): login session → `Login.sessionsValidAfter = now`; stand-alone account (not super-admin) → `User.sessionsValidAfter = now`; then `logoutAction()`. No session or a super-admin → `{ success: false, message: "You're not signed in." }`.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/tier42-one-login-switcher.test.ts` (suite `"Tier 42", "One login: switcher and sign-out"`; reuse the helper style of tier 41: unique emails, throwaway studios, cleanup in `finally`; a login with a TEAM_MEMBER account at `lumina-cine` and a CLIENT account at `apex-media` via `createLoginFromProof`, plus an STUDIO_OWNER account at a throwaway studio).
  - `T42-SWITCH-01: one row per live account, labelled, ordered, current marked`: `withLoginSession(login, team.id)` → `loadSwitcher("lumina-cine")` has 3 entries ordered by studio name; roles "Owner", the team role's name, "Client"; exactly one `current` (lumina); with `loadSwitcher(null)` none is current; with no session `[]`.
  - `T42-SWITCH-02: removed accounts and cancelled studios are not listed`: deactivate the team account, cancel apex → only the owner row remains; restore both.
  - `T42-SWITCH-03: hrefs follow signInTarget, absolute only with subdomains on`: owner → `/<slug>/admin`, team → `/<slug>/admin/schedule`, client → `/<slug>/account` (subdomains off); with `NEXT_PUBLIC_STUDIO_SUBDOMAINS=true` and `NEXT_PUBLIC_APP_URL=https://cineflow-os.my` set for the call, owner → `https://<slug>.cineflow-os.my/admin`. A studio with `customDomain` set still links to its subdomain address. Restore env.
  - `T42-OUT-01: sign out everywhere ends every session of the login`: two tokens for the same login (the two studios); after `signOutEverywhere()` run inside one of them, `getCurrentUser()` under the other (a fresh `withLoginSession`-style token issued earlier than the sign-out: build it before) is null at both studios; `getCurrentLogin()` null; a token issued after works again.
  - `T42-OUT-02: a stand-alone account signs out everywhere too, and nobody else is touched`: a stand-alone client; `signOutEverywhere()` sets its `sessionsValidAfter`; another account's untouched; no session or a super-admin → `{ success: false, message: "You're not signed in." }`.

- [ ] **Step 2: Run the tier, expect FAIL** (module not found).

- [ ] **Step 3: Implement** `lib/auth/switcher.ts` and `signOutEverywhere`. Use one query for team role names (`db.user.findMany({ where: { id: { in } }, select: { id: true, teamRole: { select: { name: true } } } })`).

- [ ] **Step 4: Run tier 42 and `pnpm typecheck`, expect PASS. Commit**

```bash
git add lib tests/e2e
git commit -m "feat(auth): the switcher's data, and sign out everywhere"
```

---

### Task 2: The account menu: switcher and "Sign out everywhere"

**Files:**
- Create: `components/auth/session-menu.tsx` (client)
- Modify: `components/admin/admin-header.tsx` (load entries, pass to `AdminUserNav`), `components/admin/admin-user-nav.tsx`, `components/account/client-user-nav.tsx` (the dropdown gets the section), `app/[tenantSlug]/account/layout.tsx` and `components/account/client-account-header.tsx` (pass entries down), `components/layout/studio-page-header.tsx`, `app/[tenantSlug]/page.tsx`, `components/showcase/showcase-nav.tsx` and `components/account/client-account-menu.tsx` (website bar)
- Modify: `app/[tenantSlug]/admin/manual/settings-and-team/page.tsx` (a short "One sign-in" section)
- Test: `tests/e2e/tier42-one-login-switcher.test.ts`

**Interfaces:**
- Consumes: `loadSwitcher`, `SwitcherEntry` (Task 1), `signOutEverywhere` (Task 1), `logoutAction`.
- Produces: `<SessionMenu tenantSlug: string entries: SwitcherEntry[] />` (client): a Radix dropdown whose trigger is an icon button (`aria-label="Studios and sign out"`, min 44px tap target on phones). Contents: when `entries.length > 1` a heading "Switch studio" and one link per entry (studio name, role label, "Current" badge and `aria-current="true"` on the current one); then a separator and a button "Sign out everywhere" that calls `signOutEverywhere()` and goes to `signedOutHref(studioPath(tenantSlug, "/login"))`. The menu renders for every signed-in person (the switcher part only with 2 or more entries).

- [ ] **Step 1: Write the failing tests** (tier 42, source and render checks in the style of tier 39/40):
  - `T42-MENU-01: the menu is in all three account bars`: source checks that `admin-user-nav.tsx`, `client-user-nav.tsx` and `client-account-menu.tsx` render `<SessionMenu`, and that `admin-header.tsx`, the account layout and `studio-page-header.tsx` call `loadSwitcher(`.
  - `T42-MENU-02: SessionMenu markup`: `renderToStaticMarkup` (see tier 38's use of `provideReactGlobal`) of `SessionMenu` with 3 entries shows "Switch studio", each studio name and role, a "Current" badge once; with 1 entry shows no "Switch studio" but still the trigger. The trigger has `aria-label="Studios and sign out"`.
  - `T42-MENU-03: the manual explains it`: `settings-and-team/page.tsx` contains the heading text "One sign-in".

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** the component and wire the three bars (server components load entries with `loadSwitcher(tenant.slug)`; pass `[]` to signed-out views). Keep each bar's existing layout; the icon button sits next to the existing sign-out control.

- [ ] **Step 4: Run tier 42, `pnpm typecheck`, the whole `pnpm test:e2e`. Step 5: Check it in the app** (`docker compose up -d --build app`; Playwright at 390px and 1280px): sign in as a person with two studios; the menu lists both, the current one is marked, picking the other lands on its page signed in; "Sign out everywhere" signs out; a person with one studio sees only "Sign out everywhere".

- [ ] **Step 6: Commit**

```bash
git add components app lib tests/e2e
git commit -m "feat(auth): the studio switcher and sign out everywhere in the account menus"
```

---

### Task 3: Platform sign-in and "Your studios"

**Files:**
- Create: `app/(saas)/login/page.tsx`, `app/(saas)/studios/page.tsx`, `components/auth/platform-account-login-form.tsx`
- Modify: `lib/actions/one-login.ts` (add `loginToPlatform`), `lib/validations/onboarding.ts` (add `"studios"` to `RESERVED_SLUGS`), `components/saas/saas-navbar.tsx` (a "Sign in" link to `/login`, before the main button)
- Test: `tests/e2e/tier42-one-login-switcher.test.ts`; adjust `tests/e2e/tier39-landing-page.test.ts` only if its nav assertions break.

**Interfaces:**
- Consumes: `verifyLoginPassword` (`lib/auth/login.ts`), `liveAccounts`, `setLoginSessionCookie`, `getCurrentLogin`, `loadSwitcher(null)`.
- Produces: `loginToPlatform(email: string, password: string): Promise<{ success: true; redirectTo: "/studios" } | { success: false; error: "INVALID_CREDENTIALS" | "RATE_LIMITED" }>`: `verifyLoginPassword` ok → session with the first live account active (`liveAccounts(login.id)[0]`); no live account, NO_LOGIN and WRONG all → `INVALID_CREDENTIALS`; `RATE_LIMITED` as is. `/login` redirects to `/studios` when `getCurrentLogin()` is set. `/studios` redirects to `/login` when it isn't, else lists every entry (a link each, "Open" with the role label) with "Sign out" and "Sign out everywhere"; with no entries: "You're not with any studio yet." and links to `/create-studio` and the landing page. Form errors: `INVALID_CREDENTIALS` → "Wrong email or password.", `RATE_LIMITED` → "Too many attempts. Wait a few minutes and try again."

- [ ] **Step 1: Write the failing tests**
  - `T42-PLATFORM-01: a login signs in on the platform and gets a login session`: `withRequest` + `loginToPlatform(email, password)` → `{ success: true, redirectTo: "/studios" }`; the cookie decodes with `accounts` for both studios.
  - `T42-PLATFORM-02: every failure looks the same`: unknown email, wrong password, an email with only a stand-alone account, and a super-admin's email each return exactly `{ success: false, error: "INVALID_CREDENTIALS" }` and set no cookie; ten wrong tries then give `RATE_LIMITED` (shared with `loginWithCredentials`).
  - `T42-PLATFORM-03: the pages`: source checks that `/login` redirects when `getCurrentLogin()` is set and `/studios` redirects when it isn't; `RESERVED_SLUGS` has `"studios"`; `saas-navbar.tsx` links `/login`; `OnboardStudioSchema` refuses the slug `studios`.
  - `T42-PLATFORM-04: Your studios lists the person's studios`: render check of the page's list component (or source check of the empty-state copy "You're not with any studio yet.").

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run tier 42, tier 39 (landing) and `pnpm typecheck`, expect PASS.**

- [ ] **Step 5: Check it in the app at 390px and 1280px** (the landing nav still fits on a phone with the new link), **then commit**

```bash
git add app components lib tests/e2e
git commit -m "feat(auth): platform sign-in and Your studios"
```

---

### Task 4: The handoff for studios on their own domain

**Files:**
- Modify: `prisma/schema.prisma` (model `SignInHandoff`), create `prisma/migrations/20261126120000_sign_in_handoff/migration.sql`
- Create: `lib/auth/handoff.ts`, `lib/auth/handoff-client.ts` (plain, client-safe), `app/auth/handoff/route.ts`, `app/auth/sign-out/route.ts`
- Modify: `lib/auth/session.ts` (`loginWithCredentials` result gains `handoffCode?`; `logoutAction` result gains `via?`), `lib/actions/client-auth.ts` (`registerClient` result), `lib/actions/one-login.ts` (`continueAsClient` result), `components/auth/studio-login-form.tsx`, `components/auth/client-auth-panel.tsx`, and the sign-out controls in `admin-user-nav.tsx`, `client-user-nav.tsx`, `client-account-menu.tsx`, `session-menu.tsx`
- Test: `tests/e2e/tier42-one-login-switcher.test.ts`

**Interfaces:**
- Consumes: `setLoginSessionCookie`, `requestHost`, `sessionCookieFor`, `tenantSlugForDomain` (`lib/tenant-domain.ts`), `isPlatformHost`, `studioSubdomainOf`, `studioSubdomainsOn`, `platformUrl`, `isSafeRelativePath` (`lib/domain-name.ts`).
- Produces:
  - Prisma `SignInHandoff { id String @id @default(cuid()); codeHash String @unique; loginId String; activeUserId String; expiresAt DateTime; usedAt DateTime?; createdAt DateTime @default(now()) }` (no relation; rows are swept when older than a day by `issueHandoff`).
  - `HANDOFF_TTL_SECONDS = 60`; `issueHandoff(loginId: string, activeUserId: string): Promise<string>` (random 32-byte base64url code; stores its SHA-256); `redeemHandoff(code: string): Promise<{ loginId: string; activeUserId: string } | null>` (one `updateMany` setting `usedAt` where `codeHash` matches, `usedAt` is null and `expiresAt` is in the future; null otherwise).
  - `isCustomDomainHost(host: string): Promise<boolean>`: subdomains on, the host (port ignored) is neither a platform host nor a studio subdomain, and `tenantSlugForDomain(host)` finds a studio.
  - `safeHandoffReturn(next: string): Promise<string | null>`: an absolute `https:` (or `http:` outside production) URL whose host passes `tenantSlugForDomain`, with a path that passes `isSafeRelativePath`; the same URL back, else null.
  - `GET /auth/handoff?code=&next=`: `redeemHandoff` and `safeHandoffReturn` both ok → `setLoginSessionCookie(loginId, activeUserId)` then 302 to `next`; otherwise 302 to `platformUrl("/login")` and no cookie. Never a 500, never leaves the code in a log.
  - `GET /auth/sign-out?next=`: deletes the shared session cookie (and this host's); 302 to `next` when `safeHandoffReturn(next)` passes, else to `platformUrl("/")`.
  - `loginWithCredentials`, `registerClient`, `continueAsClient` set `handoffCode` (from `issueHandoff`) in their success result when the request host `isCustomDomainHost` and the session is a login session. `logoutAction()` returns `{ success, via?: string }` where `via` is `platformUrl("/auth/sign-out")` when the request host is a custom domain.
  - `handoffHref(code: string, target: string): string` in `lib/auth/handoff-client.ts`: `platformUrl("/auth/handoff")` + `?code=` + `&next=` of `window.location.origin + target`. Forms use it when a result carries `handoffCode`. Sign-out controls, when `logoutAction()` returns `via`, go to `via + "?next=" + encodeURIComponent(origin + signedOutHref(studioPath(slug, "/login")))` instead.

- [ ] **Step 1: Write the failing tests** (tier 42; for custom-domain cases set `Tenant.customDomain` on a throwaway studio, turn subdomains on with the env helpers tier 33 uses, run actions under `withHost("<domain>", ...)`, restore everything in `finally`):
  - `T42-HANDOFF-01: issue and redeem are single use and short`: `redeemHandoff(code)` returns the ids once, then null; an expired row (set `expiresAt` in the past) null; a made-up code null; only the hash is stored (`codeHash !== code`).
  - `T42-HANDOFF-02: the route signs in on the platform host and sends the person back`: `GET` with a fresh code and `next=https://<custom domain>/account` → 302 to that `next`, and the cookie jar holds the shared cookie (`SHARED_COOKIE_NAME`, `domain` = base domain) decoding to a login session; the same request again → 302 to `/login` and no cookie.
  - `T42-HANDOFF-03: next is only ever a studio's own domain`: `safeHandoffReturn` returns null for `https://evil.com/x`, `//evil.com`, `javascript:alert(1)`, a studio subdomain, a custom domain nobody owns, `https://<custom domain>/\\evil`, and a tab or newline in the path; and the route sends those to `/login` with no cookie, even with a valid code.
  - `T42-HANDOFF-04: signing in on a custom domain returns a handoff code, elsewhere none`: `loginWithCredentials` for a linked account under `withHost(customDomain)` has `handoffCode`; under `withHost("localhost:3000")` and under a studio subdomain it has none; a stand-alone account never gets one. `registerClient` and `continueAsClient` likewise.
  - `T42-SIGNOUT-01: signing out on a custom domain also clears the platform cookie`: `logoutAction()` under `withHost(customDomain)` deletes the host cookie and returns `via` ending `/auth/sign-out`; `GET /auth/sign-out?next=<custom domain url>` deletes the shared cookie (a `delete` call for `SHARED_COOKIE_NAME` with the base `domain`) and redirects to `next`; with a bad `next` it redirects to the platform home. On a subdomain `logoutAction()` returns no `via`.
  - `T42-HANDOFF-05: the forms use it`: source checks that `studio-login-form.tsx` and `client-auth-panel.tsx` call `handoffHref(` when `handoffCode` is present and that the three sign-out controls and `session-menu.tsx` honour `via`.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement** (schema and migration first: run `npx prisma migrate dev --create-only` or write the SQL by hand and confirm with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code`; then `npx prisma generate`). In route handlers read `code` and `next` from `request.nextUrl.searchParams`; never echo them back.

- [ ] **Step 4: Run tier 42, tier 33 (middleware and subdomains), `pnpm typecheck`, the whole `pnpm test:e2e`, expect PASS.**

- [ ] **Step 5: Check it in the app:** with `NEXT_PUBLIC_STUDIO_SUBDOMAINS` still off the handoff path is unused, so verify the routes directly in Playwright: issue a code through a script, open `/auth/handoff?code=…&next=<custom domain URL>` and confirm the redirect and cookie; a replay goes to `/login`.

- [ ] **Step 6: Commit; rebuild the graph**

```bash
git add prisma lib app components tests/e2e
git commit -m "feat(auth): a sign-in on a studio's own domain carries over to the platform"
graphify update .
```
