# Studio Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real studio plans: features and team size per plan, a 14-day trial, payments the platform owner records by hand, overdue/paused handling that never strands clients, reminders, and a super-admin console to run it all.

**Architecture:**
- **Plan rules:** a plan catalogue and a pure state function (`lib/billing/`) decide what a studio may do from stored dates.
- **Server enforcement:** the shared access guards refuse changes for paused studios. New `requireFeature`/team-limit checks lock features in the actions that create them.
- **UI:** upgrade panels and banners read the same rules.
- **Super-admin:** new actions and a rewritten console record payments and change plans.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + SQLite (migrations), TypeScript, the repo's e2e harness (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-21-studio-subscriptions-design.md`

## Global Constraints

- **Plan codes stay** `STARTER`, `PRO`, `STUDIO_UNLIMITED`. Display names: Solo, Studio, Production. Prices: RM 99, RM 249, RM 599 per month.
- **Team limit** (staff other than the owner, plus open invitations): STARTER 0, PRO 5, STUDIO_UNLIMITED unlimited.
- **Features:**
  - `team` (team roles, assignments, My schedule): PRO and up.
  - `proposals`, `callSheets` (HUD and talent releases), `customDomain`: PRO and up.
  - `wallArt` (visualizer, frames, print & frame orders), `gear`: STUDIO_UNLIMITED only.
- **States:** trial lasts 14 days from sign-up, with everything unlocked. Grace is 7 days. Reminders go out 7 days before the end.
- **Time:** "today" is Malaysia time (`STUDIO_TIME_ZONE`), and a paid-until date covers its whole day.
- **Super-admins** are never blocked by plans or pausing.
- **Downgrades** never delete: only creating new locked things is refused. Existing records stay readable and editable; a custom domain already set keeps working.
- **While paused, these stay allowed:**
  - approving or rejecting payment slips (`requireTick(...,"approvePayments")`);
  - recording payments (`requireTick(...,"recordPayments")`);
  - telling a client their photos are ready (`notifyClientPhotosReady`);
  - uploading deliverables to an existing gallery.
- **Copy:**
  - Locked: `"<Feature> is on the <Plan> plan. Contact us to upgrade."`
  - Paused: `"Your plan has ended. Contact us to renew."`
  - Team: `"Your plan includes <n> team members."` (Solo: `"Your plan is for the owner only."`)
  - Public booking while paused: `"This studio isn't taking bookings online right now."`
- **"Contact us"** shows the first super-admin's email. No new setting.
- **Migrations:** a new Prisma migration (`npm run db:migration -- studio_subscriptions`); never `prisma db push` on dev.db.
- **Commits:** on branch `feat/studio-subscriptions`, no attribution lines, no pushing.

## Review Focus

1. **A super-admin inside a paused Solo studio** can still do everything, with no panels or refusals. Tested in T2 and T5.
2. **A downgraded studio** can still edit an existing proposal and gear item, and a client can still sign a proposal already sent. Tested in T3.
3. **A paused studio:**
   - a client uploads a slip to an existing invoice, the studio approves it, and the paid gallery downloads;
   - but a new admin booking or a new slot is refused.

   Tested in T2 and T4.
4. **Day edges:** `paidUntil` = today still counts as active all day (Malaysia time), and day 7 of grace is still overdue, not paused. Tested in T1.
5. **A back-dated payment** never shortens `paidUntil`, and doesn't resume a studio whose new date is still past grace. Tested in T7.

---

### Task 1: Data, plan catalogue and state rules

**Files:**
- Modify `prisma/schema.prisma`:
  - `Tenant`: add `trialEndsAt DateTime?`, `paidUntil DateTime?`, `pausedAt DateTime?`, `pauseReason String?`, `lastPlanReminder String?`, and the `platformPayments` relation.
  - New `PlatformPayment` model: `id cuid`, `tenantId` (FK, cascade), `amount Float`, `method String` (BANK_TRANSFER, DUITNOW, CASH, OTHER), `reference String?`, `plan String`, `paidUntil DateTime`, `note String?`, `recordedById String`, `createdAt`. Indexes: `@@index([tenantId])` and `@@index([createdAt])`.
- Create the migration with `npm run db:migration -- studio_subscriptions`. Its SQL also sets `trialEndsAt = datetime('now','+14 days')` on existing tenants.
- Create `lib/billing/plans.ts` and `lib/billing/state.ts`.
- Test in `tests/e2e/tier38-studio-subscriptions.test.ts` (`runTier38StudioSubscriptionsTests`, registered after Tier 37).

**Produces:**
- `type PlanCode = "STARTER" | "PRO" | "STUDIO_UNLIMITED"`
- `type PlanFeature = "team" | "proposals" | "callSheets" | "customDomain" | "wallArt" | "gear"`
- `PLANS: Record<PlanCode, { name; priceMyr: number; teamLimit: number /* Infinity = unlimited */; features: PlanFeature[] }>`
- `FEATURE_LABEL: Record<PlanFeature, string>` ("Team & shoot assignments", "Proposals", "Call sheets & releases", "Custom domain", "Wall-art visualizer & print orders", "Gear inventory")
- `cheapestPlanWith(feature): PlanCode`
- `type PlanState = "TRIAL" | "ACTIVE" | "OVERDUE" | "PAUSED" | "CLOSED"`
- `planStatus(t: { subscriptionTier; subscriptionStatus; trialEndsAt; paidUntil; pausedAt }, now?: Date): { state: PlanState; plan: PlanCode; endsOn: string | null /* YYYY-MM-DD */; graceEndsOn: string | null; features: Set<PlanFeature>; teamLimit: number }`. TRIAL has all features and unlimited team. CLOSED comes from `subscriptionStatus === "CANCELLED"`. A manual `pausedAt` means PAUSED.

**Steps:**
- [ ] **Write T38-STATE-01..04:**
  - **01, trial:**
    - trial day 14 is TRIAL with all features;
    - day 15 with no payment is OVERDUE;
    - day 21 is still OVERDUE (the 7th grace day);
    - day 22 is PAUSED.
  - **02, paid:**
    - `paidUntil` = today (Malaysia time, checked at 23:30 MYT) is ACTIVE;
    - the next day is OVERDUE;
    - paidUntil + 8 days is PAUSED;
    - an ACTIVE STARTER has no `proposals` and `teamLimit` 0.
  - **03, manual pause and closed:** `pausedAt` set with a future `paidUntil` is PAUSED. `subscriptionStatus "CANCELLED"` is CLOSED.
  - **04, catalogue:** `PLANS.PRO.priceMyr` is 249; `cheapestPlanWith("gear")` is `"STUDIO_UNLIMITED"`; `cheapestPlanWith("proposals")` is `"PRO"`.
- [ ] **Run Tier 38 to see it fail, then write the migration and the two modules.**
- [ ] **Run Tier 38** (passes), then `npm run db:check-migrations` (no drift).
- [ ] **Commit:** `feat(billing): plans, subscription state and payment records`

### Task 2: Guards — paused studios and plan features

**Files:**
- Create `lib/billing/guard.ts`.
- Modify `lib/auth/access-guard.ts` and `lib/auth/guard.ts` (`requireOwner`).
- Check that `lib/action-error.ts` passes the copy through to the person.

**Consumes:** `planStatus`, `PLANS`, `FEATURE_LABEL`, `cheapestPlanWith`.

**Produces:**
- `class PlanLockedError extends Error { code: "PLAN_UPGRADE_REQUIRED" | "PLAN_PAUSED" | "PLAN_TEAM_LIMIT" }`, with the spec's copy as `message`.
- `loadPlanStatus(tenantId): Promise<ReturnType<typeof planStatus>>`
- `requireFeature(tenantId, feature, user?: { role })`: throws unless the plan has the feature or the user is a SUPER_ADMIN.
- `assertNotPaused(tenantId, user)`: throws `PLAN_PAUSED` unless SUPER_ADMIN.
- `platformContactEmail(): Promise<string | null>`: the first SUPER_ADMIN.

**Guard changes** (all after the existing checks):
- `requireAccess` calls `assertNotPaused` when `need === "MANAGE"`.
- `requireOwnOrManage` and `requireOwner` always call it.
- `requireTick` calls it except for `approvePayments` and `recordPayments`.
- Add an optional final parameter `{ whilePaused?: true }` to `requireAccess` and `requireOwnOrManage`. Use it in `notifyClientPhotosReady` and the deliverable-upload route.

**Steps:**
- [ ] **Write T38-GUARD-01..03:**
  - **01:** in a paused studio, the owner's `createSlot` (or another MANAGE action) is refused with the paused copy. `approvePaymentVerification` and `recordInvoicePayment` succeed. A SUPER_ADMIN's MANAGE action succeeds.
  - **02:** `requireFeature(t, "proposals")` throws `PLAN_UPGRADE_REQUIRED` with "Proposals is on the Studio plan. Contact us to upgrade." for an ACTIVE STARTER. It passes for PRO, for a trial, and for a SUPER_ADMIN on STARTER.
  - **03:** the refused action's `{ success:false, message }` carries the copy, not "FORBIDDEN".
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(billing): paused studios are read-only; plan feature guard`

### Task 3: Feature locks and the team limit in actions

**Files:**
- `lib/actions/admin-projects.ts`
- `lib/actions/admin-proposals.ts`
- `lib/actions/logistics.ts`
- `lib/actions/admin-settings.ts`
- `lib/actions/admin-frames.ts`
- `lib/actions/print-orders.ts`
- `lib/actions/gear.ts`
- `lib/actions/admin-team.ts`
- `lib/actions/admin-assignments.ts`

**Lock only the creating actions, with `requireFeature(tenantId, <feature>, session)`:**
- `proposals`: `createProposal`, `sendProposal`, `createProposalAddOnTemplate`.
- `callSheets`: `createCallSheet`, `createShotItem`.
- `customDomain`: `updateStudioSettings`, only when `customDomain` is set to a new non-empty value.
- `wallArt`: `createFrameDesign`, `createPrintSize`, `placePrintOrder` (client-facing: use no user).
- `gear`: `createGearItem`, `createKitBundle`, `createEquipmentReservation`.
- `team`: `createTeamRole`, `assignTeamMember`.

**Team limit:**
- Count staff accounts in the tenant whose role isn't CLIENT or STUDIO_OWNER and that aren't removed (pending invitations included).
- `inviteTeamMember` and `restoreTeamMember` throw `PLAN_TEAM_LIMIT` when that count is already at the limit.

**Steps:**
- [ ] **Write T38-LOCK-01..04:**
  - **01:** each locked action listed above is refused for ACTIVE STARTER and allowed for PRO / STUDIO_UNLIMITED as the plan says. Use one loop over a table of `[action, feature, args]`.
  - **02:** on a downgrade to STARTER, an existing proposal can still be updated or deleted. A client can still sign a proposal already sent (`proposals.ts`). An existing gear item can still be updated.
  - **03:** a PRO studio with 5 members can't invite a 6th ("Your plan includes 5 team members."). STARTER can't invite anyone ("Your plan is for the owner only."). Restoring a removed member past the limit is refused. Existing members over the limit keep their access.
  - **04:** a custom domain already set stays when other settings are saved on STARTER; setting a new one is refused.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(billing): lock plan features and team size in actions`

### Task 4: Paused studios close online booking; locked public pages

**Files:**
- `lib/actions/booking.ts` (`holdBookingSlot`, `createClientBooking`)
- `lib/actions/checkout.ts` (`processBookingCheckout` only; `processInvoicePayment` stays open)
- `app/[tenantSlug]/book/page.tsx`
- `app/[tenantSlug]/visualizer/page.tsx`
- the studio website's links to the visualizer (`components/showcase/*`)

**Behaviour:**
- The three booking actions return `{ success:false, error:"BOOKINGS_CLOSED", message:<copy> }` when the studio is PAUSED.
- The book page shows that copy in place of the calendar.
- The visualizer page shows "This isn't available right now." when the plan lacks `wallArt`, and website links to it are hidden.

**Steps:**
- [ ] **Write T38-PUBLIC-01..02:**
  - **01:** in a paused studio, `holdBookingSlot` returns BOOKINGS_CLOSED. A client's slip upload (`processInvoicePayment` with QR) for an existing invoice still succeeds, and the owner can then approve it.
  - **02:** on a STARTER plan, `placePrintOrder` is refused, and `showsWallArt(tenant)` (exported from `lib/billing/guard.ts`) is false.
- [ ] **Watch them fail, then implement, then check the pages in the browser.**
- [ ] **Commit:** `feat(billing): paused studios close online booking; locked visualizer`

### Task 5: Upgrade panels, menu locks and the plan banner

**Files:**
- Create `components/billing/upgrade-panel.tsx` (`UpgradePanel({ feature, contactEmail })`).
- Create `components/billing/plan-banner.tsx` (`PlanBanner({ status, contactEmail })`).
- Modify the admin layout, `components/admin/admin-nav-bar.tsx`, the admin pages for proposals, frames, print orders, inventory, settings (team and custom-domain sections), and schedule.

**Behaviour:**
- **Banner** (admin layout, every admin page):
  - OVERDUE: "Your plan ended on <date>. Pay by <grace date> to keep your studio open."
  - PAUSED: the paused copy.
  - TRIAL in its last 7 days: "Your trial ends on <date>."
  - None for SUPER_ADMIN.
- **Menu:** a small lock next to locked items. They still open, to show the panel.
- **Locked pages:** the page shows the UpgradePanel above any existing records, which stay readable. The page's create buttons are hidden.

**Steps:**
- [ ] **Write T38-UI-01:** render (server components) `/admin/proposals` for STARTER: the output contains the locked copy. For PRO it doesn't. The admin layout for a PAUSED studio contains the paused copy. For a SUPER_ADMIN, neither appears. Follow Tier 23's render pattern.
- [ ] **Watch it fail, then implement.** Check desktop and 375px in Docker: no sideways scroll, and the panel reads well.
- [ ] **Commit:** `feat(billing): upgrade panels, menu locks and plan banner`

### Task 6: Sign-up starts the trial

**Files:**
- `lib/actions/onboarding.ts` (`onboardStudio` sets `trialEndsAt = now + 14 days`, keeps the chosen plan)
- `app/(saas)/create-studio/page.tsx` (plan picker: names, prices and features from `PLANS`; "14-day free trial, everything included")

**Steps:**
- [ ] **Write T38-SIGNUP-01:** a new studio has `trialEndsAt` 14 days out, state TRIAL, and its chosen plan stored.
- [ ] **Watch it fail, then implement.**
- [ ] **Commit:** `feat(billing): new studios start a 14-day trial`

### Task 7: Super-admin actions

**Files:**
- Modify `lib/actions/super-admin.ts`.
- Add the new actions to the Tier 26 access table (they need `requireSuperAdmin`, from `lib/auth/guard.ts:48`).

**Produces** (all super-admin only, returning `{ success, message? }`):
- `recordPlatformPayment({ tenantId, amount, method, reference?, plan, paidUntil /* YYYY-MM-DD */, note? })`:
  - creates the payment record;
  - sets `subscriptionTier = plan`;
  - sets `paidUntil = max(current, given)`;
  - clears a lateness pause (`pausedAt` with `pauseReason "OVERDUE"`) when the new state is no longer past grace;
  - never clears a manual pause.
- `changeStudioPlan({ tenantId, plan })`
- `extendTrial({ tenantId, until })`
- `pauseStudio({ tenantId, reason })` sets `pausedAt` and `pauseReason "MANUAL"`; `resumeStudio({ tenantId })` clears them.
- `closeStudio({ tenantId, confirmSlug })` requires `confirmSlug === slug` and sets `subscriptionStatus "CANCELLED"`.
- `getPlatformMetrics()` returns:
  - `{ byState: Record<PlanState, number>; revenueThisMonth; revenue12m; endingSoon: { tenantId, name, endsOn }[] }`;
  - revenue is summed from `PlatformPayment` in Malaysia time.
- `getAllTenantsSummary()` adds `state`, `endsOn`, `teamUsed`, `teamLimit`, `lastActive`.
- `getStudioPayments(tenantId)`.

**Steps:**
- [ ] **Write T38-ADMIN-01..04:**
  - **01:** a payment record sets the plan and paidUntil; a back-dated one doesn't shorten it.
  - **02:** a payment that brings an OVERDUE-paused studio back within grace resumes it. A manual pause stays.
  - **03:** `closeStudio` with the wrong slug is refused. With the right one, the studio is CLOSED and its public pages say not found (as today).
  - **04:** a studio owner calling any of these is refused, and the metrics revenue equals the recorded payments.
- [ ] **Watch them fail, then implement.** Update Tier 26 entries until the access-table tests pass.
- [ ] **Commit:** `feat(super-admin): record payments, change plan, trial, pause, close`

### Task 8: The super-admin console

**Files:**
- Rewrite `components/super-admin/super-admin-view.tsx`.
- Create `components/super-admin/manage-studio-panel.tsx`.

**Behaviour:**
- Show the spec's totals and studios table. Remove the invented text (SQLite, "Card (Simulated)", estimated MRR).
- The manage panel holds: change plan, record payment (form), payment history, extend trial, pause/resume, and close with a typed slug.
- Phone layout: the table becomes cards.

**Steps:**
- [ ] **Write T38-CONSOLE-01:** render the console page as SUPER_ADMIN. It shows a studio's state and paid-until, and doesn't contain "SQLite" or "Simulated".
- [ ] **Watch it fail, then implement.** Check desktop and 375px in Docker by recording a payment, pausing and resuming.
- [ ] **Commit:** `feat(super-admin): console for plans, payments and studio status`

### Task 9: Reminders

**Files:**
- Create `lib/billing/reminders.ts`.
- Modify `app/api/health/route.ts`: call `void runPlanReminders()`, throttled in memory to once an hour; it never fails the health check.

**Produces:** `runPlanReminders(now?: Date): Promise<number>` (the count sent).

**Behaviour:**
- **Reminder keys and their moments:**
  - `"due:<endsOn>"`: 7 days before the end of a trial or a paid period;
  - `"overdue:<endsOn>"`: entering OVERDUE;
  - `"paused:<endsOn>"`: entering a lateness pause, which also sets `pausedAt` and `pauseReason "OVERDUE"` so the state is stored.
- **One email per key** to the studio owner and every super-admin, as `STUDIO_UPDATE` with the plan details and "contact us".
- **Never repeated:** `lastPlanReminder` records the last key sent.

**Steps:**
- [ ] **Write T38-REMIND-01..02:**
  - **01:** at endsOn − 7 the due reminder is sent once; a second run sends nothing.
  - **02:** past grace, the pause is stored and the paused email is sent once. A CLOSED or manually paused studio gets nothing.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(billing): plan reminders`

### Task 10: Docs, full check, browser

- **README:** under "Staging and production", a short "Studio plans" section explains how to record payments in the console, how the trial, grace and pause work, and that reminders come from the health check.
- **Manual page:** add a short plans section for studios at `app/[tenantSlug]/admin/manual`, where it fits.
- **Checks:** run the full suite, `npx tsc --noEmit`, `npm run db:check-migrations` and `graphify update .`, then rebuild Docker.
- **In the browser:**
  - as the owner on Solo: a locked page, the menu locks, the team limit;
  - pause in the console: the banner shows and changes are refused, then approve a client slip;
  - resume;
  - all at phone width too.
- **Final whole-branch review** by a fresh reviewer.
