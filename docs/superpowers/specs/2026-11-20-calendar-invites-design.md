# Shoot reminders in the calendar — design

Status: draft for approval (2026-11-20)

## Why

The user wants nobody to forget a shoot. When a booking is confirmed, the client and the shooter
each get the session in their calendar (Google Calendar first), with reminders.

The user chose **calendar invites by email**:
- no "Connect Google" button and no Google app review;
- works with Google, Apple and Outlook calendars alike.

## What happens

### Who gets an invite, and when

- **The client**, when the booking is **confirmed**, i.e. its deposit is settled: a card payment
  clears, the studio approves a QR slip, or the studio records the deposit. The invite rides in
  the email that already tells them the booking is confirmed.
- **Each shooter**, when they're **assigned** to a confirmed booking. If they were assigned
  before the booking was confirmed, they get it when it's confirmed. The invite rides in the
  assignment email they already get.

### What the event says

- **The client's event:**
  - title: "Photo session with Lumina CineWorks" (or "Video session…", from the booking's
    discipline);
  - date, start and end time, in the studio's time zone (Asia/Kuala_Lumpur);
  - description: the package, the tracking code, and the link to their account.
- **The shooter's event:**
  - title: "Shoot: <client name> (<package>)";
  - description: the client's name and phone, and the link to the booking in the admin.
- **Both:** reminders **1 day before** and **1 hour before** (my call).

### When things change

- **Moved** (new date or time): an update to the same event. Calendars move it; nothing is
  duplicated.
- **Cancelled**, or the shooter is taken off the shoot: a cancellation removes it from their
  calendar.
- The event keeps one id per booking and person, with a version number that goes up with each
  change, so calendars apply them in order.

### How it looks in Gmail

The email carries the invite the standard way, both as an invite part and as an `invite.ics`
file. Gmail shows the event card and puts it in Google Calendar. Other mail apps show
"Add to calendar". The invite doesn't ask for Yes/No replies (no RSVP), so nobody's inbox fills
with "Accepted" emails (my call).

### Which email address it comes from

- The invite's organiser is the studio, by name.
- It's sent from the platform's sending address (`noreply@cineflow-os.app` in production).

## Not in scope

- Studios connecting their own Google Calendar.
- Syncing the studio's own calendar.
- Invites for bookings that aren't confirmed yet. Pending bookings can still expire unpaid; the
  "Booking received" email stays as it is.

## Constraints

- Works through both email routes the app has: SMTP (dev and staging, via Mailpit) and Resend
  (production).
- An email that fails to send never blocks the booking action, as today.
- No new account, key or setting for the studio or the platform.

## Testing

**Automated tests:**
- the invite text: times in the studio's zone, both reminders, update and cancel versions,
  special characters escaped, long lines folded the way the calendar standard requires;
- the client gets an invite when the booking is confirmed, through each of the three
  confirmation paths;
- a shooter gets one on assignment, on confirmation if assigned earlier, an update when the shoot
  moves, and a cancellation when taken off or when the booking is cancelled;
- nothing is sent for unconfirmed bookings.

**Real check, with the user's permission:** send one real invite through Resend to the user's own
Gmail, and confirm the event lands in Google Calendar with its reminders. Then send a
cancellation, and confirm it's removed.
