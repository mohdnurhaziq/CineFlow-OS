# Dev, staging and production

Status: draft for approval (2026-11-18)

## Why

Real studios will start using CineFlow soon. Today there is one copy of the app, on the
developer's PC, filled with demo data, and every change lands on it straight away. Studios
and their clients need a copy that only gets work that has been checked first, and whose
data (bookings, payments, galleries) is never lost by an update.

## What we're building

Three copies of the app:

| | Where | Who uses it | Data | Address |
| --- | --- | --- | --- | --- |
| **Dev** | this PC | building and testing changes | demo data | `localhost:3000` (Docker) and `pnpm dev` |
| **Staging** | the 24/7 PC | the owner, to check a change before it goes live | demo data | `staging.<domain>`, behind a Cloudflare sign-in |
| **Production** | the 24/7 PC | real studios and their clients | real data, starts empty | `app.<domain>` |

A change moves dev → staging → production. Production only ever gets the exact version
that staging ran.

### Approaches considered

- **A. Staging and production both on the 24/7 PC** (chosen). Free and uses hardware the
  owner already has. If that PC loses power or internet, or Windows restarts it, the site
  is down until it's back.
- **B. Staging on the PC, production on a rented server** (about $5–10 a month). Production
  survives home outages. Not chosen for now; A is built so production can move to a
  server later by restoring a backup there.
- **C. Both on a rented server.** More cost for little gain over B.

## Goals

1. **Separate copies.** Staging and production each have their own folder, settings file
   (`.env`), database, uploads, private files, Cloudflare tunnel and address. Nothing is
   shared between them. Dev keeps working as it does today, with its data kept.
2. **Two commands to release.** On the 24/7 PC:
   - `deploy staging` puts the latest `main` on staging.
   - `deploy production` builds, takes a backup, then puts the commit staging is running on
     production.
   Each prints the commit it deployed and fails loudly if the app doesn't come back healthy.
3. **Safe database changes.** Staging and production apply recorded database changes
   (Prisma migrations), never `prisma db push`. A change that would lose data has to be
   written as a migration on purpose; it can't happen by accident on start-up.
4. **Production starts empty and safe.**
   - No demo data or demo accounts.
   - A command creates the super-admin with a random password, shown once.
   - Studios join through the existing studio sign-up page.
   - Production refuses to start, with a clear message, if any of these is true:
     - the auth secret is the built-in development one, or missing;
     - fake card payments are on;
     - the app address is localhost or isn't https;
     - no real email is set up (none at all, or Mailpit);
     - Toyyibpay points at its sandbox.
5. **Backups.**
   - Production's database is backed up every night and before every production deploy,
     and those copies are kept for 14 days.
   - Uploads and private files are copied to a mirror that only adds and updates files.
   - Backups go to a folder the owner picks. Pointing it at a Google Drive or OneDrive
     sync folder gets a copy off the PC.
   - A restore command puts a chosen backup back, along with the commit it was taken on.
6. **Staging can't reach real people.**
   - Its emails go to its own Mailpit inbox.
   - It allows fake card payments, and its Toyyibpay address (`TOYYIBPAY_BASE_URL`) is the
     sandbox one.
   - Only the owner can open it, through Cloudflare Access.
   - Every page shows a thin "Staging" bar, and search engines are told not to index it.
7. **Automatic checks.** GitHub runs the type check, the full test suite and a "schema
   matches migrations" check on every push to `main`, and shows a red or green mark on
   the commit.

## Non-goals

- **Deploying automatically on push.** The 24/7 PC is on a home network, and a person
  running `deploy` is simpler and safer for now.
- **Moving to Postgres.** SQLite is fine for a handful of studios on one machine.
- **Running two machines at once,** or keeping the site up when one goes down.
- **Serving studios' own custom domains through the tunnel.** Each one needs its own
  hostname in Cloudflare, so that's a later step.
- **Moving production to a rented server** (approach B). The design keeps that possible,
  but doesn't do it.

## Anti-goals (would count as failure even if it "works")

- Real client data copied into staging or dev.
- An update that loses or corrupts production data, or one that leaves production broken
  with no backup taken just before it.
- Demo accounts or `password123` on production.
- Staging emailing a real client, or taking a real payment.
- Staging and production confused for each other.

## Constraints

- **Each copy is built separately.** `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_APP_DOMAIN` are
  fixed into the build, so the same Docker image can't serve two addresses. Each copy is
  built from the same commit with its own settings.
- **The 24/7 PC's operating system isn't decided.** Assume Windows with Docker Desktop, but
  keep it portable:
  - deploy, backup and restore commands are Node scripts, not PowerShell or bash;
  - the nightly backup runs in a Docker container, not Windows Task Scheduler or cron.
  The PC needs git, Node 20+ (with pnpm) and Docker.
- **Don't break `prisma/dev.db`.** Never run `prisma db push` against it. Moving dev
  databases onto migrations is a one-time step (below).
- **Keep the existing Docker volumes.** The dev volumes (`cineflow-os_cineflow-data` and the
  others) must survive, so dev keeps its Compose project name.

## How it works

### Folders on the 24/7 PC

```
CineFlow/
  staging/       git clone of the repo, with its own .env (staging settings)
  production/    git clone of the repo, with its own .env (production settings)
  backups/       or a folder inside Google Drive / OneDrive
```

### Docker Compose

One `docker-compose.yml`, configured by each folder's `.env`:

- **Names.** `COMPOSE_PROJECT_NAME` (`cineflow-staging`, `cineflow-production`) keeps their
  containers and volumes apart. Dev leaves it unset and keeps today's names and volumes.
  The fixed `container_name` entries go.
- **Ports.** The app's port comes from `APP_PORT`: 3000 for dev, 3100 for staging, 3200
  for production. Staging and production only listen on `127.0.0.1`, because the tunnel
  is how people reach them.
- **Mail.** Mailpit moves into a profile, used by dev and staging only. Staging's Mailpit
  web inbox gets its own local port.
- **Tunnel.** `domain-tunnel` (already added, uncommitted) is reused. Each copy runs its own
  tunnel with its own token.
- **Backups.** A new `backup` service, in the production profile, runs the nightly
  backup. It runs at 03:00 by default, in the studio time zone, and both can be changed
  in `.env`.

### Settings

- **`APP_ENV`** is a new setting: `development`, `staging` or `production`. `NODE_ENV` is
  `production` in all the Docker copies, so it can't tell them apart.
- **Start-up checks and the Staging bar.** These read `APP_ENV`.
- **Example settings files.** The repo gets `.env.staging.example` and
  `.env.production.example` with every setting each copy needs, and a note on each.

### Database changes (migrations)

- **A starting point.** A first migration (`0_init`) is generated from today's schema.
- **On start-up,** the container runs `prisma migrate deploy` instead of `db push`.
- **Existing databases.** If a database already exists but has no migration history, the
  start-up script checks it exactly matches `0_init`.
  - If it matches, the script records `0_init` as already applied.
  - If it doesn't, the app stops with a message. It never guesses.
  This covers the dev Docker volume. For `prisma/dev.db`, the same check runs once, by
  hand, with the owner's OK.
- **New migrations in dev.** A `db:migration <name>` command writes the next migration
  file from the difference between the migrations and `schema.prisma`, using a throwaway
  database, so it never touches `dev.db`. Applying it to dev is `prisma migrate deploy`.
- **Tests.** The test suite builds `test.db` with `migrate deploy`, so every test run also
  checks the migrations.
- **First run.** The first-run seed only happens when `APP_ENV` isn't `production`.

### Deploying

- **`deploy staging`** (run in `staging/`):
  1. Fetch and check out `origin/main`.
  2. Warn if GitHub's checks for that commit aren't green, using `gh` if it's installed.
  3. Build the new image while the old one keeps running.
  4. Restart the app and wait for the health check.
  5. Print the commit it deployed.
- **`deploy production`** (run in `production/`):
  1. Read the commit staging is running from `../staging`.
  2. List the commits that will go live.
  3. Check out that commit and build it while the old version keeps serving (if the build
     fails, go back to the running version and stop).
  4. Take a backup, just before the swap, so it misses seconds of work rather than minutes.
  5. Restart and wait for the health check.
  If the health check fails, it prints the restore command for the backup it just took.
  It doesn't restore automatically, because the person should see what went wrong first.
- **Health check.** A new `/api/health` route answers 200 when the app is up and can read
  the database. It doesn't need sign-in and shows no details.

### Backup and restore

- **What a backup holds.** A timestamped folder with:
  - a consistent snapshot of the database (SQLite online backup);
  - the commit it was taken on;
  - the date and time.
- **Files.** Uploads and private files are mirrored, never deleted from the mirror.
- **Keeping old ones.** Database snapshots older than 14 days are removed; the number of
  days can be changed in `.env`.
- **Taking one by hand.** `backup now` takes one immediately.
- **Restoring.** `restore <backup>`:
  1. stops the app;
  2. copies the database and files back;
  3. checks out the backup's commit;
  4. rebuilds and starts the app.
- **Testing restore.** It is tested once for real on staging before production goes live.

### Creating the super-admin

`create super-admin <email>` runs inside the production container. It creates (or resets)
the super-admin with a random password and prints that password once.

## The owner's one-time setup (not code)

1. **Install** git, Node 20+ and Docker Desktop on the 24/7 PC.
   - Set Docker to start on sign-in.
   - Set Windows to sign in automatically and not to sleep.
2. **Cloudflare tunnels.** Create two tunnels and two hostnames in Cloudflare:
   - `staging.<domain>` → `app:3000`;
   - `app.<domain>` → `app:3000`.
3. **Lock staging.** Add a Cloudflare Access rule so only the owner's email can open
   `staging.<domain>`.
4. **Real email.** Set up a real email service for production (Resend, or Gmail SMTP).
5. **Toyyibpay.** Set staging's `TOYYIBPAY_BASE_URL` to the sandbox and production's to the
   live one. Each studio enters its own Toyyibpay keys in its settings, as today.
6. **Backups folder.** Pick it, ideally inside a cloud-synced folder with enough space:
   private files (finished deliverables) can be large.

## Left to the builder

- **Script names and how they're called.** For example `pnpm env:deploy staging`.
- **Exact wording** of messages, and what the Staging bar looks like (keep it small).
- **How the backup container waits** for 03:00.
- **Waiting for the health check:** how long to wait, and how often to retry.

## Open after this (separate decisions)

- **Who can sign up as a studio.** Should anyone be able to, or only studios the owner
  invites? Today the sign-up page is open to anyone.
- **Moving production to a rented server** (approach B), if home outages start to hurt.
