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

## 2026-11-18: Client walkthrough

A browser walkthrough of the client side on the Docker build, at phone width: a new client books a session, pays the deposit by QR slip, the owner approves it, and the client checks their account; then a delivered gallery, favourites, locked prints and a receipt (demo client). Ordering prints wasn't tried in the browser (it needs a paid gallery; Tier 20 covers it). Everything created was removed afterwards.

### BUG-20261118-04: After a QR or cash booking, the client never saw how to pay

- **Area:** Booking page (Quick Confirm Booking)
- **Problem:** The booking form closed at once, leaving a short message on the calendar. The client never saw the "Booking received" screen, the QR or the slip upload, so there was no payment for the studio to check.
- **Cause:** On success the calendar cleared the held slot, and the form hides itself without a slot. Its button also only went to My Account.
- **Fix:** The slot is kept until the form is closed, so the confirmation shows; its Upload Payment Slip button opens that invoice's slip upload. The booking action now returns the invoice.
- **Files:** `components/booking/cinema-booking-shell.tsx`, `components/booking/booking-intake-modal.tsx`, `lib/actions/booking.ts`
- **Tests:** browser walkthrough
- **Commit:** 05d4b4d

### BUG-20261118-05: The account called an unpaid booking "Confirmed" and the balance "settled"

- **Area:** Client account (Overview, My Bookings, Invoices & Receipts)
- **Problem:** Before any deposit was paid, the session read "Confirmed", Balance due read $0.00 "All invoices settled & clear", the bill read "Under review" with no way to pay, the Unpaid filter read 0, and statuses showed as codes (PENDING_VERIFICATION, PENDING, "Qr Code"). A rejected slip was counted with cancelled invoices.
- **Cause:** A QR deposit is stored as "awaiting verification" from the moment it's booked; the account read that as "the studio is checking a slip" even with no slip. The overview badge was hard-coded "Confirmed".
- **Fix:** One rule for the client's side (`clientPayState`): unpaid, waiting for your payment (no slip yet, or cash to bring), under review (slip sent), slip not accepted, paid, cancelled. Owed invoices count toward the balance and the Unpaid filter; each shows a plain label and its next step (Pay now, Upload slip). Sessions read "Awaiting deposit" or "Payment under review" until confirmed. The top banner names the payment due first, says "Action required" only when it is (a deposit to pay, a rejected slip, or due within 3 days), and otherwise shows its date.
- **Files:** `lib/invoices/client-status.ts`, `lib/invoices/bill-groups.ts`, `components/account/client-dashboard.tsx`
- **Tests:** T13-PAY-01, T13-PAY-02, T13-GROUP-02
- **Commit:** c7797fc

### BUG-20261118-06: The booking email said "Confirmed" before the deposit was paid

- **Area:** Booking emails
- **Problem:** A QR or cash booking got "Confirmed: Production Session" at once, with no word on how to pay; a portrait client was told about "location ephemeris".
- **Cause:** One email for every booking, paid or not.
- **Fix:** Unpaid: "Booking received: please pay your deposit", with the next step (upload the slip, or pay at the studio, within 24 hours) and, for QR, a link straight to the slip upload. Paid: "Booking confirmed". Plain wording, and the approval email formats the session day as stored.
- **Files:** `lib/notifications.ts`, `lib/bookings/confirmation-email.ts`, `lib/bookings/payment-approval.ts`
- **Tests:** T13-PAY-02, T7-ADM-EMAIL-01
- **Commit:** cad4c7e

### BUG-20261118-07: Checkout opened on Card, claimed an "escrow guarantee", and said a slip was sent before it was

- **Area:** Checkout
- **Problem:** "Upload payment slip" opened checkout on Card. The page said "Secure Escrow Checkout" and "CineFlow Escrow Guarantee ... cryptographic booking receipt", neither of which exists. Attaching a slip said "uploaded successfully!" before it was submitted.
- **Fix:** An invoice opens on its own payment method (QR or cash). Plain, accurate wording: "Pay your invoice", "Choose how to pay", "Amount due", "Confirms your booking". The attach message says to press Submit.
- **Files:** `components/checkout/checkout-shell.tsx`, `components/checkout/order-summary-card.tsx`, `components/checkout/qr-payment-form.tsx`, `app/[tenantSlug]/checkout/page.tsx`
- **Tests:** browser walkthrough
- **Commit:** 1c5c445

### BUG-20261118-08: Smaller things from the walkthrough

- **Category codes shown as names:** sessions read "Studio-Portrait" and website cards "commercial"; they now show the studio's category name ("Studio Portraits"). `lib/bookings/category-name.ts`, `components/showcase/portfolio-grid.tsx`. Test: T13-PAY-01.
- **No message after adding a slot:** the admin calendar now says "Slot added: Thu 19 Nov, 10:00 AM – 11:30 AM." `components/admin/calendar/single-slot-dialog.tsx`.
- **Stage names cut off on a phone** ("Plann…"): on a phone the strip shows bars and icons, with the current stage named above it. `components/account/client-dashboard.tsx`.
- **Commit:** c7797fc

## 2026-11-17: Full access check of every role and permission

A test now lists every admin action (99), upload folder and admin page (22) with exactly the access it needs (Tier 26). For each one it checks that one step below is refused and exactly the need is allowed, so a check that asks for the wrong area or level fails the suite, not only a missing one. Proved by loosening one action and one page on purpose: 9 failures, then restored. A browser walkthrough on the Docker build signed in as each starter role (Photographer, Videographer, Crew, Front desk), each money permission, and a role with no access. Full E2E suite: 4795 assertions, 0 failures.

### BUG-20261118-03: Dates changed day between the server and the browser

- **Area:** Client account, checkout, call sheet, model release, signed proposal, gear bookings
- **Problem:** The client account logged a React hydration error, and dates could show a different day than the studio sees: a shoot on Fri 20 Nov showed as Sat 21 Nov for a client in Malaysia.
- **Cause:** These screens formatted dates in the viewer's time zone. The server renders them in UTC, then the browser renders them again in its own zone, and the two disagree.
- **Fix:** Calendar days (shoot, session and gear booking days) use `formatSlotDate` (UTC, as they are stored). Moments (paid, due, signed, submitted) use the studio's time zone, as the invoice document already did.
- **Files:** `components/account/client-dashboard.tsx`, `components/checkout/order-summary-card.tsx`, `components/checkout/receipt-lightbox-modal.tsx`, `components/gear/gear-dashboard.tsx`, `components/logistics/call-sheet-shell.tsx`, `components/logistics/release-form-shell.tsx`, `components/proposals/signed-acceptance-view.tsx`
- **Tests:** T27-DATES-01 (no browser-rendered screen formats a date without a fixed time zone), T27-DATES-02
- **Commit:** bb4b6ff

### BUG-20261118-02: Overview "Billing & Receipts" listed invoices one by one

- **Area:** Client account → Overview → Billing & Receipts
- **Problem:** The box listed single invoices (one unpaid, one or two paid), so a client saw "Booking deposit" and "Booking balance" as separate items, and a slip under review didn't show at all. A print order from a proposal's gallery also sat apart from that proposal on the Invoices tab.
- **Fix:** The box shows one line per bill (a booking or proposal with all its invoices, or a lone invoice): total, paid so far, a progress bar, a Settled / due / Under review badge, and Pay now, Receipt or Details. Bills with money due come first. A gallery's print order joins the proposal billed for that gallery, as it already did for bookings.
- **Files:** `components/account/client-dashboard.tsx`, `lib/invoices/bill-groups.ts`
- **Tests:** T13-GROUP-01
- **Commit:** 130afdf

### BUG-20261118-01: A booking's print order sat outside its bill, and "All settled" showed while a slip was under review

- **Area:** Client account → Invoices & Payment Receipts
- **Problem:** A booking's deposit and balance were grouped in one card, but a print order from that booking's gallery showed apart under "Direct Orders". The card's total was the session price only, and it said "All settled" even while a payment slip was waiting for review.
- **Cause:** Cards grouped invoices by booking only; a print order is linked to the gallery, not the booking. The settled badge was checked before the review state.
- **Fix:** Invoices linked to a booking's gallery join that booking's card; the total is the session price plus extras such as prints; a card with a slip under review isn't settled.
- **Files:** `lib/invoices/bill-groups.ts`, `components/account/client-dashboard.tsx`
- **Tests:** T13-GROUP-01, T13-GROUP-02
- **Commit:** 0fab02e

### BUG-20261117-04: A deleted account's cookie still signed in

- **Area:** Sign-in sessions (`getCurrentUser`)
- **Problem:** After an account was deleted from the database, its browser cookie still opened the admin. Team access was safe (it is read from the database, and a missing account gets none), but owner-only checks trust the role inside the cookie, so a deleted owner's cookie would still pass them.
- **Cause:** The session check ended a session only when the account was marked removed or its password was reset; it treated a missing account as fine.
- **Fix:** A missing account means no session.
- **Files:** `lib/auth/token.ts`
- **Tests:** T26-SESSION-01
- **Commit:** 544d66b

### BUG-20261117-01: Booking showed "Upload photos" to people who can't open the gallery

- **Area:** Booking details (page, Bookings pop-up, Calendar pop-up)
- **Problem:** Crew (no Galleries access) saw "Upload photos" on their booking and landed on "You don't have access to this". Front desk (Galleries View) saw "Upload photos" on a gallery they can only look at.
- **Cause:** The link showed whenever the booking had a gallery, whatever the viewer's Galleries access.
- **Fix:** The link follows the gallery page's own rule: "Upload photos" for Galleries Manage, or Only their own on a booking assigned to them; "Open gallery" for Galleries View; no link otherwise.
- **Files:** `lib/bookings/gallery-link.ts`, `lib/auth/page-powers.ts`, `components/admin/bookings/booking-actions.tsx`
- **Tests:** T26-LINK-01 (link and gallery page agree at every level)
- **Commit:** `82c2a1b`

### BUG-20261117-02: "Record payment" offered on a slip the person can't approve

- **Area:** Invoice page
- **Problem:** With "Record or cancel payments" but not "Approve or reject payments", an invoice whose payment slip was waiting for review showed "Record payment". The server refused it on save, because recording over a slip approves it.
- **Cause:** The button only checked the record-payments permission.
- **Fix:** One shared rule decides both: on a waiting slip, recording also needs approve-payments. Without it the page says "A payment slip is waiting for review in Verification."
- **Files:** `lib/invoices/record-rule.ts`, `components/admin/invoices/invoice-admin-actions.tsx`, `app/[tenantSlug]/admin/invoices/[invoiceId]/page.tsx`
- **Tests:** T26-LINK-02 (button and server agree in all 8 combinations)
- **Commit:** `82c2a1b`

### BUG-20261117-03: Gear kit availability said "check failed" when access was refused

- **Area:** Gear & Fleet, kit bundles (`checkBundleAvailability`)
- **Problem:** Someone without Shoot days & gear access got a generic failure instead of a refusal.
- **Fix:** The action reports `FORBIDDEN` when the access check refuses.
- **Files:** `lib/actions/gear.ts`
- **Tests:** T26-TABLE-02, T26-TABLE-03
- **Commit:** `82c2a1b`

## 2026-11-06: Page audit, client records need a signed-in owner

From a full audit of every page. Decision taken with the owner: vault, proposals, releases and set-hud need the customer (or studio staff) to sign in, so every view and signature has a name on it. The full E2E suite passes: 2349 assertions, 0 failures. New tests are T10-REC-01 to 08.

### BUG-20261106-01: Proposals could be read and signed by anyone

- **Area:** Client proposal page, `acceptProposal`, `toggleProposalAddOn`, `getProposalBySlugAndId`
- **Problem:** The page accepted the proposal number in the URL, and numbers run in sequence (`PR-2026-001`, `-002`…). Anyone could guess a number, see the client's name, email and phone, change the add-ons, and sign the contract.
- **Cause:** No sign-in or ownership check on the page or its actions. `getProposalBySlugAndId` also returned the whole tenant and client rows.
- **Fix:** The page needs a sign-in, by the proposal's client or the studio's staff. Signed-out visitors go to the login page and come back afterwards. Only the client the proposal is addressed to can sign it; staff can't sign on a client's behalf. Add-ons can't change once a proposal is signed. `getProposalBySlugAndId` returns trimmed rows. Tab titles no longer show the proposal title.
- **Files:** `app/[tenantSlug]/proposals/[proposalId]/page.tsx`, `lib/actions/proposals.ts`, `lib/auth/project-access.ts`
- **Tests:** T10-REC-01, T10-REC-02
- **Commit:** `a47a9f6`

### BUG-20261106-02: Studio-created clients could never sign in

- **Area:** New proposal (admin), client sign-up
- **Problem:** A client added through "New proposal" got an account with no password. Claiming it needed a booking tracking code, which a proposal-only client doesn't have. Once proposals needed a sign-in (BUG-20261106-01), those clients could not open them at all.
- **Cause:** Claiming only accepted a tracking code; the `inviteToken` fields on User were unused.
- **Fix:** The proposal email for a client without a password now links to a "set your password" page with a one-time invite (30 days; only a SHA-256 of it is stored). Sign-up accepts the invite as proof of ownership and then continues to the proposal. An expired invite says to ask the studio to resend it. The login page's "Create account" link keeps the page the visitor was going to.
- **Files:** `lib/auth/invite.ts`, `lib/actions/client-auth.ts`, `lib/actions/admin-projects.ts`, `app/[tenantSlug]/register/page.tsx`, `components/auth/client-register-card.tsx`, `components/auth/client-auth-panel.tsx`, `components/auth/studio-login-form.tsx`
- **Tests:** T10-REC-06
- **Commit:** `a47a9f6`

### BUG-20261106-03: Vaults, master downloads and print previews were open to anyone

- **Area:** Vault page, `/api/download`, vault favourites and retouch notes, visualizer `?projectId=`
- **Problem:** Anyone with a project link could see the client's gallery and details, download masters once the balance was paid, and change favourites and retouch notes. `/visualizer?projectId=` showed any project's photo previews, and `?photoUrl=` put any outside image on the page.
- **Cause:** No sign-in or ownership checks.
- **Fix:** All of these need a sign-in, by the project's client or the studio's staff. The download route answers 401 when signed out and 404 for anyone else. `?photoUrl=` was removed (nothing linked to it).
- **Files:** `app/[tenantSlug]/vault/[projectId]/page.tsx`, `app/api/download/route.ts`, `lib/actions/vault.ts`, `app/[tenantSlug]/visualizer/page.tsx`
- **Tests:** T10-REC-03, T10-REC-05
- **Commit:** `a47a9f6`

### BUG-20261106-04: Releases and call sheets were public, and releases didn't record who took them

- **Area:** Releases page, `submitDigitalRelease`, set-hud (call sheet) page
- **Problem:** Anyone with the link could see signed releases (names, emails, signature images) and submit new ones. The call sheet page sent the studio's whole record, including bank details and the encrypted payment gateway secret, to the browser.
- **Cause:** No sign-in checks; `tenant: true` on the call sheet query.
- **Fix:** Both pages need a sign-in, by the project's client or the studio's staff. Each release stores who collected it (`collectedById`, `collectedByName`), shown as "Collected by …" in the list. The call sheet query now loads only the studio's id, name and slug.
- **Files:** `app/[tenantSlug]/releases/[projectId]/page.tsx`, `app/[tenantSlug]/set-hud/[callSheetId]/page.tsx`, `lib/actions/logistics.ts`, `components/logistics/release-form-shell.tsx`, `prisma/schema.prisma`
- **Tests:** T10-REC-04
- **Commit:** `a47a9f6`

### BUG-20261106-05: Password hashes sent to the browser

- **Area:** Checkout (paying an invoice), Admin > Verification
- **Problem:** Both pages loaded invoices with the whole client row, so the client's password hash and invite token were in the page sent to the browser.
- **Cause:** `client: true` passed into client components.
- **Fix:** Both load only the client's id, name, email and phone.
- **Files:** `app/[tenantSlug]/checkout/page.tsx`, `app/[tenantSlug]/admin/verification/page.tsx`
- **Tests:** Checked by loading the live pages (no `passwordHash` or bcrypt hash in the response)
- **Commit:** `a47a9f6`


### BUG-20261106-06: Print orders and invoice payments needed no sign-in

- **Area:** Visualizer print orders, checkout for invoices (`checkout?invoiceId=`, final balance), `processInvoicePayment`
- **Problem:** Anyone could place a print order under any email (creating an account and invoice for that person), view any invoice's checkout page from its link, and send a payment slip for any invoice.
- **Cause:** No sign-in or ownership checks. Decision with the owner: customers must sign in (option A).
- **Fix:** Print orders need a sign-in. A client is billed as themselves (typed name and email are ignored). Studio staff can still order for a client at the counter, but never bill a team member. An order can only reference a project the caller can see. Signed-out visitors see "Sign in / Create an account" in the order dialog and come back to the visualizer afterwards. Invoice checkout and invoice payment need the invoice's client or studio staff.
- **Files:** `lib/actions/visualizer.ts`, `components/visualizer/order-modal.tsx`, `components/visualizer/visualizer-shell.tsx`, `app/[tenantSlug]/visualizer/page.tsx`, `app/[tenantSlug]/checkout/page.tsx`, `lib/actions/checkout.ts`
- **Tests:** T10-REC-07, T10-REC-08; Tier 12 now pays balances as the invoice's client
- **Commit:** `a47a9f6`

### BUG-20261106-07: Visualizer showed another studio's photos

- **Area:** Visualizer
- **Problem:** Every studio's wall visualizer offered the same four demo photos ("Aurora…", "Farah…") from the seed studios.
- **Cause:** The photo list was hard-coded.
- **Fix:** It now offers the studio's own showcase covers (plus the project's photos when opened from a vault). A studio with none gets a neutral "Your photo here" placeholder.
- **Files:** `app/[tenantSlug]/visualizer/page.tsx`, `components/visualizer/visualizer-shell.tsx`
- **Tests:** Checked by loading the live page
- **Commit:** `a47a9f6`

### BUG-20261106-08: Wrong currency symbol on Gear and Visualizer

- **Area:** Admin > Gear & Fleet, Visualizer
- **Problem:** Any currency other than MYR showed as `$` (e.g. SGD, EUR).
- **Cause:** Each page had `MYR ? "RM" : "$"`.
- **Fix:** New `currencySymbol()` in `lib/money.ts` (RM, $, or the ISO code), used by both pages.
- **Files:** `lib/money.ts`, `app/[tenantSlug]/admin/inventory/page.tsx`, `app/[tenantSlug]/visualizer/page.tsx`
- **Tests:** Typecheck; live page check
- **Commit:** `a47a9f6`

### BUG-20261106-09: Tab titles said "CineFlow OS" twice, and some were missing or inconsistent

- **Area:** Page titles
- **Problem:** Titles like "My Account | CineFlow OS | CineFlow OS". The admin Overview and the login page had no title. Admin titles each followed a different pattern.
- **Cause:** Pages added "CineFlow OS" on top of the root title template.
- **Fix:** Removed the extra suffix (the landing page uses an absolute title). Every admin page is now "<menu label> | <studio> Studio Admin", using the same names as the admin menu. Added titles for Overview and Sign in.
- **Files:** most `app/**/page.tsx` metadata
- **Tests:** Checked by loading the live pages
- **Commit:** `a47a9f6`

### BUG-20261106-10: Signing in to the admin always landed on Overview

- **Area:** Admin login redirect
- **Problem:** Opening a deep admin link (e.g. one invoice) while signed out, then signing in, went to the Overview instead. A wrong-studio redirect dropped the return path entirely.
- **Cause:** Middleware always set `callbackUrl` to `/<studio>/admin`.
- **Fix:** It now keeps the requested path and query string, including on the wrong-studio redirect.
- **Files:** `middleware.ts`, `app/[tenantSlug]/admin/layout.tsx`
- **Tests:** Checked against the live server
- **Commit:** `a47a9f6`

### BUG-20261106-11: Smaller fixes from the audit

- **Proposals list** showed only the latest 50 with no notice; the limit is gone (`admin/proposals/page.tsx`).
- **`bg-zinc-850`** (32 uses) wasn't a defined colour, so those fills and borders didn't render; it's now defined in `app/globals.css`.
- **Login page** showed the form again to someone already signed in; it now moves them on to their page, like `/register` does (`login/page.tsx`).
- **After an online payment,** a signed-in client lands in their account instead of the tracking-code lookup (`checkout/payment-return/page.tsx`).
- **Commit:** `a47a9f6`

### BUG-20261106-12: Dead-end pages and inconsistent layout

- **Area:** Checkout, proposal, call sheet, releases, admin pages
- **Problem:** Checkout, proposal, call sheet and releases had no way back. Releases, call sheet and visualizer painted their background only on the centred column. Verification used a different page wrapper. Admin headings used four different sizes and weights.
- **Fix:** New `PortalTopBar` on those four pages: a back link (to the account tab for clients, the admin project or list for staff) and a "My account" / "Studio admin" link. Full-width backgrounds. Verification uses the standard admin wrapper. All admin page headings use one style. The payment status card matches the other cards.
- **Files:** `components/portal/portal-top-bar.tsx`, the four pages, `components/checkout/admin-verification-console.tsx`, admin console components
- **Tests:** Checked by loading the live pages as signed-out, client and owner
- **Commit:** `a47a9f6`
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

### To do: gaps found while writing the admin manual (2026-11-16)

The manual describes the app as it is today; each item below is written there as a limitation. Update the manual page named in brackets when one is fixed.

- [x] **No screen to add or remove team members.** Fixed 2026-11-17: Settings has a Team tab where the owner invites, edits and removes team members, defines roles with per-area access, and assigns people to bookings (with a My schedule page). Manual: Team, roles and assigning shoots.
- [x] **Proposals have no draft or decline.** A proposal is sent the moment it is created; the "Draft" and "Declined" labels exist in the proposals list but nothing ever sets them. Either add Save as draft and a client Decline button, or remove the labels. (Clients and proposals) Fixed 2026-11-18: New proposal has Save as draft. A draft is hidden from the client (page, account, booking lookup, tab count) and isn't emailed; the list has Preview, Send and Delete for it (Set prices, as for creating). The client can Decline a sent proposal with an optional reason, shown under Declined in the list; a declined proposal can't be signed and a signed one can't be declined (each checked inside the write, so the first wins). Declined proposals leave the pipeline value. Leftover jargon and an untrue "256-Bit Cryptographic Hash" line removed from the signing area. Manual: Clients and proposals. Test: T29-PROP-01..06.
- [x] **A package can't be hidden.** It can only be deleted or moved to a switched-off category. Add an Active switch to packages, as categories, sizes and frames already have. (Services and your website) Fixed 2026-11-18: each package card has an Active / Inactive switch (Services: Manage). Inactive packages are kept with their bookings but left out of the website, booking page, checkout, staff New booking and calendar slot pricing, and the server refuses to book them. Manual: Services and your website. Test: T11-PKG-OFF-01. Commit: 5fc9181.
- [x] **Client pages use film-crew jargon.** Found in the client walkthrough (2026-11-18): "Cinema-Style Soundstage Calendar", "Main Production Stage", "Morning Call Session", "Quick account // 4 fields", "PAYWALL ACTIVE", "Streaming Review Proxy & 4K ProRes". Decide whether clients should see plainer words. Fixed 2026-11-18: the app's own wording on client pages is plain (website, booking, checkout, account, gallery, booking lookup, receipt, proposal, error pages), e.g. "Book a session", "Morning", "Your gallery", "Downloads locked", "Your videos", "Preview". Untrue claims removed ("cryptographic" signature, "calendar invite"), and "50%"/"4K ProRes" no longer stated where they may not be true. Contract terms keep their meaning. Each studio's own content (tagline, package descriptions, file titles) is unchanged.
- [x] **The booking form has two finish buttons.** "Quick Confirm Booking" and "Proceed to Dedicated Checkout Page" do nearly the same thing; a client can't tell which to press. Fixed 2026-11-18: one button, Confirm booking. Card goes on to the payment page; QR and cash hold the slot for 24 hours and the next screen says how to pay. The separate checkout page stays for paying invoices. Commit: b180a82.
- [x] **A tab left open across an update breaks its buttons.** After a new version is deployed, buttons on an already-open page (e.g. Sign out) fail with "Server Action not found" until the page is reloaded. Consider reloading the page when that happens. Fixed 2026-11-18: the page reloads itself when a button gets Next's "action not found" error, whether nothing caught it, an error page did, or the button showed a message (errorMessageOf). At most once a minute, so it can't loop; any other error is left as it was. `lib/stale-version.ts`, `components/stale-version-reload.tsx`. Test: T28-STALE-01..03. Commit: 6248010.
- [x] **A page-load error in the browser console.** React error #418 (server and browser rendered different text) appears on the client account, checkout and call sheet pages in the Docker build. Nothing visible breaks; likely a date or time formatted in a different time zone on the server and in the browser. Fixed 2026-11-18 (BUG-20261118-03, commit bb4b6ff): dates now use a fixed time zone. Test: T27-DATES-01.
- [x] **Gear day rates show to everyone with Shoot days & gear access.** Found in the access walkthrough (2026-11-17): Photographer and Crew see each item's day rate and the kit's total ($2,620 in the demo). Other money is hidden without Invoices access; the design doesn't say whether gear rates count. Decide, then hide them the same way or leave as is. (Team, roles and assigning shoots) Fixed 2026-11-18: rates count as money. Without Invoices View, Gear & Fleet leaves out the Daily rental value card, the Daily rate column, kit rates and the rate fields in the edit forms; the server doesn't send them, and saving a form without the field keeps the existing rate. Manual: Team, roles and assigning shoots; Production → Your gear list. Test: T26-GEAR-01. Commit: 6dab402.
- [x] **Shipping zones: the server allowed Catalog Manage, but the only screen was in owner-only Settings.** Fixed 2026-11-17: shipping zones moved to Frames & Prints → Shipping Zones (`?tab=shipping`), editable with Catalog & website: Manage and read-only with View. Settings → Photo delivery links there. Manual: Framed prints, Settings and your team. Test: T26-SHIP-01. Commit: e61eee3.
- [x] **A held slot can still be edited or deleted in the Calendar.** Fixed 2026-11-16: edit, delete and batch delete refuse a slot whose hold is still running (`SLOT_HELD`) or that has a client booking (`SLOT_HAS_BOOKING`, use Move to another slot), checked again inside the write so a client who selects it at the same instant wins. A hold that has run out doesn't block, and editing such a slot opens it up. The Calendar greys out the buttons with the reason. Test: T2-SLOT-02.
