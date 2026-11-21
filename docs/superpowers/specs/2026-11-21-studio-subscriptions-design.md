# Studio subscriptions and the super-admin console — design

Status: approved by the user in conversation (2026-11-21); this document writes it down, with a few builder calls marked as such.

## Why

Studios (CineFlow's customers) can't subscribe today. "Plan" is a label chosen at sign-up that
changes nothing, nothing charges a studio, and the landing page sells three plans (RM 99 / 249 / 599)
and features that don't exist (public API, webhooks, 24/7 support). Before redesigning the landing
page, the plans have to be real: what each includes, what a studio pays, and what happens when it
doesn't. The platform owner (the super-admin) needs one place to watch and run every studio.

The landing page redesign is a separate, later project; it will sell exactly what this builds.

## Decisions (the user's)

- **Payment:** collected manually for now. Studios pay the owner by bank transfer / DuitNow / cash;
  the owner records each payment in the super-admin console. No payment gateway. (Toyyibpay or
  Stripe can be added later behind the same records.)
- **Plans differ by features and team size**, as below.
- **Approved proposals** (the owner said "I'm ok with this proposals"): the plan table, the 14-day
  trial, recording payments with a paid-until date, upgrade panels for locked features, downgrades
  never deleting anything, reminders, 7-day grace, pausing that keeps clients' things working, and
  the console's contents.

## Approaches considered

1. **Toyyibpay bill each period** — already integrated for studios' own clients; not automatic.
2. **Stripe automatic card subscription** — true auto-renew; needs a registered business and a new
   integration.
3. **Manual collection, recorded in the console** — chosen: no gateway, fine for an invite-only
   beta, every renewal is the owner's work. Built so a gateway can later create the same payment
   records.

## The plans

Codes stay as stored today; the names people see change.

| | **Solo** (`STARTER`) RM 99/mo | **Studio** (`PRO`) RM 249/mo | **Production** (`STUDIO_UNLIMITED`) RM 599/mo |
|---|---|---|---|
| Team members besides the owner | 0 | 5 | unlimited |
| Studio website + portfolio, booking calendar, client accounts | ✓ | ✓ | ✓ |
| Deposits (QR, cash, online), payment-slip checking, invoices | ✓ | ✓ | ✓ |
| Galleries locked until final payment, email + calendar invites | ✓ | ✓ | ✓ |
| Team roles, shoot assignments, "My schedule" | – | ✓ | ✓ |
| Proposals with e-signature; on-set call sheets (HUD); talent releases | – | ✓ | ✓ |
| Own custom domain | – | ✓ | ✓ |
| Wall-art visualizer; print & frame orders | – | – | ✓ |
| Gear inventory and kits | – | – | ✓ |

Prices live in one place in code (a plan catalogue), shown in RM, monthly. A payment can cover any
period: the owner enters the paid-until date.

"Team members" means staff accounts other than the owner that aren't removed: active members plus
invitations still open (an invitation holds a place).

## A studio's subscription state

Worked out from stored dates, so nothing needs a timer to flip it:

- **Trial:** no payment recorded yet and today is on or before `trialEndsAt` (sign-up + 14 days).
  Everything unlocked (Production features and unlimited team) during the trial.
- **Active:** `paidUntil` is today or later. The studio's plan applies.
- **Overdue (grace):** up to 7 days after `paidUntil` (or after the trial ends with no payment). Works
  as Active, with a warning banner in the studio's admin.
- **Paused:** past the grace period, or paused by the owner by hand (`pausedAt` set). See below.
- **Closed:** the existing `CANCELLED` status: the studio is gone from the platform (today's
  behaviour, unchanged). Only the owner sets it.

A manual pause wins over dates; resuming clears it. Recording a payment that moves `paidUntil` into
the future ends a pause caused by lateness.

### What "paused" means

- The studio's admin opens, shows "Your plan has ended — contact us to renew" with the owner's
  contact (from settings), and is **read-only**: every change (create, edit, delete, approve, book
  for a client) is refused with that message. Signing in and out still works.
- **Builder's call (follows "no client stranded"):** a paused studio can still finish what clients
  have already paid or are paying for: approving or rejecting their payment slips, recording a cash
  or bank payment on an existing invoice, and releasing a gallery once it's paid. Everything else is
  refused. In code this is one "paused" check in the shared access guard, with those few actions
  explicitly allowed.
- The public website stays up; **new online bookings are closed** ("This studio isn't taking
  bookings online right now"). Clients' accounts, existing bookings, invoices, payment-slip uploads
  for existing invoices, and galleries/downloads keep working, so no client is stranded.
- Nothing is deleted.

### Locked features

- A feature outside the plan shows an upgrade panel where it would be ("Proposals are on the Studio
  plan. Contact us to upgrade."), in the admin's menu (a small lock) and on its pages. Actions behind
  it are refused on the server with the same message, whatever the page shows.
- Public pages of a locked feature (the client wall-art visualizer) aren't offered: links to them are
  hidden and the page says it isn't available.
- **Downgrading never deletes:** existing proposals, call sheets, releases, gear, print orders and team
  members stay readable (and clients can still open and sign proposals already sent); only creating
  new ones is locked. A custom domain already set keeps working but can't be changed or added.
- Team limit: inviting or restoring a member beyond the plan's limit is refused ("Your plan includes
  5 team members"); existing members over the limit after a downgrade keep their access.

## Reminders

- Seven days before `paidUntil` (or the trial's end): an email to the studio owner ("Your CineFlow
  plan renews on …: how to pay") and to every super-admin ("Lumina's plan ends on …").
- When a studio becomes overdue, and when it pauses: one email each to the same people.
- Each reminder is sent once per period (recorded on the studio so it isn't repeated).
- **Builder's call (owner may change):** there is no scheduler in the app. The check runs at most
  once an hour, piggybacked on requests that already happen (the studio admin's layout, the
  super-admin console, the nightly backup's health call). A studio nobody visits for days still gets
  its reminder on the next nightly run.

## The super-admin console

Replaces today's console content (which shows invented text: "SQLite dev.db", "Card (Simulated)",
an estimated MRR from list prices).

- **Totals:** studios by state (trial / active / overdue / paused), revenue recorded this month and
  in the last 12 months (from payments, not list prices), studios whose plan ends in the next 7 days.
- **Studios table:** name and address, plan, state with its date (trial ends / paid until), team
  used of limit, bookings and settled client revenue (as today), last activity, and actions: open
  website, open admin (full access, as today), **manage**.
- **Manage a studio** (a panel): change plan; record a payment (amount in RM, method: bank
  transfer / DuitNow / cash / other, reference, plan, paid-until date, note); payment history;
  extend the trial; pause / resume; close (with a typed confirmation).
- Every change is recorded with who did it and when (payment records carry `recordedBy`).
- **Builder's call:** recording a payment sets the studio's plan to the payment's plan and moves
  `paidUntil` to the payment's date only if that's later (a back-dated payment never shortens it).
  "Change plan" also works on its own, without a payment (e.g. during a trial, or a goodwill upgrade).
- **Builder's call:** dates and "today" are Malaysia time (`STUDIO_TIME_ZONE`), like the rest of the
  app; a paid-until date covers that whole day.
- **Builder's call:** "team members" counts staff accounts of any role except the owner (not clients,
  not removed members), plus open invitations.
- Super-admins keep full access to every studio's admin (today's behaviour); plan locks and pausing
  never apply to a super-admin acting in a studio, so the owner can always help.

## Data

- `Tenant` gains: `trialEndsAt DateTime?`, `paidUntil DateTime?`, `pausedAt DateTime?`,
  `pauseReason String?`, `lastPlanReminder String?` (which reminder was last sent, e.g.
  `"due:2026-12-01"`). `subscriptionTier` keeps its codes; `subscriptionStatus` keeps `ACTIVE` /
  `CANCELLED` meaning "on the platform / closed" (state above is computed).
- New `PlatformPayment`: `id, tenantId, amount (RM), method, reference?, plan, paidUntil,
  note?, recordedById, createdAt`.
- A Prisma migration (never `db push` on dev.db). Existing studios: plan unchanged, `trialEndsAt` =
  14 days after the update, so nobody is paused by the release.
- Studio sign-up (`onboardStudio`) sets `trialEndsAt`; the plan chosen there is kept for after the
  trial.

## Not in scope

- A payment gateway for subscriptions (later).
- Studios paying or upgrading by themselves in the app (they contact the owner).
- The landing page (next project).
- Invoices/receipts for subscription payments (the owner sends their own for now).
- Per-plan limits on storage, bookings or anything other than features and team size.

## Constraints

- Every server action that does what a locked feature does checks the plan on the server.
- A super-admin is never locked out of anything.
- Existing tests keep passing; the access-control tables (Tier 26) cover the new actions.
- Studio-facing words follow the app's plain-language style; prices in RM.

## Testing

- The state rules: trial, active, overdue, paused (by date and by hand), closed, with edge days.
- Each locked feature refused on the server for a plan without it, allowed with it, and allowed for
  a super-admin; existing records still readable after a downgrade.
- Team limit: invite / restore refused past the limit, existing members kept.
- Paused: admin changes refused, public booking closed, client galleries and slip uploads still work.
- Console actions: record payment (moves paid-until, ends a lateness pause), change plan, pause,
  resume, close — super-admin only.
- Reminders: each sent once at the right time.
- In the browser: the console, an upgrade panel, the paused banner, at phone width too.
