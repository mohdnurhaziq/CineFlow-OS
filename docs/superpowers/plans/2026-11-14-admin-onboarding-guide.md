# Admin Onboarding Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a first-time studio owner a self-ticking setup checklist on the admin dashboard, plus a dismissible tour of the dashboard and menu for all staff.

**Architecture:** Checklist status is computed on the server from existing tenant data and passed to a client card. "Closed" and "seen tour" are stored on `User`, written by two guarded server actions. The tour is driver.js, anchored on `data-tour` attributes, auto-run once and replayable via `?tour=1`.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma (SQLite, `db push`), Tailwind, lucide-react, driver.js 1.10.2.

**Spec:** `docs/superpowers/specs/2026-11-14-admin-onboarding-guide-design.md`

## Global Constraints

- New `User` columns must be nullable (the schema is applied with `prisma db push`, no migrations).
- Every exported function in a `"use server"` file calls a guard from `lib/auth/guard.ts` before any DB access.
- Checklist shown only to `role === "STUDIO_OWNER"` of this tenant. Not to staff or `SUPER_ADMIN`.
- Tour available to every staff role (`STAFF_ROLES`).
- Pin `driver.js` to exactly `1.10.2` (newer releases are under 2 weeks old).
- Dark admin theme (zinc backgrounds, amber accent); must work at 375px width.
- No Claude attribution in commit messages.
- After code changes run `graphify update .`.

## Review Focus

1. **Super admin viewing a studio:** sees no checklist (not the owner) and the tour must not fail. `markTourSeen` updates the super admin's own row. Tested in Task 1.
2. **Crew calling `dismissSetupChecklist`:** must be refused and must not change any row. Tested in Task 1.
3. **Signed-out or other-studio caller:** both actions refuse. Tested in Task 1.
4. **All 6 steps done:** the card shows the "ready" state and can still be closed. `allDone` is tested in Task 1, and the UI is checked in Task 2.
5. **Tour stop whose anchor isn't on the page** (the checklist is hidden for staff): driver.js must skip it, not break. The step list is built from anchors present in the DOM (Task 3).

---

### Task 1: Data, checklist status and server actions

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Create: `lib/onboarding/checklist.ts`
- Create: `lib/actions/onboarding-guide.ts`
- Create: `tests/e2e/tier16-onboarding-guide.test.ts`
- Modify: `tests/e2e/runner.ts` (import and run tier 16 after tier 15)

**Interfaces:**
- Produces:
  - `type SetupStepId = "brand" | "services" | "availability" | "payments" | "showcase" | "firstBooking"`
  - `interface SetupStep { id: SetupStepId; done: boolean }`
  - `interface SetupChecklist { steps: SetupStep[]; doneCount: number; total: number; allDone: boolean }`
  - `getSetupChecklist(tenantId: string): Promise<SetupChecklist>` in `lib/onboarding/checklist.ts` (plain server module, NOT `"use server"`). Steps are always in the order above.
  - `dismissSetupChecklist(tenantSlug: string): Promise<{ success: boolean; error?: string }>` (`"use server"`)
  - `markTourSeen(tenantSlug: string): Promise<{ success: boolean; error?: string }>` (`"use server"`)
  - `User.onboardingChecklistDismissedAt DateTime?`, `User.onboardingTourSeenAt DateTime?`

- [ ] **Step 1: Add the two nullable columns to `User`, then run `pnpm prisma db push` and `pnpm prisma generate`.**

- [ ] **Step 2: Write failing tests in `tests/e2e/tier16-onboarding-guide.test.ts`** exporting `runTier16OnboardingGuideTests(harness: TestHarness)`. Follow the tier15 pattern (`withSession`, an `as(user)` SessionUser mapper). Create a fresh tenant plus owner and crew rows in the test, so seed data never decides the result:
  - `getSetupChecklist(newTenant.id)` → `doneCount === 0`, `total === 6`, `allDone === false`, step ids in the order above.
  - After setting `logoUrl`, creating 1 ServicePackage, 1 BookingSlot, `qrCodeUrl`, 1 ShowcaseItem and 1 ClientBooking → `doneCount === 6` and `allDone === true`. Each step's `done` turns true individually: assert after each change.
  - Payments counts as done with only `bankDetails`, or with only `toyyibpaySecretEnc`.
  - `withSession(owner, () => dismissSetupChecklist(slug))` → `success: true`, and the owner row has `onboardingChecklistDismissedAt` set.
  - `withSession(crew, () => dismissSetupChecklist(slug))` → `success: false`, and the crew row's field stays null.
  - `withSession(null, ...)` for both actions → `success: false`.
  - Owner of another tenant (seed `apex-media` owner) → `success: false` for both actions on the new slug.
  - `withSession(crew, () => markTourSeen(slug))` → `success: true`, and only the crew row's `onboardingTourSeenAt` is set.
  - Super admin (seed) `markTourSeen(slug)` → `success: true`, and the super-admin row is updated.
  - Teardown deletes the created tenant (cascade).

- [ ] **Step 3: Run and confirm failure.** Run: `pnpm test:e2e`. Expected: tier 16 fails (module not found or assertions failing).

- [ ] **Step 4: Implement `getSetupChecklist`.** One `db.tenant.findUnique` selecting `logoUrl, qrCodeUrl, bankDetails, toyyibpaySecretEnc` and `_count` of `servicePackages, bookingSlots, showcaseItems, clientBookings`. Blank strings count as not set.

- [ ] **Step 5: Implement both actions.** `dismissSetupChecklist`: resolve tenant by slug, `requireOwner(tenant.id)`, refuse if `session.role !== "STUDIO_OWNER"` (super admins have no checklist), then update `session.id`. `markTourSeen`: `requireStaffBySlug(slug)`, then update `session.id`. Catch `AuthorizationError` and return `{ success: false, error }`.

- [ ] **Step 6: Run and confirm pass.** Run: `pnpm test:e2e`. Expected: all tier 16 assertions pass, and no earlier tier regresses compared with `main`.

- [ ] **Step 7: Commit.** `git add prisma/schema.prisma lib/onboarding lib/actions/onboarding-guide.ts tests/e2e && git commit -m "feat(onboarding): setup checklist status and dismiss/tour-seen actions"`

### Task 2: Setup checklist card on the dashboard

**Files:**
- Create: `components/admin/onboarding/setup-checklist.tsx` (client)
- Modify: `app/[tenantSlug]/admin/page.tsx`
- Modify: `components/admin/studio-dashboard.tsx` (accept and render an optional slot above the KPIs, add `data-tour="kpis"` on the KPI grid)

**Interfaces:**
- Consumes: `SetupChecklist`, `dismissSetupChecklist` (Task 1).
- Produces: `<SetupChecklist tenantSlug: string; checklist: SetupChecklist; bookingUrl: string; onStartTour: () => void />`. The card root has `data-tour="checklist"`. `onStartTour` is wired in Task 3; in this task pass a no-op.

- [ ] **Step 1: In `admin/page.tsx`,** read `getCurrentUser()`. When the user is `STUDIO_OWNER` of this tenant, load `onboardingChecklistDismissedAt`. If it's null, call `getSetupChecklist(tenant.id)` and pass it to the dashboard. Build `bookingUrl` from `NEXT_PUBLIC_APP_URL` + `/${slug}`.

- [ ] **Step 2: Build the card.**
  - Title "Get your studio ready", "N of 6 done" and a progress bar.
  - One row per step, with a tick or empty circle, a label and a link. The first undone step gets an amber highlight.
  - **×** button (`aria-label="Close setup guide"`) calls `dismissSetupChecklist`, hides the card optimistically and shows a sonner toast on error.
  - "Take the tour" button.
  - In the `allDone` state: "Your studio is ready", with only the close button.
  - Labels and links:

  | id | Label | Link |
  |---|---|---|
  | brand | Brand your studio: add your logo | `/${slug}/admin/settings` |
  | services | Add your first service and price | `/${slug}/admin/services` |
  | availability | Open your booking times | `/${slug}/admin/calendar` |
  | payments | Set up how clients pay you | `/${slug}/admin/settings` |
  | showcase | Show your best work | `/${slug}/admin/cms` |
  | firstBooking | Share your booking page | "Copy link" button: copies `bookingUrl` and toasts "Booking link copied" |

- [ ] **Step 3: Verify.**
  - `npx tsc --noEmit` passes.
  - In the browser, as `alex@luminacine.com` / `password123` (seed owner): the card shows, with seed data, its real count.
  - × hides it and it stays hidden after reload.
  - As `liam@luminacine.com` (crew): no card.
  - Reset the owner afterwards with `pnpm prisma studio` or a one-line `db.user.update` script.

- [ ] **Step 4: Commit.** `git commit -m "feat(onboarding): setup checklist card on the admin dashboard"`

### Task 3: Dashboard tour

**Files:**
- Modify: `package.json` (add `"driver.js": "1.10.2"` exactly, via `pnpm add driver.js@1.10.2 --save-exact`)
- Create: `components/admin/onboarding/dashboard-tour.tsx` (client)
- Create: `components/admin/onboarding/tour-theme.css` (driver.js popover overrides, imported by the tour component)
- Modify: `components/admin/admin-nav-bar.tsx` (add `data-tour="nav-production" | "nav-finance" | "nav-catalog" | "nav-settings"` on those triggers)
- Modify: `components/admin/admin-user-nav.tsx` (add `data-tour="account"` and a "Take the tour" item linking to `/${slug}/admin?tour=1`)
- Modify: `app/[tenantSlug]/admin/page.tsx` and `components/admin/studio-dashboard.tsx` (mount the tour and wire `onStartTour`)

**Interfaces:**
- Consumes: `markTourSeen` (Task 1), `data-tour` anchors (Task 2 and this task).
- Produces: `<DashboardTour tenantSlug: string; autoStart: boolean />`, exposing `start()` through a ref or a shared callback so the checklist button can start it.

- [ ] **Step 1: Install** `pnpm add driver.js@1.10.2 --save-exact`. Confirm `package.json` shows `"driver.js": "1.10.2"`.

- [ ] **Step 2: Build `DashboardTour`.**
  - Steps, in order: welcome (no element), `kpis`, `nav-production`, `nav-finance`, `nav-catalog`, `nav-settings`, `account`, `checklist`.
  - Before starting, filter out any step whose `[data-tour=…]` isn't in the DOM (Review Focus 5).
  - Turn on `showProgress`, with Next/Back/Done buttons.
  - On destroy (finished or skipped), call `markTourSeen(slug)` once.
  - `autoStart` runs it once after mount, when the user's `onboardingTourSeenAt` is null.
  - `?tour=1` also starts it, then removes the param with `router.replace`.
  - Copy, one or two short sentences each:
    1. Welcome: "Welcome to your studio admin. Here's a 1-minute look around."
    2. KPIs: "Your studio at a glance: revenue, bookings and what needs attention."
    3. Production: "Projects, bookings, your calendar and gear."
    4. Finance: "Invoices, payments waiting for your check, and proposals."
    5. Catalog: "What you sell (services, frames and prints) and your public showcase."
    6. Settings: "Your studio's name, logo, domain and how clients pay you."
    7. Account: "Your account. You can replay this tour from here any time."
    8. Checklist: "Start here: work through these steps to get your studio ready."

- [ ] **Step 3: Theme the popover** in `tour-theme.css`: zinc-900 background, zinc-100 text, amber-500 primary button, rounded-lg. At 375px the popover must stay inside the screen.

- [ ] **Step 4: Verify.**
  - `npx tsc --noEmit` passes.
  - In the browser, as a user with the tour unseen: it auto-starts, and Skip sets `onboardingTourSeenAt`. Reload: no auto-start.
  - "Take the tour" in the account menu replays it from `/admin/invoices`.
  - As crew: the tour runs with no checklist stop.
  - At 375px width the popover fits.

- [ ] **Step 5: Commit.** `git commit -m "feat(onboarding): dashboard tour with driver.js, replay from the account menu"`

### Task 4: Ship check

- [ ] **Step 1:** Run `pnpm test:e2e`. Expected: tier 16 passes, and other tiers are no worse than before Task 1.
- [ ] **Step 2:** Rebuild the container with `docker compose up -d --build` and repeat the Task 2 and Task 3 browser checks against http://localhost:3000.
- [ ] **Step 3:** Run `graphify update .` and commit the graph files.
