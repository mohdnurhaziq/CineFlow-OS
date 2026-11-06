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

## 2026-11-06: Page audit, client records need a signed-in owner

From a full audit of every page. Decision taken with the owner: vault, proposals, releases and set-hud need the customer (or studio staff) to sign in, so every view and signature has a name on it. The full E2E suite passes: 2349 assertions, 0 failures. New tests are T10-REC-01 to 08.

### BUG-20261106-01: Proposals could be read and signed by anyone

- **Area:** Client proposal page, `acceptProposal`, `toggleProposalAddOn`, `getProposalBySlugAndId`
- **Problem:** The page accepted the proposal number in the URL, and numbers run in sequence (`PR-2026-001`, `-002`…). Anyone could guess a number, see the client's name, email and phone, change the add-ons, and sign the contract.
- **Cause:** No sign-in or ownership check on the page or its actions. `getProposalBySlugAndId` also returned the whole tenant and client rows.
- **Fix:** The page needs a sign-in, by the proposal's client or the studio's staff. Signed-out visitors go to the login page and come back afterwards. Only the client the proposal is addressed to can sign it; staff can't sign on a client's behalf. Add-ons can't change once a proposal is signed. `getProposalBySlugAndId` returns trimmed rows. Tab titles no longer show the proposal title.
- **Files:** `app/[tenantSlug]/proposals/[proposalId]/page.tsx`, `lib/actions/proposals.ts`, `lib/auth/project-access.ts`
- **Tests:** T10-REC-01, T10-REC-02
- **Commit:** pending

### BUG-20261106-02: Studio-created clients could never sign in

- **Area:** New proposal (admin), client sign-up
- **Problem:** A client added through "New proposal" got an account with no password. Claiming it needed a booking tracking code, which a proposal-only client doesn't have. Once proposals needed a sign-in (BUG-20261106-01), those clients could not open them at all.
- **Cause:** Claiming only accepted a tracking code; the `inviteToken` fields on User were unused.
- **Fix:** The proposal email for a client without a password now links to a "set your password" page with a one-time invite (30 days; only a SHA-256 of it is stored). Sign-up accepts the invite as proof of ownership and then continues to the proposal. An expired invite says to ask the studio to resend it. The login page's "Create account" link keeps the page the visitor was going to.
- **Files:** `lib/auth/invite.ts`, `lib/actions/client-auth.ts`, `lib/actions/admin-projects.ts`, `app/[tenantSlug]/register/page.tsx`, `components/auth/client-register-card.tsx`, `components/auth/client-auth-panel.tsx`, `components/auth/studio-login-form.tsx`
- **Tests:** T10-REC-06
- **Commit:** pending

### BUG-20261106-03: Vaults, master downloads and print previews were open to anyone

- **Area:** Vault page, `/api/download`, vault favourites and retouch notes, visualizer `?projectId=`
- **Problem:** Anyone with a project link could see the client's gallery and details, download masters once the balance was paid, and change favourites and retouch notes. `/visualizer?projectId=` showed any project's photo previews, and `?photoUrl=` put any outside image on the page.
- **Cause:** No sign-in or ownership checks.
- **Fix:** All of these need a sign-in, by the project's client or the studio's staff. The download route answers 401 when signed out and 404 for anyone else. `?photoUrl=` was removed (nothing linked to it).
- **Files:** `app/[tenantSlug]/vault/[projectId]/page.tsx`, `app/api/download/route.ts`, `lib/actions/vault.ts`, `app/[tenantSlug]/visualizer/page.tsx`
- **Tests:** T10-REC-03, T10-REC-05
- **Commit:** pending

### BUG-20261106-04: Releases and call sheets were public, and releases didn't record who took them

- **Area:** Releases page, `submitDigitalRelease`, set-hud (call sheet) page
- **Problem:** Anyone with the link could see signed releases (names, emails, signature images) and submit new ones. The call sheet page sent the studio's whole record, including bank details and the encrypted payment gateway secret, to the browser.
- **Cause:** No sign-in checks; `tenant: true` on the call sheet query.
- **Fix:** Both pages need a sign-in, by the project's client or the studio's staff. Each release stores who collected it (`collectedById`, `collectedByName`), shown as "Collected by …" in the list. The call sheet query now loads only the studio's id, name and slug.
- **Files:** `app/[tenantSlug]/releases/[projectId]/page.tsx`, `app/[tenantSlug]/set-hud/[callSheetId]/page.tsx`, `lib/actions/logistics.ts`, `components/logistics/release-form-shell.tsx`, `prisma/schema.prisma`
- **Tests:** T10-REC-04
- **Commit:** pending

### BUG-20261106-05: Password hashes sent to the browser

- **Area:** Checkout (paying an invoice), Admin > Verification
- **Problem:** Both pages loaded invoices with the whole client row, so the client's password hash and invite token were in the page sent to the browser.
- **Cause:** `client: true` passed into client components.
- **Fix:** Both load only the client's id, name, email and phone.
- **Files:** `app/[tenantSlug]/checkout/page.tsx`, `app/[tenantSlug]/admin/verification/page.tsx`
- **Tests:** Checked by loading the live pages (no `passwordHash` or bcrypt hash in the response)
- **Commit:** pending


### BUG-20261106-06: Print orders and invoice payments needed no sign-in

- **Area:** Visualizer print orders, checkout for invoices (`checkout?invoiceId=`, final balance), `processInvoicePayment`
- **Problem:** Anyone could place a print order under any email (creating an account and invoice for that person), view any invoice's checkout page from its link, and send a payment slip for any invoice.
- **Cause:** No sign-in or ownership checks. Decision with the owner: customers must sign in (option A).
- **Fix:** Print orders need a sign-in. A client is billed as themselves (typed name and email are ignored). Studio staff can still order for a client at the counter, but never bill a team member. An order can only reference a project the caller can see. Signed-out visitors see "Sign in / Create an account" in the order dialog and come back to the visualizer afterwards. Invoice checkout and invoice payment need the invoice's client or studio staff.
- **Files:** `lib/actions/visualizer.ts`, `components/visualizer/order-modal.tsx`, `components/visualizer/visualizer-shell.tsx`, `app/[tenantSlug]/visualizer/page.tsx`, `app/[tenantSlug]/checkout/page.tsx`, `lib/actions/checkout.ts`
- **Tests:** T10-REC-07, T10-REC-08; Tier 12 now pays balances as the invoice's client
- **Commit:** pending

### BUG-20261106-07: Visualizer showed another studio's photos

- **Area:** Visualizer
- **Problem:** Every studio's wall visualizer offered the same four demo photos ("Aurora…", "Farah…") from the seed studios.
- **Cause:** The photo list was hard-coded.
- **Fix:** It now offers the studio's own showcase covers (plus the project's photos when opened from a vault). A studio with none gets a neutral "Your photo here" placeholder.
- **Files:** `app/[tenantSlug]/visualizer/page.tsx`, `components/visualizer/visualizer-shell.tsx`
- **Tests:** Checked by loading the live page
- **Commit:** pending

### BUG-20261106-08: Wrong currency symbol on Gear and Visualizer

- **Area:** Admin > Gear & Fleet, Visualizer
- **Problem:** Any currency other than MYR showed as `$` (e.g. SGD, EUR).
- **Cause:** Each page had `MYR ? "RM" : "$"`.
- **Fix:** New `currencySymbol()` in `lib/money.ts` (RM, $, or the ISO code), used by both pages.
- **Files:** `lib/money.ts`, `app/[tenantSlug]/admin/inventory/page.tsx`, `app/[tenantSlug]/visualizer/page.tsx`
- **Tests:** Typecheck; live page check
- **Commit:** pending

### BUG-20261106-09: Tab titles said "CineFlow OS" twice, and some were missing or inconsistent

- **Area:** Page titles
- **Problem:** Titles like "My Account | CineFlow OS | CineFlow OS". The admin Overview and the login page had no title. Admin titles each followed a different pattern.
- **Cause:** Pages added "CineFlow OS" on top of the root title template.
- **Fix:** Removed the extra suffix (the landing page uses an absolute title). Every admin page is now "<menu label> | <studio> Studio Admin", using the same names as the admin menu. Added titles for Overview and Sign in.
- **Files:** most `app/**/page.tsx` metadata
- **Tests:** Checked by loading the live pages
- **Commit:** pending

### BUG-20261106-10: Signing in to the admin always landed on Overview

- **Area:** Admin login redirect
- **Problem:** Opening a deep admin link (e.g. one invoice) while signed out, then signing in, went to the Overview instead. A wrong-studio redirect dropped the return path entirely.
- **Cause:** Middleware always set `callbackUrl` to `/<studio>/admin`.
- **Fix:** It now keeps the requested path and query string, including on the wrong-studio redirect.
- **Files:** `middleware.ts`, `app/[tenantSlug]/admin/layout.tsx`
- **Tests:** Checked against the live server
- **Commit:** pending

### BUG-20261106-11: Smaller fixes from the audit

- **Proposals list** showed only the latest 50 with no notice; the limit is gone (`admin/proposals/page.tsx`).
- **`bg-zinc-850`** (32 uses) wasn't a defined colour, so those fills and borders didn't render; it's now defined in `app/globals.css`.
- **Login page** showed the form again to someone already signed in; it now moves them on to their page, like `/register` does (`login/page.tsx`).
- **After an online payment,** a signed-in client lands in their account instead of the tracking-code lookup (`checkout/payment-return/page.tsx`).
- **Commit:** pending

### BUG-20261106-12: Dead-end pages and inconsistent layout

- **Area:** Checkout, proposal, call sheet, releases, admin pages
- **Problem:** Checkout, proposal, call sheet and releases had no way back. Releases, call sheet and visualizer painted their background only on the centred column. Verification used a different page wrapper. Admin headings used four different sizes and weights.
- **Fix:** New `PortalTopBar` on those four pages: a back link (to the account tab for clients, the admin project or list for staff) and a "My account" / "Studio admin" link. Full-width backgrounds. Verification uses the standard admin wrapper. All admin page headings use one style. The payment status card matches the other cards.
- **Files:** `components/portal/portal-top-bar.tsx`, the four pages, `components/checkout/admin-verification-console.tsx`, admin console components
- **Tests:** Checked by loading the live pages as signed-out, client and owner
- **Commit:** pending
---

## 2026-11-05: Owner walkthrough, remaining items (9–20)

The second half of the owner walkthrough. Decisions taken with the owner: money actions are owner-only (item 20), and a rejected slip asks the client for a new one instead of cancelling (item 13). The full E2E suite passes: 2236 assertions, 0 failures. New tests are in Tiers 14 and 15.

### BUG-20261105-09: Bookings were view-only

- **Area:** Admin > Bookings, Admin > Calendar (booking details), client account
- **Problem:** A booking couldn't be cancelled, moved, closed out after the shoot, or marked delivered. The Overview counted "delivered" work, but nothing could make a booking delivered.
- **Cause:** Only creation and payment-approval actions existed.
- **Fix:** The booking details dialog now has actions, backed by `lib/actions/admin-booking-lifecycle.ts`:
  - **Move to another slot:** open, upcoming slots in the same category only. The slots swap, and an unpaid balance moves its due date to a week after the new session.
  - **Cancel:** with a reason the client sees. The slot reopens and unpaid invoices are voided. A paid deposit stays on record, and cancelling a paid booking is owner-only.
  - **Mark session done / Client didn't show:** only once the session has started.
  - **Mark delivered:** after a done session, with an optional gallery link the client sees in their account.
  - The client is emailed on move, cancel and delivery (new `STUDIO_UPDATE` notification).
  - New booking statuses: `COMPLETED`, `NO_SHOW`, `DELIVERED`. New fields: `cancelledAt`, `cancelReason`, `completedAt`, `deliveredAt`, `deliveryUrl`.
- **Files:** `lib/actions/admin-booking-lifecycle.ts`, `components/admin/bookings/booking-actions.tsx`, `components/admin/bookings/booking-details-dialog.tsx`, `components/admin/bookings/bookings-console.tsx`, `components/admin/calendar/calendar-admin-dashboard.tsx`, `components/account/client-dashboard.tsx`, `lib/bookings/details.ts`, `lib/notifications.ts`, `lib/actions/admin-analytics.ts`, `prisma/schema.prisma`
- **Tests:** T14-MOVE-01, T14-CANCEL-01/02, T14-DONE-01/02, T14-AUTH-01
- **Commit:** `378d89e`

### BUG-20261105-10: Invoices were view-only

- **Area:** Admin > Invoices
- **Problem:** An invoice couldn't be marked paid (cash or bank transfer), cancelled or sent as a reminder, and there was no way to bill anything outside a booking or proposal.
- **Cause:** No invoice actions existed.
- **Fix:** New invoice actions in `lib/actions/admin-invoices.ts`:
  - **Record payment** (owner): cash, bank transfer, QR or card, with an optional reference. It has the same effects as approving a slip: confirms the booking, issues the balance, unlocks the vault.
  - **Cancel invoice** (owner): with a reason. A booking's deposit can't be cancelled on its own; cancel the booking instead.
  - **Send reminder** (any staff): emails the client a link to view and pay.
  - **New invoice** (owner): a `CUSTOM` invoice for a client, with a description, amount and due date, numbered in the studio's sequence. The invoice document shows the description.
- **Files:** `lib/actions/admin-invoices.ts`, `components/admin/invoices/invoice-admin-actions.tsx`, `components/admin/invoices/new-invoice-dialog.tsx`, `components/admin/invoices/invoices-console.tsx`, `app/[tenantSlug]/admin/invoices/page.tsx`, `app/[tenantSlug]/admin/invoices/[invoiceId]/page.tsx`, `lib/invoices/document.ts`, `prisma/schema.prisma` (`description`)
- **Tests:** T14-INV-01/02/03
- **Commit:** `378d89e`

### BUG-20261105-11: Proposals, projects, gear reservations, call sheets and photo delivery had no screens

- **Area:** Admin > Proposals, new Admin > Projects, client vault
- **Problem:** Only seeded proposals and projects existed. There was no way to send a proposal, plan shoot days, reserve gear for a project, or give a client their photos.
- **Cause:** These features had data models and client-facing pages, but no studio-side screens or actions.
- **Fix:**
  - **New proposal** (owner): pick an existing client or add one, set the title, category, discipline, base price, deposit % and terms, and choose which add-ons to offer. It's numbered `PR-<year>-NNN`, emailed to the client, and its signing link is shown to copy. When the client signs, the project and retainer invoice are created, as before.
  - **Projects** tab: a list of projects with stage, next shoot day, files and budget.
  - **Project page:**
    - Change the stage (Planning → Shooting → Editing → Client review → Delivered).
    - Add or delete shoot days, as call sheets with a crew list that open in the existing call-sheet view.
    - Reserve or release gear.
    - Upload files for the client.
    - See the project's invoices.
  - **Photo delivery:**
    - Full-resolution masters are stored privately in `storage/` (git-ignored), never under `/public`. Only `/api/download` serves them, after the final balance is paid.
    - Clients see a public preview, at most 1600 px and tiled with the studio name as a watermark (`sharp`, now a direct dependency).
    - Videos take a review copy (streamed) plus a private master.
    - Deleting a file removes both copies.
- **Files:** `lib/actions/admin-projects.ts`, `lib/projects/constants.ts`, `lib/deliverables/storage.ts`, `app/api/deliverables/route.ts`, `app/api/download/route.ts`, `app/[tenantSlug]/admin/projects/page.tsx`, `app/[tenantSlug]/admin/projects/[projectId]/page.tsx`, `components/admin/projects/project-workspace.tsx`, `components/admin/proposals/new-proposal-dialog.tsx`, `components/admin/proposals/proposal-admin-dashboard.tsx`, `app/[tenantSlug]/admin/proposals/page.tsx`, `components/admin/admin-nav-bar.tsx`, `package.json`, `.gitignore`
- **Tests:** T15-PROP-01/02, T15-PROJ-01, T15-GEAR-01, T15-FILES-01. Upload, privacy, preview size, the paywall before and after payment, and deletion were also checked in the browser.
- **Commit:** `378d89e`

### BUG-20261105-12: Book for Customer was confusing

- **Area:** Admin > Calendar > Book for Customer; calendar table; Track Booking
- **Problem:**
  - "Service Tier" (Standard / Premium / Cinematic) changed nothing and was shown to clients as raw "STANDARD".
  - Discipline didn't follow the chosen package.
  - A booked slot showed the slot's default price, not what the client was paying.
- **Fix:**
  - Service Tier was removed from the form.
  - A chosen package sets the discipline, both in the form and on the server.
  - Booked slots show the booking's package price, deposit and package name. Open slots with no fee show "By package".
  - Track Booking shows the package name, or "None chosen".
- **Files:** `components/admin/calendar/book-for-customer-dialog.tsx`, `components/admin/calendar/slot-table.tsx`, `components/admin/calendar/single-slot-dialog.tsx`, `app/[tenantSlug]/admin/calendar/page.tsx`, `components/booking/package-picker.tsx`, `lib/actions/admin-bookings.ts`, `lib/actions/my-booking.ts`, `components/booking/my-booking-lookup.tsx`
- **Commit:** `378d89e`

### BUG-20261105-13: Rejecting a slip cancelled the whole booking

- **Area:** Admin > Verification; client account; expiry
- **Problem:** Rejecting a payment slip (for example "Illegible screenshot") cancelled the booking and freed the slot, so the client couldn't simply send a clearer one. The rejection email also linked to a broken address (`?invoice=` instead of `?invoiceId=`).
- **Fix:**
  - Rejection keeps the booking and slot, and records `rejectedAt` and `rejectionReason`.
  - The client sees the reason and a "Send new slip" button, in their account and on the invoice.
  - If no new slip arrives within 24 hours of the rejection, `expireUnpaidDeposits` releases the slot and voids the deposit.
  - The dialog, toast and email wording now say so, and the email link is fixed.
- **Files:** `lib/actions/admin-verification.ts`, `lib/bookings/expiry.ts`, `components/checkout/admin-verification-console.tsx`, `components/account/client-dashboard.tsx`, `app/[tenantSlug]/account/invoices/[invoiceId]/page.tsx`, `components/invoices/invoice-document.tsx`, `lib/invoices/document.ts`, `lib/notifications.ts`, `prisma/schema.prisma`
- **Tests:** T1-F19-04 (reject, resend, reject again, expire after 24 h), T7-BKG-09
- **Commit:** `378d89e`

### BUG-20261105-14: Raw codes showed in the UI

- **Area:** Admin header, Verification, Overview, Gear, showcase, booking page, forms
- **Problem:** Codes such as HYBRID, QR_CODE, ON_SHOOT, CHECKED_OUT, MAINTENANCE_NEEDED, "RETAINER 50" and "(studio-portrait)" were shown to users. The Verification card also had no session date.
- **Fix:**
  - A shared `lib/labels.ts` gives readable labels for disciplines, payment methods, invoice types and statuses, gear status, condition and reservation status ("Photo & video", "QR / bank transfer", "On a shoot", "Project retainer (50%)").
  - Category slugs show their category name.
  - The Verification card shows the session date.
- **Files:** `lib/labels.ts`, `lib/invoices/document.ts`, `components/checkout/admin-verification-console.tsx`, `app/[tenantSlug]/admin/verification/page.tsx`, `components/gear/*`, `components/admin/studio-dashboard.tsx`, `components/showcase/*`, `components/booking/cinema-booking-shell.tsx`, the discipline selects in the admin forms, `app/[tenantSlug]/admin/layout.tsx`, `components/checkout/order-summary-card.tsx`
- **Commit:** `378d89e`

### BUG-20261105-15: Inconsistent naming and jargon

- **Area:** Admin navigation and page headings
- **Problem:**
  - The same section was "Inventory" (nav), "Gear Fleet" (button) and "Gear Fleet & Kit BOM Studio Command" (heading).
  - Headings used jargon: "Command Center", "Holding Engine", "Manual Payment Authorization", "gross escrow", "Enterprise hardware fleet registry".
- **Fix:**
  - Nav and headings now match: Gear, Showcase, Calendar, Services, Proposals, Frames & prints, Settings, Payment verification.
  - Subtitles and KPI labels are plain sentences ("Waiting to be confirmed", "On a shoot", "Checked out right now").
  - The Overview's section titles were renamed ("Recent invoices", "Upcoming shoot days"), and its shoot-day link goes to Projects.
- **Files:** `components/admin/admin-nav-bar.tsx`, `app/[tenantSlug]/admin/layout.tsx`, `components/admin/studio-dashboard.tsx`, `components/checkout/admin-verification-console.tsx`, `components/admin/calendar/calendar-admin-dashboard.tsx`, `components/admin/services/services-dashboard.tsx`, `components/admin/proposals/proposal-admin-dashboard.tsx`, `components/admin/frames/frames-manager.tsx`, `components/admin/cms/cms-manager.tsx`, `components/admin/settings/studio-settings-form.tsx`, `components/gear/gear-dashboard.tsx`, `components/gear/gear-kpi-summary.tsx`
- **Commit:** `378d89e`

### BUG-20261105-16: Deletes used the browser's confirm() popup

- **Area:** Gear, kits, packages, categories, frames, print sizes, add-ons, showcase items, slots
- **Problem:** Deleting showed the browser's plain `confirm()` box, unlike the app's other dialogs.
- **Fix:** A styled `useConfirm()` dialog (`components/ui/confirm-dialog.tsx`, built on `useDialog`) with clearer wording, such as "Delete 'Print order'? Clients will no longer be able to order this print size." Focus starts on Cancel.
- **Files:** `components/ui/confirm-dialog.tsx` and the seven list components that delete
- **Commit:** `378d89e`

### BUG-20261105-17: Settings had two confusing save buttons

- **Area:** Admin > Settings
- **Problem:** "Save Settings" (top) and "Save payment settings" (Toyyibpay) sat in the same form, with no hint of what each saved. Pressing Enter in a Toyyibpay field submitted the main form.
- **Fix:**
  - Toyyibpay moved out of the settings form into its own section, with the button "Connect Toyyibpay" / "Update connection".
  - The main form has a sticky "Save settings" bar at the bottom that says what it saves.
  - "Workspace & License Meta" is now "Plan".
- **Files:** `components/admin/settings/studio-settings-form.tsx`
- **Commit:** `378d89e`

### BUG-20261105-18: Past slots showed as "Available"; slot actions were off-screen on phones

- **Area:** Admin > Calendar
- **Fix:**
  - Past slots are hidden by default, with a "Show past slots" checkbox; picking a date shows them.
  - Open slots that have passed read "Passed · not booked" and can't be booked for a customer.
  - The Available count ignores them.
  - The Actions column stays pinned on the right when the table scrolls sideways.
- **Files:** `components/admin/calendar/calendar-admin-dashboard.tsx`, `components/admin/calendar/slot-table.tsx`
- **Commit:** `378d89e`

### BUG-20261105-19: Gear check-in reloaded the page; check-out was allowed at any time

- **Area:** Admin > Gear > Reservations & checks
- **Problem:**
  - Checking gear in or out reloaded the whole page and dropped you back on the first tab.
  - Gear could be checked out days before a reservation, or twice.
  - Gear could be checked in without having been checked out.
- **Fix:**
  - Saves refresh the data in place and keep the tab.
  - Check-out opens 48 hours before the reservation starts and closes when it ends (`lib/gear/checkout-window.ts`), and only from "Reserved".
  - Check-in requires a check-out.
  - Outside the window, the button is replaced with the reason ("Too early: this gear can be checked out from …").
- **Files:** `lib/actions/gear.ts`, `lib/gear/checkout-window.ts`, `components/gear/gear-dashboard.tsx`
- **Tests:** T1-F35-03b. Tier 4 and Tier 5 scenarios now move the reservation to the shoot day before checking out.
- **Commit:** `378d89e`

### BUG-20261105-20: Staff could approve payments and change prices

- **Area:** Verification, Services, Calendar, Book for Customer, Bookings, Invoices
- **Problem:** Photographers, videographers and crew could approve or reject payments, create bookings marked paid, change package prices, delete packages and categories, and set slot fees.
- **Cause:** Only Settings and payment setup used `requireOwner`.
- **Fix (decided with the owner: "owner-only money"):**
  - These are now owner-only on the server, and hidden for staff in the UI with a short note:
    - approve and reject slips
    - record payments and create or cancel invoices
    - cancel paid bookings
    - book a customer as "Paid"
    - create, edit or delete packages
    - delete categories
    - set or change a slot's fee or deposit
  - Slots that staff open are priced by the category's packages; a category with no packages needs the owner first.
  - Staff keep the calendar, bookings (unpaid cancel, move, done, deliver), gear, showcase, frames and reminders.
- **Files:** `lib/auth/owner.ts`, `lib/actions/admin-verification.ts`, `lib/actions/admin-services.ts`, `lib/actions/admin-calendar.ts`, `lib/actions/admin-bookings.ts`, the matching admin pages and dialogs
- **Tests:** T10-VER-03, T10-OWN-01/02/03
- **Commit:** `378d89e`

## 2026-11-05: Studio owner walkthrough (admin suite)

The bugs below were found by signing in as the Lumina demo owner and using every admin page. All are fixed. The full E2E suite passes: 2107 assertions, 0 failures.

### BUG-20261105-01: The "Verified by" name could be faked

- **Area:** Admin > Verification, Admin > Inventory (gear check-out and check-in)
- **Problem:** Approving or rejecting a payment recorded whatever name was picked from a hard-coded list ("Studio Lead", "Sarah Tan", "David Chong", …). That list included people from other studios. The audit trail showed "Studio Lead" rather than the person who acted. Gear inspections worked the same way: free text, pre-filled with "Liam Ross (Key Tech)".
- **Cause:** The browser sent the verifier or inspector name (`staffName`, `inspectorName`), and the server saved it as given.
- **Fix:** The server records the signed-in user's name from the session. The name fields were removed from the action inputs. The UI shows "Verifying as / Inspected by `<you>`" as read-only text.
- **Files:** `lib/actions/admin-verification.ts`, `lib/actions/gear.ts`, `lib/validations/gear.ts`, `components/checkout/admin-verification-console.tsx`, `components/gear/inspection-dialog.tsx`, `components/gear/gear-dashboard.tsx`, `app/[tenantSlug]/admin/verification/page.tsx`, `app/[tenantSlug]/admin/inventory/page.tsx`
- **Tests:** T1 "Invoice records the signed-in verifier" and "Inspection is logged under the signed-in user". Every test now calls these actions without a name.
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

### BUG-20261105-05: Renaming a category's slug orphaned its records

- **Area:** Admin > Services > Campaign Categories
- **Problem:** Changing a category's slug left its packages, slots, bookings, showcase items, projects and proposals on the old slug. They no longer matched any category.
- **Cause:** Those records store the category as slug text, and the rename only updated the category row.
- **Fix:** The rename runs in a transaction that moves every record filed under the old slug to the new one. Matching is loose, as for bookings, so `STUDIO_PORTRAIT` matches `studio-portrait`.
- **Files:** `lib/actions/admin-services.ts`
- **Tests:** T2-CAT-01
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

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
- **Commit:** `5fb4e61`

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

- Several admin form labels aren't linked to their inputs (`htmlFor`/`id`), so screen readers don't announce them.
- The client vault (`/<studio>/vault/<project>`) and `/api/download` don't check who is signed in: anyone with the project link can see the watermarked previews and, once the balance is paid, download the masters.
- Demo data: seeded receipt and portfolio images are 1×1 placeholders, and `lumina_showcase_02.jpg` is missing.
