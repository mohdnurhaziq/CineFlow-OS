# Team, Roles, Access and Shoot Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a studio owner invite and remove team members, define the studio's own roles with per-area access (plus extras per person), and assign team members to bookings, so each person sees only what their access allows and opens the app to their own schedule.

**Architecture:** A new `lib/auth/access.ts` turns a person's role + extras into one access map (read from the database on every call, never from the session cookie). One pair of server checks, `requireAccess` and `requireTick`, replaces every `requireStaff` / `requireOwner` / `OWNER_ROLES` decision in admin actions, pages, API routes and the admin menu. Roles and extras are stored as a JSON string on `TeamRole.access` / `User.extraAccess`; assignments are a `BookingAssignment` link table.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma + SQLite, Tailwind, sonner, the in-repo e2e harness (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-16-team-roles-and-assignments-design.md`

## Global Constraints

- Before any codebase question, run `graphify query "<question>"` (CLAUDE.md); after code changes run `graphify update .`.
- Work on branch `feat/team-roles`. Commit messages never contain Co-Authored-By or "Generated with Claude" lines.
- Areas (keys, in this order): `bookings`, `galleries`, `production`, `printOrders`, `clients`, `proposals`, `invoices`, `services`, `catalog`.
- Levels, lowest to highest: `NONE` < `OWN` < `VIEW` < `MANAGE`. Only `bookings` and `galleries` accept `OWN`; any other area given `OWN` is read as `NONE`.
- Ticks: `approvePayments`, `recordPayments`, `setPrices`. Default `false`.
- `STUDIO_OWNER` and `SUPER_ADMIN` always have every area at `MANAGE` and every tick; access settings never apply to them.
- Team & roles and Studio settings are owner-only and never grantable.
- New team accounts use `User.role = "TEAM_MEMBER"`. `PHOTOGRAPHER`, `VIDEOGRAPHER`, `CREW` stay valid team account types. `STAFF_ROLES` includes all four; `app/api/upload/route.ts` imports `STAFF_ROLES` instead of keeping its own copy.
- Legacy access (existing team on upgrade): every area `MANAGE`, every tick `false`.
- Starter roles for a studio with no team members, exactly:
  - `Photographer`: bookings OWN, galleries OWN, production VIEW.
  - `Videographer`: bookings OWN, galleries OWN, production VIEW.
  - `Crew`: bookings OWN, production VIEW.
  - `Front desk`: bookings MANAGE, clients MANAGE, galleries VIEW, printOrders MANAGE, invoices VIEW.
- Invite links last 30 days, open the existing reset-password page in a "welcome" mode, and are also shown on screen to copy.
- A failed or skipped email never blocks the action; the screen says what happened (as `notifyClientPhotosReady` does today).
- No browser `confirm()`/`alert()`; use `useConfirm` from `components/ui/confirm-dialog`.
- Admin pages keep the admin top bar (`AdminHeader`); the menu hides what the person can't open.
- Schema changes reach Docker via `prisma db push` on container start; tests use `prisma/test.db` via `npm run test:e2e`. Do not run `prisma db push` against `prisma/dev.db`.
- Every new e2e tier is registered in `tests/e2e/runner.ts`.
- After UI changes: `docker compose up -d --build app`, wait for HTTP 200 on `localhost:3000`, check in the browser.

## Review Focus

1. A team member calls an owner-only or higher-access action directly (crafted request, not the UI): refused on the server with `AuthorizationError`. Pinned in Task 3 (`T24-ACCESS-03`).
2. A removed member's open session and their "Forgot password": the next request is signed out and no reset link is issued. Pinned in Task 6 (`T24-TEAM-04`).
3. An "Only their own" member opens another person's booking or gallery by URL, or uploads to another project via `/api/upload`: refused. Pinned in Task 4 (`T24-OWN-02`).
4. Deleting a role that still has members, or giving two roles the same name: refused with a plain message. Pinned in Task 5 (`T24-ROLE-02`).
5. Inviting an email that is the owner, a client of the same studio, an active team member, or a removed team member: refused with the right message (the removed case says to bring them back). Pinned in Task 6 (`T24-TEAM-02`).

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `TeamRole`, `BookingAssignment`, new `User` fields |
| `lib/auth/access.ts` | Access types, constants, parse/merge, `loadAccess`, `ensureStudioRoles` (plain module) |
| `lib/auth/access-guard.ts` | `requireAccess`, `requireTick`, `canAccessBooking`, `canAccessProject` (plain module) |
| `lib/auth/admin-page.ts` | `adminPageAccess` for admin pages |
| `components/admin/no-access.tsx` | The "You don't have access to this" page body |
| `lib/actions/admin-team.ts` | Invite, edit, remove, restore, resend; role create, update, delete (`"use server"`) |
| `components/admin/settings/team-tab.tsx`, `team-member-dialog.tsx`, `team-role-dialog.tsx`, `access-editor.tsx` | Settings → Team |
| `lib/actions/admin-assignments.ts` | Assign and unassign (`"use server"`) |
| `lib/bookings/assignment-emails.ts` | Emails to assigned team members (plain module) |
| `components/admin/bookings/booking-team-section.tsx`, `assign-dialog.tsx` | Assigning in Booking Details and the Bookings list |
| `app/[tenantSlug]/admin/schedule/page.tsx`, `components/admin/schedule/my-schedule.tsx` | My schedule |
| `app/[tenantSlug]/admin/manual/team/page.tsx` | Manual page |
| `tests/e2e/tier24-team-access.test.ts`, `tests/e2e/tier25-assignments.test.ts` | Tests |

---

## Phase 1: Team, roles and access

### Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma` (models `User`, `Tenant`, `ClientBooking`)
- Test: `tests/e2e/tier24-team-access.test.ts` (new, registered in `tests/e2e/runner.ts`)

**Interfaces:**
- Produces: `TeamRole { id, tenantId, name, access: String (JSON), sortOrder: Int @default(0), createdAt, updatedAt; @@unique([tenantId, name]) }`; `User.teamRoleId String?`, `User.extraAccess String?`, `User.deactivatedAt DateTime?`, `User.teamRole TeamRole?`; `BookingAssignment { id, tenantId, bookingId, userId, assignedById String?, createdAt; @@unique([bookingId, userId]); @@index([userId]) }` with `onDelete: Cascade` from the booking; back-relations `ClientBooking.assignments`, `User.assignments`, `Tenant.teamRoles`.

- [ ] **Step 1: Write the failing test** `T24-SCHEMA-01: team roles, extras and assignments are stored`: create a `TeamRole` for lumina with `access: "{}"`, link a seeded PHOTOGRAPHER to it with `extraAccess: "{}"`, create a `BookingAssignment` on a seeded booking for that user, read them back, assert the fields round-trip, then assert a second `TeamRole` with the same name in the same studio throws. Clean up in `finally`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: fails (unknown model `teamRole`).
- [ ] **Step 3: Add the models and fields** as in Interfaces.
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: T24-SCHEMA-01 passes, 0 failed.
- [ ] **Step 5: Commit** `feat(team): schema for team roles, extras and booking assignments`.

### Task 2: The access model

**Files:**
- Create: `lib/auth/access.ts`, `lib/auth/access-guard.ts`
- Modify: `lib/auth/guard.ts` (add `"TEAM_MEMBER"` to `STAFF_ROLES`), `app/api/upload/route.ts` (import `STAFF_ROLES`)
- Test: `tests/e2e/tier24-team-access.test.ts`

**Interfaces:**
- Produces, in `lib/auth/access.ts`:
  - `type AccessArea = "bookings" | "galleries" | "production" | "printOrders" | "clients" | "proposals" | "invoices" | "services" | "catalog"`
  - `type AccessLevel = "NONE" | "OWN" | "VIEW" | "MANAGE"`; `type AccessTick = "approvePayments" | "recordPayments" | "setPrices"`
  - `interface AccessMap { areas: Record<AccessArea, AccessLevel>; ticks: Record<AccessTick, boolean> }`
  - `ACCESS_AREAS: AccessArea[]`, `ACCESS_TICKS: AccessTick[]`, `FULL_ACCESS`, `NO_ACCESS`, `LEGACY_TEAM_ACCESS`, `STARTER_ROLES: { name: string; access: AccessMap }[]` (values in Global Constraints)
  - `parseAccess(json: string | null | undefined): AccessMap`: unknown keys ignored; missing or invalid → `NONE` / `false`; `OWN` outside bookings/galleries → `NONE`.
  - `serializeAccess(map: AccessMap): string`
  - `mergeAccess(a: AccessMap, b: AccessMap): AccessMap`: higher level per area; ticks OR-ed.
  - `levelAtLeast(have: AccessLevel, need: AccessLevel): boolean`
  - `ensureStudioRoles(tenantId: string): Promise<void>`: idempotent. If the studio has no `TeamRole` rows: when it has team members (role in PHOTOGRAPHER/VIDEOGRAPHER/CREW/TEAM_MEMBER), create one role per distinct legacy title ("Photographer", "Videographer", "Crew"; TEAM_MEMBER without a role → "Team") with `LEGACY_TEAM_ACCESS`; otherwise create `STARTER_ROLES`. In every case, link team members with `teamRoleId = null` to the role named after their title (creating it with `LEGACY_TEAM_ACCESS` if missing). A unique-constraint race is caught and ignored.
  - `loadAccess(user: { id: string; role: string; tenantId: string | null }): Promise<AccessMap>`: owner/super-admin → `FULL_ACCESS`; deactivated or not a team account → `NO_ACCESS`; otherwise calls `ensureStudioRoles` when `teamRoleId` is null, then `mergeAccess(parseAccess(role.access), parseAccess(user.extraAccess))`.
- Produces, in `lib/auth/access-guard.ts`:
  - `requireAccess(tenantId: string, area: AccessArea, need: AccessLevel): Promise<SessionUser & { access: AccessMap }>`: `requireStaff(tenantId)` first, then throws `AuthorizationError("FORBIDDEN: …")` when below `need`.
  - `requireTick(tenantId: string, tick: AccessTick): Promise<SessionUser & { access: AccessMap }>`
  - `canAccessBooking(user, access, bookingId): Promise<boolean>`: `VIEW`+ → true; `OWN` → a `BookingAssignment` exists for (bookingId, user.id); else false.
  - `canAccessProject(user, access, projectId): Promise<boolean>`: `galleries` `VIEW`+ → true; `OWN` → user is the project's `studioLeadId`, or is assigned to the project's booking; else false.

- [ ] **Step 1: Write failing tests:**
  - `T24-ACCESS-01: parse, merge and levels`: `parseAccess(null)` equals `NO_ACCESS`; `parseAccess('{"areas":{"clients":"OWN"}}').areas.clients === "NONE"`; merging `{bookings: OWN}` with `{bookings: MANAGE}` gives `MANAGE`; a tick true in either is true; `levelAtLeast("VIEW","OWN") === true`, `levelAtLeast("OWN","VIEW") === false`.
  - `T24-ACCESS-02: starter and legacy roles`: for apex-media (has a seeded PHOTOGRAPHER and CREW) `ensureStudioRoles` creates exactly roles "Photographer" and "Crew", both `LEGACY_TEAM_ACCESS`, and links both members; calling it twice creates nothing new. For a fresh studio created in the test with no team, it creates the four starter roles with the exact values from Global Constraints.
  - `T24-ACCESS-03: owner and super-admin always have everything; a deactivated member has nothing`: `loadAccess` for the lumina owner equals `FULL_ACCESS`; a member with `deactivatedAt` set gets `NO_ACCESS`; `requireTick(lumina, "setPrices")` inside `withSession(luminaCrew)` throws.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: the three fail.
- [ ] **Step 3: Implement** both modules as in Interfaces.
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: pass, 0 failed.
- [ ] **Step 5: Commit** `feat(team): access model, starter roles and server checks`.

### Task 3: Replace every server-side check

**Files:**
- Modify: every file below.
- Test: `tests/e2e/tier24-team-access.test.ts`; existing `tests/e2e/tier10-authorization.test.ts` must keep passing (only message text may change).

**Interfaces:**
- Consumes: `requireAccess`, `requireTick`, `canAccessBooking`, `canAccessProject` (Task 2).
- Produces: no new exports. Existing error codes (`OWNER_ONLY`, `OWNER_PRICING_REQUIRED`) are kept; their messages become "Only the studio owner, or someone they've allowed to …, can …".

The mapping (action → check). "own" means: call the level shown, then refuse with `FORBIDDEN` unless `canAccessBooking` / `canAccessProject` is true for that record.

| File | Function | Check |
|---|---|---|
| `admin-booking-lifecycle.ts` | `cancelBooking` | bookings MANAGE; plus tick `recordPayments` when `depositPaid` (replaces `OWNER_ROLES`) |
| | `listRescheduleOptions`, `rescheduleBooking`, `resendBookingConfirmation` | bookings MANAGE |
| | `recordSessionOutcome` | bookings OWN, own |
| `admin-bookings.ts` | `createBookingForCustomer` | bookings MANAGE; tick `recordPayments` when `paymentStatus === "PAID"` |
| | `getBookingDetails` | bookings OWN, own |
| | `promoteBookingToProjectAction` | galleries MANAGE |
| `admin-calendar.ts` | all slot actions, `cleanupExpiredHolds` | bookings MANAGE; the three `OWNER_ROLES` price checks → tick `setPrices` |
| `admin-included-prints.ts` | both | bookings MANAGE |
| `admin-clients.ts` | both | clients MANAGE |
| `admin-projects.ts` | `createProposal` | tick `setPrices` |
| | `updateProjectStatus`, `deleteDeliverableItem`, `notifyClientPhotosReady` | galleries OWN, own |
| | `updateProjectKind` | galleries MANAGE |
| | `createCallSheet`, `deleteCallSheet`, `cancelEquipmentReservation` | production MANAGE |
| `admin-proposals.ts` | all | proposals MANAGE |
| `admin-invoices.ts` | `recordInvoicePayment`, `voidInvoice` | tick `recordPayments` |
| | `sendInvoiceReminder` | invoices MANAGE |
| | `createInvoice` | tick `setPrices` |
| `admin-verification.ts` | approve, reject | tick `approvePayments` |
| `admin-services.ts` | package create/update/delete, `deleteCampaignCategory` | tick `setPrices` |
| | `togglePackageFeatured`, category create/update/toggle | services MANAGE |
| `admin-frames.ts`, `admin-shipping.ts`, `admin-cms.ts` | all | catalog MANAGE |
| `gear.ts` | `checkBundleAvailability`, `logPreShootInspection`, `logPostShootInspection` | production VIEW |
| | everything else | production MANAGE |
| `logistics.ts` | `toggleShotCompletion` | production VIEW |
| | shot create/update/delete | production MANAGE |
| `print-orders.ts` | `updatePrintOrderStatus`; staff path of `placePrintOrder`; staff path of `cancelPrintOrder` | printOrders MANAGE; cancelling an order with an invoice also tick `recordPayments` |
| `admin-analytics.ts` | `getStudioAnalytics` | invoices VIEW |
| `admin-settings.ts`, `admin-payments.ts`, `onboarding-guide.ts#dismissSetupChecklist` | | unchanged (`requireOwner`) |
| `app/api/upload/route.ts`, `app/api/deliverables/route.ts` | staff branch | galleries OWN, own (project from the request) |
| `lib/auth/project-access.ts` | staff branch | staff pass only with the record's area (Galleries for vaults, Proposals VIEW for proposals, Production VIEW for call sheets and releases); vault OWN → `canAccessProject` |

- [ ] **Step 1: Write failing tests:**
  - `T24-ACCESS-04: every admin action checks access`: read each file in `lib/actions/admin-*.ts`, `gear.ts`, `logistics.ts`, `print-orders.ts`; for each `export async function`, assert its body contains `requireAccess(`, `requireTick(`, `requireOwner(` or `requireStaffBySlug(` (the last only in `onboarding-guide.ts#markTourSeen`); assert no file outside `lib/auth/` references `OWNER_ROLES`.
  - `T24-ACCESS-05: a role without access is refused on the server`: give a test role every area `NONE`, link a test member; inside `withSession(member)` assert `updateClientNotes`, `createGearItem`, `saveShippingZones`, `sendInvoiceReminder` each return `success: false` or throw `AuthorizationError`.
  - `T24-ACCESS-06: ticks grant exactly the money powers`: a member with every area `MANAGE` and only `setPrices` can `createServicePackage` but `recordInvoicePayment` and `approvePaymentVerification` are refused.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: the three fail.
- [ ] **Step 3: Replace the checks** per the table.
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: all pass, tier10 included, 0 failed.
- [ ] **Step 5: Commit** `feat(team): every admin action checks the person's access`.

### Task 4: Pages, menu and "Only their own" lists

**Files:**
- Create: `lib/auth/admin-page.ts`, `components/admin/no-access.tsx`
- Modify: every `app/[tenantSlug]/admin/**/page.tsx` except `manual/*`; `components/admin/admin-header.tsx`, `components/admin/admin-nav-bar.tsx`; components taking `isOwner` (see the earlier list: booking-actions, booking-details-dialog, bookings-console, new-booking-dialog, calendar dashboard and dialogs, invoice-admin-actions, print-order-actions, services-dashboard, verification console and queue); `lib/auth/owner.ts` (remove once unused)
- Test: `tests/e2e/tier24-team-access.test.ts`

**Interfaces:**
- Produces: `adminPageAccess(tenantSlug: string): Promise<{ user: SessionUser; access: AccessMap; isOwner: boolean } | null>` (null when signed out or not this studio's team; the admin layout already redirects those). Pages decide with `levelAtLeast` and return `<NoAccess />` when below the level in the table.
- `AdminNavBar` gains prop `access: AccessMap` and hides each item below its level; `AdminHeader` passes it.
- `AdminHeader` shows a team member's role name (their `TeamRole.name`, e.g. "Front desk") under their name instead of the account type ("TEAM MEMBER"); the owner keeps "Studio owner".
- Components' `isOwner: boolean` props become the specific power they gate, named after it: `canRecordPayments`, `canSetPrices`, `canApprovePayments`, `canManage` (the area's MANAGE). Owners get `true` for all.

| Page | Needs |
|---|---|
| `admin` (Overview) | any team member; money tiles and recent invoices only with invoices VIEW; gear tile with production VIEW; proposals tile with proposals VIEW |
| `bookings`, `bookings/[id]` | bookings OWN (list filtered to assigned at OWN; detail needs `canAccessBooking`) |
| `calendar` | bookings VIEW |
| `clients`, `clients/[id]` | clients VIEW |
| `projects` | galleries OWN (list filtered at OWN to `canAccessProject` rules) |
| `projects/[id]` | galleries OWN + `canAccessProject` |
| `projects/[id]/prints` | printOrders MANAGE + galleries OWN + `canAccessProject` |
| `print-orders`, `print-orders/[id]` | printOrders VIEW |
| `inventory` | production VIEW |
| `invoices`, `invoices/[id]` | invoices VIEW |
| `verification` | tick approvePayments, or invoices VIEW (read-only queue) |
| `proposals` | proposals VIEW |
| `services` | services VIEW |
| `frames`, `frames/visualizer`, `cms` | catalog VIEW |
| `settings` | owner only (unchanged) |

- [ ] **Step 1: Write failing tests:**
  - `T24-OWN-01: an Only-their-own member's lists hold only their work`: member with bookings OWN and galleries OWN, assigned to one seeded booking: the bookings query used by the Bookings page (extract it as `loadAdminBookings(tenantId, viewer)` in `lib/bookings/admin-list.ts`) returns exactly that booking; the projects query (`loadAdminProjects(tenantId, viewer)` in `lib/projects/list.ts`) returns only its gallery and any where they are studio lead.
  - `T24-OWN-02: they can't reach anyone else's work`: `getBookingDetails` for an unassigned booking fails; `canAccessProject` for another gallery is false; a POST to `/api/upload` for another project as that member returns 403.
  - `T24-MENU-01: the menu hides what they can't open`: render `AdminNavBar` with the Crew starter access; assert no links to `/admin/invoices`, `/admin/verification`, `/admin/clients`, `/admin/services`; assert links to `/admin/bookings` and `/admin/inventory` are present.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: fail.
- [ ] **Step 3: Implement** the helper, page gates, menu filtering and the prop renames.
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: pass, 0 failed.
- [ ] **Step 5: Commit** `feat(team): admin pages and menu follow each person's access`.

### Task 5: Roles on Settings → Team

**Files:**
- Create: `lib/actions/admin-team.ts`, `components/admin/settings/team-tab.tsx`, `team-role-dialog.tsx`, `access-editor.tsx`
- Modify: `components/admin/settings/tabs.ts` (add `{ id: "team", label: "Team" }` after "Photo delivery"), `settings-shell.tsx`, `app/[tenantSlug]/admin/settings/page.tsx`
- Test: `tests/e2e/tier24-team-access.test.ts`

**Interfaces:**
- Produces (all `requireOwner`; return `{ success: true, ... } | { success: false; error: string; message: string }`):
  - `createTeamRole({ tenantId, tenantSlug, name, access: AccessMap })` → `{ roleId }`
  - `updateTeamRole({ tenantId, tenantSlug, roleId, name, access })` → `{ affected: number }` (members with this role)
  - `deleteTeamRole({ tenantId, tenantSlug, roleId })`; error `ROLE_IN_USE` when members are linked, message "Move its {n} people to another role first."; error `NAME_TAKEN` on a duplicate name.
- `AccessEditor` (client): props `value: AccessMap`, `onChange(map)`, `baseline?: AccessMap` (for extras: shows the role's level and only offers higher ones). Each area is a row with the levels it accepts; each tick a checkbox with one plain-language line from the spec.

- [ ] **Step 1: Write failing tests:**
  - `T24-ROLE-01: the owner manages roles`: create "Editor" with galleries MANAGE; update it to galleries VIEW and see `affected` equal the linked count; a team member's next `loadAccess` reflects the change without a new session.
  - `T24-ROLE-02: roles can't clash or vanish from under people`: duplicate name → `NAME_TAKEN`; deleting a role with a member → `ROLE_IN_USE`; a team member calling `createTeamRole` is refused.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: fail.
- [ ] **Step 3: Implement** the actions and the Roles half of the Team tab (list as in the spec sketch; New role and Edit open `TeamRoleDialog` with `AccessEditor`; the dialog says how many people a change affects).
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: pass.
- [ ] **Step 5: Commit** `feat(team): studios define their own roles and access`.

### Task 6: Members: invite, edit, remove, bring back

**Files:**
- Modify: `lib/actions/admin-team.ts`, `components/admin/settings/team-tab.tsx`; `lib/auth/password-reset.ts` (`issuePasswordReset(userId, now?, ttlMinutes = PASSWORD_RESET_TTL_MINUTES)`); `lib/auth/session.ts` (`loginWithCredentials` refuses `deactivatedAt` with error `ACCOUNT_REMOVED`); `components/auth/studio-login-form.tsx` (message "This account was removed by the studio."); `lib/actions/password-reset.ts` (no link for removed accounts; same neutral reply); `app/[tenantSlug]/reset-password/page.tsx` + `components/auth/reset-password-form.tsx` (`welcome=1`: heading "Welcome to {studio}", button "Set my password"); `lib/notifications.ts` (event `TEAM_INVITE`)
- Create: `components/admin/settings/team-member-dialog.tsx`
- Test: `tests/e2e/tier24-team-access.test.ts`

**Interfaces:**
- Produces (all `requireOwner`):
  - `inviteTeamMember({ tenantId, tenantSlug, name, email, roleId, extraAccess?: AccessMap })` → `{ userId, inviteUrl, emailDelivery: "SENT" | "SKIPPED" | "FAILED" }`. Creates `role: "TEAM_MEMBER"`, no password, a 30-day (43 200 min) reset token; `inviteUrl` = absolute `passwordResetPath(...)` + `&welcome=1`.
  - `resendTeamInvite({ tenantId, tenantSlug, userId })` → same shape.
  - `updateTeamMember({ tenantId, tenantSlug, userId, name, roleId, extraAccess })`
  - `removeTeamMember({ tenantId, tenantSlug, userId })`: sets `deactivatedAt` and `sessionsValidAfter = now`, deletes that user's `BookingAssignment` rows for bookings whose session is today or later and not cancelled; returns `{ unassigned: number }`.
  - `restoreTeamMember({ tenantId, tenantSlug, userId })`: clears `deactivatedAt`.
  - Member status for the list: `"ACTIVE"` (has password, not removed), `"INVITED"` (no password, link unexpired), `"LINK_EXPIRED"`, `"REMOVED"`; exported as `teamMemberStatus(user, now)` from `lib/team/status.ts` (plain module).
- Errors: `EMAIL_IS_OWNER`, `EMAIL_IS_CLIENT` ("{email} is a client of this studio. A client can't also be on the team."), `ALREADY_ON_TEAM`, `REMOVED_MEMBER` ("{name} was removed. Bring them back from the list instead."), `CANNOT_CHANGE_OWNER` (owner's own row).

- [ ] **Step 1: Write failing tests:**
  - `T24-TEAM-01: invite creates a member who sets a password from the link`: invite returns an `inviteUrl` containing `welcome=1`; status is `INVITED`; `resetPassword` with that token sets the password; status becomes `ACTIVE`; `loginWithCredentials` succeeds and the session's `loadAccess` matches the role.
  - `T24-TEAM-02: invite refuses the wrong emails`: the owner's email → `EMAIL_IS_OWNER`; a seeded lumina client → `EMAIL_IS_CLIENT`; the invited member again → `ALREADY_ON_TEAM`; after removal → `REMOVED_MEMBER`. The same email invited at apex-media succeeds.
  - `T24-TEAM-03: extras add to the role`: a Photographer with extras bookings MANAGE can call `rescheduleBooking`; without the extra it's refused.
  - `T24-TEAM-04: removing someone locks them out at once`: after `removeTeamMember`, `getCurrentUser()` with their pre-existing session returns null; `loginWithCredentials` returns `ACCOUNT_REMOVED`; `requestPasswordReset` issues no token; their future assignments are gone and past ones kept; `restoreTeamMember` lets them sign in again.
  - `T24-TEAM-05: the owner's row can't be changed here`: `removeTeamMember` / `updateTeamMember` on the owner → `CANNOT_CHANGE_OWNER`.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: fail.
- [ ] **Step 3: Implement** the actions, the email, sign-in refusal, welcome mode, and the Members half of the Team tab: "Invite team member" opens `TeamMemberDialog` (name, email, role, optional extras via `AccessEditor` with `baseline` = the role); after inviting, show the link with a Copy button and the email outcome; rows show name, email, role (+ extras summary), status, and Resend link / Edit / Remove / Bring back; Remove confirms with `useConfirm` and reports how many bookings were unassigned.
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: pass, 0 failed.
- [ ] **Step 5: Rebuild Docker and check in the browser** as the lumina owner: invite a member, open the link in an isolated tab, set a password, sign in, see only the allowed menu; remove them and see the session end. Remove the test member afterwards.
- [ ] **Step 6: Commit** `feat(team): owners invite, edit and remove team members`.

## Phase 2: Assigning shoots

### Task 7: Assign and unassign, with emails

**Files:**
- Create: `lib/actions/admin-assignments.ts`, `lib/bookings/assignment-emails.ts`
- Modify: `lib/notifications.ts` (events `SHOOT_ASSIGNED`, `SHOOT_CHANGED`), `lib/actions/admin-booking-lifecycle.ts` (`cancelBooking`, `rescheduleBooking` notify assignees), `lib/bookings/expiry.ts` (auto-cancelled bookings notify assignees)
- Test: `tests/e2e/tier25-assignments.test.ts` (new, registered)

**Interfaces:**
- Produces:
  - `assignTeamMember({ tenantId, tenantSlug, bookingIds: string[], userId })` → `{ assigned: number; skipped: number; emailDelivery }`. Bookings MANAGE. Skips cancelled bookings and existing pairs. Refuses a user who isn't an active team member of the studio (`NOT_ON_TEAM`).
  - `unassignTeamMember({ tenantId, tenantSlug, bookingId, userId })`. Bookings MANAGE. Emails "unassigned".
  - `notifyAssignees(bookingId: string, change: { kind: "ASSIGNED" | "MOVED" | "CANCELLED" | "UNASSIGNED"; previous?: string; userIds?: string[] }): Promise<void>` in `assignment-emails.ts`; never throws.
- [ ] **Step 1: Write failing tests:**
  - `T25-ASSIGN-01: assign one or many`: assigning one member to three bookings creates three rows; repeating skips all three; a cancelled booking is skipped; two people on one booking both stored.
  - `T25-ASSIGN-02: only active team members, only with Bookings: Manage`: a client id → `NOT_ON_TEAM`; a removed member → `NOT_ON_TEAM`; a Photographer starter role calling assign is refused.
  - `T25-ASSIGN-03: assignees hear about changes`: with email in log mode, `rescheduleBooking` and `cancelBooking` record a `SHOOT_CHANGED` notification to each assignee; `getNotificationHistory` shows them; assignments survive the move.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:e2e`. Expected: pass.
- [ ] **Step 5: Commit** `feat(assign): assign team members to bookings, with emails`.

### Task 8: Assigning in the Bookings screens

**Files:**
- Create: `components/admin/bookings/booking-team-section.tsx`, `components/admin/bookings/assign-dialog.tsx`
- Modify: `components/admin/bookings/booking-details-dialog.tsx`, `bookings-console.tsx`, `lib/bookings/details.ts` (assignees on the details payload), `lib/bookings/admin-list.ts` (assignees per row), `app/[tenantSlug]/admin/bookings/page.tsx` (active team list for the picker)
- Test: `tests/e2e/tier25-assignments.test.ts`

**Interfaces:**
- Consumes: `assignTeamMember`, `unassignTeamMember` (Task 7).
- Booking Details: a "Team" section listing assignees (name + role), "Add" (pick an active member) and remove per person; shown read-only below MANAGE.
- Bookings list: a "Team" column; filter chip "Unassigned" (upcoming, not cancelled, no assignees); row checkboxes and an "Assign" button (MANAGE only) opening `AssignDialog` to pick one person for all ticked rows; the toast reports assigned/skipped.

- [ ] **Step 1: Write failing tests:** `T25-UI-01: the bookings list and details carry assignees`: `loadAdminBookings` rows include `assignees: { id, name }[]` and the "Unassigned" predicate `isUnassigned(row, today)` (exported from `lib/bookings/admin-list.ts`) is true only for upcoming, non-cancelled rows without assignees; `getBookingDetails` includes `assignees`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement** data and UI.
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Rebuild Docker; in the browser** assign two lumina bookings at once, open one and remove the person.
- [ ] **Step 6: Commit** `feat(assign): assign from Booking Details and the Bookings list`.

### Task 9: My schedule, landing and the Overview flag

**Files:**
- Create: `app/[tenantSlug]/admin/schedule/page.tsx`, `components/admin/schedule/my-schedule.tsx`, `lib/bookings/schedule.ts`
- Modify: `components/admin/admin-nav-bar.tsx` ("My schedule" first, for every team member), `components/auth/studio-login-form.tsx` (team accounts land on `/{slug}/admin/schedule`; owner on `/{slug}/admin`), `components/admin/studio-dashboard.tsx` + `app/[tenantSlug]/admin/page.tsx` (flag "N upcoming bookings have nobody assigned" linking to Bookings filtered Unassigned, shown with bookings VIEW+)
- Test: `tests/e2e/tier25-assignments.test.ts`

**Interfaces:**
- Produces: `loadSchedule(tenantId: string, userId: string, opts: { from: string /* YYYY-MM-DD studio date */; past?: boolean }): Promise<{ date: string; sessions: ScheduleSession[] }[]>` where `ScheduleSession = { bookingId, startTime, endTime, clientName, clientPhone, category, packageName: string | null, brief: string | null, projectId: string | null, status }`. Excludes cancelled bookings; groups by studio date; sorted by date then start time.
- Page: day groups; each session shows time, client name with call and WhatsApp links, category and package, brief, and "Open gallery" when `canAccessProject`; "Past sessions" toggles `past: true`; empty state "Nothing assigned to you yet."

- [ ] **Step 1: Write failing tests:**
  - `T25-SCHED-01: a member's schedule holds only their upcoming sessions`: assigned to two upcoming bookings and one cancelled: two sessions returned, in time order, grouped by date; another member's assignment is absent.
  - `T25-SCHED-02: the overview counts unassigned bookings`: `countUnassignedUpcoming(tenantId, today)` (exported from `lib/bookings/schedule.ts`) equals the number of upcoming confirmed-or-pending bookings with no assignees.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Rebuild Docker; in the browser** sign in as a Photographer starter member assigned to one booking: lands on My schedule, sees one session, the menu shows My schedule, Bookings, Galleries, Gear & Fleet, Manual only.
- [ ] **Step 6: Commit** `feat(assign): My schedule, team landing and unassigned flag`.

### Task 10: Manual, to-do list and final checks

**Files:**
- Create: `app/[tenantSlug]/admin/manual/team/page.tsx`
- Modify: `lib/manual/topics.ts` (topic `team`, area "Studio setup", before `settings-and-team`), manual pages `bookings`, `payments`, `settings-and-team`, `services-and-website`, `clients-and-proposals` ("who can do what" tables become "the owner, and anyone given …"; drop the platform-administrator claim; Settings has a Team tab), `getting-started` (menu table: My schedule; daily routine: assign shoots), `tests/e2e/tier21-admin-manual.test.ts` (register the page in `TOPIC_PAGES`; add quoted labels "Invite team member", "New role", "Unassigned", "My schedule" with their source files), `docs/BUG_FIX_LOG.md` (tick gap 1)
- Test: `tests/e2e/tier21-admin-manual.test.ts`

- [ ] **Step 1: Write the manual page** "Team, roles and assigning shoots" with sections: In short; Roles and access (the area table and the three ticks, with the Global Constraints values); Starter roles; Inviting someone; Changing access; Removing and bringing back; Assigning shoots; My schedule; What only the owner can do; Guidelines; Common questions.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: tier 21 passes with the new topic; 0 failed.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npx eslint` on changed files. Expected: no errors.
- [ ] **Step 4: Rebuild Docker and walk the whole flow in the browser** as owner, as a Front desk member and as a Photographer member; then remove the test accounts.
- [ ] **Step 5: Run** `graphify update .` and commit `docs(team): manual for team, roles and assignments` (include `graphify-out/`).
