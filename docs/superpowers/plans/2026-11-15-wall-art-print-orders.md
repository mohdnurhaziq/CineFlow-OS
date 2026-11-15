# Wall Art Print Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let paid-in-full clients claim their package's included framed prints and buy extra framed prints from their own gallery, in one cart per order with pickup or zone-priced shipping, and let the studio work those orders.

**Architecture:** New Prisma models (`PackageIncludedPrint`, `BookingIncludedPrint`, `PrintOrder`, `PrintOrderItem`, `ShippingZone`) plus pure helpers in `lib/prints/` for pricing, zones and remaining counts. Server actions in `lib/actions/print-orders.ts` place, cancel and advance orders; paid `PRINT_FRAME_ORDER` invoices move orders to `NEW` via `onInvoicePaid`. The existing visualizer becomes project-scoped with a client-side cart.

**Tech Stack:** Next.js App Router (server actions), Prisma + SQLite, Zod, React 19, Tailwind, existing E2E harness (`tests/e2e`, run with `npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-15-wall-art-print-orders-design.md`

## Global Constraints

- Claiming and ordering require `Project.isFinalBalancePaid === true`, for clients and staff alike (no override).
- One order = one fulfilment (`PICKUP` | `SHIP`) = one `shippingFee` = at most one `PRINT_FRAME_ORDER` invoice.
- Shipping is never free: `SHIP` always adds the fee of the zone containing the address state. No zone for the state → shipping not offered for that state; no zones → pickup only.
- Order total 0 (only included items, no upgrades, pickup) → status `NEW`, **no invoice**.
- Upgrade = `max(0, chosenPrice − includedLinePrice)`, both priced as size `basePrice` + frame `priceOffset` + mat at current catalog prices.
- Mat price comes from `Tenant.matBoardPrice` (default 25); no hard-coded 25 remains.
- Booking included prints are a snapshot; editing a package never changes existing bookings.
- Sizes/frames referenced by any package line, booking line or order item can only be hidden, not deleted.
- Shipping country is Malaysia only. States list: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Perak, Perlis, Pulau Pinang, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, Putrajaya.
- After each task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:e2e`, `graphify update .`. After the last task: `docker compose up -d --build app` and check localhost:3000.
- Commits: no Co-Authored-By / Claude attribution lines.

## Review Focus

1. Double submit / two tabs placing orders for the same last included print → only one succeeds (test in Task 5).
2. Client cancels after paying, or admin voids an already-paid invoice → paid orders can't be cancelled by the client; void refuses on PAID (test in Task 6).
3. Package edited or a frame hidden after booking → booking still shows and can claim its snapshot line (test in Task 3 and Task 5).
4. Address state changes between cart and order (e.g. user edits state to one with no zone) → server rejects with a clear message; fee always recomputed server-side (test in Task 5).
5. A client opening another client's project in the visualizer, or placing an order on another client's project → refused (test in Task 5).

---

### Task 1: Schema and pricing/zone helpers

**Files:**
- Modify: `prisma/schema.prisma` (add models below; `Tenant.matBoardPrice Float @default(25)`; `PrintSize.isAvailable Boolean @default(true)`; relations on `ServicePackage`, `ClientBooking`, `User`, `Project`, `MilestoneInvoice`, `Tenant`; `User` address fields `shipRecipient? shipPhone? shipLine1? shipLine2? shipPostcode? shipCity? shipState?`)
- Modify: `prisma/seed.ts` (lumina-cine: 3 zones — Local [Sarawak] 10, Sabah [Sabah, Labuan] 20, Peninsular [rest] 30; one included line `1 × smallest size + first frame` on `pkg_lumina_comm`)
- Create: `lib/prints/states.ts`, `lib/prints/pricing.ts`, `lib/prints/zones.ts`
- Test: `tests/e2e/tier20-print-orders.test.ts` (register `runTier20PrintOrderTests` in `tests/e2e/runner.ts` after Tier 19)

Models (SQLite: list fields as JSON strings):
- `PackageIncludedPrint { id, packageId, printSizeId, frameDesignId, quantity Int }` (cascade on package delete)
- `BookingIncludedPrint { id, tenantId, bookingId, printSizeId, frameDesignId, quantity Int, sizeCode, sizeName, widthInches, heightInches, frameName, source String /*PACKAGE|BACKFILL|MANUAL*/, grantedById?, note?, createdAt }`
- `PrintOrder { id, tenantId, clientId, projectId, orderNumber @unique, fulfilment, recipientName?, recipientPhone?, line1?, line2?, postcode?, city?, state?, country @default("Malaysia"), shippingZoneName?, shippingFee Float @default(0), itemsTotal Float, totalAmount Float, status @default("NEW"), courier?, trackingNumber?, invoiceId? @unique, placedById, notes?, createdAt, updatedAt }`
- `PrintOrderItem { id, orderId, kind /*INCLUDED|PAID*/, bookingIncludedPrintId?, deliverableItemId?, photoUrl, photoTitle, orientation, printSizeId, sizeCode, sizeName, widthInches, heightInches, sizePrice, frameDesignId, frameName, framePrice, matBoardType, matPrice, upgradeAmount Float, lineAmount Float }`
- `ShippingZone { id, tenantId, name, fee Float, statesJson String, sortOrder Int @default(0) }`

**Interfaces — Produces:**
- `MY_STATES: readonly string[]` and `type MyState` in `lib/prints/states.ts`
- `framedPrice(p: { sizePrice: number; framePrice: number; mat: MatBoardType; matBoardPrice: number }): number`
- `upgradeAmount(chosen: number, included: number): number` (`max(0, round2(chosen − included))`)
- `type MatBoardType = "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH"` (move from `components/visualizer/order-modal.tsx`)
- `zoneForState(zones: { name: string; fee: number; statesJson: string }[], state: string): { name: string; fee: number } | null` in `lib/prints/zones.ts`
- `parseZoneStates(statesJson: string): string[]`

- [ ] **Step 1: Write failing tests** in tier20:
  - `T20-PRICE-01`: `framedPrice({sizePrice:40, framePrice:15, mat:"NONE", matBoardPrice:25}) === 55`; with `"WHITE_2INCH"` `=== 80`.
  - `T20-PRICE-02`: `upgradeAmount(80, 55) === 25`; `upgradeAmount(40, 55) === 0`; `upgradeAmount(55.1, 55) === 0.1`.
  - `T20-ZONE-01`: with seed zones, `zoneForState(z,"Sarawak")` → `{name:"Local",fee:10}`; `"Labuan"` → Sabah 20; `"Selangor"` → Peninsular 30; `"Narnia"` → `null`.
- [ ] **Step 2:** `npm run test:e2e` → T20 tests FAIL (module not found).
- [ ] **Step 3:** Add models, `npx prisma db push`, update seed, implement helpers.
- [ ] **Step 4:** `npm run test:e2e` → PASS (all tiers).
- [ ] **Step 5:** Commit `feat(prints): schema for included prints, print orders and shipping zones`.

### Task 2: Package included prints (admin) and delete-protection

**Files:**
- Modify: `lib/validations/admin-services.ts` (package create/update accept `includedPrints: {printSizeId, frameDesignId, quantity}[]`, max 10 lines, quantity 1–20)
- Modify: `lib/actions/admin-services.ts` (`createServicePackage`/`updateServicePackage` replace lines in the same transaction; each id must belong to the tenant and be available)
- Modify: `components/admin/services/package-dialog.tsx` (section "Included framed prints": rows Size ▾ / Frame ▾ / Qty / ✕, "+ Add framed print", summary "Shown to clients as: \"N framed prints included\""; empty = softcopy only)
- Modify: `app/[tenantSlug]/admin/services/page.tsx` (load lines + available sizes/frames into the dialog)
- Modify: `components/showcase/*` package card (badge "Includes N framed prints" when N>0) and `app/[tenantSlug]/page.tsx` query
- Modify: `lib/actions/admin-frames.ts` (`deleteFrameDesign`/`deletePrintSize` return `fail("IN_USE", "This is used by a package or an order. Hide it instead.")` when referenced; add `togglePrintSizeAvailability`), `components/admin/frames/frames-manager.tsx` (hide toggle for sizes; "Mat board price" field saving `Tenant.matBoardPrice` via a new `updateMatBoardPrice({tenantId, tenantSlug, price})`)

**Interfaces — Produces:** `includedPrintCount(lines: {quantity:number}[]): number` in `lib/prints/pricing.ts`.

- [ ] **Step 1: Failing tests:** `T20-PKG-01` update package with 2 lines (1×A, 2×B) → DB has those 2 lines, `includedPrintCount === 3`; `T20-PKG-02` a size id from another tenant → `success:false`; `T20-PKG-03` deleting a frame used by a package line → `error === "IN_USE"`, frame still exists; `T20-PKG-04` `updateMatBoardPrice` to 30 → tenant has 30.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): included framed prints on packages`.

### Task 3: Booking snapshot, launch backfill, manual grants

**Files:**
- Create: `lib/prints/entitlements.ts`
- Modify: `lib/actions/admin-bookings.ts` (~L144) and `lib/actions/checkout.ts` (~L183): after the booking is created inside the transaction, call `snapshotIncludedPrints`.
- Create: `prisma/backfill-included-prints.ts`; `package.json` script `"db:backfill-included-prints": "tsx prisma/backfill-included-prints.ts"`
- Create: `lib/actions/admin-included-prints.ts`
- Modify: `app/[tenantSlug]/admin/bookings/[bookingId]/page.tsx` (+ a small client component `components/admin/bookings/included-prints-card.tsx`): list lines with source badge and claimed/remaining; "Grant included print" form (size, frame, qty, note); remove button only for MANUAL lines with 0 claimed.

**Interfaces — Produces:**
- `snapshotIncludedPrints(tx: Tx, booking: { id: string; tenantId: string; packageId: string | null }, source: "PACKAGE" | "BACKFILL"): Promise<number>` (rows created; no-op if booking already has rows)
- `remainingForLines(tx: Tx | typeof db, lineIds: string[]): Promise<Map<string, number>>` (quantity − items on non-CANCELLED orders)
- `loadProjectEntitlements(projectId: string): Promise<{ lines: (BookingIncludedPrint & { remaining: number })[]; unlocked: boolean; hasPhotos: boolean }>`
- `grantIncludedPrint(input: { tenantId; tenantSlug; bookingId; printSizeId; frameDesignId; quantity; note? })`, `removeIncludedPrint(input: { tenantId; tenantSlug; lineId })` → `{ success: true } | fail(...)`; staff-only.
- `backfillIncludedPrints(): Promise<{ bookings: number; lines: number }>` exported from the script module for testing.

- [ ] **Step 1: Failing tests:** `T20-SNAP-01` booking via `processBookingCheckout` with `pkg_lumina_comm` → one `BookingIncludedPrint` with source PACKAGE and frame name snapshot; `T20-SNAP-02` then change package lines → booking rows unchanged; `T20-SNAP-03` hide the frame → `loadProjectEntitlements` still lists the line; `T20-BACKFILL-01` delete a booking's rows, run backfill twice → rows recreated once (second run creates 0); `T20-GRANT-01` grant 2×B → remaining 2; remove → gone; `T20-GRANT-02` client session calling `grantIncludedPrint` → refused.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): snapshot included prints on bookings, backfill and manual grants`.

### Task 4: Shipping zones in Settings → Delivery

**Files:**
- Create: `lib/actions/admin-shipping.ts`, `lib/validations/admin-shipping.ts`
- Modify: `components/admin/settings/delivery-tab.tsx` (Shipping zones table: name, states multi-select from `MY_STATES` with states already in another zone disabled, fee; add/remove; note "States not in any zone can only choose pickup.")
- Modify: `app/[tenantSlug]/admin/settings/page.tsx` (load zones)

**Interfaces — Produces:** `saveShippingZones(input: { tenantId; tenantSlug; zones: { name: string; fee: number; states: string[] }[] })` replaces all zones; rejects a state in two zones (`"Sabah is in two zones."`), unknown state, fee < 0, empty name.

- [ ] **Step 1: Failing tests:** `T20-ZONES-01` save 2 zones → stored and `zoneForState` works; `T20-ZONES-02` same state in two zones → `success:false` with that message; `T20-ZONES-03` fee 0 → `success:false`, message "Shipping fee must be more than 0." (shipping is never free).
- [ ] **Step 2:** run → FAIL. **Step 3:** Implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): shipping zones in delivery settings`.

### Task 5: Placing an order

**Files:**
- Create: `lib/validations/print-orders.ts`, `lib/actions/print-orders.ts`
- Modify: `lib/bookings/billing.ts` (export `nextPrintOrderNumber(tx, tenantId): Promise<string>` format `PO-<year>-<4-digit seq>` counted from existing orders that year)

**Interfaces — Produces:**
```ts
type CartItemInput = {
  kind: "INCLUDED" | "PAID";
  bookingIncludedPrintId?: string;   // required for INCLUDED
  deliverableItemId: string;          // must be a PHOTO item of this project
  orientation: "PORTRAIT" | "LANDSCAPE";
  printSizeId: string; frameDesignId: string; matBoardType: MatBoardType;
};
type PlaceOrderInput = {
  tenantId: string; tenantSlug: string; projectId: string;
  items: CartItemInput[];             // 1..20
  fulfilment: "PICKUP" | "SHIP";
  address?: { recipientName; recipientPhone; line1; line2?; postcode; city; state };
  saveAddress?: boolean; notes?: string;
};
placePrintOrder(input): Promise<
  | { success: true; orderId: string; orderNumber: string; checkoutUrl: string | null }
  | { success: false; error: string; message: string }>
quotePrintOrder(input: PlaceOrderInput): Promise<{ success: true; items: {lineAmount:number; upgradeAmount:number}[]; shippingFee: number; total: number } | fail>
```
Rules (in one `db.$transaction`): caller is the project's client or tenant staff; `isFinalBalancePaid` else `fail("LOCKED", "Framed prints unlock when your balance is paid.")`; each INCLUDED line belongs to the project's booking and remaining ≥ count in cart (`fail("NONE_LEFT", "You've already claimed all of these prints.")`); size/frame available (INCLUDED keeps the line's own size/frame allowed even if hidden); SHIP needs address and zone (`fail("NO_SHIPPING", "We don't ship to <state> yet. Choose pickup.")`); prices from DB only. Total 0 → status `NEW`, no invoice, `checkoutUrl: null`. Else create invoice (`milestoneType: "PRINT_FRAME_ORDER"`, `projectId`, `clientId` = project client, `amount: total`, `description: "Framed prints <orderNumber>"`, due in 7 days), status `AWAITING_PAYMENT`, `checkoutUrl: /<slug>/checkout?invoiceId=<id>`. `saveAddress` writes the `User` ship* fields.

- [ ] **Step 1: Failing tests** (`T20-ORDER-*`), using a project from a booking with the seed line:
  - `01` unpaid project → `error "LOCKED"`, for client and for staff.
  - `02` paid: 1 INCLUDED, same size/frame, no mat, PICKUP → status NEW, `invoiceId null`, remaining 0.
  - `03` same line again → `NONE_LEFT`.
  - `04` race: cancel #02, then `Promise.all` two identical orders → exactly one success.
  - `05` INCLUDED upgraded to a bigger size + white mat, SHIP to Sarawak → `upgradeAmount = framedPrice(new) − framedPrice(included)`, `shippingFee 10`, invoice amount = upgrade + 10, status AWAITING_PAYMENT.
  - `06` 2 PAID + 1 INCLUDED, SHIP to Selangor → one order, 3 items, one fee 30, one invoice.
  - `07` SHIP to a state with no zone → `NO_SHIPPING`.
  - `08` another client's session on this project → refused; a `deliverableItemId` from another project → refused.
  - `09` `saveAddress:true` → user ship* fields saved.
- [ ] **Step 2:** run → FAIL. **Step 3:** Implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): place framed print orders with included, paid and shipping`.

### Task 6: Payment hooks, cancel and void

**Files:**
- Modify: `lib/bookings/billing.ts` `onInvoicePaid` (add `if (invoice.milestoneType === "PRINT_FRAME_ORDER") return markPrintOrderPaid(tx, invoice.id)`)
- Create in `lib/prints/entitlements.ts` or `lib/prints/orders.ts`: `markPrintOrderPaid(tx: Tx, invoiceId: string): Promise<null>` (AWAITING_PAYMENT → NEW; idempotent)
- Modify: `lib/payments/settle.ts` (~L117) and `lib/actions/admin-verification.ts` (~L106): call `onInvoicePaid` for `PRINT_FRAME_ORDER` too. `lib/actions/checkout.ts` card path already calls it unconditionally (L363) — confirm.
- Modify: `lib/actions/admin-invoices.ts` cancel (~L90): when voiding a `PRINT_FRAME_ORDER` invoice, set its order `CANCELLED` in the same transaction.
- Add to `lib/actions/print-orders.ts`: `cancelPrintOrder(input: { tenantId; tenantSlug; orderId })` — client (own order) only while `AWAITING_PAYMENT`, staff while not `SHIPPED/COLLECTED/DELIVERED`; voids an unpaid linked invoice; sets `CANCELLED`.
- Remove: `createPrintOrder` from `lib/actions/visualizer.ts` and its validation (callers replaced in Task 7). Convert any existing `PRINT_FRAME_ORDER` invoices without an order: leave them as plain invoices (no order rows) — none are produced after this task.

- [ ] **Step 1: Failing tests:** `T20-PAY-01` order from ORDER-05 paid via simulated card checkout (`processInvoicePayment` CARD) → NEW; `T20-PAY-02` QR slip then `approvePaymentVerification` → NEW; `T20-PAY-03` `settleGatewayPayment` (Toyyibpay mock as in Tier 9) → NEW; `T20-CANCEL-01` client cancels AWAITING_PAYMENT → CANCELLED, invoice VOID, included remaining back to 1; `T20-CANCEL-02` client cancels a NEW (paid) order → refused; `T20-VOID-01` admin voids the invoice → order CANCELLED, remaining restored; `T20-VOID-02` void on a PAID invoice → refused (existing rule) and order unchanged.
- [ ] **Step 2:** run → FAIL. **Step 3:** Implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): print orders follow invoice payment, cancel and void`.

### Task 7: Client experience (gallery section, project-scoped Wall Art, cart)

**Files:**
- Create: `components/prints/framed-prints-section.tsx` (gallery section: included lines "N of M left" or locked message "N framed prints included, unlocks when your balance is paid"; no-photos message "Ask the studio to add your photos here to choose one"; "Order a framed print" button; past orders with status, courier + tracking, Cancel for AWAITING_PAYMENT and Pay link to checkout)
- Modify: `app/[tenantSlug]/vault/[projectId]/page.tsx` and the account Galleries card (in `app/[tenantSlug]/account/page.tsx` or its galleries component) to render it.
- Modify: `app/[tenantSlug]/visualizer/page.tsx`: with `projectId` → photos only from that project's PHOTO items (drop showcase covers), load entitlements, zones, saved address, `matBoardPrice`; `&claim=<lineId>` preselects that line. Without `projectId` → showcase covers, no ordering, banner "Ordering is done from your gallery — sign in" linking to `/<slug>/login?next=/<slug>/account`.
- Create: `components/visualizer/cart-drawer.tsx`, `components/visualizer/checkout-step.tsx`; replace `components/visualizer/order-modal.tsx` usage. Cart state in `visualizer-shell.tsx` (`useState`, persisted to `sessionStorage` key `cf-print-cart:<projectId>` in try/catch). "Add included print" / "Add as paid print" buttons; included items show "Included" or "Upgrade +RM X". Checkout step: Pickup / Ship, address form (state `<select>` of zone-covered states only), live `quotePrintOrder`, Confirm → `placePrintOrder` → redirect to `checkoutUrl` or show "Order placed" with order number.
- Modify: `components/visualizer/configurator-panel.tsx` mat price from prop, not 25.

- [ ] **Step 1: Failing tests** (render-level, like Tier 18 using `findProp`): `T20-UI-01` visualizer page with `projectId` passes only that project's PHOTO items as `initialPhotos`; `T20-UI-02` without `projectId` passes `canOrder: false`; `T20-UI-03` vault page for an unpaid project renders the section with `unlocked: false`.
- [ ] **Step 2:** run → FAIL. **Step 3:** Implement. **Step 4:** run → PASS; manually in `next dev`: claim one included print with pickup (no checkout), then a paid print with shipping (goes to checkout).
- [ ] **Step 5:** Commit `feat(prints): framed prints in the gallery and project-scoped wall art cart`.

### Task 8: Admin print orders, status updates, emails, staff ordering

**Files:**
- Create: `app/[tenantSlug]/admin/print-orders/page.tsx`, `app/[tenantSlug]/admin/print-orders/[orderId]/page.tsx`, `components/admin/print-orders/*` (list with status filter chips using the shared filter-chip style; detail with items, full-res photo download via existing `/api/download`, copyable address, status actions, courier + tracking inputs required for SHIPPED, cancel)
- Modify: `components/admin/admin-nav-bar.tsx` (Production group: "Print orders" → `/admin/print-orders`, badge = count of NEW)
- Add to `lib/actions/print-orders.ts`: `updatePrintOrderStatus(input: { tenantId; tenantSlug; orderId; status; courier?; trackingNumber? })` — staff only; allowed moves: NEW→IN_PRODUCTION; IN_PRODUCTION→READY_FOR_PICKUP (PICKUP) or SHIPPED (SHIP, needs courier + tracking); READY_FOR_PICKUP→COLLECTED; SHIPPED→DELIVERED.
- Create: `lib/email/print-order-emails.ts` `sendPrintOrderReadyEmail(orderId)`, `sendPrintOrderShippedEmail(orderId)` using `lib/email/smtp.ts`; called after the status update commits (failures logged, not thrown).
- Modify: admin gallery page `app/[tenantSlug]/admin/projects/[projectId]/page.tsx`: "Order framed prints for client" link → `/<slug>/visualizer?projectId=<id>` (staff path through the same `placePrintOrder` rules).

- [ ] **Step 1: Failing tests:** `T20-ADMIN-01` NEW→IN_PRODUCTION→SHIPPED without tracking → refused; with courier+tracking → SHIPPED and one shipped email captured by the Tier 8 mail mock; `T20-ADMIN-02` PICKUP order IN_PRODUCTION→SHIPPED → refused, →READY_FOR_PICKUP ok + ready email; `T20-ADMIN-03` client session calling `updatePrintOrderStatus` → refused; `T20-ADMIN-04` staff from another tenant → refused.
- [ ] **Step 2:** run → FAIL. **Step 3:** Implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat(prints): admin print orders with status, tracking and client emails`.
- [ ] **Step 6:** `graphify update .`, `docker compose up -d --build app`, run the launch backfill inside the container (`docker exec cineflow-os pnpm db:backfill-included-prints`), confirm `/lumina-cine/admin/print-orders` returns 200 when signed in and the public `/lumina-cine/visualizer` shows the sign-in banner.
