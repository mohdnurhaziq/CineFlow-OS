# Bug Fix Log

Every bug fixed in CineFlow OS, newest first. Add an entry whenever a fix lands.

**Entry format**

- **ID**: `BUG-<date>-<nn>`
- **Area**: the page or feature
- **Problem**: what a user saw or could do
- **Cause**: why it happened
- **Fix**: what changed
- **Files**: the main files touched
- **Tests**: the tests that cover it
- **Commit**: the commit hash, or "pending" until it is committed

Entries from before 5 Nov 2026 were rebuilt from commit messages, so they are shorter.

---

## 2026-11-05: Studio owner walkthrough (admin suite)

The bugs below were found by signing in as the Lumina demo owner and using every admin page. All are fixed. The full E2E suite passes: 2107 assertions, 0 failures.

### BUG-20261105-01: The "Verified by" name could be faked

- **Area:** Admin > Verification, Admin > Inventory (gear check-out and check-in)
- **Problem:** Approving or rejecting a payment recorded whatever name was picked from a hard-coded list ("Studio Lead", "Sarah Tan", "David Chong", …). That list included people from other studios. The audit trail showed "Studio Lead" rather than the person who acted. Gear inspections worked the same way: free text, pre-filled with "Liam Ross (Key Tech)".
- **Cause:** The browser sent the verifier or inspector name (`staffName`, `inspectorName`), and the server saved it as given.
- **Fix:** The server records the signed-in user's name from the session. The name fields were removed from the action inputs. The UI shows "Verifying as / Inspected by `<you>`" as read-only text.
- **Files:** `lib/actions/admin-verification.ts`, `lib/actions/gear.ts`, `lib/validations/gear.ts`, `components/checkout/admin-verification-console.tsx`, `components/gear/inspection-dialog.tsx`, `components/gear/gear-dashboard.tsx`, `app/[tenantSlug]/admin/verification/page.tsx`, `app/[tenantSlug]/admin/inventory/page.tsx`
- **Tests:** T1 "Invoice records the signed-in verifier" and "Inspection is logged under the signed-in user". Every test now calls these actions without a name.
- **Commit:** pending

### BUG-20261105-02: Online payments charged ringgit for every currency

- **Area:** Checkout, Admin > Settings, notifications
- **Problem:** A USD, SGD, EUR or GBP studio could connect Toyyibpay. Toyyibpay only charges in MYR, so a $600 deposit would be billed as RM600. Booking confirmations said "MYR" for every studio. Payment approved and rejected messages said "USD" and showed the studio slug instead of its name.
- **Cause:** Nothing checked the studio's currency before using the gateway, and the notification currency was hard-coded.
- **Fix:**
  - `getCheckoutGateway()` returns no gateway unless the studio currency is MYR. Checkout and invoice payment use it, so card or FPX isn't offered or accepted otherwise.
  - Saving Toyyibpay credentials is refused for studios not priced in MYR (`CURRENCY_NOT_SUPPORTED`).
  - For such studios, Settings shows a "MYR only" note in place of the credentials form.
  - Notifications use the studio's own currency and name.
  - Settling an existing bill is unchanged.
- **Files:** `lib/payments/settle.ts`, `lib/actions/checkout.ts`, `lib/actions/admin-payments.ts`, `lib/actions/admin-verification.ts`, `app/[tenantSlug]/checkout/page.tsx`, `components/admin/settings/studio-settings-form.tsx`
- **Tests:** T9-CHK-04, T9-ADM-04. The rest of Tier 9 runs Lumina as an MYR studio and restores USD afterwards.
- **Commit:** pending

### BUG-20261105-03: A deposit could be larger than the price

- **Area:** Admin > Services (packages), Admin > Calendar (single slot, batch generator, slot edit)
- **Problem:**
  - A $100 package with a $500 deposit saved without error.
  - New packages pre-filled the deposit with "50" whatever the price.
  - A blank deposit quietly became 50.
  - Validation errors came back as raw Zod JSON.
- **Cause:** There was no rule tying the deposit to the price, and a default of 50 was applied in both the form and the schema.
- **Fix:**
  - A package deposit must be ≤ its price.
  - A slot deposit must be ≤ its fee when a fee is set. A fee of 0 means "priced by the package", so only the deposit is charged.
  - Slot edits check the merged values.
  - The package deposit starts blank, is required, and suggests half the price as a placeholder.
  - The slot form explains what a fee of 0 means.
  - Errors come back as one readable sentence via `lib/action-error.ts`.
- **Files:** `lib/validations/services.ts`, `lib/validations/calendar.ts`, `lib/actions/admin-services.ts`, `lib/actions/admin-calendar.ts`, `lib/action-error.ts`, `components/admin/services/package-dialog.tsx`, `components/admin/calendar/single-slot-dialog.tsx`, `components/admin/calendar/batch-generator-dialog.tsx`
- **Tests:** T2-PRICE-01b
- **Commit:** pending

### BUG-20261105-04: Slots could double-book the studio

- **Area:** Admin > Calendar
- **Problem:**
  - A 10:00–11:30 slot could be created on top of a booked 10:00–12:00 session, and it then appeared as bookable.
  - Slots could end before they started, or be created in the past.
  - The batch generator only skipped slots with the same start time.
  - With "Skip conflicting slots" unticked, it created duplicates.
- **Cause:** Slot create and update had no time, past or overlap checks, and batch conflict detection compared start times only.
- **Fix:**
  - Creating or moving a slot requires a readable time range with the end after the start.
  - It also requires a start that hasn't passed (studio time zone) and no overlap with any other slot that day, whatever its status. Slots that only touch end to start are allowed.
  - The batch generator always skips overlaps (against existing slots and within the batch) and past times. The "Skip conflicting slots" option was removed.
  - Matching covers the whole calendar day, because older slots were saved with a time of day on `date`.
- **Files:** `lib/actions/admin-calendar.ts`, `lib/validations/calendar.ts`, `components/admin/calendar/batch-generator-dialog.tsx`
- **Tests:** T2-SLOT-01, which includes a slot stored with a time of day.
- **Commit:** pending

### BUG-20261105-05: Renaming a category's slug orphaned its records

- **Area:** Admin > Services > Campaign Categories
- **Problem:** Changing a category's slug left its packages, slots, bookings, showcase items, projects and proposals on the old slug. They no longer matched any category.
- **Cause:** Those records store the category as slug text, and the rename only updated the category row.
- **Fix:** The rename runs in a transaction that moves every record filed under the old slug to the new one. Matching is loose, as for bookings, so `STUDIO_PORTRAIT` matches `studio-portrait`.
- **Files:** `lib/actions/admin-services.ts`
- **Tests:** T2-CAT-01
- **Commit:** pending

### BUG-20261105-06: The Custom Domain setting did nothing

- **Area:** Admin > Settings, middleware
- **Problem:** A domain saved in Settings never served the studio. Only the two demo domains, hard-coded in `middleware.ts`, worked. Any other host was read as `<slug>.<anything>`, so `studio.example.com` looked for a studio called "studio".
- **Cause:** The middleware ran on the Edge runtime with no database access, so it used a static map and a loose subdomain rule.
- **Fix:**
  - The middleware runs on the Node.js runtime (Next 15.5) and looks the host up in the database, with a 60-second cache, via `lib/tenant-domain.ts`.
  - `<slug>.` subdomains only count on platform domains (`cineflow.app`, `cineflow.local`, `localhost`).
  - Saved domains are cleaned up (protocol, path and port removed; lowercased) and validated, and platform domains can't be claimed.
  - Settings explains that a new domain starts working within a minute.
- **Files:** `middleware.ts`, `lib/tenant-domain.ts`, `lib/domain-name.ts`, `lib/validations/admin-settings.ts`, `lib/actions/admin-settings.ts`, `components/admin/settings/studio-settings-form.tsx`
- **Tests:** T1-F06 middleware tests, now served from the database. Checked by hand with `Host:` headers for both demo domains, an unknown domain and `lumina-cine.localhost`.
- **Commit:** pending

### BUG-20261105-07: Invoice numbers were random and inconsistent

- **Area:** Every invoice: checkout deposits, staff bookings, balance invoices, proposal retainers, print orders
- **Problem:** New invoices got random numbers (`INV-2026-313417`), while the seeded ones counted up (`INV-2026-001`).
- **Cause:** Each code path generated `INV-<year>-<random 6 digits>`. Invoice numbers were also unique across the whole platform, so per-studio counting wasn't possible.
- **Fix:**
  - Invoice numbers are unique per studio (`@@unique([tenantId, invoiceNumber])`).
  - `nextInvoiceNumber()` issues `INV-<year>-0001`, `0002`… per studio and restarts each year.
  - It bumps a counter on the studio row (`invoiceSeq`, `invoiceSeqYear`) inside the invoice's transaction, so concurrent invoices can't share a number.
  - A studio's first number of the year continues after its highest existing short number. Old random 6-digit numbers are ignored.
  - Schema applied to the dev database with `prisma db push`.
- **Files:** `prisma/schema.prisma`, `lib/bookings/billing.ts`, `lib/actions/checkout.ts`, `lib/actions/admin-bookings.ts`, `lib/actions/proposals.ts`, `lib/actions/visualizer.ts`
- **Tests:** T2-INV-01
- **Commit:** pending

### BUG-20261105-08: Modals ignored Escape and weren't announced as dialogs

- **Area:** All hand-built modals: receipt viewer, reject payment, package, category, slot, batch generator, book for customer, force release, gear, kit, inspection, frame, print size, add-on, showcase item, video and media lightboxes, vault photo lightbox, retouch notes, wall-art order
- **Problem:** Escape didn't close the receipt viewer, or most other modals. Screen readers weren't told a dialog had opened, focus stayed on the page behind, and Tab could leave the modal.
- **Cause:** Each modal was a plain `div` with no dialog semantics or keyboard handling.
- **Fix:** A shared `useDialog()` hook (`lib/use-dialog.ts`) does the following, and every modal uses it:
  - Gives the panel `role="dialog"` and `aria-modal`, labelled by the modal's title.
  - Closes it on Escape.
  - Moves focus into it, keeps Tab inside, and returns focus to the button that opened it.
- **Files:** `lib/use-dialog.ts` and the 21 modal components above
- **Tests:** Checked by hand: the package dialog opens labelled "Create New Service Package", focus moves in, Escape closes it and focus returns to "New Package".
- **Not done yet:** Several admin forms still have labels that aren't linked to their inputs (`htmlFor`/`id`).
- **Commit:** pending

---

## 2026-11-05: Client walkthrough (Haz Creatives Studio)

Commit `4d5c669`.

- **BUG-20261105-C1:** Fixed testimonials and equipment claims appeared on every studio's page as if they were real. Those sections are hidden until studios can enter their own. The "Award-Winning Color Grading", "4K Cinema" and "Shot on ARRI / 4K DCI MASTER" badges were removed.
- **BUG-20261105-C2:** The "Quick Demo Personas" sign-in shortcuts appeared on every studio's login page. They now show only on the seeded demo studios.
- **BUG-20261105-C3:** The screen went blank after signing up or in on `/register`.
  - Cause: the sign-in server action re-rendered `/register`, and the page's server `redirect()` left an empty body.
  - Fix: `SignedInRedirect` shows "You're signed in as …" while moving to the account page, and the card does a single `router.replace`.
- **BUG-20261105-C4:** The copy promised a "50% deposit" whatever each package's actual deposit was. The wording now just says a deposit is taken.
- **BUG-20261105-C5:** Money showed as "MYR 0.00" on the account page and as "RM" elsewhere. A shared `formatMoney` in `lib/money.ts` is now used everywhere except formal invoices.
- **BUG-20261105-C6:** Studios with no portfolio showed an empty gallery and "0 Works Displayed". Both are hidden when there are no works.
- **BUG-20261105-C7:** The booking-page header split into two misaligned rows on desktop. It's now one row.
- **BUG-20261105-C8:** Signed-in clients on Track Booking got no pointer to their account. A banner now links to it.
- **BUG-20261105-C9:** Signed-in clients saw the booking form titled "Quick account // 4 fields". It now says "Booking summary".

## 2026-11-05: First UI/UX inspection

- **`2783d65`:** The account menu and header controls were smaller than 44 px on phones, and the signed-in header overflowed at 390 px.
- **`fdcf858`:**
  - Booking category chips wrapped.
  - The stage marker overlapped its label.
  - Showcase header and footer controls were under 44 px.
  - Empty categories had no count.
- **`5d26444`:**
  - Portfolio cards were black when the image was missing.
  - Slot cards, the hold bar and the modal showed different deposits.
  - Slots showed the category slug.
  - The hold state lagged.
  - The hold bar covered the held slot.
  - Account fields had no visible labels.
  - The admin had a "Fleet Fleet" button, wrong plurals, invoice cells that wrapped, and a nav that overflowed at 1440 px.
- **`366a6e6`:** The booking modal was taller than the screen with no scroll, so a booking couldn't be finished on phones. It also had a form nested inside a form. It was rebuilt on Radix Dialog.

## 2026-11-04

- **`6d89b10`:** The booking page mixed every day's slots without dates and offered sessions that had already passed. It also put 9 PM under Morning and sorted times as text. Fixed with a date strip, past-slot refusal (`SLOT_IN_PAST`) and studio-time-zone helpers in `lib/slot-time.ts`.
- **`78d970a`:** Approving or rejecting a deposit acted on the client's latest pending booking. With two pending bookings, approving one confirmed the other. Invoices now link to their booking (`bookingId`), and ambiguous cases change nothing.
- **`1330fca`:**
  - Bookings from the booking popup, and unpaid staff bookings, created no deposit invoice. They never reached Verification, and their slots stayed stuck.
  - "Card (Instant)" confirmed a booking without any payment.
- **`a35fc40` (security):** Staff-only server actions didn't check authorisation themselves, so they could be called directly. `/super-admin` was open. Both are now enforced, with Tier 10 tests.
- **`56002ed` (security):** `/api/upload` accepted any folder, any extension and any size from anyone. It now has staff-only folders, MIME-derived extensions, size caps, a rate limit and a sandbox CSP.
- **`9665a78`:** Two registrations racing with the same email returned a server error instead of `EMAIL_EXISTS`.
- **`615ed21`:** There was no confirmation after a client registered or signed in.

## 2026-11-03

- **`746667b`:** Zod schemas were exported from `"use server"` files, which Next rejects at runtime.
- **`af41676`:** Browser extensions caused a body hydration warning on every page.

---

## Still open (found, not yet fixed)

From the 2026-11-05 owner walkthrough:

- Bookings are view-only: no cancel, reschedule, complete or no-show. Nothing marks a booking "delivered".
- Invoices are view-only: no mark-as-paid for bank or cash, void, resend or create.
- Proposals, projects, gear reservations, call sheets and client photo uploads have no screens to create them.
- Book for Customer:
  - "Service Tier" does nothing.
  - Discipline doesn't follow the package.
  - The calendar shows the slot price instead of the package price.
- Rejecting a slip cancels the booking instead of asking the client to upload it again.
- Raw codes show in the UI (HYBRID, QR_CODE, ON_SHOOT, RETAINER 50).
- Naming is inconsistent (Inventory / Gear Fleet), and headings use jargon.
- Deletes use the browser's `confirm()` popup.
- Settings has two separate save buttons.
- Past slots show as "Available" in the admin calendar, and slot actions are off-screen on phones.
- Gear check-in reloads the page, and is allowed before the reservation window.
- Staff (photographer or crew) can approve payments and change prices; owner-only rules are to be decided.
- Several admin form labels aren't linked to their inputs.
