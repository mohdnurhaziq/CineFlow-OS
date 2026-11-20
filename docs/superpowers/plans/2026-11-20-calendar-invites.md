# Calendar Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmed bookings put the session in the client's and each shooter's calendar, by email invite, and keep it right when the shoot moves or is cancelled.

**Architecture:**
- A pure iCalendar builder (`lib/calendar/ics.ts`).
- The email layer carries an optional invite on both routes: nodemailer `icalEvent` for SMTP, an `invite.ics` attachment for Resend.
- `lib/bookings/calendar-invites.ts` builds the client's and the shooters' invites from a booking. The existing confirmation, assignment, move and cancel emails attach them.

**Tech Stack:** TypeScript, Prisma, nodemailer, the Resend REST API, the repo's e2e harness (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-20-calendar-invites-design.md`

## Global Constraints

- **Invite timing:**
  - the client gets an invite only when the booking's status is `CONFIRMED` and it has a slot;
  - a shooter only when assigned to a `CONFIRMED` booking with a slot, or on confirmation if assigned earlier.
- **Reminders:** 1 day before and 1 hour before (`TRIGGER:-P1D`, `TRIGGER:-PT1H`).
- **Times:** in the studio's zone (`STUDIO_TIME_ZONE`, default Asia/Kuala_Lumpur), written as UTC (`…Z`).
- **UID:**
  - client: `booking-<bookingId>-client@cineflow-os`;
  - shooter: `booking-<bookingId>-shooter-<userId>@cineflow-os`.
- **SEQUENCE:** whole seconds since 1 Jan 2026, so every later change is higher without storing anything.
- **Methods:** `REQUEST` (new, or a move) and `CANCEL` (cancelled, or a shooter taken off).
- **Attendee and organiser:**
  - the attendee is the recipient, with `RSVP=FALSE`;
  - the organiser is the studio name, at the platform's sending address.
- **Failures:** an email or invite failure never blocks the action that triggered it. Builders return null rather than throw.
- **Commits:** local commits on branch `feat/calendar-invites`. No pushing, and no attribution lines.

## Review Focus

1. **A booking with no slot** (only a target date) must produce no invite and no error. Covered by the T35-BOOK tests.
2. **A slot time in 12-hour or 24-hour form** ("09:30 AM", "21:00") must give the right UTC time. Covered by T35-ICS-01.
3. **Studio or client text with commas, semicolons, new lines or emoji** must be escaped, and long lines folded at 75 bytes. Covered by T35-ICS-02.
4. **A shooter assigned before the deposit was paid** gets the invite at confirmation, not twice. Covered by T35-SHOOT-02.
5. **The Resend route** must send the invite as an attachment with content type `text/calendar; method=…`. Covered by T35-MAIL-02.

---

### Task 1: The iCalendar builder

**Files:**
- Create `lib/calendar/ics.ts`.
- Test `tests/e2e/tier35-calendar-invites.test.ts` (`runTier35CalendarInvitesTests`, registered after Tier 34).

**Produces:**
- `type CalendarInvite = { method: "REQUEST" | "CANCEL"; ics: string }`
- `interface InviteEvent { uid; sequence: number; title; description; start: Date; end: Date; organizerName; organizerEmail; attendeeName; attendeeEmail; url?: string }`
- `buildInvite(event: InviteEvent, method: "REQUEST" | "CANCEL"): CalendarInvite`
- `slotTimes(slot: { date: Date; startTime: string; endTime: string }, timeZone?: string): { start: Date; end: Date } | null`
- `inviteSequence(now?: Date): number`

**Steps:**
- [ ] **Write tests T35-ICS-01..03 first:**
  - **ICS-01, times:**
    - a slot of 2026-12-05, "10:00 AM" to "12:30 PM", in Asia/Kuala_Lumpur gives `DTSTART:20261205T020000Z` and `DTEND:20261205T043000Z`;
    - "21:00" works;
    - an unparseable time gives null.
  - **ICS-02, text:** `BEGIN:VCALENDAR`, `METHOD:REQUEST`, `UID`, `SEQUENCE`, both `TRIGGER`s, and `ATTENDEE;…RSVP=FALSE…:mailto:`. Text with `,` `;` and a new line comes out as `\,` `\;` `\n`. No line is longer than 75 bytes, and the lines are joined with CRLF.
  - **ICS-03, cancel:** `METHOD:CANCEL` and `STATUS:CANCELLED`, with the same UID. `inviteSequence` rises over time.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(calendar): build calendar invites`

### Task 2: Emails can carry an invite

**Files:**
- Modify `lib/notifications.ts`: `deliverEmail` input gets `calendar?: CalendarInvite`. `BookingConfirmedPayload`, `StudioUpdatePayload`, `ShootAssignedPayload` and `ShootChangedPayload` get `calendar?: CalendarInvite`. `sendNotification` passes it through.
- Modify `lib/email/smtp.ts`: `deliverViaSmtp` input gets `calendar?`, sent as nodemailer `icalEvent: { method, filename: "invite.ics", content }`.

**Behaviour:**
- **Resend:** add `attachments: [{ filename: "invite.ics", content: <base64>, content_type: "text/calendar; method=<METHOD>; charset=UTF-8" }]`.
- **Platform sending address**, for the organiser: export `platformSenderAddress(): string`. It's the SMTP from-address when SMTP is set up, otherwise the address inside `RESEND_FROM_EMAIL`, otherwise `noreply@cineflow-os.app`.

**Steps:**
- [ ] **Write tests T35-MAIL-01..02 first:**
  - **MAIL-01:** through the capturing SMTP transport, a `BOOKING_CONFIRMED` with a calendar arrives with `icalEvent.method === "REQUEST"`. Without one, there's no `icalEvent`.
  - **MAIL-02:** with SMTP unset and `RESEND_API_KEY` set, a stubbed `fetch` receives a body whose `attachments[0]` has filename `invite.ics`, a content type starting `text/calendar; method=REQUEST`, and base64 content that decodes to the ics.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(email): emails can carry a calendar invite`

### Task 3: The client's invite

**Files:**
- Create `lib/bookings/calendar-invites.ts`.
- Modify `lib/bookings/payment-approval.ts` (its `BOOKING_CONFIRMED`), `lib/payments/settle.ts` (its `BOOKING_CONFIRMED`), `lib/bookings/confirmation-email.ts` (when the booking is `CONFIRMED`), and `lib/actions/admin-booking-lifecycle.ts` (`notifyClient` takes `calendar?`; reschedule sends `REQUEST`, cancel sends `CANCEL`).
- Check `lib/actions/checkout.ts`'s card path for a confirmation email. If it sends none, it relies on settle or sendBookingConfirmation: note which.

**Produces:**
- `clientInvite(bookingId: string, method: "REQUEST" | "CANCEL"): Promise<CalendarInvite | null>`. `REQUEST` needs a `CONFIRMED` booking with a slot; `CANCEL` needs a slot.

**Event wording:**
- **Title:** "Photo session with <studio>"; "Video session…" for `VIDEOGRAPHY`; "Photo & video session…" for `HYBRID`.
- **Description:** the package, the tracking code, and "Your booking: <studioUrl(slug, '/account')>".

**Steps:**
- [ ] **Write tests T35-BOOK-01..03 first:**
  - **BOOK-01:** approving a QR deposit (`approvePaymentVerification`) for a pending booking with a slot sends the client a `BOOKING_CONFIRMED` email with a `REQUEST` invite, at the right time and with the client UID.
  - **BOOK-02:** the email for an unconfirmed booking (`sendBookingConfirmation` on a `PENDING` booking) has no invite. A confirmed booking with no slot gets no invite and no error.
  - **BOOK-03:** rescheduling a confirmed booking sends the client a `REQUEST` with the same UID, a higher sequence and the new time. Cancelling it sends a `CANCEL` with that UID.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(calendar): clients get the session in their calendar`

### Task 4: The shooters' invites

**Files:**
- Modify `lib/bookings/assignment-emails.ts`.
- Call the new `CONFIRMED` change from the confirmation paths in Task 3, after confirmation.

**Produces:**
- `shooterInvite(bookingId: string, user: { id; name; email }, method): Promise<CalendarInvite | null>`
- `AssignmentChange.kind` adds `"CONFIRMED"`.

**Behaviour:**
- **ASSIGNED:** a `REQUEST` if the booking is `CONFIRMED`.
- **MOVED:** a `REQUEST` with the new time.
- **CANCELLED and UNASSIGNED:** a `CANCEL`.
- **CONFIRMED** (new): a `SHOOT_CHANGED` email. The subject says the shoot is confirmed and the body says "It's in your calendar". It carries a `REQUEST` to every current assignee.
- **Event wording:**
  - title "Shoot: <client name> (<package>)";
  - description: the client's phone, the brief if any, and the link to the booking in the admin.

**Steps:**
- [ ] **Write tests T35-SHOOT-01..03 first:**
  - **SHOOT-01:** assigning a shooter to a confirmed booking with a slot sends a `SHOOT_ASSIGNED` email with a `REQUEST` and the shooter UID. Assigning to a pending booking sends no invite.
  - **SHOOT-02:** a shooter assigned while the booking was pending gets exactly one `REQUEST` when the deposit is approved.
  - **SHOOT-03:** moving the booking gives each shooter a `REQUEST` with a higher sequence. Taking a shooter off gives them a `CANCEL`. Cancelling the booking gives every assignee a `CANCEL`.
- [ ] **Watch them fail, then implement.**
- [ ] **Commit:** `feat(calendar): shooters get their shoots in their calendar`

### Task 5: Docs and the real check

- README, under "Staging and production": add one line saying confirmed bookings send calendar invites (client and shooters) through the same email setup.
- Run the full suite and `npx tsc --noEmit`, then `graphify update .`, then rebuild dev Docker.
- **In the browser on dev:**
  - approve a QR deposit and see the email in Mailpit with an `invite.ics`;
  - assign a shooter and see theirs;
  - reschedule, then cancel.
- **The real check, only with the user's go-ahead:** send one `REQUEST` and then a `CANCEL` through Resend to the user's own Gmail, using a one-off script. The user confirms the event appears in Google Calendar with both reminders, then disappears.
- Final review by a fresh reviewer.
