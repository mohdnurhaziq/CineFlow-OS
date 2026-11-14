# Every Booking Gets a Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every confirmed booking gets a project (its gallery), labelled Session or Production, so the studio always has one place to upload finished photos.

**Architecture:** Add `Project.kind` (`SESSION` | `PRODUCTION`). Provisioning stops being gated by category: every confirmation path creates the project and the category only decides its kind. The admin UI filters Projects by kind, gives sessions a slimmer page, and replaces "Promote to Project" / "Mark delivered" on bookings with an "Upload photos" link.

**Tech Stack:** Next.js App Router, server actions, Prisma (SQLite, `prisma db push`, no migrations folder), Zod, custom E2E harness (`npm run test:e2e`, the whole suite only; tests in `tests/e2e/tier*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-14-every-booking-gets-a-gallery-design.md`

## Global Constraints

- Kinds are exactly `"SESSION"` and `"PRODUCTION"`; projects from proposals are always `"PRODUCTION"`; the column default is `"PRODUCTION"`.
- UI copy: tabs **Productions** (default) · **Sessions** · **All**; booking button **Upload photos**; category choice **Session / Production**.
- Existing category answers carry over without data loss: rename the Prisma field `autoCreateProject` → `isProduction` with `@map("autoCreateProject")` (same column).
- Keyword fallback for categories without a row stays (`isProjectCategorySlug`).
- No new delivery-by-link: `markBookingDelivered` and its UI are removed; existing `deliveryUrl` values are still shown read-only (client dashboard, booking details dialog).
- After code changes run `graphify update .`. Commits carry no Claude attribution.

## Review Focus

1. **Cancelled / no-show bookings:** their projects must not appear under Productions or Sessions (only under All). Test in Task 4.
2. **Confirmed twice** (e.g. QR approval after a card attempt, or re-approval): still exactly one project per booking. Test in Task 1.
3. **Test teardowns:** many suites delete clients/bookings they created; now those bookings own projects (`Project.clientId` has no cascade). Every teardown that deletes such users must delete their projects first. Full suite green in Task 1.
4. **Notify on a cancelled booking's project:** must not flip the booking to `DELIVERED`; only `CONFIRMED`/`COMPLETED` move to `DELIVERED`. Test in Task 5.
5. **Production → Session switch:** existing call sheets / gear reservations are hidden, never deleted; switching back shows them again. Test in Task 5.

---

### Task 1: Project kind + provision every confirmed booking

**Files:**
- Modify: `prisma/schema.prisma` (`Project`, `CampaignCategory`)
- Modify: `lib/bookings/project-promotion.ts`
- Modify: `lib/actions/checkout.ts:207-208,408-409`, `lib/payments/settle.ts:145-146`, `lib/actions/admin-verification.ts:101-102`, `lib/actions/admin-bookings.ts:174-175`
- Modify: `lib/actions/admin-services.ts`, `lib/validations/services.ts` (field rename only; UI is Task 2)
- Test: `tests/e2e/tier15-projects.test.ts` (rewrite `T15-BOOKING-PROJ-01`), teardowns across `tests/e2e/*`

**Interfaces:**
- Produces: `Project.kind: string` (`"SESSION" | "PRODUCTION"`, default `"PRODUCTION"`); `CampaignCategory.isProduction: boolean` (`@map("autoCreateProject")`).
- Produces: `export async function projectKindForBooking(tx: Tx, booking: { tenantId: string; category: string }): Promise<"SESSION" | "PRODUCTION">` in `lib/bookings/project-promotion.ts` (replaces `shouldAutoProvisionProject`, same lookup logic).
- Produces: `provisionProjectForBooking` sets `kind` from `projectKindForBooking`; creates the initial call sheet only for `"PRODUCTION"`.

- [ ] **Step 1: Rewrite `T15-BOOKING-PROJ-01` as the failing test**

Keep the wedding + convocation setup. New assertions:
```ts
harness.assertEqual(weddingProject?.kind, "PRODUCTION", "Wedding booking -> Production project");
harness.assert((weddingProject?.callSheets.length ?? 0) > 0, "Production gets its shoot-day call sheet");
const convoProject = await db.project.findFirst({ where: { bookingId: convoBooking.id }, include: { callSheets: true } });
harness.assert(convoProject !== null, "Convocation booking gets a gallery too");
harness.assertEqual(convoProject?.kind, "SESSION", "Convocation -> Session project");
harness.assertEqual(convoProject?.callSheets.length, 0, "Sessions get no call sheet");
// Review Focus 2: approving the same deposit again keeps one project
await withSession(owner, () => approvePaymentVerification({ invoiceId: convoDepositInvoice.id, tenantId: lumina.id, tenantSlug: lumina.slug }));
harness.assertEqual(await db.project.count({ where: { bookingId: convoBooking.id } }), 1, "Still one project per booking");
```
Remove the `promoteBookingToProjectAction` part (Task 5 removes the button; the action stays for now). Clean up both projects in the test's cleanup.

- [ ] **Step 2: Run `npm run test:e2e`** — Expected: FAIL on "Convocation booking gets a gallery too" (and `kind` type error until schema exists).

- [ ] **Step 3: Schema.** `Project.kind String @default("PRODUCTION") // SESSION, PRODUCTION` plus `@@index([tenantId, kind])`; rename `CampaignCategory.autoCreateProject` to `isProduction Boolean @default(false) @map("autoCreateProject")`. Run `npx prisma db push` (dev DB) — expected: "in sync", no data-loss prompt.

- [ ] **Step 4: Implement `projectKindForBooking`** (category row `isProduction` true → PRODUCTION; else keyword check on slug/name; no row → keyword check on `booking.category`), use it inside `provisionProjectForBooking`, skip the call sheet for sessions, and at the five call sites drop the `if (await shouldAutoProvisionProject(...))` guard so provisioning always runs. Rename `autoCreateProject` → `isProduction` in `admin-services.ts` and `validations/services.ts` (schema key `isProduction`).

- [ ] **Step 5: Run `npm run test:e2e`; fix every teardown that now hits a foreign-key error** by deleting `db.project` rows (and their `callSheet`s) for the bookings/clients it created before deleting users. Expected: 0 failed.

- [ ] **Step 6: Commit** — `feat(projects): every confirmed booking gets a gallery, labelled session or production`

### Task 2: Category setting becomes Session / Production

**Files:**
- Modify: `components/admin/services/category-dialog.tsx:17,47,60,115,133,~273`, `components/admin/services/category-list.tsx:~108`
- Test: the existing services/category tier test that creates categories (find with `grep -rn "createCampaignCategory\|autoCreateProject" tests/e2e`)

**Interfaces:**
- Consumes: `CampaignCategory.isProduction` and the action input key `isProduction` from Task 1.

- [ ] **Step 1: Failing test:** create a category with `isProduction: true`, read it back: `harness.assertEqual(row?.isProduction, true, "Category saved as Production")`; update it with `isProduction: false` and assert `false`.
- [ ] **Step 2: Run `npm run test:e2e`** — Expected: FAIL only if Task 1 missed the rename; otherwise PASS (then this step just confirms).
- [ ] **Step 3: UI.** Replace the checkbox with a two-option radio, legend "Kind of job", options **Session** ("Quick shoots: convocation, portrait, Raya. Listed under Sessions.") and **Production** ("Weddings, commercial, events. Gets shoot-day planning tools."). The list badge shows "Production" or "Session".
- [ ] **Step 4: Run `npm run test:e2e`; `npx tsc --noEmit`** — Expected: 0 failed, no type errors.
- [ ] **Step 5: Commit** — `feat(services): categories are sessions or productions`

### Task 3: Backfill projects for existing bookings

**Files:**
- Create: `prisma/backfill-booking-projects.ts` (pattern: `prisma/backfill-invoice-bookings.ts`, supports `--dry`)
- Modify: `package.json` scripts: `"db:backfill-booking-projects": "tsx prisma/backfill-booking-projects.ts"`

**Interfaces:**
- Consumes: `provisionProjectForBooking(tx, bookingId)` (idempotent) from Task 1.

- [ ] **Step 1:** Script: for bookings with `status in ["CONFIRMED","COMPLETED","DELIVERED"]` and no `project`, run `db.$transaction(tx => provisionProjectForBooking(tx, id))`; print `slug: TRACKING -> PJ-… (SESSION)`; `--dry` prints only.
- [ ] **Step 2: Verify:** `npm run db:backfill-booking-projects -- --dry` lists candidates; run it for real; run it again — Expected: second run prints nothing (idempotent).
- [ ] **Step 3: Commit** — `chore(db): backfill galleries for existing bookings`

### Task 4: Projects page tabs

**Files:**
- Modify: `app/[tenantSlug]/admin/projects/page.tsx`
- Test: `tests/e2e/tier15-projects.test.ts` (new `T15-LIST-01`, renders the page like other page tests via `tests/e2e/react-tree.ts`)

**Interfaces:**
- Produces: `export function projectListWhere(tenantId: string, tab: "productions" | "sessions" | "all"): Prisma.ProjectWhereInput` in `lib/projects/list.ts`.

- [ ] **Step 1: Failing test** on `projectListWhere`: with one PRODUCTION, one SESSION, and one SESSION whose booking is `CANCELLED`:
```ts
harness.assertEqual(await count("productions"), 1, "Productions tab: productions only");
harness.assertEqual(await count("sessions"), 1, "Sessions tab hides cancelled bookings");
harness.assertEqual(await count("all"), 3, "All shows everything");
```
(`count = (tab) => db.project.count({ where: projectListWhere(lumina.id, tab) })`, scoped to the test's own client.)
- [ ] **Step 2: Run** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `projectListWhere` (productions/sessions exclude `booking.status in ["CANCELLED","NO_SHOW"]`; projects without a booking are kept). Page reads `searchParams.tab` (default `"productions"`), renders three `Link` tabs with counts (`db.project.count` per tab), and updates the empty-state copy to "Every confirmed booking gets a project. Sessions are listed under Sessions."
- [ ] **Step 4: Run `npm run test:e2e`** — Expected: 0 failed.
- [ ] **Step 5: Commit** — `feat(projects): Productions / Sessions / All tabs`

### Task 5: Booking → "Upload photos", session page, delivery marks the booking

**Files:**
- Modify: `components/admin/bookings/booking-actions.tsx` (remove `deliver` mode, `markBookingDelivered`, Promote button; add Upload photos link)
- Modify: `lib/actions/admin-booking-lifecycle.ts` (delete `DeliverSchema`, `markBookingDelivered`)
- Modify: `components/admin/projects/project-workspace.tsx` (`id="files"` on the files Section; hide call sheets, shot list, gear when `project.kind === "SESSION"`; kind switch)
- Modify: `app/[tenantSlug]/admin/projects/[projectId]/page.tsx` (pass `kind`)
- Modify: `lib/actions/admin-projects.ts` (`updateProjectKind`; `notifyClientPhotosReady` marks booking delivered)
- Test: `tests/e2e/tier15-projects.test.ts` (extend `T15-FILES-02`, new `T15-KIND-01`), `tests/e2e/tier14-booking-lifecycle.test.ts` (drop `markBookingDelivered` cases)

**Interfaces:**
- Consumes: `Project.kind` (Task 1).
- Produces: `export async function updateProjectKind(input: { tenantId: string; projectId: string; kind: "SESSION" | "PRODUCTION" }): Promise<Result>` in `lib/actions/admin-projects.ts` (staff only, tenant-scoped).

- [ ] **Step 1: Failing tests.**
  `T15-KIND-01`: crew switches a project with one call sheet to SESSION → `kind === "SESSION"` and `callSheet.count === 1` (hidden, not deleted); switch back → `"PRODUCTION"`; another studio's owner → `success === false`; `kind: "OTHER"` → `success === false`.
  Extend `T15-FILES-02` with a booking-linked project: booking `COMPLETED` → after notify, `booking.status === "DELIVERED"` and `deliveredAt` set; a second project whose booking is `CANCELLED` → status stays `"CANCELLED"` (Review Focus 4).
- [ ] **Step 2: Run** — Expected: FAIL (`updateProjectKind` missing, booking not delivered).
- [ ] **Step 3: Implement** `updateProjectKind`; in `notifyClientPhotosReady`, after sending, `clientBooking.updateMany({ where: { id: project.bookingId, status: { in: ["CONFIRMED","COMPLETED"] } }, data: { status: "DELIVERED", deliveredAt: now } })` (keep an existing `deliveredAt`), revalidate `/admin/bookings`.
- [ ] **Step 4: UI.** Booking actions: when `booking.project` exists show **Upload photos →** linking `/${tenantSlug}/admin/projects/${booking.project.id}#files`; remove Promote and Mark delivered. Workspace: session page renders the header (stage + kind select "Session / Production"), Files, Payments only. Delete `markBookingDelivered` and its tier14 cases; keep read-only `deliveryUrl` display.
- [ ] **Step 5: Run `npm run test:e2e`, `npx tsc --noEmit`, `npx eslint` on touched files** — Expected: 0 failed, clean.
- [ ] **Step 6: Browser check** on a separate dev server (`npx next dev -p 3100`): a session booking shows Upload photos → lands on Files; the session page has no call sheet/gear/shot list; Projects tabs switch.
- [ ] **Step 7: `graphify update .`; commit** — `feat(bookings): upload photos from the booking; simple session page`
