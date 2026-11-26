# 08. Go-live checklist for the 24/7 PC

Written 26 November 2026. A step-by-step list for putting everything built so far onto the 24/7 PC
(staging first, then production). The full background is in the README ("Staging and production")
and in [07. Deployment & Configuration Guide](07_DEPLOYMENT_AND_CONFIGURATION_GUIDE.md); this page is
the short, ticked-off version for this release.

**No passwords or secrets are written in this file, on purpose.** It is committed to git. Where a
secret is needed, it says where to get it.

---

## 1. What is waiting to go live

Nothing below is on the 24/7 PC yet. It is all on `main` on GitHub.

- **One login across studios** (parts 1 to 3): one email works at every studio, a studio switcher,
  a platform sign-in at `/login` and "Your studios" at `/studios`, sign out everywhere.
- **Google sign-in** ("Continue with Google") for studio sign-in, client sign-up, team invites and
  starting a studio. Hidden until the Google keys are in that copy's `.env`.
- **Privacy Policy and Terms of Service** at `/privacy` and `/terms`, linked from the landing page
  footer and the studio sign-up.
- **First-time tours** for the studio admin and for clients, and a refreshed "Start here" manual.
- **Landing page** updates: what's new, extra FAQ answers, "Sign in" moved to the footer.
- **Framed prints on/off** switch (wall-art plan), MYR-only sign-up, uploaded logos only.

The database changes that come with these only add things (new tables and columns). Nothing is
removed. They are applied automatically when the app starts.

---

## 2. Settings to put in each copy's `.env`

Use the templates `.env.staging.example` and `.env.production.example`. Each file explains every
setting. Never commit the real `.env`.

### Both staging and production

| Setting | Value |
| --- | --- |
| `AUTH_SECRET` | A different one for each copy: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it: changing it signs everyone out. |
| `TUNNEL_TOKEN` | From Cloudflare Zero Trust → Networks → Tunnels (one tunnel per copy). |
| `GOOGLE_CLIENT_ID` | Copy from the bottom of the laptop's `C:\Dev-System\CineFlow-OS\.env`. One shared client works for staging, production and localhost. |
| `GOOGLE_CLIENT_SECRET` | Same place. Google will not show it again. If it is lost, make a new secret (section 4). |

### Production only (`production/.env`)

| Setting | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://cineflow-os.my` |
| `NEXT_PUBLIC_APP_DOMAIN` | `cineflow-os.my` |
| `NEXT_PUBLIC_STUDIO_SUBDOMAINS` | `true` |
| `STUDIO_SIGNUP_CODE` | A long random code you give to invited studios. Empty means sign-up is closed. |
| Email (pick one) | **Resend** (the domain is already verified in DNS): `RESEND_API_KEY=` and `RESEND_FROM_EMAIL="CineFlow OS <hello@cineflow-os.my>"`. Or SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Production will not start without one, and with Resend it also refuses to start if `RESEND_FROM_EMAIL` is missing or is a test address (`resend.dev`, `example.com`), because clients would get nothing. |
| `PLATFORM_CONTACT_EMAIL` | Optional. Defaults to `hello@cineflow-os.my`, which is what the landing page, Privacy Policy and Terms show. |
| `BACKUP_DIR` | Point it inside a Google Drive or OneDrive folder so a copy leaves the PC. |

### Staging only (`staging/.env`)

| Setting | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://staging.cineflow-os.my` |
| `NEXT_PUBLIC_APP_DOMAIN` | `staging.cineflow-os.my` |
| `NEXT_PUBLIC_STUDIO_SUBDOMAINS` | `false` |

Staging's emails go to its own test inbox at `http://localhost:8125` on the 24/7 PC, not to real people.

---

## 3. Deploy

Run on the 24/7 PC. Staging first, then production.

```
cd staging
node scripts/ops.mjs deploy staging

cd ../production
node scripts/ops.mjs deploy production
```

Useful: `node scripts/ops.mjs status` (what is running), `node scripts/ops.mjs backup now`.
`deploy production` takes a backup before swapping, and the old version stays live if the new one
does not start.

**First time only on production:** create the super-admin and bookmark its sign-in page.

```
cd production
node scripts/ops.mjs create-super-admin <your email>
```

It prints a password once. Sign in at `https://cineflow-os.my/super-admin/login`.

---

## 4. Google sign-in: what exists in Google Cloud

Nothing to redo. This is for reference.

| Item | Value |
| --- | --- |
| Google account | `mn.haziq.irsyamuddin@gmail.com` (use `?authuser=2` in the console link if you have several accounts) |
| Project | **CineFlow OS**, project ID `woven-framework-515820-m3` |
| Where | https://console.cloud.google.com/auth/overview?project=woven-framework-515820-m3 |
| Audience | External, **In production** (no verification needed: only name, email and profile are asked) |
| Scopes | `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` |
| Client | Web application, **CineFlow web** (Google Auth Platform → Clients) |
| Redirect addresses | `https://cineflow-os.my/auth/google/callback`<br>`https://staging.cineflow-os.my/auth/google/callback`<br>`http://localhost:3000/auth/google/callback` |
| Branding | home `https://cineflow-os.my`, privacy `https://cineflow-os.my/privacy`, terms `https://cineflow-os.my/terms`, authorised domain `cineflow-os.my` |
| Support email on the consent screen | `mn.haziq.irsyamuddin@gmail.com` (Google only allows the signed-in account or a Google Group) |
| Developer contact | `hello@cineflow-os.my` |

If the client secret is ever lost: Google Auth Platform → Clients → CineFlow web → **Add secret**,
put the new one in each copy's `.env`, then restart (`docker compose up -d app`).

A leftover empty project called "CineFlow OS" (`cineflow-os-515820`) exists under
`ziq1995@gmail.com` from a first attempt. It is harmless and can be deleted.

---

## 5. Email at hello@cineflow-os.my

**Receiving: done.** Cloudflare Email Routing forwards `hello@cineflow-os.my` to
`mn.haziq.irsyamuddin@gmail.com`. The catch-all is off, so only `hello@` is accepted. The MX, SPF
and DKIM records were added by Cloudflare. Check or change it in Cloudflare → `cineflow-os.my` →
Email → Email Routing. Tested: a message reached the inbox on 26 November 2026.

**Sending the app's emails: needs the production `.env`.** Resend's DNS records are already on the
domain (`resend._domainkey` and `send.cineflow-os.my`). Set `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` as in section 2. Never paste the key in a chat or commit it.

**Replying as hello@ (optional):** replying from Gmail shows your personal address. To reply as
`hello@cineflow-os.my`, use Gmail → Settings → Accounts → "Send mail as", pointed at Resend's SMTP.

---

## 6. After deploying: check these

On **staging** first (`https://staging.cineflow-os.my`), then on **production**.

- [ ] The landing page opens. The footer shows Sign in, Privacy and Terms.
- [ ] `/privacy` and `/terms` open. (Google's consent screen links to them.)
- [ ] `/login` shows **Continue with Google**. If not, one of the two Google values is missing.
- [ ] Sign in with Google. If Google says `redirect_uri_mismatch`, the address in its error is the one to add in section 4.
- [ ] Studio sign-up (`/create-studio`) shows the Google button on step 3 and the Terms line on step 4.
- [ ] Send a message to `hello@cineflow-os.my` from another account. It arrives in your inbox.
- [ ] A studio owner sees the admin tour on first sign-in. A client sees the client tour.
- [ ] On staging and production: `node scripts/ops.mjs email-report`. It only reads. It should say "Nothing to clean up"; if it lists duplicates, tell Claude before any change.
- [ ] Production only: `node scripts/ops.mjs test-alert` emails every super-admin within a minute.
- [ ] Production only: sign in at `/super-admin/login`. The **System health** card shows Email as OK with `hello@cineflow-os.my`, and Backups as OK once the first nightly backup has run (run `node scripts/ops.mjs backup now` to see it straight away). "Needs attention" says what to fix.
- [ ] Production only: UptimeRobot monitor on `https://cineflow-os.my/api/health` (every 5 minutes).

---

## 6b. Watching the system after go-live

The super-admin console (`/super-admin`) is for the business: studios, plans, payments and invite
requests, plus a **System health** card (app version, database, email setup, last backup). It is
not a server monitor, so also use:

- the UptimeRobot monitor on `/api/health` (tells you the site is down);
- the backup and disk alert emails, which go to every super-admin (use an inbox you read daily).

---

## 7. Still to decide before real customers

These need you, not code:

1. **Business name.** The Privacy Policy and Terms say only "CineFlow OS". Add your registered
   business name or SSM number if you have one. Google may also ask who is behind the app.
2. **Where the servers are.** The Privacy Policy only says "we host the service ourselves". Say "in
   Malaysia" only if that is true.
3. **Terms wording that is your call:** no refund for a period already paid; liability capped at 3
   months of fees; replying to privacy requests within 21 days; a studio can ask for a copy of its
   data before closing.
4. **Have a Malaysian lawyer read the Terms** before taking real payments.
5. **Support email on the Google consent screen** is a personal Gmail. To change it, make a Google
   Group and pick it in Google Auth Platform → Branding.

---

## 8. If something goes wrong

- **The new version won't start:** `deploy production` leaves the old version live and prints the
  command that restores the backup it took. To restore by hand:
  `node scripts/ops.mjs restore <backup name>` (backups are listed in `BACKUP_DIR/db/`).
- **The app refuses to start:** `docker compose logs app` says which setting is wrong.
- **No Google button:** both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set, then
  `docker compose up -d app`.
- **Emails are not arriving:** check Resend (or SMTP) settings in `.env`, then `node scripts/ops.mjs test-alert`.
