# Beta Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 11 audit findings before the beta.

**Architecture:**
- Small, independent fixes, each pinned by a Tier 34 test that reproduces the hole first.
- A shared `clientIp()` helper reads Cloudflare's `CF-Connecting-IP`.
- Per-IP limits apply only when an IP is known. Production, behind the tunnel, always has one; local and test runs don't, so existing tests aren't throttled.

**Tech Stack:** Next.js 15, Prisma/SQLite, the e2e harness (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-19-beta-security-design.md`

## Global Constraints

- **Tests:** new tests live in `tests/e2e/tier34-beta-security.test.ts`, as `runTier34BetaSecurityTests`, registered after Tier 33. Each starts by reproducing the hole (RED).
- **Copy:** user-facing messages are plain words. No `confirm()` or `alert()`.
- **Commits:** local commits on branch `fix/beta-security`. No pushing, and no attribution lines.
- **Limits:**
  - sign-in: 10 per 10 min per email (all studios), 30 per 10 min per IP;
  - anonymous uploads: 20 per hour per IP, 300 per hour overall;
  - staff uploads: 300 per hour per user;
  - slot holds: 30 per 10 min per IP;
  - checkout and booking: 10 per hour per IP;
  - studio sign-up: 5 per hour per IP.

## Review Focus

1. A returning client with a password who books as a guest still gets a confirmation email, and the booking shows in their account.
2. An existing client with no password who tries to register gets a set-password email, not a dead end.
3. The studio sign-up page with no code set, in dev, still works (no code field).
4. The booking page after a reload still recognises the visitor's own held slot.
5. Uploads from a browser (which always sends Content-Length) still work.

---

### Task 1: The client-IP helper, a limiter that cleans up, and the sign-in limits (fixes 3, 4-part)

- `lib/client-ip.ts`: `clientIpFrom(get: (h: string) => string | null): string | null`, from `cf-connecting-ip`, then `x-real-ip`; never `x-forwarded-for`. Also `requestIp(): Promise<string | null>`, from `headers()`.
- `lib/rate-limit.ts`: drop expired entries when the map holds 5000 or more.
- `lib/auth/session.ts` `loginWithCredentials`: the email key `login:<email>` (no studio), plus `login-ip:<ip>` (30 per 10 min) when an IP is known.
- **Tests:**
  - `clientIpFrom` ignores `x-forwarded-for` and prefers `cf-connecting-ip`;
  - 11 attempts on one email across 11 made-up studio names: the 11th is `RATE_LIMITED`;
  - the limiter's map shrinks after expiry.

### Task 2: Uploads (fix 4)

- `app/api/upload/route.ts`:
  - per-IP key from `clientIpFrom(request.headers.get)`;
  - anonymous: 20 per hour per IP plus 300 per hour overall;
  - staff: 300 per hour per user;
  - refuse with 411 when there's no `content-length`, and 413 when it's over the folder's limit, before `formData()`.
- **Tests:**
  - 21 anonymous uploads with a different `x-forwarded-for` each but the same `cf-connecting-ip`: the 21st gets 429;
  - a request with no content-length gets 411.

### Task 3: Guest booking and client registration (fix 1)

- `lib/actions/client-auth.ts` `registerClient`: remove `claimCode`.
  - For an existing passwordless CLIENT without a valid invite: issue a client invite, email the set-password link (the `clientInvitePath` flow), and return `success: false, error: "CHECK_EMAIL"` with "We've emailed you a link to set your password."
  - Rate-limited per email.
- `components/auth/client-auth-panel.tsx`: drop the claim-code field, and show the CHECK_EMAIL message.
- `lib/actions/my-booking.ts` `lookupMyBooking`: invoices only where `bookingId = booking.id`; the project only when linked to this booking; no proposals.
- **Tests:**
  - attacker flow: guest checkout with the email of an existing passwordless client gives a tracking code; `registerClient` with that email (and the old claimCode field) doesn't set a password or sign in, and an invite email goes to the real address;
  - lookup with a new booking's code doesn't list the client's other invoices.

### Task 4: Studio text and the JSON-LD script (fix 2)

- `app/[tenantSlug]/page.tsx`: `JSON.stringify(jsonLd).replace(/</g, "\\u003c")`.
- `lib/validations/admin-settings.ts`: `tagline.max(200)`, `bio.max(2000)`.
- **Test:** render the studio page with a bio containing `</script><script>x()</script>`: the JSON-LD script's text contains no `</script`.

### Task 5: Invite-only studio sign-up (fix 5)

- `lib/actions/onboarding.ts`:
  - `studioSignupStatus(): Promise<{ open: boolean; needsCode: boolean }>`;
  - `onboardStudio` checks `signupCode` against `STUDIO_SIGNUP_CODE` (timing-safe) when it's set;
  - refuses with SIGNUP_CLOSED in production when it isn't;
  - limits to 5 per hour per IP.
- `app/(saas)/create-studio/page.tsx`: an invite-code field when `needsCode`, and a closed notice when not `open`.
- `.env.production.example`: add `STUDIO_SIGNUP_CODE=`. Add a README line.
- **Tests:**
  - with the code set, a wrong or missing code is refused and the right one works;
  - with no code in production, sign-up is closed;
  - with no code in dev, it's open.

### Task 6: Headers and test headers (fixes 6, 7)

- `next.config.ts`:
  - `poweredByHeader: false`;
  - `/:path*` gets `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: frame-ancestors 'self'`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`;
  - the existing `/uploads` CSP stays.
- `middleware.ts`: the test headers are honoured only when `process.env.NODE_ENV !== "production"` and they match `^[a-z0-9-]+$` (slug) or a hostname (domain).
- **Tests:**
  - the `headers()` output has those headers for `/:path*`, and `poweredByHeader` is false;
  - with `NODE_ENV=production`, an `x-tenant-slug` header doesn't change the rewrite;
  - `victim/.` is refused in any mode.

### Task 7: Payment slips, visualizer data, slots (fixes 8, 9, 10)

- **Payment slips:** `lib/validations/checkout.ts` `paymentProofUrl` must match `^/uploads/receipts/[A-Za-z0-9._-]+$` (both schemas).
- **Visualizer:** `app/[tenantSlug]/visualizer/page.tsx` passes a reduced tenant: `id`, `name`, `slug`, `discipline`, `currency`, `brandColor`, `logoUrl` and whatever the components read.
- **Slots:**
  - the book and checkout pages map slots without `heldBySessionId`;
  - `cinema-booking-shell` remembers its held slot id in localStorage (`cineflow_held_slot`) and compares by id;
  - new session ids use `crypto.randomUUID()`;
  - `holdBookingSlot`, `processBookingCheckout` and `createClientBooking` get per-IP limits;
  - delete `getTenantBookingSlots` and its use in `tests/challenger-m2-concurrency.ts`.
- **Tests:**
  - the schema refuses `https://evil.example/x.jpg` and accepts `/uploads/receipts/a.jpg`;
  - the visualizer page's props contain no `toyyibpaySecretEnc`;
  - the book page's slots carry no `heldBySessionId`;
  - `getTenantBookingSlots` isn't exported.

### Task 8: Production can't start as a demo (fix 11), docs, real check

- `scripts/start.ts` `settingsRefusal`: if `appEnvFrom(env) === "development"` and `NEXT_PUBLIC_APP_URL` is `https://` with a non-local, non-example host, return a refusal telling them to set `APP_ENV=production` (or `staging`).
- **Test:** that case is refused; localhost and https example hosts aren't.
- **Then:**
  - run the full suite, `tsc` and `graphify update .`;
  - rebuild dev Docker and check in the browser: booking a slot, registering, studio sign-up, an upload;
  - final review by a fresh reviewer.
