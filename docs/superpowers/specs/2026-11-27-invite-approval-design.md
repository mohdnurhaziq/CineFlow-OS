# Approving invite requests

Approved in chat on 27 November 2026.

## Why
Today the super-admin can only mark an invite request "handled", then has to send one shared code
(`STUDIO_SIGNUP_CODE`) by hand. The code can be passed on and never expires. The owner wants to share
only `cineflow-os.my`, and decide from the super-admin console.

## Approaches considered
- **A. A personal invite link, emailed on Approve** (chosen): per person, single use, expires, can be
  cancelled.
- **B. Email the shared code on Approve:** less work, but forwardable and can't be cancelled per person.
- **C. Approved/Rejected labels only:** nothing is sent; the manual work stays.

## Behaviour
- A request is **Pending**, **Approved**, **Rejected**, or **Joined** (a studio was made with its invite).
  An approved invite past its date shows **Expired**.
- **Approve** emails "You're approved" with a **Create your studio** button. The link works once, only
  for the applicant's email, for 14 days. The database keeps only a hash of it.
- Before they join: **Resend email** (a new link; the old one stops), **Copy link** (a new link to send by
  hand; the old one stops) and **Cancel invite** (back to Pending). If the email can't be sent, Approve
  says so and gives the link to copy.
- **Reject** asks first, with a box (ticked) to email a short, polite note. A rejected request can be
  approved later.
- With a valid link, sign-up is open even while it is closed to everyone else, and needs no code. The
  email is fixed to the invited one (a Google sign-up must use that same address).
  `STUDIO_SIGNUP_CODE`, if set, keeps working as before.
- Requests already "marked handled" keep that note and can still be approved or rejected.

## Email confirmation
Using a link **that CineFlow itself emailed** proves the person reads that inbox, so their one sign-in is
made at sign-up and they are not asked to confirm. Two exceptions, which get the usual confirm link:
- the link was copied by the super-admin (it proves nothing about the inbox);
- **another account already uses the email.** Confirming an email takes over every account on it, and a
  14-day invite is easier to forward than a 60-minute confirm link, so an invite never does that.

## Not doing
Reasons for rejection, bulk actions, reminders before expiry, and approval by anyone but a super-admin.
