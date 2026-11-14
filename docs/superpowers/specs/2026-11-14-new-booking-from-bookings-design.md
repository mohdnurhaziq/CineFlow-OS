# New booking from the Bookings page: design

**Date:** 2026-11-14 · **Status:** Approved

## Why
When a customer asks to book (e.g. a convocation slot the studio opened), staff instinctively go to **Bookings**, but booking on a customer's behalf only exists in the **Calendar** (per-slot "Book for Customer").

## Goal / non-goals
- Goal: a **+ New booking** button on the Bookings page that books a customer into an open slot without visiting the Calendar.
- Non-goals: creating slots from Bookings; changing booking rules, pricing or permissions; customer-first flow.

## Approaches
1. **Two-step dialog: pick a session, then the existing customer form (chosen).** Reuses the Calendar's form and its server action unchanged.
2. Link the button to the Calendar: cheap, but still sends staff to a page they don't think of.
3. Customer first, then slot: reverses the existing form for no gain; phone/WhatsApp bookings agree the time first.

## Design
- **Data:** the Bookings page also loads bookable slots (status `AVAILABLE`, not yet started in studio time), categories, clients and packages, as the Calendar page does. Slots come from a new `loadBookableSlots(tenantId, now?)` in `lib/bookings/bookable-slots.ts`, which also expires stale holds first.
- **Step 1, `NewBookingDialog`:** a category filter ("All categories" by default), with slots grouped by date as time chips. Picking a chip enables **Next**. If there are no open slots, it says so and links to the Calendar.
- **Step 2:** the existing `BookForCustomerDialog`, given an optional `onBack` that returns to step 1. On success, the page refreshes so the new booking appears.
- Permissions are unchanged: any staff member can open it, and the existing action enforces its own rules.

## Left to the builder
Copy, layout, and keyboard focus inside the dialogs.
