# One login across studios, and Google sign-in — design

Status: approved (2026-11-25)

## Why

The product owner runs a studio on CineFlow OS, sometimes works as a replacement photographer
for another studio, and sometimes hires another studio's services as a client. Today that is
three accounts with three passwords, and only one can be signed in at a time. Photographers and
studios in Malaysia freelance for each other often, so this will be common, not an edge case.

They want:

1. **One login per person**: one email, one password (or Google), for every studio they belong to.
2. **A switcher**: move between "my studio (owner)", "Studio B (photographer)" and "Studio C
   (client)" without signing in again.
3. **Google sign-in**: register and sign in with Google, alongside email and password. Both stay.

A combined home page (all my shoots across studios, my bookings as a client) is wanted **later**,
not now.

## How it works today

- **An account belongs to one studio.** `User` has `tenantId` and `@@unique([tenantId, email])`, so
  the same email exists once per studio, each with its own `passwordHash`.
- **The session** (`lib/auth/token.ts`) is an HMAC-signed token holding one account:
  `{ id, email, name, role, tenantId, tenantSlug, iat, exp }`, valid 7 days. The middleware
  verifies it at the edge and checks `role` and `tenantSlug` for `/admin` routes.
- **Cookies** (`lib/auth/cookie-name.ts`): in production (studio subdomains on), the platform and
  every `<slug>.cineflow-os.my` share **one** cookie for the whole domain, so signing in at
  studio B replaces the session for studio A. A studio's **custom domain** (`studio.com`, Studio plan
  and up) gets its own host-only cookie and can't share it. With subdomains off (dev), it's one host.
- **Signing in**: `loginWithCredentials(email, password, tenantSlug)` looks up the account in that
  studio (or the super-admin), checks the password, refuses removed team members
  (`deactivatedAt`), and sets the cookie. The super-admin signs in on `/super-admin/login`.
- **Signed out everywhere**: `User.sessionsValidAfter`, set on password reset.
- **Accounts are created by**:
  - studio sign-up (`onboardStudio`): the owner, with a password;
  - client self-registration (`registerClient`): with a password and **no email proof**;
  - the studio creating a client (quick-create on bookings, projects and the client directory):
    no password, then an emailed invite link (`lib/auth/invite.ts`);
  - team invites (`inviteTeamMember`): no password, then an emailed set-password link.
- **Password reset** is per studio account (`lib/auth/password-reset.ts`).

## Goals

1. A person signs in once and can reach every studio where they are an owner, team member or
   client, without signing in again, including studios on a custom domain.
2. A switcher in the account menu of the admin bar and of the client account menu lists every
   studio and role, and takes the person there, already signed in.
3. "Continue with Google" for registering and signing in: the studio sign-in page, client
   registration, accepting a team invite, studio sign-up (owner step), and the platform sign-in page.
   Email and password keep working everywhere.
4. Accounts that already exist join one login safely: never on a matching email alone.
5. Nothing a studio keeps about a person changes: team access, client notes, delivery addresses,
   bookings and work all stay per studio. Studios see nothing about a person's other roles.

## Non-goals (for now)

- The combined home page across studios (a later project).
- Changing a login's email, or merging two logins with different emails.
- The platform super-admin joining a login or appearing in the switcher: it stays a separate
  account on its own sign-in page.
- Other providers (Apple, Facebook), two-factor sign-in, deleting a login.

## Anti-goals (a failure even if it works)

- Someone reaching another person's studio by registering an account with their email.
- One studio seeing another studio's data, or learning that a person works elsewhere.
- A studio owner or team member locked out after the change, or an old password that stops
  working with no explanation.
- Existing sessions all thrown out on deploy.

## Approaches considered

- **A. A login layer above today's accounts (chosen).** A new `Login` record per person; each
  per-studio `User` points to it. Per-studio data and every permission check stay as they are.
  Lowest risk; the cost is two layers (the person, and the person inside each studio).
- **B. One global account, studio roles in a separate table.** Cleaner on paper, but nearly every
  query assumes an account belongs to one studio, and per-studio data (client notes, delivery
  addresses, team access) would have to move. Rejected: a large, risky migration for no visible gain.
- **C. Link existing accounts, keep separate passwords.** Smallest, but no single password, and
  Google has nothing clean to attach to. Rejected.

The product owner chose **A**.

## The design

### The rule that keeps it safe

**A `Login` exists only for an email that has been proven, and its password is always chosen by
whoever proved it.** The ways to prove an email are:

- signing in with Google (Google says the email is verified);
- clicking a link we emailed to that address: a client invite, a password reset, or a "confirm
  your email" link. **A team invite link is not proof**: the studio is shown it (to copy), so a
  studio could use it. Accepting a team invite joins an existing login only with that login's own
  password; with no login it makes a stand-alone studio account, and the person is emailed a
  separate confirm link (found in review, 2026-11-25). The page the link opens asks the person to **set the login's
  password** (it can be the same one they use today) or to continue with Google. A password set on
  an unproven account is never carried over. Otherwise someone could register with another
  person's email, wait for the real owner to click the link, and end up holding the login.

Self-registered accounts with a password but no proof stay stand-alone accounts, exactly as today,
until their email is proven.

### Data

- **New model `Login`**: `email` (unique, lowercase), `passwordHash` (optional: a Google-only login
  has none), `googleSub` (optional, unique), `sessionsValidAfter`, password-reset token fields,
  `createdAt`.
- **`User.loginId`** (optional, indexed). `null` means a stand-alone account, as today.
- A short-lived, single-use **sign-in handoff** record (for custom domains) and an **email
  confirmation** record. The exact shape is the builder's choice.
- The super-admin's `User` is never linked.
- **No data is joined on deploy.** Logins appear over time as people prove their email.

### Joining accounts

- **When a login is created**, every account with that email that the person **has already set up**
  is linked to it: one with its own password, or one already linked elsewhere. The proof already
  exists, so there is no extra step. Super-admin accounts are excluded. For each account joined:
  - its own `passwordHash` is cleared and its sessions are ended (`sessionsValidAfter = now`), so a
    password someone else set on an unproven account stops working;
  - from then on, signing in to it uses the login's password or Google.
- **Accounts a studio creates and the person hasn't taken up yet** (a pending team invite, a
  quick-created client with no password) are **not** linked until the person acts: accepting the
  invite, using the client invite link, or "Continue as a client" (below). Until then the studio
  sees "Invited" or "Not registered", exactly as for anyone else. That way a studio can never tell
  that an email already uses CineFlow elsewhere.
- **"Set up" means `passwordHash` OR `loginId`.** Everywhere that today reads "has a
  `passwordHash`" as "has set up their account" must read both. That includes team status
  (Active / Invited / Link expired), who can be assigned to a shoot, a client's Registered status,
  the "Set your password" vs "Sign in" wording in emails, and resending invites. A joined team
  member stays Active and assignable.
- **The person gets one email** listing the studios that were joined, and saying that one password
  (their login's) now works for all of them.
- **A studio changes a linked client's email:** the account is unlinked and becomes a client with no
  password, as if quick-created. The person at the new email takes it up through the usual invite.
  A studio can never push an account into someone's switcher.

### The session

The session holds **the person**, not one account at a time. Otherwise, on subdomains, two studios
open in two tabs would share one cookie and keep pushing each other out.

- **A linked session's token** carries `loginId` plus a short list of the person's live accounts:
  `{ tenantSlug, userId, role }` for each one (not removed, studio not closed).
- **On each request**, the active account is the one in that list for the studio being visited. On
  the platform (`cineflow-os.my`) there is none, and the session is the person alone.
  `getCurrentUser()` returns that account, shaped exactly as today. On the platform and in a
  studio where the person has no account, it returns `null` for studio purposes. Studio code keeps
  working unchanged. A new `getCurrentLogin()` serves the platform pages and the switcher.
- **The edge middleware** reads the same list to check `/admin` access for the studio in the
  address. No database is needed at the edge, as today.
- **On the server**, the account is checked against the database on every request: still linked,
  not removed, studio not closed. The list in the token is a hint, never the authority. The token
  is reissued whenever the list changes (an invite is accepted, an account is joined), and is
  refreshed if it's out of date.
- **A session is ended** when the login's or the active account's `sessionsValidAfter` is newer.
- **Stand-alone sessions** (no login) work exactly as today: one account, no list.
- **Old tokens** stay valid until they expire, so nobody is signed out on deploy.
- **Opening any studio where the person has an account** (a link in an email, a bookmark, a typed
  address) finds them already signed in there with the right role. There is no prompt. This is
  safe because nothing changes for any other tab or studio.

### Signing in

- **At a studio's sign-in page, with email and password:**
  1. If the email has a login and the login has an account in this studio, check the login's
     password and sign in.
  2. If the email has a login but no account in this studio, the password is checked, then the
     person is offered "Continue as a client of <studio>". That creates or takes up a linked client
     account (clients can register themselves anyway). Staff access only ever comes from an invite.
  3. If the email has no login, sign in as today. On success the person is invited to "use one
     sign-in for all your studios", which sends the confirmation link. The person sets the login's
     password on that page.
  4. A wrong password shows the usual message. The joining email is what tells people their old
     studio passwords were replaced.
- **With Google, anywhere:** find the login by `googleSub`, then by verified email (which adds Google
  to it), else create a login. Then continue where the person started: sign in to that studio's
  account, "Continue as a client" (client sign-in or registration), accept the invite (team
  invite), or carry on with studio sign-up as its owner. On the platform sign-in page, a Google
  email with no login and no accounts creates nothing. It says "You're not with any studio yet" and
  offers studio sign-up or a studio's website.
- **Platform sign-in** (`cineflow-os.my/login`, new): email and password or Google, then the
  "Your studios" page listing the same entries as the switcher. This is not the combined home page.
- **Removed team members** (`deactivatedAt`) are hidden from the switcher and their sign-in is
  refused, as today. **Cancelled studios** are hidden from the switcher and the list. Sign-in to
  them is unchanged by this project (today there's no check there). **Paused studios stay listed**,
  so their owners can still get in and renew.
- **Rate limits** keep today's rules (per email and per visitor).

### Registering

- **Client registration with email and password:** if the email has a login, the form asks for that
  login's password (or Google), then creates the client account linked. Saying an email already
  has a sign-in is in line with today, where registration already says "An account with this email
  already exists". It reveals nothing about which studios. Otherwise, create the stand-alone account
  as today and send a "confirm your email" message. The account works straight away either way.
- **Team invite:** the link does not prove the email (the studio sees it). With a login, the person
  enters that login's password and the new team account joins it; Google is the same in part 3.
  With no login, the account is a stand-alone studio account and the person is emailed a confirm link.
- **Studio sign-up (owner):** as for client registration. If a login exists, sign in with it, and the
  new owner account is linked.

### Password reset

- **For a linked email:** the reset sets the login's password and ends its sessions everywhere.
- **For a stand-alone account:** the reset link counts as proof. Its page sets the new login's
  password, creates the login, and joins the person's accounts.

### The switcher

- It sits in the account menu of the admin bar (`AdminHeader`) and of the client account menu
  (`ClientAccountMenu`, shown in the website bar), and only appears when the login has more than one
  account. Each row shows the studio name and the role: "Owner", the team role's name, or "Client".
  The current row is marked.
- Choosing a row is just a link to that studio where `signInTarget` says (Overview for owners, My
  schedule for team, the account page for clients). The session already covers it.
- **Studios with a custom domain:** the switcher links to their `<slug>.cineflow-os.my` address,
  which every studio keeps and which shares the cookie. No handoff is needed on the way in.
- **The handoff** is only for sign-ins that start on a custom domain. Signing in there also signs
  the person in on `cineflow-os.my`, through a single-use code valid about a minute, so the
  switcher works from there too. The studio's own page posts the code to the platform as a form (never
  a link) and the platform checks the browser's Origin header is that studio's domain, so another site
  can't log a visitor into someone else's account; the code is tied to the domain that issued it. Google sign-in started on a custom domain comes back the same way.

### Signing out

- **Sign out** ends the session in this browser: the shared cookie for `cineflow-os.my` and its
  studios, and the current host's cookie.
  Signing out on a studio's own domain goes through the platform the same way (a form post with an
  Origin check), so no other site can sign visitors out.
- **"Sign out everywhere"** (new, in the account menu) ends every session of the login on every
  device and host (`Login.sessionsValidAfter`). This covers a custom-domain cookie left in another
  browser, which a normal sign-out can't reach.

### Google sign-in

- The standard Google OAuth 2.0 / OpenID Connect authorization-code flow with PKCE, written into our
  own session system. No auth framework, since its own sessions would fight ours. Small libraries
  for the OAuth exchange and for checking Google's ID token are fine (the builder's choice).
- One fixed callback per environment on the platform host: `https://cineflow-os.my/auth/google/callback`,
  `https://staging.cineflow-os.my/auth/google/callback`, and `http://localhost:3000/auth/google/callback`.
  Where to go afterwards (which studio, which flow) travels in the signed `state`.
- Checks: `state` and PKCE match; the ID token's issuer, audience and expiry; `email_verified` is
  true. Otherwise the sign-in is refused.
- Settings: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` per environment. Without them the Google
  buttons are hidden and everything else works.
- The product owner creates the Google Cloud OAuth client (consent screen plus the three callback
  addresses). The builder writes the steps into the deploy docs.
- A Google user registering as a client is asked only for what Google doesn't give (phone, if the
  studio needs it).

### Privacy

- A studio's team list shows the person's name and email in that studio, as today. No other studio
  and no other role is ever shown to a studio. Statuses look the same whether or not the person
  uses CineFlow elsewhere (see Joining).
- The joining email, the switcher and the "Your studios" page are only shown to the person.

## Constraints

- Next.js 15 App Router, Prisma with SQLite, our own HMAC session tokens, edge middleware. Migrations
  run with `prisma migrate deploy` on start. Deploys go dev → staging → production, with a backup.
- Production uses studio subdomains of `cineflow-os.my`. Custom domains can't share its cookie.
- Emails go through the existing mailer (Mailpit in dev).
- Every change is covered by the e2e suite (`pnpm test:e2e`), and checked at phone width and in
  every area (admin, client account, studio website, platform).

## Order of work

1. The login layer: data, the joining rule, the session, signing in, registration, invites,
   password reset and the "set up" status checks. Nothing new on screen except messages and the
   "confirm your email" invitation.
2. The switcher, the "Your studios" page, platform sign-in, sign out everywhere, and the handoff for
   custom domains.
3. Google sign-in on every entry point.

Each part ships on its own.

## Left to the builder

- The exact shape of the handoff and email-confirmation records, and the token formats.
- The libraries for the Google OAuth exchange and ID-token checks.
- The wording of messages and emails (plain English, in line with the rest of the app).
- How often a token's list of accounts is refreshed.

## Calls made in writing this up

These were settled by the writer, not the product owner. They should be checked:

- Confirming an email always means setting the login's password on that page. An unproven
  account's password is never carried over (security).
- Accounts a studio creates are linked only once the person takes them up, so statuses never give
  away that someone uses CineFlow elsewhere.
- The session holds the person, with the account picked by the studio being visited. Opening any of
  your studios needs no switch and no prompt, and tabs don't fight.
- The switcher sends custom-domain studios to their `cineflow-os.my` address.
- Cancelled studios are hidden from the switcher; paused ones stay. Sign-in rules for cancelled
  studios are not changed here.
- A studio editing a linked client's email unlinks that account.
- "This email already has a sign-in" may be shown at registration, as today's registration
  already does per studio.
- Normal sign-out covers this browser; a new "Sign out everywhere" covers every device.
- How the switcher looks inside the existing menus, following the current design.
