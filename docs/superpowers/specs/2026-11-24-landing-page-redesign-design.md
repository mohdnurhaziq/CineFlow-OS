# Platform landing page redesign — design

Date: 2026-11-24 · Status: draft for approval

## Intent

cineflow-os.my is where a photo or video studio owner first meets CineFlow OS. Today the page reads like a
developer demo: invented claims ("< 60s launch", "solar-timed on-set logistics", "100% Dynamic Admin CRUD"),
old prices in dollars ($29, "Starter/Pro"), links to the super-admin login and to demo studios that don't exist
in production, and sections ("interactive teasers", studio switcher) that sell nothing.

The owner wants an Awwwards-quality page that makes a studio owner say "wow" and want to subscribe, and that
sells **only what CineFlow really does, at the real prices**.

## Goals

- A studio owner understands in one scroll what CineFlow does for them: their client books, pays, signs,
  gets shot, receives the gallery and orders prints, all through the studio's own branded website.
- Every claim on the page is true today (see "Claims" below). Prices come from `lib/billing/plans.ts`.
- One clear next step: **Request an invite**, with a smaller "Have an invite code? Create your studio".
- Feels premium and cinematic on a laptop, and is just as good on a phone (375px), fast and accessible.

## Non-goals

- No online payment for plans (payment stays manual, as in the subscriptions spec).
- No blog, no changelog, no customer logos or testimonials (there are none yet), no live chat.
- No changes to studio (tenant) websites or the admin console, apart from the invite-request list in the
  super-admin console.

## Anti-goals (a failure even if it "works")

- Any invented number, customer, integration or feature. No "trusted by 500 studios", no fake stats.
- A page that is slow or janky on a mid-range Android phone, or that hides the headline until a video loads.
- Motion that makes the page hard to use: scroll-jacking that traps the visitor, or ignoring reduced motion.
- Generic "AI SaaS" look: purple gradients, glassmorphism card grids, icon-in-a-circle feature walls.

## Constraints

- Next.js 15 App Router, React 19, Tailwind 4, existing `app/(saas)` route group and layout.
- Brand: dark background (#09090b), amber accent. Geist / Geist Mono already loaded.
- Sign-up rules stay as they are: `studioSignupStatus()` (open / needs an invite code). Production needs a code.
- The demo studios exist only in dev and staging (`showsDemoStudios()`); production pages must not link to them.
- New studios get a 14-day free trial; plans Solo RM 99, Studio RM 249, Production RM 599 per month.

## Approaches considered

1. **Cinematic editorial in the existing Next.js app (chosen).** Full-screen looping video hero with large type,
   then scroll "chapters" following one client's journey, each showing real CineFlow screens, with GSAP scroll
   motion; then pricing, FAQ, invite. Most "wow" for the effort, light on phones, all real product.
2. WebGL / Three.js 3D hero. Biggest first impression, but heavy on phones, slower to build, shows less product.
3. Clean minimal page with CSS-only motion. Quickest and lightest, but won't feel Awwwards-level.

The owner picked 1.

## Decisions

### The main action (call: C)

- Primary button everywhere: **Request an invite**, which scrolls to the invite form in the final section (one
  form on the page, no modal; focus moves to its first field).
- Secondary link: **Have an invite code? Create your studio** → `/create-studio`.
- When `studioSignupStatus()` says sign-up is open without a code (dev, or later), the primary button becomes
  **Start your 14-day free trial** → `/create-studio` (nav and hero alike), and the invite form, the
  "Have an invite code?" link and the FAQ's invite-only entry are not shown. So switching to an open trial later
  is one setting, no redesign. The page reads the status on each request (rendered dynamically), not at build.

### Invite requests (new, small)

- Form fields: name, studio name, email, phone (optional), what they shoot (photo / video / both), a short
  message (optional). A hidden honeypot field; rate limited per IP like the booking actions.
- Saved as a new `InviteRequest` record (name, studioName, email, phone?, kind, message?, createdAt,
  handledAt?), with no tenant (a migration adds the table). Emailed through `sendNotification` as a
  `STUDIO_UPDATE` (the same way the plan reminders write to super-admins) to every user with role SUPER_ADMIN and
  no `deactivatedAt`. The request is saved first; a mail failure never loses it.
- The visitor sees a plain thank-you ("Thanks, we'll email you an invite code within 2 working days" — wording
  left to the builder, without promising a time we can't keep: "we'll be in touch by email" is fine).
- Super-admin console gets an "Invite requests" list (newest first, mark as handled). Nothing else.

### Art direction

- **Mood:** a film set at night. Near-black, warm amber light, film-slate and timecode details used sparingly
  (chapter numbers like `01 — BOOK`, a running timecode in the hero corner).
- **Type:** an editorial display serif for big headlines (e.g. Instrument Serif or Fraunces via next/font),
  Geist for body, Geist Mono for small labels. Very large hero type; short lines.
- **Layout:** full-bleed sections, generous space, asymmetric product shots, no card grids for features.
- **Motion:** GSAP + ScrollTrigger with one smooth-scroll engine (Lenis). Text reveals by line, product shots
  that drift and scale as you scroll, a pinned "journey" section on desktop. On phones the journey is a plain
  vertical scroll (no pinning). With `prefers-reduced-motion`, everything is static and fully readable.

### Page structure

1. **Nav** — logo, How it works, Pricing, FAQ; button "Request an invite" (or "Start free trial"). No super-admin
   link, no demo links in production. Collapses to a simple menu on phones.
2. **Hero** — full-screen looping video (poster image first, video after). Headline about running the whole
   studio in one place (e.g. "Booked. Paid. Delivered."), one sentence of sub-copy naming the real things
   (bookings, payments, proposals, galleries, prints, your own website), the two actions, and a small line
   "14-day free trial · From RM 99 a month".
3. **The journey (6 chapters)** — one client, start to finish, each with a real screenshot and two lines of copy:
   - `01 Book` — the studio's booking page; a slot is held while the client checks out, no double bookings.
   - `02 Pay` — invoices, DuitNow and bank-slip upload; the studio approves the slip.
   - `03 Sign` — proposals with add-ons the client picks and signs online. *(Studio plan)*
   - `04 Shoot` — call sheets, team assignments and calendar invites. *(Studio plan)*
   - `05 Deliver` — the client's gallery, which unlocks when the invoice is paid.
   - `06 Print` — the wall-art visualizer and print orders. *(Production plan)*
   Plan badges are small and honest so nobody feels misled at pricing.
4. **Your own website** — the studio's branded public site (showcase, services, booking), and your own web
   address on the Studio plan. A screenshot of a demo studio site.
5. **Everything else, briefly** — a compact list, not a card wall: team roles and access, client portal,
   gear and kits *(Production)*, email reminders, works on phone.
6. **Pricing** — three plans read from `PLANS` (name, RM price, team size, what it adds), the 14-day trial,
   "Pay by bank transfer or DuitNow", "Change plan anytime; nothing is deleted when you move down".
7. **FAQ** — trial, how payment works, what happens if a plan ends (7-day grace, then read-only, clients keep
   galleries), moving between plans, own domain, the invite-only beta.
8. **Final call to action** with the invite form.
9. **Footer** — logo, sections, contact email **hello@cineflow-os.my**, © year CineFlow OS. No super-admin, no
   demo studio links in production. The address comes from one setting (env `PLATFORM_CONTACT_EMAIL`, defaulting
   to hello@cineflow-os.my), and the FAQ uses it too. Before launch, mail to it must reach the owner: set up
   Cloudflare Email Routing forwarding hello@cineflow-os.my to the owner's Gmail (done with the owner, in their
   browser).

Removed: `StudioSwitcher`, `InteractiveTeasers`, the old `FeaturesGrid`, old `PricingTiers`, the metric cards.

### Claims (each must be true; the builder checks each against the code before shipping)

If a claim turns out false or only partly true, reword it to what the code does; if nothing true is left of a
chapter, drop the chapter. Plan badges follow `PLANS` in `lib/billing/plans.ts` (the code wins over this doc);
today that gives Studio for proposals, call sheets and own address, Production for wall art and gear.

| Claim | Backed by |
| --- | --- |
| No double bookings; slot held during checkout | booking slot hold (`holdBookingSlot`) |
| DuitNow / bank-slip payment, studio approves | checkout + verification |
| Proposals with add-ons, signed online | proposals, `acceptProposal` |
| Call sheets, team, calendar invites | logistics, team roles, calendar invites |
| Gallery unlocks when paid | deliverables paywall / vault |
| Wall-art visualizer and print orders | visualizer, print orders |
| Own website and own web address | showcase, custom domain |
| Gear and kits | gear module |
| 14-day trial, RM 99 / 249 / 599, team limits | `lib/billing` |

Anything not in this table does not go on the page.

### Videos (supplied later by the owner, made in Google Flow)

The page ships with stills and works fully without video; dropping in files is all it takes.

| Slot | File (in `public/landing/video/`) | Content |
| --- | --- | --- |
| Hero | `hero-16x9.mp4`, `hero-9x16.mp4` | Moody behind-the-scenes of a shoot: lights, camera, crew, a client. |
| Deliver | `deliver-16x9.mp4` | A client happily looking at their photos on a phone or laptop. |
| Print | `print-16x9.mp4` | Framed prints going up on a living-room wall. |
| Shoot | `shoot-16x9.mp4` | Crew on set, someone checking a phone. |

All: 6–10 s seamless loop, no sound, no text or logos, dark warm cinematic grade, H.264 1080p, hero ≤ 4 MB,
others ≤ 2.5 MB; each has a poster JPG of its first frame. Videos are muted, inline, play only when on screen,
and never on "save data" or reduced motion (poster only). Until the owner supplies clips, posters are stills the
builder makes (a cropped product screenshot or a dark graded frame); the page ships without any video, and a
missing video file simply leaves the poster.

### Product screenshots

Captured by the builder from the demo studio (Lumina) on the local Docker dev app (localhost:3000) at 2×
resolution, desktop and phone, stored in `public/landing/shots/` as WebP (AVIF optional). Admin and client-portal
screens are fine to show (slip approval, call sheet, gallery). Demo data only; no real client data. The builder may
add demo records in the dev database to make a screen look right; seed changes only if a test needs them.
Shown in simple device frames (browser bar, phone outline) drawn in CSS.

### Quality bars

- Mobile LCP under 2.5 s on throttled 4G: headline is server-rendered text, the poster is the LCP image.
- No horizontal scroll at 375px; tap targets ≥ 44px; visible focus; contrast AA; one `h1`.
- Metadata: new title and description matching the real offer; Open Graph image (a still from the hero).
- JS for motion (GSAP, Lenis) loaded only on this page; the display font may live in the `(saas)` layout so the
  nav and footer can use it too.

### Tests

- A new e2e tier: the page renders; prices equal `PLANS`; none of the banned phrases appear ("< 60s",
  "solar", "CRUD", "$", "Starter", super-admin links); the main action follows `studioSignupStatus()`;
  `requestInvite` validates, rate-limits, ignores honeypot submissions, saves, and emails super-admins (a mail
  failure still saves); the super-admin list shows and marks requests; only super-admins can read it.
- Existing tests that check the old landing page are updated: Tier 1 T1-F07 (keep the CTA-target and
  data assertions that still apply) and Tier 31 (which checks the demo switcher; it now checks that production
  shows no demo links). The banned-phrase check covers the landing page, nav and footer. The removed components
  are used only by the landing page and those tests, so they are deleted.
- Browser checks at 1440px and 375px, with reduced motion on and off, and Docker rebuilt before saying done.

## Left to the builder

- Exact copy within the claims table (plain, confident, no jargon; British spelling as elsewhere). The pricing
  card lines ("what it adds") are written by hand from `PLANS[...].features` via `FEATURE_LABEL`, so they can't
  drift from the gating.
- The display font choice between the two named, exact motion timings and easing.
- Whether the "Everything else" list uses small screenshots or text only.
- The device-frame styling and how screenshots are cropped.
