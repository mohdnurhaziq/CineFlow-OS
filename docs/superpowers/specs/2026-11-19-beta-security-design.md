# Security fixes before the beta — design

Status: approved by the user 2026-11-19 ("yes fix 1-11"; choices below).

## Why

A security audit before the beta (a few friends, but the site is on the open internet at
cineflow-os.app) found two critical holes and nine smaller ones. All are fixed before going live.

## Decisions

### 1. Guest booking can't open someone else's account (critical)

The user chose: **book, then link by email**.

- **The account is reached only by its password or by an emailed link.** The booking-tracking-code
  "claim" in client registration is removed. Registering with the email of an existing passwordless
  account emails that address a one-time link to set the password (the existing client-invite link),
  instead of accepting a code the person booking was shown.
- **The booking is recorded against the email's account** (my call). Every deposit invoice must
  belong to a client account, and one email has one account per studio, so the booking can't stay
  fully unattached. The person booking still gets no access: the confirmation email, which goes to
  the email's real owner, carries the link (set-password link for passwordless accounts, as today).
- **"Find my booking"** (email + tracking code) shows only that booking and its own invoices, not
  everything the client has.

### 2. No script injection through studio text (critical)

- The studio page's search-engine data (JSON-LD in a `<script>`) escapes `<`, so a studio's bio or
  tagline can't close the tag.
- Tagline and bio get length limits (200 and 2000 characters).

### 3. Super-admin password guessing is limited (high)

- The sign-in limit is per email across all studios (no longer per studio and email, which a
  made-up studio name reset).
- Plus a per-visitor (IP) limit on sign-in attempts.

### 4. Uploads can't fill the disk (high)

- The visitor's IP comes from Cloudflare's `CF-Connecting-IP`, which visitors can't fake behind the
  tunnel, never from the first `X-Forwarded-For` entry.
- Anonymous uploads: a per-IP limit and an overall hourly cap. Staff uploads: a per-user hourly limit.
- An upload without a size (Content-Length) or over the limit is refused before it's read.
- The in-memory rate limiter drops expired entries, so attacker-chosen keys can't grow it forever.

### 5. Studio sign-up needs an invite code (medium)

The user chose: **invite code**.

- `STUDIO_SIGNUP_CODE` in `.env`. When it's set, studio sign-up asks for it (checked in constant time).
  When it's not set: sign-up is open in dev and staging, and closed in production.
- The sign-up page shows the code field, or says sign-up is closed, from a small server action.
- Plus a per-IP limit on studio creation.

### 6. Pages can't be framed by other sites

- Every page: `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- No `X-Powered-By` header.
- (A full script CSP is left for later: it needs nonces throughout.)

### 7. Test-only headers are ignored in production

The middleware's `x-tenant-slug` / `x-custom-domain` test headers are honoured only outside
production (`NODE_ENV !== "production"`), and only as a plain slug or domain.

### 8. Payment-slip links point only at uploaded slips

`paymentProofUrl` must be an uploaded receipt path (`/uploads/receipts/<file>`).

### 9. The visualizer page sends only what it shows

The studio record passed to the page's client components is reduced to the fields they use; no
payment keys, counters or subscription data.

### 10. Booking slots can't be hijacked or flooded

- The booking pages never send other visitors' hold ids to the browser. The browser remembers which
  slot it held; the server still checks the hold id on every action.
- New hold ids are long random ids (`crypto.randomUUID`).
- Per-IP limits on holding slots, checkout and booking.
- The unused public action that listed every slot with client names (`getTenantBookingSlots`) is removed.

### 11. Production can't start as a demo site by mistake

If `APP_ENV` is missing (so treated as development) while `NEXT_PUBLIC_APP_URL` is a public https
address, start-up refuses with a message to set `APP_ENV`. Staging sets `APP_ENV=staging`, so it's
unaffected.

## Not in scope (listed for later)

- Email enumeration through sign-in replies and timing.
- Someone locking out a studio owner with wrong passwords.
- Payment-slip images stored as public files (with unguessable names).
- Zod's memory issue (needs Zod 4).
- A full script CSP.
- Studios' robots.txt on their own domains.
