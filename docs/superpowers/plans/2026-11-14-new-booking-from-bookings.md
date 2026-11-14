# New Booking from Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Book a customer into an open slot from the Bookings page.
**Architecture:** A server helper lists bookable slots. A new client dialog picks one, then hands off to the existing `BookForCustomerDialog` (with a Back button).
**Tech Stack:** Next.js 15, Prisma, Tailwind.
**Spec:** `docs/superpowers/specs/2026-11-14-new-booking-from-bookings-design.md`

## Global Constraints
- Reuse `createBookingForCustomer` and `BookForCustomerDialog` unchanged, except for an optional `onBack` prop.
- No Claude attribution in commits. Run `graphify update .` after code changes.

## Review Focus
1. A slot that started earlier today must not be offered. Tested in Task 1.
2. HELD, BOOKED and BLOCKED slots must not be offered, and expired holds should become offered again. Tested in Task 1.
3. Another studio's slots must never be listed. Tested in Task 1.
4. No open slots: the dialog says so and links to the Calendar (checked in the browser, Task 2).
5. Back from step 2 keeps the chosen category (checked in the browser, Task 2).

### Task 1: `loadBookableSlots`
**Files:** create `lib/bookings/bookable-slots.ts`; test in `tests/e2e/tier14-booking-lifecycle.test.ts` (append).
**Produces:** `loadBookableSlots(tenantId: string, now?: Date): Promise<BookingSlotRow-compatible rows>` (id, date, startTime, endTime, category, campaignTitle, price, depositRequired, status), sorted by date then start time.
- [ ] Failing test `T14-BOOKABLE-01`: in a fresh tenant, create an AVAILABLE slot for tomorrow, one for yesterday, one that started earlier today, plus BLOCKED, BOOKED and HELD (unexpired) slots tomorrow, a HELD slot whose hold has expired, and an AVAILABLE slot in another tenant. Assert that exactly tomorrow's AVAILABLE slot and the expired-hold slot are returned, in date and time order.
- [ ] Implement: expire holds (`HELD` with `heldUntil < now` → `AVAILABLE`), query `AVAILABLE` slots, then filter with `isSlotInPast`.
- [ ] Run `node tests/e2e/run.mjs` and confirm it passes. Commit.

### Task 2: dialog and page
**Files:** create `components/admin/bookings/new-booking-dialog.tsx`; modify `components/admin/calendar/book-for-customer-dialog.tsx` (optional `onBack`), `components/admin/bookings/bookings-console.tsx` (button and dialog), `app/[tenantSlug]/admin/bookings/page.tsx` (load slots, categories, clients and packages).
- [ ] Build the dialog as in the spec.
- [ ] `tsc` passes. In the browser: pick a convocation slot → book a new client → the booking appears in the list. Back keeps the category. The no-slots state shows the Calendar link. Check at 375px. Commit, then push to main.
