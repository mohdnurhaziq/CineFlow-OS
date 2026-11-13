# Admin onboarding guide: design

**Date:** 2026-11-14
**Status:** Approved approach, awaiting design approval

## Why

A studio owner who signs in for the first time lands on a dashboard full of KPIs, invoices, call sheets and gear alerts, with about 11 admin pages behind the top menu. A brand-new studio is also nearly empty: sign-up creates only the tenant, the owner account and default campaign categories. The owner needs to know **what to do first**, and needs to be able to **close the help** when they no longer want it.

## Goals

- Tell a new owner what to set up, in order, and link straight to where each step is done.
- Explain what the dashboard and menu sections are, on demand.
- Dismissible, and the choice is remembered on the account (works on any device or browser).

## Non-goals

- Tours of individual admin pages (Invoices, Calendar…). This version covers only the dashboard and the top menu.
- Onboarding emails, videos or a help centre.
- Changing the existing dashboard content.

## Anti-goals

- Help that pops up again after the owner closed it.
- Steps that claim to be done when they aren't, or need manual ticking.
- Anything that gets in the way of staff who already know the system.

## Approaches considered

1. **Setup checklist only.** Tells owners what to do, but doesn't explain the screen.
2. **Guided tour only.** Explains the screen, but not what to do first, and is often clicked through unread.
3. **Both (chosen).** A checklist card for what to do, plus a tour that can be started at any time to explain the screen.

Supporting choices (chosen = first):
- **Where "closed" is remembered:** on the User record (chosen), or browser localStorage, which reappears on another browser.
- **Tour engine:** driver.js (chosen: small, MIT, framework-agnostic, works with React 19), react-joyride (React-version lag), or a custom implementation (more code to maintain).

## Design

### 1. Data

Add two nullable columns to `User` (applied by the existing `prisma db push`, no data loss):

- `onboardingChecklistDismissedAt DateTime?`: set when the owner closes the checklist.
- `onboardingTourSeenAt DateTime?`: set when any user finishes or skips the tour.

### 2. Setup checklist (studio owner only)

A card at the top of the admin dashboard (`components/admin/studio-dashboard.tsx` area, rendered by `app/[tenantSlug]/admin/page.tsx`). Every step is computed on the server from real data:

| # | Step | Done when | Action |
|---|---|---|---|
| 1 | Brand your studio | `tenant.logoUrl` set | Link to Settings |
| 2 | Add a service and price | ≥1 `ServicePackage` | Link to Services |
| 3 | Open booking times | ≥1 `BookingSlot` | Link to Calendar |
| 4 | Set up payments | `qrCodeUrl`, `bankDetails` or `toyyibpaySecretEnc` set | Link to Settings |
| 5 | Show your work | ≥1 `ShowcaseItem` | Link to Showcase CMS |
| 6 | Get your first booking | ≥1 `ClientBooking` | "Copy booking link" button |

- Shows "N of 6 done" and a progress bar. Done steps are ticked and muted. The first not-done step is highlighted as the next thing to do.
- **×** closes it. A server action sets `onboardingChecklistDismissedAt` and the card disappears.
- When all 6 are done, the card shows a short "Your studio is ready" message with a close button.
- Shown only when `role === "STUDIO_OWNER"`, the account belongs to this tenant, the checklist hasn't been dismissed, and at least one step is open or the "ready" message hasn't been closed yet. Not shown to staff or super admins.

### 3. Tour (all staff)

driver.js highlights one element at a time with Back / Next / Skip and a step counter. About 7 stops, each anchored with a `data-tour="..."` attribute:

1. Welcome (no anchor, centred)
2. Overview numbers (dashboard KPIs)
3. Production menu (projects, bookings, calendar, gear)
4. Finance menu (invoices, payment verification, proposals)
5. Catalog & CMS menu (services, frames, showcase)
6. Settings
7. Account menu, including "Take the tour" to replay
8. The setup checklist (only if it's shown)

- **Runs automatically once:** on the dashboard, for a user whose `onboardingTourSeenAt` is null. Finishing or skipping sets it, through a server action.
- **Replay:** a "Take the tour" button on the checklist card, and a "Take the tour" item in the account menu (`components/admin/admin-user-nav.tsx`). It works from any admin page by going to the dashboard with `?tour=1`.
- Styled to match the dark admin theme (zinc background, amber accent).

### 4. Server actions

A new `lib/actions/onboarding-guide.ts`, `"use server"`, with each action calling the existing staff guard (`lib/auth/guard.ts`) before touching the database:

- `dismissSetupChecklist(tenantSlug)`: owner of that tenant only.
- `markTourSeen(tenantSlug)`: any staff member of that tenant, updating only their own record.
- Checklist status is read by a server function called from the dashboard page (not a client-callable action).

## Constraints

- No migrations folder; the schema is applied with `prisma db push`, so new columns must be nullable.
- Server actions are public endpoints and must call the guards themselves (see `lib/auth/guard.ts`).
- The admin console is dark (zinc/amber) and has to work at phone width.

## Left to the builder

- Exact wording of steps and tour text (short, plain language).
- Card layout details, within the existing dashboard styling.
- driver.js version: pin an exact current release.
