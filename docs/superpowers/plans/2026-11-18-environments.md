# Dev, Staging and Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run CineFlow OS as three separate copies (dev on this PC; staging and production on a 24/7 PC), with recorded database changes, safe production start-up, backups, and two-command releases.

**Architecture:**
- **One `docker-compose.yml`, one folder per copy.** Each copy's folder holds its own `.env`, which sets the project name, port, profiles and `APP_ENV`.
- **Start-up.** A TypeScript start script runs before `next start`. It checks production settings, brings the database up to date with Prisma migrations (adopting an existing database that matches the baseline), and seeds demo data only outside production.
- **Host commands.** A dependency-free Node script on the host deploys, backs up and restores.
- **Backups.** A small `backup` container takes the nightly and on-demand backups.

**Tech Stack:** Next.js 15, Prisma 6 + SQLite, Docker Compose, Node 22 (container) / Node 20+ (host), tsx, Alpine + sqlite3 + rsync (backup image), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-18-environments-design.md`

## Global Constraints

- **Name:** the product stays **CineFlow OS**.
- **Allowed values of `APP_ENV`:** `development` | `staging` | `production`. The default is `development`.
- **Ports:** dev 3000, staging 3100, production 3200. Staging and production bind to `127.0.0.1` only.
- **Project names:** `cineflow-staging` and `cineflow-production`. Dev leaves `COMPOSE_PROJECT_NAME` unset. Today's dev volumes (`cineflow-os_cineflow-data`, `cineflow-os_cineflow-uploads`, `cineflow-os_cineflow-storage`) must survive, with their data.
- **Never run `prisma db push` against `prisma/dev.db`.** The one-time baseline of `prisma/dev.db` needs the owner's OK first.
- **Production refuses to start when any of these is true:**
  - `AUTH_SECRET` is missing, shorter than 32 characters, or the built-in development secret;
  - `ALLOW_SIMULATED_CARD_PAYMENTS=true`;
  - `NEXT_PUBLIC_APP_URL` isn't `https` or is localhost or `127.0.0.1`;
  - no real email is set up (neither SMTP nor `RESEND_API_KEY`, or SMTP pointing at mailpit, localhost or `127.0.0.1`);
  - `TOYYIBPAY_BASE_URL` is the sandbox (`dev.toyyibpay.com`).
- **Backups:**
  - They run nightly at `BACKUP_TIME` (default `03:00`), in `TZ` (default `Asia/Kuala_Lumpur`).
  - Database snapshots are kept for `BACKUP_KEEP_DAYS` (default `14`).
  - Files are mirrored and never deleted from the mirror.
  - Every backup records the commit it was taken on.
- **No demo seed in production.**
- **Host requirements:** the host commands need only Node 20+, git and Docker (no `pnpm install` on the 24/7 PC).
- **No `confirm()`/`alert()`** anywhere.
- **Commits:** no attribution lines in commits. Work on branch `feat/environments`; commit locally per task; push only when the owner asks.
- **Before reporting a task done:** run `graphify update .` after code changes. Rebuild dev Docker (`docker compose up -d --build`) and verify before claiming UI work done.

## Review Focus

1. **A database that exists but doesn't match the baseline** (for example `prisma/dev.db` behind the schema) must stop start-up with a message and never be marked as migrated. Tested in Task 1 (T30-DB-03).
2. **A deploy run in the wrong folder** (staging's command in the production folder, or a copy with no `APP_ENV`) must refuse before touching git or Docker. Tested in Task 4 (T30-OPS-02).
3. **A deploy folder with uncommitted changes** must refuse, rather than lose them on checkout. Tested in Task 4 (T30-OPS-03).
4. **A production deploy when staging was never deployed, or already runs the same commit,** must explain and stop, without taking a backup or rebuilding. Tested in Task 4 (T30-OPS-04).
5. **A backup taken while the app is writing** must use SQLite's online backup, not a file copy. A restore must remove stale `-wal`/`-shm` files. Checked by the restore drill in Task 7, step 5.

---

### Task 1: Recorded database changes (migrations) and the start script

**Files:**
- Create: `prisma/migrations/migration_lock.toml`, `prisma/migrations/0_init/migration.sql`
- Create: `scripts/start.ts`
- Modify: `Dockerfile` (the last `CMD`)
- Test: `tests/e2e/tier30-environments.test.ts` (new), `tests/e2e/runner.ts`

**Interfaces:**
- Produces, in `scripts/start.ts`:
  - `sqlitePathFromUrl(url: string, schemaDir: string): string`. Takes `file:` URLs only; a relative path resolves against `schemaDir`, as Prisma does.
  - `prepareDatabase(opts: { databaseUrl: string; cwd: string; log?: (m: string) => void }): Promise<"created" | "adopted" | "migrated">`. It throws an `Error` whose message starts with `"The database doesn't match"` on a mismatch.
  - A `main()` that runs only when the file is executed directly. It runs `prepareDatabase`, then seeds when the database was `"created"`, `APP_ENV !== "production"` and `SEED_ON_FIRST_RUN !== "false"`. Task 2 adds the production settings check before it.
- Produces: `runTier30EnvironmentsTests(harness)` in the new test file. Later tasks add tests to it.

- [ ] **Step 1: Branch.** Run `git switch -c feat/environments`.

- [ ] **Step 2: Generate the baseline migration.**
  - Run `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`.
  - Write `prisma/migrations/migration_lock.toml` with `provider = "sqlite"`.
  - Expected: the SQL contains `CREATE TABLE "Proposal"`, with the `declinedAt` column.

- [ ] **Step 3: Write the failing tests** (T30-DB-01..04) in `tests/e2e/tier30-environments.test.ts`. Each one works on a temporary SQLite file under `os.tmpdir()` and deletes it after.
  - **T30-DB-01:** `prepareDatabase` on a missing file returns `"created"`. The file now has a `_prisma_migrations` row named `0_init` and a `Proposal` table.
  - **T30-DB-02:** a database built with `prisma db push --skip-generate` (`DATABASE_URL` set to the temp file) returns `"adopted"`. Its `_prisma_migrations` now lists `0_init`, and its existing rows are untouched: insert a `Tenant` row before the call, and check it's still there after.
  - **T30-DB-03:** the same as 02, then `ALTER TABLE "Proposal" DROP COLUMN "declinedAt"` before the call. It rejects with a message starting with `"The database doesn't match"`, and the database has no `_prisma_migrations` table afterwards.
  - **T30-DB-04:** on a second call against the database from 01, it returns `"migrated"`. Also, `sqlitePathFromUrl("file:./dev.db", "/app/prisma")` is `/app/prisma/dev.db`, and `sqlitePathFromUrl("file:/app/data/dev.db", "/x")` is `/app/data/dev.db`.
  - Register `runTier30EnvironmentsTests` in `tests/e2e/runner.ts`, after Tier 29.

- [ ] **Step 4: Run them and confirm they fail.** Run `npm run test:e2e`. Expected: Tier 30 fails because `scripts/start.ts` doesn't exist. Every other tier passes.

- [ ] **Step 5: Implement `scripts/start.ts`.** It calls Prisma through `npx prisma …` with `spawnSync` (`shell: process.platform === "win32"`), passing `DATABASE_URL` in the child environment.
  - **No file:** run `migrate deploy`, and return `"created"`.
  - **A file without a `_prisma_migrations` table:**
    1. Run `migrate diff --from-url <url> --to-migrations prisma/migrations --shadow-database-url file:<temp file> --exit-code`.
    2. If it exits 0, run `migrate resolve --applied 0_init`, then `migrate deploy`, and return `"adopted"`.
    3. If it exits 2, throw the mismatch error. Include the diff's summary and the instruction "Back it up and bring it in line with prisma/migrations by hand; nothing was changed."
  - **Otherwise:** run `migrate deploy`, and return `"migrated"`.
  - Check whether the table exists with `sqlite3`-free means: a `PrismaClient` with `datasourceUrl`, running `SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`.

- [ ] **Step 6: Run the tests and confirm they pass.** Run `npm run test:e2e`. Expected: T30-DB-01..04 pass, with 0 failures overall.

- [ ] **Step 7: Switch the container start-up.** Replace the Dockerfile `CMD` with:
  ```
  CMD ["sh", "-c", "pnpm tsx scripts/start.ts && exec pnpm start"]
  ```
  Update the comment above it: "check settings, apply database changes, seed demo data on a new non-production database, then start".

- [ ] **Step 8: Commit.**
  - `git add prisma/migrations scripts/start.ts Dockerfile tests/e2e/tier30-environments.test.ts tests/e2e/runner.ts`
  - `git commit -m "feat(db): recorded database changes and a start-up script"`

---

### Task 2: `APP_ENV`, the production settings check, the Staging bar and the health check

**Files:**
- Create: `lib/app-env.ts`, `components/staging-bar.tsx`
- Modify: `scripts/start.ts` (`main`), `app/layout.tsx`, `app/robots.ts`, `app/api/health/route.ts`, `Dockerfile` (build stage `ARG`/`ENV APP_ENV`), `.env.example`
- Test: `tests/e2e/tier30-environments.test.ts`

**Interfaces:**
- Produces, in `lib/app-env.ts` (no `server-only` import; `scripts/start.ts` uses it too):
  - `type AppEnv = "development" | "staging" | "production"`
  - `appEnvFrom(env?: NodeJS.ProcessEnv): AppEnv`. A missing value gives `"development"`; any other unknown value throws `Unknown APP_ENV "<value>"`.
  - `productionSettingProblems(env?: NodeJS.ProcessEnv): string[]`. Returns one plain sentence per problem, or an empty list. It uses `smtpConfigFromEnv` from `lib/email/smtp.ts` and `DEV_FALLBACK_AUTH_SECRET` from `lib/auth/dev-secret.ts`.
  - `APP_ENV: AppEnv`, evaluated once.

- [ ] **Step 1: Write the failing tests (T30-ENV-01..04).**
  - **T30-ENV-01:** `appEnvFrom({})` is `"development"`, `appEnvFrom({APP_ENV:"staging"})` is `"staging"`, and `appEnvFrom({APP_ENV:"prod"})` throws.
  - **T30-ENV-02:** a fully good production environment gives `[]`. Use `AUTH_SECRET` of 40 random characters, `NEXT_PUBLIC_APP_URL=https://app.example.com`, `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=a@b.c`, `SMTP_PASS=x`, and no Toyyibpay or simulated-payment settings.
  - **T30-ENV-03:** each bad value alone gives exactly one problem. Check each sentence mentions the setting's name.
    - `AUTH_SECRET` missing, short, or equal to `DEV_FALLBACK_AUTH_SECRET`;
    - `ALLOW_SIMULATED_CARD_PAYMENTS=true`;
    - an `http://` URL;
    - `https://localhost:3000`;
    - no SMTP and no Resend;
    - `SMTP_HOST=mailpit`;
    - `TOYYIBPAY_BASE_URL=https://dev.toyyibpay.com`.
    `RESEND_API_KEY` alone, without SMTP, counts as real email.
  - **T30-ENV-04:**
    - With `process.env.APP_ENV="staging"`, `robots()` returns a single rule disallowing `/`. Restore the env after.
    - Without it, `robots()` keeps today's allow list.
    - The `/api/health` GET response body has only the keys `status`, `db` and `timestamp`.

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run test:e2e`. Expected: T30-ENV fails, because `lib/app-env.ts` is missing.

- [ ] **Step 3: Implement `lib/app-env.ts`.** Then:
  - In `scripts/start.ts`, `main()` first runs `appEnvFrom()`. When it's `production` and there are problems, print `Production can't start:` and each problem as a `- ` line, then exit with code 1.
  - In `app/robots.ts`, call `appEnvFrom()` inside the function rather than using the `APP_ENV` constant, so the test can switch it. Staging returns `{ rules: [{ userAgent: "*", disallow: "/" }] }`.
  - In `app/api/health/route.ts`, return only `{ status, db, timestamp }`, and `console.error` the database error instead of returning it.

- [ ] **Step 4: Add the Staging bar.**
  - Create `components/staging-bar.tsx`, a server component. It renders a fixed, full-width, 24px-high amber bar at the top with the text `Staging — test copy. Changes here don't affect the live site.`.
    - It has `role="note"` and is truncated on one line at phone width.
    - It sets `--staging-bar-height: 24px` on `body`, so nothing sits under it. Check sticky headers in admin, the client portal and public pages.
  - In `app/layout.tsx`:
    - render it only when `APP_ENV === "staging"`;
    - add `robots: { index: false, follow: false }` to `metadata` in staging.
  - In the Dockerfile build stage, add `ARG APP_ENV=development` and `ENV APP_ENV=$APP_ENV`, so pages built ahead of time agree with the runtime.

- [ ] **Step 5: Run the tests and type check, and confirm they pass.** Run `npx tsc --noEmit` and `npm run test:e2e`. Expected: both clean, with 0 failures.

- [ ] **Step 6: Document `APP_ENV`.** In `.env.example`, add `APP_ENV="development"` under App Domain, with a one-line comment listing the three values.

- [ ] **Step 7: Commit.** Commit the files above with the message `feat(env): APP_ENV, production settings check and the Staging bar`.

---

### Task 3: One Compose file for every copy

**Files:**
- Modify: `docker-compose.yml`, `.env.example`
- Create: `.env.staging.example`, `.env.production.example`

**Interfaces:**
- Produces:
  - **Settings read by Compose:** `COMPOSE_PROJECT_NAME`, `COMPOSE_PROFILES`, `APP_ENV`, `APP_BIND`, `APP_PORT`, `MAILPIT_PORT`, `MAILPIT_SMTP_PORT`, `TUNNEL_TOKEN`, `BACKUP_DIR`, `BACKUP_TIME`, `BACKUP_KEEP_DAYS`, `TZ`.
  - **Profiles:** `mail`, `tunnel`, `domain`, `backup`.
  - **The backup service** (`backup`) is defined in Task 5. This task only reserves its profile name.

- [ ] **Step 1: Change `docker-compose.yml`.**
  - **app:**
    - remove `image:` and `container_name:` (the image becomes `<project>-app`, so staging and production can't overwrite each other);
    - pass `APP_ENV: ${APP_ENV:-development}` as a build arg;
    - map the port `"${APP_BIND:-0.0.0.0}:${APP_PORT:-3000}:3000"`;
    - add `APP_ENV: ${APP_ENV:-development}` to `environment`;
    - remove `depends_on: mailpit`.
  - **mailpit:**
    - add `profiles: ["mail"]` and remove `container_name`;
    - map the ports `127.0.0.1:${MAILPIT_PORT:-8025}:8025` and `127.0.0.1:${MAILPIT_SMTP_PORT:-1025}:1025`.
  - **tunnel and domain-tunnel:** remove `container_name`.
  - **Comment at the top:** explain the three copies, and that each folder's `.env` picks the project name, port and profiles.

- [ ] **Step 2: Keep dev the same.**
  - Add `COMPOSE_PROFILES=mail` to `.env.example`, with a comment.
  - Add the same line to this PC's `.env`, so `docker compose up -d` still starts Mailpit.

- [ ] **Step 3: Write `.env.staging.example` and `.env.production.example`.** Each lists every setting the copy needs, with a one-line note and placeholders, never real secrets.
  - **Staging:**
    - `COMPOSE_PROJECT_NAME=cineflow-staging`, `COMPOSE_PROFILES=mail,domain`, `APP_ENV=staging`;
    - `APP_BIND=127.0.0.1`, `APP_PORT=3100`, `MAILPIT_PORT=8125`, `MAILPIT_SMTP_PORT=1125`;
    - `SMTP_HOST=mailpit`, `SMTP_PORT=1025`;
    - `ALLOW_SIMULATED_CARD_PAYMENTS=true`, `TOYYIBPAY_BASE_URL=https://dev.toyyibpay.com`;
    - `NEXT_PUBLIC_APP_URL=https://staging.example.com`, `NEXT_PUBLIC_APP_DOMAIN=staging.example.com`;
    - `AUTH_SECRET=` (with a note on making one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    - `TUNNEL_TOKEN=`, `DEPLOY_BRANCH=main`.
  - **Production:**
    - `COMPOSE_PROJECT_NAME=cineflow-production`, `COMPOSE_PROFILES=domain,backup`, `APP_ENV=production`;
    - `APP_BIND=127.0.0.1`, `APP_PORT=3200`;
    - real SMTP or Resend placeholders;
    - no simulated payments, and no Toyyibpay base URL (live);
    - `NEXT_PUBLIC_APP_URL=https://app.example.com`, `NEXT_PUBLIC_APP_DOMAIN=app.example.com`;
    - `AUTH_SECRET=`, `TUNNEL_TOKEN=`;
    - `BACKUP_DIR=../backups`, `BACKUP_TIME=03:00`, `BACKUP_KEEP_DAYS=14`, `TZ=Asia/Kuala_Lumpur`;
    - `STAGING_DIR=../staging`.

- [ ] **Step 4: Check the Compose file for each copy.**
  - Run `docker compose --env-file .env.staging.example config`. Expected: `name: cineflow-staging`; the app is published on `127.0.0.1:3100`; mailpit is on `127.0.0.1:8125`; the `APP_ENV` build arg is `staging`.
  - Run the same with `.env.production.example`. Expected: `name: cineflow-production`, `127.0.0.1:3200`, and no mailpit service.
  - Run `docker compose config` with no flag. Expected: `name: cineflow-os`, and the volumes `cineflow-os_cineflow-data` (and the others) unchanged.

- [ ] **Step 5: Rebuild dev and confirm its data survived.**
  - Run `docker compose up -d --build`.
  - Then `docker compose logs app`. Expected: the start script reports the database was adopted (`"adopted"`).
  - Sign in as alex@luminacine.com on http://localhost:3000. Elena's declined proposal from earlier is still listed, and there's no Staging bar.

- [ ] **Step 6: Commit.** Commit the files above with the message `feat(docker): one Compose file for dev, staging and production`. `.env` is not committed.

---

### Task 4: Host commands: deploy staging and production

**Files:**
- Create: `scripts/ops.mjs` (the command-line entry), `scripts/ops/lib.mjs` (pure helpers)
- Modify: `.gitignore` (add `.cineflow-deployed.json`), `package.json` (`"ops": "node scripts/ops.mjs"`)
- Test: `tests/e2e/tier30-environments.test.ts`

**Interfaces:**
- Produces, in `scripts/ops/lib.mjs` (Node built-ins only):
  - `parseEnvFile(text: string): Record<string,string>`. Handles `#` comments, blank lines, and single or double quotes.
  - `deployTargetProblem(target: string, envVars: Record<string,string>): string | null`. The target must be `staging` or `production`, and must equal `envVars.APP_ENV`.
  - `changedFiles(porcelain: string): string[]`
  - `planProductionDeploy(input: { stagingRecord: { commit: string; at: string } | null; productionHead: string }): { action: "deploy"; commit: string } | { action: "nothing"; message: string } | { action: "error"; message: string }`
  - `backupName(date: Date): string`. Uses local time in the form `YYYY-MM-DD_HHmmss`.
  - `waitForHealth(url: string, opts?: { timeoutMs?: number; intervalMs?: number; fetchImpl?: typeof fetch }): Promise<boolean>`. Defaults: `timeoutMs` 180000, `intervalMs` 3000. It's true on the first 200.
- Produces, in `scripts/ops.mjs`:
  - **Commands:**
    - `deploy staging`
    - `deploy production`
    - `backup now`
    - `restore <backup name>` (the backup and restore commands are filled in by Task 5)
    - `create-super-admin <email>` (filled in by Task 6)
    - `status`
  - **Deploy record:** each successful deploy writes `.cineflow-deployed.json` (`{ "commit": "<sha>", "at": "<ISO>" }`) in the folder.

- [ ] **Step 1: Write the failing tests (T30-OPS-01..05).**
  - **T30-OPS-01:** `parseEnvFile` reads quoted, unquoted and commented lines.
  - **T30-OPS-02:**
    - `deployTargetProblem("staging", {APP_ENV:"production"})` mentions both names;
    - `({}, "production")` with no `APP_ENV` is refused;
    - `"prod"` is refused;
    - a match gives `null`.
  - **T30-OPS-03:** `changedFiles(" M lib/a.ts\n?? new.txt\n")` lists both files, and `changedFiles("")` is `[]`.
  - **T30-OPS-04:** `planProductionDeploy`:
    - with a `null` staging record, it gives `error`, and the message says to deploy staging first;
    - with the same commit, it gives `nothing`;
    - with a different commit, it gives `deploy` with that commit.
  - **T30-OPS-05:**
    - `backupName(new Date(2026, 10, 18, 3, 0, 5))` is `"2026-11-18_030005"`;
    - `waitForHealth` with a fake fetch returning 503, 503, then 200 resolves `true`;
    - with a fake that always returns 503 and `timeoutMs` 50, it resolves `false`.

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run test:e2e`. Expected: T30-OPS fails because the module is missing.

- [ ] **Step 3: Implement `scripts/ops/lib.mjs`.** Then run `npm run test:e2e`. Expected: T30-OPS passes.

- [ ] **Step 4: Implement `scripts/ops.mjs`.** It reads `.env` from the current folder. Before anything else it:
  - checks `deployTargetProblem`;
  - refuses if `changedFiles` (from `git status --porcelain`) isn't empty, listing the files.
  It runs commands with `spawnSync` and `stdio: "inherit"`, and stops at the first failure with exit code 1.
  - **`deploy staging`:**
    1. `git fetch origin`, then `git checkout --detach origin/${DEPLOY_BRANCH:-main}`.
    2. If `gh` is on the PATH, run `gh run list --commit <sha> --json conclusion`, and print a warning unless every result's conclusion is `success`.
    3. `docker compose build app`, then `docker compose up -d`.
    4. `waitForHealth("http://127.0.0.1:${APP_PORT}/api/health")`.
    5. Write the deploy record and print `Staging is running <short sha> <subject>.`
  - **`deploy production`:**
    1. Read `${STAGING_DIR:-../staging}/.cineflow-deployed.json` and run `planProductionDeploy` against `git rev-parse HEAD`.
    2. Fetch, and print `git log --oneline HEAD..<commit>`.
    3. Run `backup now`, and remember the name. Until Task 5 fills in `backup now`, it exits with `Backups aren't set up yet.`, which stops the deploy. That is intended.
    4. `git checkout --detach <commit>`, build, `up -d`, and wait for health.
    5. If health fails, print `Production didn't come back. To go back: node scripts/ops.mjs restore <name>` and exit 1. On success, write the record.
  - **`status`:** print `APP_ENV`, the deployed record, `git rev-parse --short HEAD`, and `docker compose ps`.

- [ ] **Step 5: Check it by hand.**
  - In this repo, `node scripts/ops.mjs deploy staging` must refuse, saying this folder's `APP_ENV` is `development` (or missing).
  - `node scripts/ops.mjs status` prints without error.

- [ ] **Step 6: Commit.** Commit the files above with the message `feat(ops): deploy commands for staging and production`.

---

### Task 5: Backups and restore

**Files:**
- Create: `docker/backup/Dockerfile`, `docker/backup/backup.sh`
- Modify: `docker-compose.yml` (the `backup` service), `scripts/ops.mjs` (`backup now`, `restore`)

**Interfaces:**
- Consumes: `backupName`, `waitForHealth` and `parseEnvFile` from Task 4.
- Produces:
  - `backup.sh`, with these modes:
    - `daemon`: waits for `BACKUP_TIME` in `TZ`, runs `backup`, and repeats.
    - `backup <name>`
    - `restore <name>`
  - **Backup layout:**
    - `${BACKUP_DIR}/db/<name>/dev.db`
    - `${BACKUP_DIR}/db/<name>/info.txt`, holding `commit=<sha>` and `taken=<ISO>`
    - `${BACKUP_DIR}/files/uploads/`
    - `${BACKUP_DIR}/files/storage/`

- [ ] **Step 1: Write the backup image and script.**
  - **The image:** `docker/backup/Dockerfile` is `FROM alpine:3.20`, then `RUN apk add --no-cache sqlite rsync tzdata`, then copies `backup.sh` and sets `ENTRYPOINT ["/backup.sh"]`.
  - **`backup <name>`:**
    1. `sqlite3 /data/dev.db ".backup '/backups/db/<name>/dev.db'"`.
    2. Read the commit from `/project/.cineflow-deployed.json`, or `unknown` if it's missing, and write `info.txt`.
    3. `rsync -a /uploads/ /backups/files/uploads/` and `rsync -a /storage/ /backups/files/storage/`, with no `--delete`.
    4. Remove `db/*` folders older than `BACKUP_KEEP_DAYS` (`find … -mindepth 1 -maxdepth 1 -type d -mtime +N`).
    5. Print `Backup <name> done`.
  - **`restore <name>`:**
    1. Refuse if `/backups/db/<name>/dev.db` is missing.
    2. Remove `/data/dev.db`, `/data/dev.db-wal` and `/data/dev.db-shm`, then copy the backup in.
    3. `rsync -a` the files back, with no `--delete`.

- [ ] **Step 2: Add the `backup` service to the Compose file.**
  - Build from `docker/backup`, with `profiles: ["backup"]` and `restart: unless-stopped`.
  - `command: daemon`.
  - Environment: `TZ`, `BACKUP_TIME`, `BACKUP_KEEP_DAYS`.
  - Volumes:
    - `cineflow-data:/data`
    - `cineflow-uploads:/uploads`
    - `cineflow-storage:/storage`
    - `${BACKUP_DIR:-./backups}:/backups`
    - `./:/project:ro`
  - Add `/backups` to `.gitignore`.

- [ ] **Step 3: Add the backup and restore commands to `scripts/ops.mjs`.**
  - **`backup now`:**
    - run `docker compose run --rm backup backup <backupName(now)>`;
    - print the name;
    - the backup service doesn't have to be running, because `run` starts its own container even without the `backup` profile active, using `--profile backup`.
  - **`restore <name>`:**
    1. Read `info.txt`'s commit from `${BACKUP_DIR}/db/<name>/info.txt`.
    2. Run `docker compose stop app`.
    3. Run `docker compose --profile backup run --rm backup restore <name>`.
    4. If the commit isn't `unknown`, run `git checkout --detach <commit>`.
    5. Build, run `up -d`, wait for health, and write the deploy record.
    6. Print `Restored <name> (<short sha>).`

- [ ] **Step 4: Check the Compose file.** Run `docker compose --env-file .env.production.example config`. Expected: the `backup` service has all five mounts, with `/backups` pointing at `../backups`.

- [ ] **Step 5: Commit.** Commit the files above with the message `feat(ops): nightly backups and restore`.

---

### Task 6: Creating the super-admin, and automatic checks on GitHub

**Files:**
- Create: `scripts/create-super-admin.ts`, `scripts/new-migration.mjs`, `.github/workflows/ci.yml`
- Modify: `scripts/ops.mjs` (`create-super-admin`), `package.json` (`db:migration`, `db:check-migrations`), `tests/e2e/run.mjs` (use migrations)
- Test: `tests/e2e/tier30-environments.test.ts`

**Interfaces:**
- Produces:
  - `createOrResetSuperAdmin(email: string): Promise<{ password: string; created: boolean }>` in `scripts/create-super-admin.ts`.
    - It generates a 20-character password from `crypto.randomBytes`, using letters and digits only.
    - It hashes it with `bcrypt.hash(password, 10)` (bcryptjs).
    - It upserts a user with `role: "SUPER_ADMIN"` and `tenantId: null`, normalising the email to lowercase.
    - When run directly, it prints the password once with `Save it now; it won't be shown again.`
- Produces, in `package.json`:
  - `"db:migration": "node scripts/new-migration.mjs"`
  - `"db:check-migrations": "prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:./shadow-check.db --exit-code"`

- [ ] **Step 1: Write the failing test (T30-ADMIN-01).**
  1. `createOrResetSuperAdmin("T30-Root@Example.test")` gives `created: true` and a 20-character password.
  2. The stored user is `t30-root@example.test`, with `SUPER_ADMIN`, and `bcrypt.compareSync(password, hash)` is true.
  3. A second call gives `created: false` and a different password; the old password no longer matches.
  Tear down by deleting the user.

- [ ] **Step 2: Run it and confirm it fails.** Run `npm run test:e2e`. Expected: T30-ADMIN-01 fails because the module is missing.

- [ ] **Step 3: Implement `scripts/create-super-admin.ts`.** Then:
  - Implement the `create-super-admin <email>` command in `ops.mjs` as `docker compose exec app pnpm tsx scripts/create-super-admin.ts <email>`.
  - Run `npm run test:e2e`. Expected: it passes.

- [ ] **Step 4: Run the tests from migrations.**
  - In `tests/e2e/run.mjs`, replace `prisma db push --skip-generate` with `prisma migrate deploy`.
  - Run `npm run test:e2e`. Expected: 0 failures, so the migrations build the same schema the tests expect.

- [ ] **Step 5: Add the new-migration command.**
  - **`scripts/new-migration.mjs <name>`:**
    1. Validate the name against `^[a-z0-9_]+$`.
    2. Run `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:<temp> --script`.
    3. If the output has no SQL statements, print `No schema changes.` and write nothing.
    4. Otherwise, write `prisma/migrations/<YYYYMMDDHHmmss>_<name>/migration.sql` and print its path, plus `Apply it to dev with: npx prisma migrate deploy`.
    5. Delete the temp shadow file.
  - **Check it:** `npm run db:migration -- nothing_changed` prints `No schema changes.` and `npm run db:check-migrations` exits 0.
  - Add `shadow-check.db` and the temp file pattern to `.gitignore` if `*.db` doesn't already cover them.

- [ ] **Step 6: Add the GitHub workflow.** Write `.github/workflows/ci.yml`.
  - It runs on `push` to `main` and on `pull_request`, on `ubuntu-latest`.
  - Steps:
    1. `actions/checkout@v4`
    2. `pnpm/action-setup@v4` with `version: 10`
    3. `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm`
    4. `pnpm install --frozen-lockfile`
    5. `pnpm prisma generate`
    6. `pnpm typecheck`
    7. `pnpm db:check-migrations`
    8. `pnpm test:e2e`
  - No secrets are needed, because the tests use the development fallbacks and mocks.

- [ ] **Step 7: Commit.** Commit the files above with the message `feat(ops): create the super-admin, new-migration command and CI checks`.

---

### Task 7: Documentation, and a full trial run on this PC

**Files:**
- Modify: `README.md` (replace "Putting it on your own domain" with a "Staging and production" section), `docs/BUG_FIX_LOG.md` (only if a bug is found)

- [ ] **Step 1: Write the README section.** Cover:
  - the three copies table (from the spec);
  - one-time setup on the 24/7 PC: the spec's checklist, including the folder layout and copying the two `.env.*.example` files;
  - releasing: `node scripts/ops.mjs deploy staging`, then `… deploy production`;
  - backups: where they go, `backup now`, and `restore <name>`;
  - `create-super-admin`;
  - changing the database in dev: edit `schema.prisma`, run `npm run db:migration -- <name>`, then `npx prisma migrate deploy`, and commit the migration folder;
  - what production refuses to start with.
  Keep the quick-tunnel section.

- [ ] **Step 2: Set up the trial.** Make two local clones on this PC: `git clone C:\Dev-System\CineFlow-OS C:\Dev-System\cineflow-trial\staging` and `…\production`.
  - Give each a `.env` copied from its example, with:
    - `DEPLOY_BRANCH=feat/environments`;
    - project names `cineflow-trial-staging` and `cineflow-trial-production`;
    - no `domain` profile;
    - `BACKUP_DIR=../backups`.
  - Production uses throwaway real-looking settings: a random `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL=https://app.example.test`, and `SMTP_HOST=smtp.example.test` with a user and password.

- [ ] **Step 3: Try staging.** Run `node scripts/ops.mjs deploy staging` in `staging/`. Expected:
  - it finishes with `Staging is running …`;
  - http://localhost:3100 shows the Staging bar on public, admin and client pages, at 390px too, with nothing hidden under it;
  - alex@luminacine.com can sign in;
  - an email the app sends shows up in the Mailpit inbox at http://localhost:8125.

- [ ] **Step 4: Try production.** Run `node scripts/ops.mjs deploy production` in `production/`. Expected:
  - it lists the commits, takes a backup, and is healthy at http://localhost:3200, with no Staging bar;
  - `password123` accounts don't exist (alex can't sign in);
  - `create-super-admin owner@example.test` prints a password that signs in.
  Then set `ALLOW_SIMULATED_CARD_PAYMENTS=true` and run `docker compose up -d --force-recreate app`. Expected: `docker compose logs app` shows `Production can't start:` with that line, and the app isn't serving. Remove the setting again.

- [ ] **Step 5: Practise a restore.**
  1. On production, sign up a studio through `/create-studio`, then run `backup now`.
  2. Delete that studio's owner in the database (`docker compose exec app` with a short Prisma script).
  3. Run `restore <name>`.
  Expected: the studio and owner are back, the app is healthy, and there are no `-wal`/`-shm` leftovers older than the restore.

- [ ] **Step 6: Clean up the trial.** In both trial folders, run `docker compose down -v --rmi local`, then delete `C:\Dev-System\cineflow-trial`. Confirm that `docker volume ls` still lists the `cineflow-os_*` volumes.

- [ ] **Step 7: Baseline `prisma/dev.db`, with the owner's OK.**
  1. Ask the owner.
  2. Run `npx prisma migrate diff --from-url file:./prisma/dev.db --to-migrations prisma/migrations --shadow-database-url file:./shadow-check.db --exit-code`.
  3. Only on exit 0, run `npx prisma migrate resolve --applied 0_init` with `DATABASE_URL=file:./dev.db`. Otherwise, report the difference to the owner and stop.

- [ ] **Step 8: Run all the checks.** Run `npx tsc --noEmit`, `npm run test:e2e` and `graphify update .`, and rebuild dev Docker. Expected: all clean, and localhost:3000 behaves as before.

- [ ] **Step 9: Commit.** Commit with the message `docs(ops): staging and production guide`, and commit the graph with `chore(graph): refresh knowledge graph for environments`.
