# Wall Art: included framed prints and paid print add-ons

Date: 2026-11-15
Status: draft for approval

## Intent

Wall Art is a client feature, not a public showcase feature. After a client's photos are
delivered and their balance is paid, they open their own gallery, pick *their* photos, preview
each framed on a wall, and put framed prints in a **cart**:

- **included** prints their package gives them (free, unless they upgrade), and/or
- **paid** framed prints as add-ons (any client, including softcopy-only packages).

One cart = one order = one fulfilment (pickup or one shipment with one shipping fee) = at most
one invoice. The studio produces the prints and hands them over or ships them.

Why: framed prints are a key upsell and a selling point of packages ("includes 3 framed
prints"). Today the feature can't deliver on either: it lives on the public page, shows the
studio's portfolio photos, has no idea what a package includes, always charges, and keeps no
order the studio can work from.

## Current state (what exists today)

- `app/[tenantSlug]/visualizer/page.tsx` + `components/visualizer/*`: wall preview with print
  size, frame, mat (NONE / WHITE_2INCH / OFFWHITE_2INCH) and orientation. Photos default to
  showcase covers; a project's `PHOTO` deliverable items load only with `?projectId=`, which
  nothing links to. Only entry points: public showcase nav ("Wall Art") and admin Frames page.
- `lib/actions/visualizer.ts` `createPrintOrder`: always creates a `MilestoneInvoice`
  (`milestoneType: "PRINT_FRAME_ORDER"`, PENDING) and returns a checkout URL. Order details
  exist only as a JSON blob assembled at order time; there is no order record. Mat price is
  hard-coded `25.0`. Staff can order on a client's behalf from this public page.
- Admin **Frames & Prints** (`/admin/frames`): `PrintSize` (code, name, inches, `basePrice`) and
  `FrameDesign` (name, material, molding, color, preview, `priceOffset`, `isAvailable`).
  Framed print price = size `basePrice` + frame `priceOffset` + mat.
- `ServicePackage.deliverables` is free text. `ClientBooking` snapshots `packageId`,
  `packageName`, `sessionPrice` at booking time. A booking becomes a `Project`
  (`lib/bookings/project-promotion.ts`). Some studios deliver via `ClientBooking.deliveryUrl`
  (outside link) with no in-app PHOTO items.
- Paid-in-full: `Project.isFinalBalancePaid`, set in `lib/payments/settle.ts`,
  `lib/actions/checkout.ts`, `lib/actions/admin-verification.ts`. Download gate:
  `lib/deliverables/access.ts`.
- Paid-invoice follow-ups: `onInvoicePaid` in `lib/bookings/billing.ts` currently handles only
  `BOOKING_DEPOSIT` and `RETAINER_50`, and is only called from those branches in `settle.ts` and
  `admin-verification.ts` (checkout calls it from two paths). Invoices can be VOIDed.
- Settings has a Delivery tab (`components/admin/settings/delivery-tab.tsx`). Email via
  `lib/email/smtp.ts` (Mailpit in dev).

## Goals

1. Studios define **included framed prints** per package: lines of
   `print size + frame design + quantity`; sizes/frames within one package can differ.
2. Each booking keeps a **snapshot** of its included prints. Later package edits never change
   existing bookings. Existing bookings get a one-time backfill at launch, and staff can grant
   included prints to any booking by hand.
3. Clients reach Wall Art **from their own gallery**, with their own delivered photos.
4. Claiming and ordering unlock only when the project's full balance is paid; before that the
   gallery shows included prints as locked.
5. Included print: size + frame pre-set to the included line; client picks photo and
   orientation (free) and may **upgrade** (bigger size, other frame, add mat) paying only the
   difference.
6. Paid print: same screen, full price, any paid-in-full client, unlimited.
7. **Cart**: several prints (included and paid mixed) in one order, one fulfilment choice, one
   shipping fee, one invoice, one tracking number.
8. Fulfilment: **Pickup at studio** or **Ship to me** (address required). Shipping is always
   paid by the client: flat fee per studio-defined shipping zone.
9. Studio works every order through statuses; client sees status and tracking.

## Non-goals

- A general add-on product catalog (albums, USBs, etc.). Approach 2, rejected.
- Free prints for proposal-based projects (no booking/package); they can still buy paid prints.
- Shipping outside Malaysia; courier API integration; automatic tracking updates.
- Claim deadlines. Splitting one order into several shipments.

## Anti-goals (would be a failure even if it works)

- A client getting any print before paying their full balance.
- Editing a package silently changing what existing clients are owed.
- A client losing a free print because they abandoned checkout.
- An order whose photo/size/frame/address details are lost or change after the fact.
- A free pickup order creating a confusing RM 0 invoice.

## Approaches considered

1. **Build on the existing pieces (chosen).** New order records and package/booking
   included-print lines; reuse wall preview, Frames & Prints admin, invoices and checkout.
2. **General add-on catalog.** More flexible later, much bigger now; frames still need size,
   wall preview and shipping. Rejected.
3. **No order record.** Orders as invoice JSON, free claims as RM 0 invoices. No place for
   status, fulfilment, address or tracking. Rejected.

Within 1, the owner chose **cart orders** (one order, many items, one shipping fee) over one
order per print, so multi-frame packages ship once.

## Design

### Data

- `PackageIncludedPrint` — `packageId`, `printSizeId`, `frameDesignId`, `quantity` (≥1).
- `BookingIncludedPrint` — `bookingId`, `printSizeId`, `frameDesignId`, `quantity`, snapshot of
  size code/name/inches + frame name, `source` (`PACKAGE` | `BACKFILL` | `MANUAL`),
  `grantedById?`, `note?`. Written when a booking is created from a package (where
  `packageName`/`sessionPrice` are snapshotted).
- `PrintOrder` (the cart once placed) — `tenantId`, `clientId`, `projectId`, `orderNumber`,
  `fulfilment` (`PICKUP` | `SHIP`), delivery address (recipient name, phone, line1, line2,
  postcode, city, state, country = Malaysia), `shippingZoneName`, `shippingFee`,
  `itemsTotal`, `totalAmount`, `status` (`AWAITING_PAYMENT`, `NEW`, `IN_PRODUCTION`,
  `READY_FOR_PICKUP`, `SHIPPED`, `COLLECTED`, `DELIVERED`, `CANCELLED`), `courier?`,
  `trackingNumber?`, `invoiceId?`, `placedById` (client or staff), notes, timestamps.
- `PrintOrderItem` — `orderId`, `kind` (`INCLUDED` | `PAID`), `bookingIncludedPrintId?`
  (INCLUDED), photo (`deliverableItemId`, url, title), orientation, size/frame/mat
  **snapshots** (ids, names, inches, prices at order time), `upgradeAmount`, `lineAmount`.
- `MilestoneInvoice` keeps `milestoneType: "PRINT_FRAME_ORDER"`; linked via
  `PrintOrder.invoiceId`.
- `ShippingZone` — `tenantId`, `name`, `fee`, `states` (Malaysian states/FTs), `sortOrder`;
  each state in at most one zone per studio. Example for a Sarawak studio:
  Local (Sarawak), Sabah (Sabah, Labuan), Peninsular (the rest).
- `User`: saved delivery address (prefills the next order, editable per order).
- `Tenant`: `matBoardPrice` (replaces hard-coded 25). `PrintSize`: add `isAvailable`.

### Cart

The cart is client-side state for one project (kept in the browser while they browse photos;
nothing is reserved until they place the order). Each cart line is one framed print. The client
adds included prints (one per remaining unit) and paid prints, previews each, then checks out
once. Placing the order re-validates everything on the server.

### Remaining included prints

Remaining for a `BookingIncludedPrint` = `quantity` − count of `PrintOrderItem`s pointing at it
whose order is not `CANCELLED`. Placing an order checks this inside the same transaction that
creates the order (no double-claim from two tabs). Cancelling an order returns its included
prints.

### Pricing

- Paid item: size `basePrice` + frame `priceOffset` + mat (if any).
- Included item: upgrade = max(0, chosen price − included line price), both at current catalog
  prices (size + frame + mat).
- Order total = sum of item amounts + shipping fee (SHIP only; fee from the address state's
  zone, snapshotted).
- Total 0 (only included items, no upgrades, pickup) → status `NEW`, **no invoice**.
- Total > 0 → one `PRINT_FRAME_ORDER` invoice for the total, status `AWAITING_PAYMENT`,
  client goes to the existing checkout. When that invoice is paid the order moves to `NEW`.
  This needs a `PRINT_FRAME_ORDER` branch added to every payment path (`settle.ts`,
  `checkout.ts` both paths, `admin-verification.ts`), or `onInvoicePaid` called for every
  invoice type — builder's choice, but all paths must be covered and tested.

### Unpaid orders (my call)

An `AWAITING_PAYMENT` order can be cancelled by the client from their portal; voiding its
invoice (admin) also cancels it. Cancelling returns its included prints and voids the invoice.
No automatic expiry.

### Unlock rule

Claiming and ordering require `Project.isFinalBalancePaid === true`, for clients **and staff**
(my call: no override; walk-in cash is recorded through the existing invoice verification).
Before that the gallery shows "3 framed prints included, unlocks when your balance is paid" and
the order button is disabled with the same message.

### Client experience

- Gallery (vault project page and account Galleries card): **Framed prints** section with
  included lines and remaining counts (locked/unlocked), "Order a framed print", and past orders
  with status and tracking.
- Wall Art opens scoped to the project (`/{tenant}/visualizer?projectId=…`). Photos = that
  project's delivered PHOTO items only. Adding an included print starts at its size + frame;
  changing them shows "Upgrade +RM X". A cart drawer lists items with prices.
- Checkout step: Pickup / Ship; Ship shows the address form (prefilled), state dropdown, and the
  zone fee; summary: items, upgrades, mat, shipping, total. Confirm → "Order placed" (free) or
  checkout (paid).
- No in-app photos (outside-link delivery, my call): the section still lists what's included,
  with "Ask the studio to add your photos here to choose one"; ordering disabled until photos exist.
- Emails to the client when an order becomes `READY_FOR_PICKUP` or `SHIPPED`.

### Public Wall Art page

`/{tenant}/visualizer` without a project stays a public preview with showcase photos and no
order button: "Ordering is done from your gallery — sign in". The showcase nav link stays.

### Studio experience

- **Services → package dialog**: "Included framed prints" rows (Size ▾ / Frame ▾ / Qty /
  remove), "+ Add framed print", summary line. Empty = softcopy only. Public package cards show
  "Includes N framed prints".
- **Frames & Prints**: Mat board price. Sizes/frames referenced by any package line, booking
  line or order item can't be deleted, only hidden. Hidden items aren't offered for new orders
  or package lines; existing booking lines keep their snapshot and can still be claimed.
- **Settings → Delivery**: shipping zones table (name, states, fee). If not every state is
  covered, shipping is offered only to covered states; with no zones, only Pickup.
- **Print orders** admin page: list filtered by status (thumbnails, client, item count,
  Free/Paid/Upgrade, pickup/ship, total, status). Detail: each item's spec + full-res photo
  download, address (copyable), status actions, courier + tracking for SHIPPED, cancel.
  Refunds for cancelled paid orders are handled outside the app.
- **Booking detail (admin)**: list of the booking's included prints with source, plus
  "Grant included print" (size, frame, qty, note) and remove for unclaimed manual grants.
- Staff can place an order for a client from that client's gallery in admin (same rules),
  replacing staff ordering from the public visualizer.

### Launch backfill

One-time script: for every existing booking with a `packageId` whose package has included
lines, create `BookingIncludedPrint` rows (`source: BACKFILL`) from the package's lines at
launch time. Idempotent (skip bookings that already have rows).

## Left to the builder

- Component split, file locations, nav placement, status-badge styling (follow the shared
  `PageShell`/`PageHeader`/button/tab styles).
- How the cart is held client-side, and order number format (reuse invoice-number style).
- Retiring `createPrintOrder`'s JSON path; converting any existing `PRINT_FRAME_ORDER`
  invoices to orders if any exist.
- Tests: snapshot on booking, backfill idempotency, remaining-count race, unlock rule (client
  and staff), upgrade math, zone lookup, every payment path → order NEW, cancel/void returns
  included prints, no invoice for free pickup, delete-protection.
