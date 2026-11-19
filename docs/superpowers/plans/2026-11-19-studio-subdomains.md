# Studio Subdomains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With subdomains switched on, every studio lives at `<slug>.<domain>` (`lumina-cine.cineflow-os.app`). No `/<slug>/` appears in its addresses, links or emails, sign-in is shared with the platform domain, and dev and staging are unchanged.

**Architecture:**
- One build-time switch (`NEXT_PUBLIC_STUDIO_SUBDOMAINS`).
- Three helpers in `lib/domain-name.ts` that every link goes through: `studioPath`, `studioUrl` and `platformUrl`.
- The middleware redirects the old forms and acts as a safety net for any link that was missed.
- The session cookie depends on the host: shared on the platform domain, host-only on a studio's own domain.

**Tech Stack:** Next.js 15 App Router (middleware on the Node runtime), TypeScript, Prisma/SQLite, and the repo's own e2e harness (`tests/e2e`, run with `npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-19-studio-subdomains-design.md`

## Global Constraints

- **The switch:** subdomain mode is on only when `process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS === "true"`. Read it inside functions (Next inlines it, and tests can toggle it), never into a module-level constant. With it off, every behaviour and every existing test stays exactly as today.
- **Cookie names:**
  - shared (platform domain, subdomain mode): `cineflow_session_shared`, with `Domain=<APP_BASE_DOMAIN>`;
  - everything else: `cineflow_session`, host-only, unchanged.
- **Reserved slugs to add:**
  - DNS names: `www`, `app`, `staging`, `mail`, `email`, `send`, `smtp`, `imap`, `pop`, `ftp`, `cdn`, `static`, `assets`, `status`, `help`, `support`, `docs`, `blog`, `dev`, `test`, `ns1`, `ns2`, `autoconfig`, `autodiscover`;
  - every top-level segment under `app/[tenantSlug]/`: `account`, `admin`, `book`, `checkout`, `forgot-password`, `login`, `my-booking`, `proposals`, `register`, `releases`, `reset-password`, `set-hud`, `vault`, `visualizer`.
- **Redirects** are 308 and keep the query string.
- **Never convert** `revalidatePath`/`revalidateTag` arguments, route-segment names, or file paths. They are internal `/<slug>/…` route paths.
- **Copy:** plain words, no jargon in anything a user sees, no `confirm()` or `alert()`.
- **Commits:** local commits on branch `feat/studio-subdomains`. Never push, and never add Co-Authored-By or "Generated with Claude" lines.
- **After code changes:** run `graphify update .`. Before claiming done, rebuild and check dev Docker: `docker compose up -d --build app`.

## Review Focus

1. **A studio page links to a platform page** ("Powered by CineFlow OS", "Create your studio"). With subdomains on, the link must leave the subdomain (`platformUrl`), not open the studio's own `/`. Task 5 adds a scan for `href="/"` and `"/create-studio"` in studio components.
2. **A client follows an email link while signed in on a studio's own domain.** The email points at the subdomain, so they must sign in there. Accepted by design, but it must not loop: Task 3's sign-in-target test covers a clean `callbackUrl`.
3. **`signInTarget` with a callback from another studio, or an absolute or protocol-relative one,** must still be refused in subdomain mode. Task 3's tests include `//evil.com`, `https://evil.com/admin` and `/../x`.
4. **Signing out on a subdomain** must clear the shared cookie (delete with the domain). Task 2 tests the delete call's options.
5. **A request to a studio subdomain whose studio doesn't exist** must show the normal studio-not-found page, not loop through redirects. Task 3 tests that `nope.<domain>/book` doesn't redirect.

---

### Task 1: The switch, the helpers and the reserved names

**Files:**
- Modify: `lib/domain-name.ts`, `lib/validations/onboarding.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example` (if present), `.env.staging.example`, `.env.production.example`
- Create: `tests/e2e/tier33-studio-subdomains.test.ts` (export `runTier33StudioSubdomainsTests`; register it in `tests/e2e/runner.ts` after Tier 32)

**Interfaces:**
- Produces, in `lib/domain-name.ts`:
  - `studioSubdomainsOn(): boolean`
  - `studioPath(slug: string, path?: string): string`, where `path` defaults to `"/"` and always starts with `/`
  - `studioUrl(slug: string, path?: string): string`
  - `platformUrl(path?: string): string`
  - `isPlatformHost(host: string): boolean`: true for the base domain and its `www.` and `app.` forms, ignoring the port
  - `studioSubdomainOf(host: string): string | null`: the slug for `<slug>.<APP_BASE_DOMAIN>`, else null. It wraps the existing `platformSubdomainSlug`.

- [ ] **Step 1: Write the failing tests** (T33-HELP-01..03). Use a `withSubdomains(on, fn)` helper that sets and restores `process.env.NEXT_PUBLIC_STUDIO_SUBDOMAINS`. Let `B` be `APP_BASE_DOMAIN` and `U` be `NEXT_PUBLIC_APP_URL` as the test process has them.
  - **Off:**
    - `studioPath("lumina-cine","/book?x=1#a") === "/lumina-cine/book?x=1#a"`
    - `studioPath("lumina-cine") === "/lumina-cine"`
    - `studioUrl("lumina-cine","/book") === U+"/lumina-cine/book"`
    - `platformUrl("/create-studio") === "/create-studio"`
  - **On:**
    - `studioPath("lumina-cine","/book?x=1#a") === "/book?x=1#a"`
    - `studioPath("lumina-cine") === "/"`
    - `studioUrl("lumina-cine","/book")` is U's scheme + `//lumina-cine.` + U's host (with port) + `/book`
    - `platformUrl("/create-studio") === U+"/create-studio"`
  - `studioSubdomainOf("lumina-cine."+B+":3000") === "lumina-cine"`
  - `studioSubdomainOf("www."+B) === null` and `studioSubdomainOf("app."+B) === null`
  - `isPlatformHost("www."+B)`, `isPlatformHost("app."+B)` and `isPlatformHost(B+":3000")` are true; `isPlatformHost("studio.com")` is false.
  - Every reserved name in Global Constraints is in `RESERVED_SLUGS`. The onboarding slug check refuses `staging`, `book` and `www` with the existing reserved message.
  - **Build wiring:**
    - the Dockerfile declares `ARG NEXT_PUBLIC_STUDIO_SUBDOMAINS=false` and passes it to `ENV`;
    - the compose app build args include `NEXT_PUBLIC_STUDIO_SUBDOMAINS: ${NEXT_PUBLIC_STUDIO_SUBDOMAINS:-false}`;
    - `.env.production.example` has `NEXT_PUBLIC_STUDIO_SUBDOMAINS=true`;
    - `.env.staging.example` has it `false` or absent.
- [ ] **Step 2: Run and see them fail.** Run: `DATABASE_URL=file:./test.db npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t33-only.ts`. Make the one-tier runner like `.t32-only.ts` and add it to `.git/info/exclude`. Expected: an import error for `studioPath`.
- [ ] **Step 3: Implement the helpers and the reserved names, and wire the build arg.** `studioUrl` with subdomains on builds from `new URL(NEXT_PUBLIC_APP_URL)`: protocol, `//`, slug, `.`, host with port, then the path.
- [ ] **Step 4: Run Tier 33.** Expected: PASS. Also run `npx tsc --noEmit`, which should be clean.
- [ ] **Step 5: Commit:** `feat(domains): studio subdomain switch, address helpers, reserved names`

### Task 2: A session cookie per host

**Files:**
- Modify: `lib/auth/token.ts`, `lib/auth/session.ts`, `middleware.ts` (`readSession` only), `tests/e2e/mocks/session.ts` (if the jar needs the name)
- Test: `tests/e2e/tier33-studio-subdomains.test.ts`

**Interfaces:**
- Consumes: `studioSubdomainsOn`, `isPlatformHost` and `studioSubdomainOf` from Task 1.
- Produces, in `lib/auth/token.ts`:
  - `SHARED_COOKIE_NAME = "cineflow_session_shared"`; `COOKIE_NAME` stays `"cineflow_session"`;
  - `sessionCookieFor(host: string): { name: string; domain?: string }`, which gives the shared name and domain only when subdomains are on and the host is a platform host or a studio subdomain;
  - `requestHost(): Promise<string>`: `x-forwarded-host`, else `host`, from `headers()`.
- `setSessionCookie`, `getSession` and `logoutAction` all use `sessionCookieFor(await requestHost())`. The middleware's `readSession` uses `sessionCookieFor(<request host>)`.

- [ ] **Step 1: Write the failing tests** (T33-COOKIE-01..02).
  - **Off:**
    - `sessionCookieFor("lumina-cine."+B)` is `{name:"cineflow_session"}`, with no domain;
    - `sessionCookieFor(B)` is the same;
    - `sessionCookieFor("studio.com")` is the same.
  - **On:**
    - for `B`, `"lumina-cine."+B+":443"` and `"www."+B`, it's `{name:"cineflow_session_shared", domain:B}`;
    - for `"studio.com"`, it's `{name:"cineflow_session"}`.
  - **On, with the existing `withRequest` / `withSession` mocks:**
    - a request with host `"lumina-cine."+B` carrying a valid token under `cineflow_session_shared` is read by `getSession()`;
    - the same token under `cineflow_session` on that host is not;
    - on host `studio.com`, the reverse.
  - **Middleware, on:** a request to `/admin` on host `"lumina-cine."+B`, carrying the studio owner's token under `cineflow_session_shared`, isn't sent to sign-in. Under `cineflow_session`, it is.
  - **Logout, on, host `"lumina-cine."+B`:** the cookie store's `delete` is called with `{ name: "cineflow_session_shared", domain: B, path: "/" }`. Extend the mock store to record delete arguments if it doesn't.
- [ ] **Step 2: Run them and see them fail** (Tier 33 runner). Expected: `sessionCookieFor` isn't exported.
- [ ] **Step 3: Implement.** `setSessionCookie` keeps every existing option and adds `domain` when given. `logoutAction` deletes with `{ name, domain, path: "/" }`.
- [ ] **Step 4: Run Tier 33, then `npm run test:e2e`.** Expected: PASS, and every existing test is unchanged (subdomains off).
- [ ] **Step 5: Commit:** `feat(auth): share sign-in across the platform domain and studio subdomains`

### Task 3: Middleware redirects and the sign-in target

**Files:**
- Modify: `middleware.ts`, `lib/tenant-domain.ts`, `lib/auth/sign-in-target.ts`
- Test: `tests/e2e/tier33-studio-subdomains.test.ts`, calling `middleware(new NextRequest(url, { headers: { host } }))` as `tests/e2e/tier1/02-saas-showcase.test.ts` does

**Interfaces:**
- Consumes: Task 1's helpers.
- Produces:
  - `studioExists(slug: string): Promise<boolean>` in `lib/tenant-domain.ts`, cached like `tenantSlugForDomain`, with the same cache lifetime;
  - `signInTarget` keeps its signature; with subdomains on, studio paths are clean (`/admin`, `/account`, `/admin/schedule`).

- [ ] **Step 1: Write the failing tests** (T33-MW-01..06). All with subdomains on, using seeded studios `lumina-cine` and `apex-media`.
  - **MW-01:** `www.`+B`/pricing?a=1` and `app.`+B`/x` give 308s to the same path and query on `B`.
  - **MW-02:** `B/lumina-cine/book?d=1` gives a 308 to `<scheme>//lumina-cine.`+B`/book?d=1`; `B/lumina-cine` gives a 308 to `lumina-cine.`+B`/`; `B/no-such-studio/book` doesn't redirect; `B/create-studio` doesn't redirect.
  - **MW-03:** on `lumina-cine.`+B, `/lumina-cine/book` gives a 308 to `/book` and `/lumina-cine` gives a 308 to `/`; `/book` is rewritten to `/lumina-cine/book` (the `x-middleware-rewrite` header); `/lumina-cinema-tips` isn't treated as a prefix (it's rewritten to `/lumina-cine/lumina-cinema-tips`, not stripped).
  - **MW-04:** on `lumina-cine.`+B with no session, `/admin/invoices?x=1` redirects to `/login?callbackUrl=%2Fadmin%2Finvoices%3Fx%3D1`. With a client session, it redirects to `/account`. On a studio's own domain (save a custom domain on a test tenant as `tier1/02` does), the same holds.
  - **MW-05:** `nope.`+B`/book` isn't redirected (the rewrite to `/nope/book` gives the not-found page); `/api/health` and `/uploads/x.png` on any host pass through untouched.
  - **MW-06 (`signInTarget`, on):**
    - with no callback, a staff role gives `/admin/schedule`, an owner `/admin`, a client `/account`;
    - a callback of `/admin/invoices/1` is kept;
    - `//evil.com`, `https://evil.com/admin`, `/../admin` and `` (empty) are refused and give the default;
    - a client with `/admin/x` gets `/account`.
  - **Off:** a test asserts the old outputs (`/lumina-cine/admin`) are unchanged.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement**, in this order, all only when subdomains are on and after the `/api`, `/_next`, `/uploads` and dotted-path bypass:
  1. `www.`/`app.` gives a 308 to the base domain;
  2. on the base domain, a first segment where `studioExists` is true gives a 308 to `studioUrl(slug, rest + search)`;
  3. on a studio subdomain or a studio's own domain, a `/<slug>` or `/<slug>/…` prefix (exact segment) gives a 308 to the stripped path;
  4. the existing admin guard builds `loginUrl` from `studioPath(slug, "/login")` and a `callbackUrl` that is the clean path in subdomain mode;
  5. the existing rewrite.

  Fix the existing `pathname.startsWith('/' + slug)` double-prefix check to compare whole segments. `signInTarget` uses `studioPath` for its root and defaults. Its same-studio test in subdomain mode is "starts with a single `/`, no `..` segment, not `//`".
- [ ] **Step 4: Run Tier 33, then the full suite.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(domains): redirect old addresses to studio subdomains; clean sign-in paths`

### Task 4: Server-side links: emails, payments and redirects

**Files:**
- Modify every `lib/**` and `app/**/route.ts` / server-action file that builds a studio link. Start from:

  ```
  grep -rEn '`/\$\{[^}]*[sS]lug[^}]*\}' lib app --include=*.ts | grep -v 'revalidate\(Path\|Tag\)('
  ```

  Known so far: `lib/actions/admin-*.ts`, `checkout.ts`, `vault.ts`, `my-booking.ts`, `proposals.ts`, `logistics.ts`, `onboarding.ts`, `lib/auth/password-reset.ts`, `lib/auth/invite.ts`, `lib/bookings/*.ts`, `lib/manual/topics.ts`.
- Test: `tests/e2e/tier33-studio-subdomains.test.ts`

**Interfaces:**
- Consumes: `studioPath`, `studioUrl` and `platformUrl`.
- Produces: `onboardStudio` returns `redirectUrl: studioUrl(slug, "/admin")` (absolute when on).

**Rules:**
- `${NEXT_PUBLIC_APP_URL}/${slug}…` becomes `studioUrl(slug, "…")`.
- A server `redirect('/${slug}…')` becomes `redirect(studioPath(slug, "…"))`.
- Leave `revalidatePath` and `revalidateTag` alone.
- Toyyibpay's `callbackUrl` stays `${NEXT_PUBLIC_APP_URL}/api/...`; its `returnUrl` becomes `studioUrl`.

- [ ] **Step 1: Write the failing tests** (T33-LINK-01..02).
  - **LINK-01:** with subdomains on and the existing capturing SMTP transport (as Tier 31 does):
    - an invoice email (`sendInvoice` path), a password-reset email, a team invite and a booking confirmation each contain `lumina-cine.`+B and no `/lumina-cine/`;
    - with subdomains off, they still contain U`/lumina-cine/`.
  - **LINK-02:** a source scan over `lib/` and `app/**/route.ts`, `app/**/actions*.ts` finds no template literal starting `` `/${…slug…}`` or `` `${…APP_URL…}/${…slug…}`` outside `revalidatePath(`/`revalidateTag(` lines and `lib/domain-name.ts`. For a multi-line `revalidatePath(`, treat the next line as allowed too.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Convert every match by the rules.**
- [ ] **Step 4: Run Tier 33 and the full suite** with subdomains off. Expected: PASS, unchanged.
- [ ] **Step 5: Commit:** `feat(domains): emails and server redirects use the studio's address`

### Task 5: Pages and components

**Files:**
- Modify every `app/**/*.tsx` and `components/**/*.{ts,tsx}` match of the same grep, including:
  - `base`-variable patterns (`admin-nav-items.ts`, `my-schedule.tsx`, `clients/[clientId]/page.tsx`);
  - `pathname.startsWith` comparisons;
  - `router.push` and `window.location` calls;
  - `app/(saas)/create-studio/page.tsx`: the post-sign-up navigation becomes `window.location.href = res.redirectUrl` (cross-origin when on), and the address preview shows `<slug>.<APP_DOMAIN>` when on;
  - `components/super-admin/super-admin-view.tsx`: studio links become `studioUrl`.
- Platform links from studio pages (`href="/"`, `"/create-studio"`, `"/super-admin…"` inside `app/[tenantSlug]/**` or studio components) become `platformUrl(...)`.
- Test: `tests/e2e/tier33-studio-subdomains.test.ts`

**Interfaces:**
- Consumes: the Task 1 helpers and Task 4's `redirectUrl`.

- [ ] **Step 1: Write the failing tests** (T33-PAGE-01..03).
  - **PAGE-01:** extend LINK-02's scan to all of `app/` and `components/`, with the same allowances. The `[tenantSlug]` folder name is not a template literal, so it doesn't match.
  - **PAGE-02:** with subdomains on, render (as functions, as Tier 23 and Tier 31 do) the studio home page, the admin layout, the account layout and the showcase nav/footer for `lumina-cine`. Every internal `href` starts with `/` and not `/lumina-cine`, and any link to the platform home or sign-up is absolute to U. With subdomains off, the same hrefs start with `/lumina-cine`.
  - **PAGE-03:** a scan of `app/[tenantSlug]/**` and the studio components (`components/{showcase,account,admin,booking,checkout,vault,auth}`) for `href="/"` or `href="/create-studio"` literals finds none.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Convert** by the Task 4 rules plus the platform-link rule.
- [ ] **Step 4: Run Tier 33, the full suite, and `npx tsc --noEmit`.** Expected: all PASS and clean.
- [ ] **Step 5: Commit:** `feat(domains): studio pages link within their own address`

### Task 6: Search engines per host

**Files:**
- Modify: `app/sitemap.ts`, `app/robots.ts`
- Test: `tests/e2e/tier33-studio-subdomains.test.ts`

**Interfaces:**
- Consumes: `requestHost()` (Task 2) and `studioSubdomainOf`, `studioExists` and `studioUrl`.

- [ ] **Step 1: Write the failing tests** (T33-SEO-01..02). Call both functions under `withRequest` with different hosts.
  - **Off:** output is identical to today (snapshot the URLs).
  - **On, host `B`:** the sitemap lists only `U` and `U/create-studio`; robots allows `/` and disallows `/api/` and `/super-admin`, with sitemap `U/sitemap.xml`.
  - **On, host `lumina-cine.`+B:**
    - the sitemap lists `studioUrl("lumina-cine", "/")`, `"/book"` and `"/visualizer"` only;
    - robots disallows `/admin`, `/checkout`, `/vault`, `/account`, `/proposals`, `/set-hud` and `/releases` (each with its `/*` form);
    - robots points at `studioUrl("lumina-cine", "/sitemap.xml")`.
  - **Staging:** still disallows everything.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run Tier 33.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(domains): sitemap and robots for each studio's address`

### Task 7: Docs, settings, and a real run with subdomains on

**Files:**
- Modify: `README.md` ("Staging and production", setup steps 4, 7 and 9, "Moving to a new PC" and every `app.<domain>`), `.env.production.example`, `.env.staging.example`, `lib/production-settings.ts`

**Docs and settings:**
- **README:**
  - production is `https://<domain>` and studios are `https://<slug>.<domain>`;
  - production's tunnel gets two public hostnames, `<domain>` and `*.<domain>`, with the manual wildcard DNS fallback;
  - the super-admin sign-in is `https://<domain>/super-admin/login`;
  - UptimeRobot watches `https://<domain>/api/health`;
  - staging stays `staging.<domain>`, with subdomains off.
- **`.env.production.example`:** `NEXT_PUBLIC_APP_URL=https://example.com`, `NEXT_PUBLIC_APP_DOMAIN=example.com`, `NEXT_PUBLIC_STUDIO_SUBDOMAINS=true`, and a Resend sender example `CineFlow OS <noreply@example.com>`.
- **`productionSettingProblems`:** add "`NEXT_PUBLIC_STUDIO_SUBDOMAINS` is on but `NEXT_PUBLIC_APP_DOMAIN` isn't the host of `NEXT_PUBLIC_APP_URL`", and a Tier 33 test for it (T33-ENV-01).

**The real run:**
- Build a throwaway copy in `C:\Dev-System\rh-subcheck` (from `git ls-files -co --exclude-standard`), with:
  - `COMPOSE_PROJECT_NAME=rh-subcheck`, `APP_ENV=development`, `APP_PORT=3300`;
  - `NEXT_PUBLIC_APP_URL=http://cineflow.localhost:3300`, `NEXT_PUBLIC_APP_DOMAIN=cineflow.localhost:3300`, `NEXT_PUBLIC_STUDIO_SUBDOMAINS=true`;
  - SMTP to `host.docker.internal:1025`.

  Chromium resolves `*.localhost` to this computer. If the browser refuses the shared cookie on `.cineflow.localhost`, stop and rule in the ledger before trying anything else.
- With the Playwright MCP browser, desktop and 375px:
  1. `cineflow.localhost:3300` shows the platform;
  2. `cineflow.localhost:3300/lumina-cine/book` lands on `lumina-cine.cineflow.localhost:3300/book`;
  3. sign in as `alex@luminacine.com` on the studio's `/login`, land on `/admin`, and click through 8 or more admin and public pages; the address never shows `/lumina-cine`;
  4. create a new studio on the platform's `/create-studio` and land signed in on `<new-slug>.cineflow.localhost:3300/admin`;
  5. a client booking email in Mailpit (`localhost:8025`) links to the subdomain and opens it;
  6. sign out clears the session on both hosts;
  7. the console shows no errors.
- **Clean up:** the containers, volumes, images, the folder and the test mails, deleting only the run's own mails, by ID.
- [ ] Steps: write ENV-01 failing, implement, then the docs; run the full suite, `npx tsc --noEmit` and `graphify update .`; do the real run; clean up. Rebuild dev Docker and check `http://localhost:3000` still works path-style. Commit: `docs(domains): set up cineflow-os.app with studio subdomains`.
