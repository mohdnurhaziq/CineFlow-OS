# Platform Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cineflow-os.my landing page with a cinematic, honest page (video hero, six-chapter client journey with real screens, real pricing, FAQ, invite form) and give the platform owner an invite-request inbox.

**Architecture:** Copy and structure live as typed data in `lib/landing/*` (so tests can scan every claim and badges derive from `PLANS`); server components render sections; two small client islands handle motion (GSAP + ScrollTrigger + Lenis, page-only, off under reduced motion) and the invite form. Invite requests are a new tenant-free Prisma model with a public rate-limited action and a super-admin list.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4, Prisma 6 (SQLite), GSAP 3 + ScrollTrigger, Lenis, next/font (Instrument Serif), e2e harness (`tests/e2e`, new Tier 39).

**Spec:** `docs/superpowers/specs/2026-11-24-landing-page-redesign-design.md`

## Global Constraints

- Every sentence on the page maps to a row of the spec's claims table; anything else does not ship. If a claim is only partly true, reword it to what the code does; drop a chapter if nothing true is left.
- Banned anywhere on the landing page, nav or footer: `< 60s`, `60s`, `solar`, `CRUD`, `$`, `USD`, `Starter`, `Pro tier`, `MRR`, `telemetry`, `PRODUCTION MANAGEMENT SYSTEM`, any link to `/super-admin`, and (in production) links to `/lumina-cine` or `/apex-media`.
- Prices, plan names, team sizes and plan badges come from `PLANS` / `FEATURE_LABEL` / `cheapestPlanWith` in `lib/billing/plans.ts`. Never hard-code RM 99/249/599 in components.
- Plans: Solo RM 99, Studio RM 249 (5 team), Production RM 599 (unlimited); 14-day free trial (`TRIAL_DAYS`); payment by bank transfer or DuitNow; 7-day grace then read-only; downgrades delete nothing.
- Main action by sign-up status (`studioSignupStatus()`, read per request; the page is dynamic):
  - `open && !needsCode` → **TRIAL**: "Start your 14-day free trial" → `/create-studio`; no invite form, no code link, no invite-only FAQ entry.
  - `needsCode` → **INVITE_WITH_CODE**: "Request an invite" (scrolls to `#invite`) + "Have an invite code? Create your studio" → `/create-studio`.
  - `!open` → **INVITE_ONLY**: "Request an invite" only (sign-up is closed, so no link to `/create-studio`).
- Public contact email: `publicContactEmail()` = env `PLATFORM_CONTACT_EMAIL` or `hello@cineflow-os.my`.
- Brand: background `#09090b`, amber accent, Geist / Geist Mono; display serif Instrument Serif (via `next/font/google`, loaded in `app/(saas)/layout.tsx` as `--font-display`).
- Motion JS (gsap, lenis) is imported only from `components/landing/*`; with `prefers-reduced-motion: reduce` no smooth scroll, no pinning, no reveals. Content is never hidden by CSS before JS runs (initial states are set by JS only).
- Videos: `public/landing/video/<slot>-16x9.mp4` (+ `hero-9x16.mp4`), muted, `playsInline`, `loop`, poster first, play only when on screen, never under reduced motion or Save-Data. A missing file means poster only.
- Phone (375px): no horizontal scroll, tap targets ≥ 44px, one `h1`, visible focus, AA contrast. Mobile LCP is the server-rendered headline / hero poster.
- Memory rules: rebuild Docker (`docker compose build app && docker compose up -d app`) before calling UI work done; check at desktop and 375px.

## Review Focus

1. **JS slow or failing:** every section's text, the prices and the invite form are visible and usable before/without hydration (no `opacity:0` in CSS awaiting GSAP; the form posts via a server action). Tested in Task 5 (T39-PAGE-04) and Task 2 (form uses `action=`).
2. **Reduced motion / Save-Data on a phone:** no smooth scroll, no pin, no video download; everything readable. Tested in Task 4 (T39-MEDIA-02) and the Task 6 browser check.
3. **Invite form abuse and odd input:** double submit, the same email twice, 2,000-character message, emoji / non-Latin names, honeypot filled, 6th request from one IP in 10 minutes. Expected: one saved row per real submit, duplicates within 24 h are accepted silently without a second email, long text refused with a plain message, Unicode kept, honeypot → fake success and nothing saved, rate limit → plain refusal. Tested in Task 2 (T39-INVITE-01..04).
4. **Nav anchors from other `(saas)` pages** (`/create-studio`, `/super-admin`): "Pricing" goes to `/#pricing`, not a dead `#pricing`; anchors land below the sticky nav. Tested in Task 5 (T39-PAGE-05).
5. **Sign-up closed in production with no code:** no link anywhere leads to the closed `/create-studio` page. Tested in Task 5 (T39-PAGE-03).

---

## File map

- `lib/landing/mode.ts` — `LandingMode`, `landingMode(status)`.
- `lib/landing/contact.ts` — `publicContactEmail(env?)`.
- `lib/landing/content.ts` — `CHAPTERS`, `EXTRAS`, `faqItems(mode, email)`, `BANNED_PHRASES`, `planBadge(feature)`.
- `lib/landing/media.ts` — `landingVideo(slot)` (server only; checks the file exists).
- `prisma/schema.prisma` + migration `*_invite_requests` — `InviteRequest`.
- `lib/actions/invite-requests.ts` — `requestInvite`, `listInviteRequests`, `setInviteRequestHandled`.
- `components/landing/` — `landing-motion.tsx` (client), `loop-video.tsx` (client), `device-frame.tsx`, `hero.tsx`, `journey.tsx`, `own-website.tsx`, `extras.tsx`, `pricing.tsx`, `faq.tsx`, `invite-section.tsx`, `invite-form.tsx` (client).
- `components/saas/saas-navbar.tsx`, `components/saas/saas-footer.tsx` — rewritten.
- `components/super-admin/invite-requests-panel.tsx` — the inbox.
- `app/(saas)/page.tsx`, `app/(saas)/layout.tsx`, `app/(saas)/super-admin/page.tsx`.
- Deleted: `components/saas/{saas-hero,studio-switcher,features-grid,interactive-teasers,pricing-tiers}.tsx`.
- `public/landing/shots/*.webp`, `public/landing/posters/*.jpg`, `public/landing/og.jpg`, `public/landing/video/README.md`.
- `tests/e2e/tier39-landing-page.test.ts` (+ `runner.ts`), `tests/e2e/tier31-go-live.test.ts`, Tier 26 access table rows.

---

### Task 1: Landing data — mode, contact, content

**Files:**
- Create: `lib/landing/mode.ts`, `lib/landing/contact.ts`, `lib/landing/content.ts`
- Create: `tests/e2e/tier39-landing-page.test.ts`; register `runTier39LandingPageTests` in `tests/e2e/runner.ts` after Tier 38; create git-excluded `tests/e2e/.t39-only.ts` (same shape as `.t38-only.ts`)

**Interfaces:**
- Produces:
  - `type LandingMode = "TRIAL" | "INVITE_WITH_CODE" | "INVITE_ONLY"`; `landingMode(s: { open: boolean; needsCode: boolean }): LandingMode`
  - `publicContactEmail(env?: Record<string, string | undefined>): string`
  - `type Chapter = { n: string; key: "book"|"pay"|"sign"|"shoot"|"deliver"|"print"; title: string; body: string; feature: PlanFeature | null; shot: { desktop: string; phone?: string; alt: string }; video?: "shoot"|"deliver"|"print" }`; `CHAPTERS: Chapter[]` (6, in that order, `n` = "01".."06")
  - `planBadge(feature: PlanFeature | null): string | null` → `"<Plan name> plan"` from `cheapestPlanWith`, null when `feature` is null
  - `EXTRAS: { title: string; body: string; feature: PlanFeature | null }[]` (team roles and access, client portal, gear and kits, email reminders, works on phone)
  - `faqItems(mode: LandingMode, email: string): { q: string; a: string }[]`
  - `BANNED_PHRASES: (string | RegExp)[]` (the Global Constraints list)

- [ ] **Step 1: Write the failing tests** (Tier 39, suite "Landing page")

```ts
T39-MODE-01: landingMode({open:true,needsCode:false})==="TRIAL"; ({open:true,needsCode:true})==="INVITE_WITH_CODE"; ({open:false,needsCode:false})==="INVITE_ONLY"
T39-CONTACT-01: publicContactEmail({})==="hello@cineflow-os.my"; publicContactEmail({PLATFORM_CONTACT_EMAIL:" team@x.my "})==="team@x.my"
T39-CONTENT-01: CHAPTERS.map(c=>c.key) deep-equals ["book","pay","sign","shoot","deliver","print"];
  planBadge for sign/shoot === "Studio plan", print === "Production plan", book/pay/deliver === null
  (computed from cheapestPlanWith, so assert equality with `${PLANS[cheapestPlanWith(f)].name} plan`)
T39-CONTENT-02: no BANNED_PHRASES match JSON.stringify([CHAPTERS, EXTRAS, faqItems(m,"hello@cineflow-os.my") for every mode])
T39-CONTENT-03: faqItems("TRIAL",e) has no item mentioning "invite"; faqItems("INVITE_WITH_CODE",e) has one; every mode's FAQ contains e and the 7-day grace and "nothing is deleted"
```

- [ ] **Step 2: Run** `DATABASE_URL=file:./test.db npx tsx --import ./tests/e2e/mocks/register.mjs tests/e2e/.t39-only.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three modules. Copy per the spec's chapter list and claims table; before writing each chapter's copy, confirm the claim in code (`holdBookingSlot`, checkout slip upload + verification, `acceptProposal` with add-ons, call sheets + calendar invites, vault unlock on paid invoice, visualizer + `placePrintOrder`). Chapter `shot` paths point at `/landing/shots/<key>-desktop.webp` (+ `-phone.webp` for book and deliver); `video` set for shoot/deliver/print.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): content, mode and contact as data`

### Task 2: Invite requests — model and actions

**Files:**
- Modify: `prisma/schema.prisma`; Create migration via `npx prisma migrate dev --name invite_requests --create-only` then apply
- Create: `lib/actions/invite-requests.ts`
- Modify: `tests/e2e/tier39-landing-page.test.ts`; Tier 26 access table (add rows for the three actions: `requestInvite` public, the other two super-admin only — the Tier 26 failure message names the row to add)

**Interfaces:**
- Produces:
  - model `InviteRequest { id String @id @default(cuid()); name String; studioName String; email String; phone String?; kind String /* PHOTO|VIDEO|BOTH */; message String?; createdAt DateTime @default(now()); handledAt DateTime?; @@index([createdAt]) @@index([email]) }`
  - `requestInvite(input: { name; studioName; email; phone?; kind; message?; website? /* honeypot */ }): Promise<{ success: true } | { success: false; error: "INVALID"|"RATE_LIMITED"|"FAILED"; message: string }>` — `"use server"`, no session needed
  - `listInviteRequests(): Promise<InviteRequestRow[]>` (newest first, max 200, dates as ISO strings) — `requireSuperAdmin()`
  - `setInviteRequestHandled(input: { id: string; handled: boolean }): Promise<{ success: boolean; message?: string }>` — `requireSuperAdmin()`
- Rules: zod limits name/studioName 1–100, email valid ≤ 200, phone ≤ 30, message ≤ 1000; trim; Unicode kept. Honeypot `website` non-empty → return `{success:true}` and save nothing. Rate limit `isRateLimited(\`invite:${ip}\`, 5)` with `requestIp()`. Same email within 24 h → return success, no new row, no email. Save first, then email every `SUPER_ADMIN` with `deactivatedAt: null` via `sendNotification({event:"STUDIO_UPDATE", studioName:"CineFlow OS", studioSlug:"", clientName, clientEmail, headline:"New invite request: <studioName>", message:"<name> (<email>, <kind>) …", linkUrl: platform URL + "/super-admin", linkLabel:"Open invite requests"}, "EMAIL")`, each wrapped so a failure is logged and never thrown.

- [ ] **Step 1: Write the failing tests**

```ts
T39-INVITE-01: valid request → success, one row with the Unicode name "Siti Nurhaliza 🎬 张伟" kept; a capturing SMTP transport (copy Tier 38's withInbox) received one mail per active super-admin whose subject contains the studio name
T39-INVITE-02: message of 1001 chars → {success:false,error:"INVALID"} with a plain message; bad email → INVALID; honeypot "website":"x" → {success:true} and no row
T39-INVITE-03: same email again within 24 h → success, still one row, no second mail; 6th request from the same mocked IP within the window → RATE_LIMITED (use distinct emails)
T39-INVITE-04: SMTP throws → still {success:true} and the row exists
T39-INVITE-05: listInviteRequests / setInviteRequestHandled as a studio owner → refused (throws or success:false); as super-admin → lists newest first, toggling sets/clears handledAt
```

- [ ] **Step 2: Run** Tier 39 — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** schema, migration, actions as above. Run `npx prisma generate`.
- [ ] **Step 4: Run** Tier 39 and Tier 26 (`npm run test:e2e` filtered or the full suite) — Expected: Tier 39 PASS; Tier 26 has no new failures (only the two pre-existing rows from other work, if still present).
- [ ] **Step 5: Commit** `feat(landing): invite requests saved and emailed to the platform owner`

### Task 3: Super-admin invite inbox

**Files:**
- Create: `components/super-admin/invite-requests-panel.tsx` (client)
- Modify: `app/(saas)/super-admin/page.tsx` (load `listInviteRequests()` alongside metrics), `components/super-admin/super-admin-view.tsx` (render the panel below the studios table; prop `invites: InviteRequestRow[]`)

**Interfaces:**
- Consumes: `listInviteRequests`, `setInviteRequestHandled`, `InviteRequestRow` from Task 2.
- Produces: `InviteRequestsPanel({ invites }: { invites: InviteRequestRow[] })` — heading "Invite requests" with an open count; rows show name, studio, mailto link, phone (tel link), kind, message, date (Malaysia time); "Mark handled" / "Reopen" button (plain busy flag + `router.refresh()`, same pattern as `manage-studio-panel.tsx`); handled rows greyed and listed after open ones; empty state "No invite requests yet."

- [ ] **Step 1: Write the failing test** `T39-INBOX-01`: render `SuperAdminView` (via `createElement`, like T38-CONSOLE-01) with one open and one handled invite → markup contains "Invite requests", the open studio name, a `mailto:` link, "Mark handled" and "Reopen".
- [ ] **Step 2: Run** Tier 39 — Expected: FAIL.
- [ ] **Step 3: Implement** the panel and wiring; phone layout is a stacked list (no table).
- [ ] **Step 4: Run** Tier 39 and Tier 38 — Expected: PASS.
- [ ] **Step 5: Commit** `feat(super-admin): invite requests inbox`

### Task 4: Motion, video and frames

**Files:**
- `npm install gsap lenis` (exact versions pinned in package.json)
- Create: `lib/landing/media.ts`, `components/landing/landing-motion.tsx`, `components/landing/loop-video.tsx`, `components/landing/device-frame.tsx`, `public/landing/video/README.md` (the expected file names, sizes and the Appendix prompts' slot names)
- Modify: `app/(saas)/layout.tsx` (load Instrument Serif as `--font-display`, weights 400 + italic), `app/globals.css` (`--font-display` token if the theme needs it)

**Interfaces:**
- Produces:
  - `landingVideo(slot: "hero"|"shoot"|"deliver"|"print"): { mp4: string | null; mp4Portrait: string | null; poster: string }` — `mp4` only when `public/landing/video/<slot>-16x9.mp4` exists (`fs.existsSync`), `mp4Portrait` only for hero when `hero-9x16.mp4` exists; `poster` = `/landing/posters/<slot>.jpg`
  - `LoopVideo({ mp4, mp4Portrait, poster, alt, priority? })` — renders `<img>` poster always (priority → `fetchPriority="high"`); mounts `<video muted playsInline loop preload="none">` only on the client when `mp4` is set, not reduced motion, not `navigator.connection?.saveData`; plays/pauses with IntersectionObserver; `<source media="(max-width: 640px)">` for portrait
  - `LandingMotion({ children })` — client wrapper: starts Lenis + ScrollTrigger (`data-reveal` elements fade/rise by line, `data-parallax` drift, `data-pin` pin on ≥1024px only); does nothing under reduced motion; cleans up on unmount; anchors (`a[href^="#"]`, `a[href^="/#"]` on `/`) scroll via Lenis with an offset equal to the nav height
  - `DeviceFrame({ kind: "browser"|"phone", children, url? })` — pure CSS frame (no images)

- [ ] **Step 1: Write the failing tests**

```ts
T39-MEDIA-01: with no files in public/landing/video, landingVideo("hero") === { mp4:null, mp4Portrait:null, poster:"/landing/posters/hero.jpg" };
  after writing a temp hero-16x9.mp4 (deleted in finally), mp4 === "/landing/video/hero-16x9.mp4"
T39-MEDIA-02: renderToStaticMarkup(LoopVideo({ mp4:"/x.mp4", poster:"/p.jpg", alt:"a" })) contains <img with src="/p.jpg" and contains no "<video" (video only mounts on the client)
T39-MEDIA-03: source scan — "gsap" and "lenis" are imported only by files under components/landing/
```

- [ ] **Step 2: Run** Tier 39 — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** Tier 39, `npx tsc --noEmit`, `npx eslint components/landing lib/landing` — Expected: PASS / clean.
- [ ] **Step 5: Commit** `feat(landing): motion, looping video and device frames`

### Task 5: The page

**Files:**
- Create: `components/landing/{hero,journey,own-website,extras,pricing,faq,invite-section,invite-form}.tsx`
- Rewrite: `app/(saas)/page.tsx` (`export const dynamic = "force-dynamic"`; reads `studioSignupStatus()`, `landingMode`, `publicContactEmail()`, `landingVideo(...)`; new `metadata` title/description/openGraph image `/landing/og.jpg`), `components/saas/saas-navbar.tsx`, `components/saas/saas-footer.tsx`, `app/(saas)/layout.tsx` (pass `mode` and `email` to nav/footer)
- Delete: `components/saas/{saas-hero,studio-switcher,features-grid,interactive-teasers,pricing-tiers}.tsx`
- Modify: `tests/e2e/tier31-go-live.test.ts` (T31-DEMO-01: drop StudioSwitcher/SaasHero checks; assert production nav/footer/page have no `/super-admin`, `/lumina-cine`, `/apex-media` links, and dev may still show the console link only in the footer if you keep it — simplest: no console link anywhere)

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:
  - `SaasNavbar({ mode, onLanding }: { mode: LandingMode; onLanding: boolean })` — links How it works / Pricing / FAQ as `#how|#pricing|#faq` when `onLanding`, else `/#how|/#pricing|/#faq`; main button per mode (TRIAL → `/create-studio` "Start free trial"; else "Request an invite" → `#invite` / `/#invite`); phone menu is a `<details>` disclosure (works without JS)
  - `SaasFooter({ email }: { email: string })` — sections, `mailto:` email, `© <year> CineFlow OS`
  - `Hero({ mode, video })` — the only `h1`; small line "14-day free trial · From RM <PLANS.STARTER.priceMyr> a month"; secondary link per mode (INVITE_WITH_CODE → "Have an invite code? Create your studio"; TRIAL → "See how it works" → `#how`; INVITE_ONLY → "See how it works")
  - `Journey({ videos })` (`id="how"`), `OwnWebsite`, `Extras`, `Pricing` (`id="pricing"`, three cards from `PLAN_CODES`, "what it adds" lines from `FEATURE_LABEL` of features not in the previous plan, trial + payment + downgrade lines), `Faq({ mode, email })` (`id="faq"`, `<details>` items), `InviteSection({ mode })` (`id="invite"`; renders `InviteForm` unless TRIAL, in which case a final "Start your 14-day free trial" block)
  - `InviteForm` — client; `<form action={serverAction}>` with labelled fields + hidden honeypot `website` (visually hidden, `tabIndex={-1}`, `autoComplete="off"`); submit disabled while pending (prevents double submit); success replaces the form with "Thanks — we'll be in touch by email."; errors shown inline in a `role="alert"` region
  - Wrap the page in `LandingMotion`; add `data-reveal` / `data-parallax` / `data-pin` attributes (pin only the journey on desktop)

- [ ] **Step 1: Write the failing tests** (render `SaasLandingPage` with the layout, as T31 does, under each app env / signup env via existing `withAppEnv` + setting `STUDIO_SIGNUP_CODE`)

```ts
T39-PAGE-01: markup contains each PLANS name and `RM ${priceMyr}`; exactly one "<h1"; ids how, pricing, faq, invite present (invite absent in TRIAL)
T39-PAGE-02: no BANNED_PHRASES in page + nav + footer markup in any mode/env; no href starting "/super-admin"; production: no "/lumina-cine" or "/apex-media"
T39-PAGE-03: TRIAL → an href "/create-studio" and text "Start your 14-day free trial", no "Request an invite"; INVITE_WITH_CODE → "Request an invite" and "Have an invite code?" linking "/create-studio";
  INVITE_ONLY (production, no code) → "Request an invite" and no href "/create-studio" anywhere (page, nav, footer)
T39-PAGE-04: no-JS safety — the rendered markup has no `opacity-0`/`opacity:0`/`invisible` classes on elements carrying data-reveal; the invite form element has an `action` attribute; the footer shows publicContactEmail()
T39-PAGE-05: SaasNavbar({mode,onLanding:false}) hrefs are "/#how","/#pricing","/#faq"; with onLanding:true they are "#how","#pricing","#faq"
T39-PAGE-06: every CHAPTERS shot path and poster path referenced in the markup exists under public/ (files come from Task 6; until then this test is expected to fail and is the hand-off check for Task 6)
```

- [ ] **Step 2: Run** Tier 39 — Expected: FAIL (T39-PAGE-01..05 on missing components; T39-PAGE-06 on missing images).
- [ ] **Step 3: Implement** sections, rewrite nav/footer/page, delete old components, update Tier 31. Use the `build-awwwards-quality-sites` and `design-taste-frontend` skills for art direction within the spec (film set at night, editorial serif headlines, asymmetric shots, no card grids, no gradients-on-text cliché).
- [ ] **Step 4: Run** Tier 39 (all but T39-PAGE-06 pass), Tier 31, `npx tsc --noEmit`, lint — Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): cinematic landing page with the client journey, pricing and invite`

### Task 6: Screens, posters and share image

**Files:**
- Create: `public/landing/shots/{book,pay,sign,shoot,deliver,print,website}-desktop.webp`, `{book,deliver}-phone.webp`, `public/landing/posters/{hero,shoot,deliver,print}.jpg`, `public/landing/og.jpg` (1200×630)

- [ ] **Step 1: Prepare demo data** on the Docker dev app (localhost:3000, Lumina) so each screen looks complete: a public booking page with open slots, an invoice with an uploaded slip awaiting approval (admin verification page), a sent proposal with add-ons (client view), a call sheet, a delivered gallery (client vault), the wall-art visualizer with a photo. Add records through the app or a throwaway script against the dev DB only; no seed changes. No real people's data.
- [ ] **Step 2: Capture** with the Playwright browser at deviceScaleFactor 2: desktop 1440×900 viewport crops and phone 390×844; convert to WebP (quality ~82) with `sharp` (already a dependency); each desktop shot ≤ 250 KB, phone ≤ 150 KB.
- [ ] **Step 3: Make posters** until the owner's clips arrive: hero = a dark, warm-graded crop of the website shot (sharp: darken, warm tint, slight blur) at 1920×1080 ≤ 200 KB; shoot/deliver/print = graded crops of their chapter shots. `og.jpg` = hero poster with the headline set in the display serif (render the hero section in the browser at 1200×630 and screenshot it).
- [ ] **Step 4: Run** Tier 39 — Expected: T39-PAGE-06 now PASS; whole tier PASS.
- [ ] **Step 5: Commit** `feat(landing): product screens, posters and share image`

### Task 7: Verify, polish and ship

- [ ] **Step 1: Browser checks** (Docker rebuilt): at 1440×900 and 375×812, with reduced motion off and on (`page.emulateMedia({ reducedMotion: "reduce" })`):
  - `document.documentElement.scrollWidth === clientWidth` at 375px;
  - nav anchors land on their sections below the nav, from `/` and from `/create-studio` (`/#pricing`);
  - the journey pins only at ≥1024px and never under reduced motion; no `<video>` element exists under reduced motion;
  - submit the invite form once (dev DB) → thank-you shown, row visible in `/super-admin` inbox, then mark handled; delete the test row afterwards;
  - Lighthouse mobile (or `PerformanceObserver` LCP in throttled 4G emulation) LCP < 2.5 s; console free of errors.
- [ ] **Step 2: Fix** anything found (each with a Tier 39 assertion if it's testable outside a browser).
- [ ] **Step 3: Docs:** README — replace the stale landing description with one paragraph on the page, the invite inbox, `PLATFORM_CONTACT_EMAIL`, and "drop clips into `public/landing/video/`" (pointing at the README there).
- [ ] **Step 4: Full checks:** `npm run test:e2e` (only pre-existing failures from other work allowed, named in the ledger), `npx tsc --noEmit`, `npm run db:check-migrations`, `python -m graphify update .`.
- [ ] **Step 5: Commit** `docs: landing page and invite inbox`

### Task 8: Contact email forwarding (with the owner, in their Chrome)

Outward-facing account change — ask the owner before each step.
- [ ] Cloudflare → cineflow-os.my → Email → Email Routing: enable (Cloudflare adds its MX + SPF records; check they don't clash with the Resend records on `send.` / `resend._domainkey`), add destination = the owner's Gmail (the owner clicks the verification email), create rule `hello@cineflow-os.my` → that Gmail.
- [ ] Send a test mail to hello@cineflow-os.my and have the owner confirm it arrived.

### Task 9 (later, when the owner supplies the Google Flow clips)

- [ ] Ask before downloading a tool: transcode with ffmpeg (e.g. via the official `jrottenberg/ffmpeg` Docker image, which needs no install on Windows): strip audio, H.264 High, `-crf 26`, `-movflags +faststart`, 1920×1080 (hero portrait 1080×1920), hero ≤ 4 MB, others ≤ 2.5 MB; save as the README's file names.
- [ ] Regenerate each poster from the clip's first frame (`-frames:v 1`), replace the placeholder JPGs.
- [ ] Rebuild Docker; browser check that videos play on desktop, pause off-screen, and don't load under reduced motion. Commit `feat(landing): hero and chapter videos`.

---

## Appendix: Google Flow video prompts

Use Veo in Google Flow, 16:9 unless stated, 8 seconds. Turn audio off if the option exists (audio is stripped anyway). Generate 3–4 takes of each and keep the one with the least obvious AI artefacts in hands and faces. For a seamless loop, make the camera move slow and steady, and if Flow offers "Frames to video", use the same image as first and last frame. Avoid recognisable real people, brands, logos and text in every shot.

**Shared style line (paste at the end of every prompt):**
> Cinematic, shot on a full-frame cinema camera with a 35mm lens, shallow depth of field, warm tungsten and amber practical lights against deep shadow, near-black background, subtle film grain, slow steady camera movement, realistic skin and hands, no text, no logos, no watermarks, no subtitles, seamless loop.

**1. Hero — `hero-16x9.mp4`**
> Night-time behind-the-scenes of a professional photo and video shoot in a small Malaysian studio. A Malay woman photographer in black clothing frames a shot of a smiling couple in elegant traditional-modern outfits under a large softbox; a videographer on a gimbal glides past in the foreground, slightly out of focus; light stands, a C-stand and a backdrop roll at the edges. The camera dollies slowly sideways from left to right, revealing the set. Mood: calm, confident, premium. Keep the centre of the frame darker and uncluttered so a headline can sit over it.

**1b. Hero for phones — `hero-9x16.mp4` (9:16)**
> Same scene as above, vertical framing: the photographer in the lower third looking through the camera, the softbox glowing at the top of the frame, the couple softly out of focus in the background. The camera slowly pushes in. Keep the top half darker for a headline.

**2. Shoot — `shoot-16x9.mp4`**
> A small film crew on location at dusk, an outdoor wedding venue with warm string lights. A crew member in black holds a phone and checks the day's schedule, then looks up and signals to the camera operator; a gaffer adjusts a small LED panel in the background. Close-medium shot, the phone screen glows but its contents are not readable. The camera drifts slowly forward. Mood: organised, focused.

**3. Deliver — `deliver-16x9.mp4`**
> Evening at home in a modern Malaysian condo living room. A young couple sit close together on a sofa, scrolling through their wedding photos on a laptop, the screen light on their faces; they smile and the woman touches her partner's arm. The laptop screen faces away from the camera so no content is visible. Slow push-in from a low angle. Mood: warm, emotional, intimate.

**4. Print — `print-16x9.mp4`**
> Bright, soft late-afternoon light in a living room with a pale wall. Two hands hang a large framed black-and-white wedding portrait on the wall above a wooden sideboard, then step back; two smaller framed prints are already hanging beside it. The photographs in the frames are soft and out of focus. The camera slowly arcs to the right. Mood: proud, finished, calm. Use a warmer, slightly brighter grade than the other clips but keep deep shadows at the frame edges.

**Checklist when choosing takes:** steady camera (no jumps), no warped hands or faces, no visible text or logos, the first and last half-second look alike (for the loop), dark enough behind where the headline sits.
