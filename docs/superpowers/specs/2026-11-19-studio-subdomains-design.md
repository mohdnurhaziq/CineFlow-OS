# Studio subdomains on cineflow-os.app — design

Status: draft for approval (2026-11-19)

## Why

The user bought **cineflow-os.app** and wants each live studio at its own address,
`lumina-cine.cineflow-os.app`, rather than `cineflow-os.app/lumina-cine`. They chose
**clean everywhere**: the subdomain is the studio's only address. Links, emails and the
address bar use it, and the old form redirects to it.

## What exists today

- The middleware already resolves `<slug>.<NEXT_PUBLIC_APP_DOMAIN>` to a studio and rewrites the
  request to `/<slug>/…` (`lib/domain-name.ts` `platformSubdomainSlug`, `middleware.ts` step 5).
  A studio's own custom domain works the same way.
- Every link the app makes is path-based:
  - about 370 `/${slug}/…` hrefs, `router.push` calls and `redirect()`s;
  - about 10 absolute `${NEXT_PUBLIC_APP_URL}/${slug}/…` links in emails, payments and the sitemap.

  On a subdomain this gives `lumina-cine.cineflow-os.app/lumina-cine/book`.
- The session cookie `cineflow_session` is host-only, so signing in on `cineflow-os.app` doesn't
  carry over to a studio subdomain.
- The reserved slugs (`super-admin`, `create-studio`, `api`, `admin`, `login`, `auth`, `public`,
  `uploads`, `settings`, `dashboard`) don't include DNS names such as `www`, `app`, `staging`
  or `mail`.

## Goals

1. **Production addresses:**
   - `cineflow-os.app` is the platform: the homepage, studio sign-up and the super-admin.
   - `<slug>.cineflow-os.app` is each studio, for its public pages, client portal and admin.
2. **No studio name in the path on a subdomain:** a studio page never shows `/<slug>/` in the
   address bar, from a link, a redirect, a sign-in, or a typed old address.
3. **Emails and other absolute links point at the subdomain.** These are invoices, bookings,
   invites, payment returns and the sitemap.
4. **The old form redirects:** `cineflow-os.app/lumina-cine/book` gives a 308 to
   `lumina-cine.cineflow-os.app/book`, and `www.cineflow-os.app` gives a 308 to
   `cineflow-os.app`.
5. **One sign-in across `cineflow-os.app` and every studio subdomain**, as it is today on a
   single host. Creating a studio on `cineflow-os.app` lands you signed in on its subdomain's
   admin.
6. **Names that would clash with real addresses can't be taken as studio slugs.**
7. **Dev and staging keep the path form.** Cloudflare's free certificate covers only one level,
   so `*.staging.cineflow-os.app` can't have HTTPS. Their behaviour doesn't change.

## Non-goals

- A studio's own domain through Cloudflare for SaaS. It works as before, but setting one up
  isn't part of this.
- Studio subdomains on staging.
- Receiving email on the domain.

## Anti-goals (a failure even if it works)

- A missed link that 404s or shows a doubled `/lumina-cine/lumina-cine/` address.
- Staging sign-ins breaking because production's cookie reaches `staging.cineflow-os.app`.
- Sign-out that doesn't actually sign out (a domain cookie deleted without its domain).
- `revalidatePath` calls converted by mistake. They take the internal route path, `/<slug>/…`,
  and must stay as they are.

## Approaches considered

- **Middleware redirect only:** strip `/<slug>` with a 308 on studio subdomains. It's small and
  catches everything, but every click costs an extra round trip through the tunnel, and links
  still render with the prefix.
- **Helper only:** convert every link to a helper. The pages are clean, but any link missed
  stays doubled or broken.
- **Chosen: helper plus a middleware safety net.** All links go through one helper, so there's
  no extra hop, and the middleware redirect fixes any link that was missed. That's the only way
  to meet goal 2 for certain.

## Design

### The switch

A new build-time setting `NEXT_PUBLIC_STUDIO_SUBDOMAINS` turns this on: it's on when the value
is `"true"`, otherwise off.

- It's a Docker build arg next to `NEXT_PUBLIC_APP_URL`, and it's `true` in
  `.env.production.example`.
- Dev and staging leave it off, and all behaviour stays as today.

### Helpers in `lib/domain-name.ts`

They have no database access, so they're safe in client code.

- `studioSubdomainsOn(): boolean`
- `studioPath(slug, path = "/")`: the in-site path for a studio page.
  - With subdomains on, `"/book"` gives `"/book"`.
  - With them off, it gives `"/lumina-cine/book"`.
  - Query strings and fragments pass through.
- `studioUrl(slug, path = "/")`: the absolute address, for emails and other places outside the
  site.
  - With subdomains on: `https://lumina-cine.cineflow-os.app/book`.
  - With them off: `${NEXT_PUBLIC_APP_URL}/lumina-cine/book`.

In subdomain mode, studio pages are only ever served on their subdomain (or the studio's own
domain), so `studioPath` needs no knowledge of the host.

### Converting links

- **Converted:**
  - every user-facing `/${slug}…` href, `router.push`/`replace`, `window.location`,
    `redirect()` and `NextResponse.redirect` goes through `studioPath`;
  - every absolute `${NEXT_PUBLIC_APP_URL}/${slug}…` goes through `studioUrl`;
  - the middleware's own sign-in redirect and `callbackUrl` use the clean path.
- **Not converted:**
  - `revalidatePath`/`revalidateTag` arguments;
  - route-segment and file paths;
  - links to platform pages (`/`, `/create-studio`, `/super-admin/...`). In subdomain mode,
    links from a studio page to a platform page become absolute (`https://cineflow-os.app/...`),
    because a relative link would stay on the subdomain.

### Middleware, in subdomain mode only

1. `www.<domain>` gives a 308 to `<domain>`, keeping the path.
2. On `<domain>`, a path whose first segment is an existing studio's slug gives a 308 to
   `https://<slug>.<domain>/<rest>`. The lookup is cached, like `tenantSlugForDomain`. Unknown
   first segments behave as today.
3. On a studio subdomain or custom domain, a path starting with `/<slug>/`, or equal to
   `/<slug>`, gives a 308 to the stripped path. This is the safety net.
4. The existing rewrite to `/<slug>/…` then runs unchanged.

`/api` and `/uploads` are untouched on every host. Payment callbacks stay on `<domain>/api/...`.

### Sign-in cookie

In subdomain mode the session cookie is set with `Domain=cineflow-os.app` under its own name,
`cineflow_session_shared`. Staging's host-only `cineflow_session` never meets it, and the reverse
holds too.

- Reading, writing and deleting all use one shared `sessionCookie()` definition (name and
  options). Deleting passes the same domain.
- With subdomains off, it's exactly today's cookie.
- **Security:** this is the same as today's path model, where every studio shares one host's
  cookie. The session still names its studio and every guard checks it. Only our app serves the
  subdomains.

**A studio's own domain** (my call). Studios can still save their own domain in settings, and
it keeps working as today, sign-in included.

- A browser refuses a `Domain=cineflow-os.app` cookie on `studio.com`. So on a host that isn't
  `cineflow-os.app` or one of its subdomains, the cookie stays host-only under the old name.
- The cookie choice depends on the request's host.
- Reading accepts whichever name belongs to that host: `readSession` in the middleware, and
  `getSession`.
- `studioUrl` still points at the subdomain. A studio's own domain is an extra address, not the
  one emails use.

### Reserved slugs

Add the following. Resend uses `send` and `resend._domainkey`.

- **DNS names:** `www`, `app`, `staging`, `mail`, `email`, `send`, `smtp`, `imap`, `pop`, `ftp`,
  `cdn`, `static`, `assets`, `status`, `help`, `support`, `docs`, `blog`, `dev`, `test`, `ns1`,
  `ns2`, `autoconfig`, `autodiscover`.
- **The names of a studio's own pages** (my call), since a slug equal to one breaks that page
  once the path no longer carries the slug: `book`, `account`, `vault`, `checkout`, `register`,
  `releases`, `proposals`, `visualizer`, `my-booking`, `set-hud`, and the other top-level
  segments under `app/[tenantSlug]/`.

Production isn't live yet (no studios, no users, no emails sent), so no existing slug needs
renaming. Renaming the cookie signs nobody out who matters.

### Old platform address

`app.cineflow-os.app` (the address the README used to describe) gives a 308 to `cineflow-os.app`,
like `www` (my call).

### Search engines (my call)

`sitemap.xml` and `robots.txt` depend on the host in subdomain mode:

- **On `cineflow-os.app`:** the sitemap lists only the platform's pages.
- **On a studio subdomain:**
  - the sitemap lists that studio's own pages at clean paths: `/`, `/book`, `/visualizer`;
  - `robots.txt` disallows `/admin`, `/checkout`, `/vault` and `/account`, and points at that
    host's sitemap.

With subdomains off, both stay as today.

### Where the address is shown

- The create-studio page shows `lumina-cine.cineflow-os.app`, not `cineflow-os.app/lumina-cine`.
- The super-admin console's studio links use it too.
- Wherever a studio's own address is shown or copied in its admin, it uses `studioUrl`.

## How it goes live (no code)

- **Cloudflare (the domain is already there):**
  - production's tunnel serves `cineflow-os.app` and `*.cineflow-os.app` to `http://app:3000`;
  - staging's tunnel serves `staging.cineflow-os.app` to `http://app:3000`, locked with Access
    to the user's email;
  - Universal SSL covers the bare domain and one level of wildcard.
- **Resend:** verify `cineflow-os.app` (records on `send.` and `resend._domainkey`; Cloudflare
  can add them automatically). Sender: `CineFlow OS <noreply@cineflow-os.app>`.
- **Production's `.env`:**
  - `NEXT_PUBLIC_APP_URL=https://cineflow-os.app`
  - `NEXT_PUBLIC_APP_DOMAIN=cineflow-os.app`
  - `NEXT_PUBLIC_STUDIO_SUBDOMAINS=true`
  - `TUNNEL_TOKEN`, `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- **Staging's `.env`:** `https://staging.cineflow-os.app`, with subdomains off.
- **README:** update every `app.<domain>` to the bare domain and studio subdomains, with the
  wildcard hostname step. Change the uptime monitor to `https://cineflow-os.app/api/health`.

## Testing

- **Unit tests:** the helpers in both modes, the reserved slugs, and the cookie definition.
- **Middleware tests in subdomain mode:**
  - the `www` redirect;
  - the old-form redirect, including when no studio has that name;
  - stripping the prefix on a subdomain and on a custom domain;
  - the admin guard's sign-in redirect, with a clean `callbackUrl`;
  - `/api` and `/uploads` untouched;
  - the `app.` redirect;
  - on a studio's own domain, a host-only cookie and a working sign-in;
  - `sitemap.xml` and `robots.txt` on the platform and on a subdomain.
- **A source scan that fails on any `/${slug}`-style link or redirect** not going through the
  helpers, with `revalidatePath` allowed. That keeps future code from regressing.
- **The full suite with subdomains off,** proving dev and staging are unchanged.
- **A real browser run against a throwaway production-like copy** with subdomains on:
  1. create a studio on the platform, land signed in on its subdomain's admin, and click
     through admin and public pages with the address bar never showing the slug;
  2. a client books and receives an email whose link opens the subdomain;
  3. an old-form address redirects;
  4. sign-out works.

  The plan picks how to give a local copy wildcard subdomains: a domain that resolves
  to 127.0.0.1, or the browser's host mapping.

## Left to the builder

- Exactly how links are converted: by hand, or a scripted edit that's then reviewed.
- How a studio page builds its link to a platform page.
- The browser setup for the real run.
