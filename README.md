# CineFlow OS 🎬📸
> **The Complete Operating System for Photographers, Videographers & Creative Studios**

CineFlow OS is a unified, multi-tenant SaaS platform engineered specifically for creative visual artists—from solo photographers and filmmakers to high-volume commercial production houses. It bridges an Awwwards-level public showcase website, an authenticated client portal with milestone billing and private deliverables vaults, and an on-set mobile companion for shooting logistics.

---

## 🌟 Key Features

### 1. Multi-Tenant SaaS Architecture & Custom Domains
- **SaaS Platform Layer**: Creator landing page, self-service studio onboarding (`/create-studio`), and Super-Admin revenue console (`/super-admin`).
- **Custom Domains & Slugs**: Each studio gets their own clean URL (e.g. `cineflow.app/apex-films`) or can map their own custom domain (e.g. `studio.apexfilms.com`).
- **Complete Data Isolation**: Every project, client vault, gear inventory, and proposal is strictly scoped to each tenant.

### 2. Public Showcase & Cinema-Style Calendar Booking
- **Awwwards-Level Showcase ("Nocturne Cine")**: High-contrast, dark cinematic aesthetic showcasing photo masonry grids (with EXIF tags) and embedded video reels.
- **Campaign & Session Category Filtering**: Instant grouping for 🎓 **Convocation**, 🌙 **Hari Raya Festive Specials**, 💍 **Weddings**, 📸 **Studio Portraits**, and 🎬 **Commercial Films**.
- **Cinema-Style Slot Holding Engine**: Clicking a time slot immediately places a **10-minute temporary exclusive hold lock** to prevent concurrent double-bookings, backed by a live countdown timer.
- **Flexible Payment Methods**: Instant Online Card, **Studio QR Code Scan** (e.g. DuitNow/Bank QR), or **Pay Cash at Studio Counter** with manual studio verification.

### 3. Client Onboarding & Interactive Proposal Engine
- **Frictionless 3-Field Onboarding**: Name, Email, and Phone Number—zero form fatigue. Email magic links for 1-time password setup.
- **Interactive Proposal Builder**: Clients toggle optional add-ons in real-time (Drone 4K aerials, RAW footage/stills drive, second shooter, extra hours, social vertical cuts, framed print packages).
- **Dynamic Recalculations & Digital Signature**: Subtotal, 50% deposit, and legal contract terms update dynamically on-screen before digital signing.

### 4. Automated Milestone Billing & Deliverables Paywall
- **Phase 1: 50% Retainer upon Signing**: Automatically reserves shoot dates on the studio production calendar.
- **Phase 2: 50% Final Balance for Master Downloads**:
  - *Pending Balance*: Watermarked photo proofing, hearting favorites, retouch notes, and streaming video review.
  - *Paid Balance*: Uncompressed high-res photo ZIP and 4K master video downloads unlock immediately.
- **Manual Payment Verification Console**: Studio staff can verify QR code receipts and cash payments with 1-click confirmation.

### 5. Interactive Print & Frame Wall Visualizer
- **Real-World Size Scaling**: Preview photos in standard print dimensions (4R, 5R, 8R, 10R, 12R, 16R, 20R) scaled against real interior walls and furniture.
- **Studio Frame Catalog**: Switch between Matte Black, Warm Walnut, Champagne Gold, and Float Mount moldings.
- **1-Click Print Order**: Converts visualized frames directly into print work orders and adds milestone invoices.

### 6. Pre-Production & On-Set Mobile Companion (Web & Tablet/Mobile PWA)
- **Dynamic Call Sheet Generator**:
  - Solar & **Golden Hour Calculator** (sunrise, sunset, morning/evening golden hour).
  - Weather forecast, GPS map navigation pins, parking instructions, and emergency hospital.
  - **1-Click WhatsApp Dispatch**: Broadcasts schedule updates to cast and crew via WhatsApp.
- **Visual Shot List & Storyboarder**: Shot cards with reference imagery, framing tags, lens specs, lighting setup notes, and an **On-Set Mobile Live Check-off Mode**.
- **Digital Release Forms**: Mobile-ready Talent & Location agreements with touchscreen signature capture.

### 7. Studio Operations & Gear BOM (Bill of Materials)
- **Kanban Production Pipeline**: Pre-Production ➔ Shoot Day ➔ Post-Production ➔ Client Review ➔ Delivered.
- **Equipment Inventory & Kit Bundles (BOM)**: Standardized cinema & photography kit packages (A-Cam packages, Strobe kits, Audio bags).
- **Pre/Post-Shoot Inspection Logs**: Condition grading, sensor dust checks, and damage flagging.
- **100% Dynamic Settings (Full CRUD)**: Studio admins have complete control to create, update, and delete service packages, campaign categories, calendar slots, frame moldings, print sizes, and add-on catalogs.

---

## 🛠️ Recommended Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 15 (App Router)](https://nextjs.org/) + React 19 + TypeScript |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) + Radix UI + Lucide Icons |
| **Database & ORM** | [Prisma ORM](https://www.prisma.io/) + SQLite (`dev.db`) *(Portable to PostgreSQL)* |
| **Architecture** | Next.js Server Actions, Multi-Tenant Dynamic Routing & Middleware |
| **Mobile Experience**| Mobile-First Responsive PWA with On-Set High-Contrast HUD |

---

## 📂 System Documentation Suite

Detailed technical architecture, database schemas, API contracts, design tokens, and user guides are organized in the [`docs/`](docs/) directory:

- 📋 **[01. Product Requirements Specification (PRD)](docs/01_PRODUCT_REQUIREMENTS_SPECIFICATION.md)**: Personas, pain points, core feature matrix, and NFRs.
- 📐 **[02. System Architecture & Data Flows](docs/02_SYSTEM_ARCHITECTURE_AND_DATA_FLOWS.md)**: High-level architecture, multi-tenant custom domain routing, and Mermaid sequence flows.
- 🗄️ **[03. Database Schema & Data Models](docs/03_DATABASE_SCHEMA_AND_MODELS.md)**: Full Prisma ORM schema reference for all 18+ models and cascade relations.
- ⚡ **[04. Server Actions & API Specification](docs/04_API_AND_SERVER_ACTIONS_SPECIFICATION.md)**: Next.js Server Actions with Zod schemas, atomic slot holds, and return types.
- 🎨 **[05. Design System & UI Guidelines ("Nocturne Cine")](docs/05_DESIGN_SYSTEM_AND_UI_GUIDELINES.md)**: Visual standards, obsidian/amber tokens, and Emil Kowalski craft rules.
- 📖 **[06. User Journey & Operations Manual](docs/06_USER_JOURNEY_AND_OPERATIONS_MANUAL.md)**: Operational guides for clients, studio producers, and platform super admins.
- 🚀 **[07. Deployment & Configuration Guide](docs/07_DEPLOYMENT_AND_CONFIGURATION_GUIDE.md)**: Environment variables, local dev setup, PWA install, and custom domain DNS.
- 🗺️ **[Detailed Architecture Plan](docs/ARCHITECTURE_PLAN.md)**: Implementation plan artifact and modular roadmap.

---

## 📄 License
Private & Proprietary © CineFlow OS. All Rights Reserved.

## Running with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env        # first time only — set AUTH_SECRET (32+ chars)
docker compose up -d --build
```

Open http://localhost:3000. On the first start the container creates the SQLite
database and seeds demo data (set `SEED_ON_FIRST_RUN=false` in `.env` to skip). Every start
applies any new recorded database changes in `prisma/migrations` first.

| Task | Command |
| --- | --- |
| Stop | `docker compose down` |
| View logs | `docker compose logs -f` |
| Rebuild after code changes | `docker compose up -d --build` |
| Wipe database & uploads | `docker compose down -v` |

The database, uploads and private deliverables live in Docker volumes
(`cineflow-data`, `cineflow-uploads`, `cineflow-storage`), so they survive
restarts and rebuilds.

### Changing the database

Every database change is recorded as a migration in `prisma/migrations`, and each copy
applies new ones when it starts. Never use `prisma db push` on a real database.

1. Edit `prisma/schema.prisma`.
2. `npm run db:migration -- <short_name>` writes the change as SQL (for example
   `npm run db:migration -- add_gift_cards`). Read it: a dropped column loses its data.
3. `npx prisma migrate deploy` applies it to `prisma/dev.db`; rebuilding Docker applies it there.
4. Commit the new folder in `prisma/migrations` together with the schema change.

`npm run db:check-migrations` fails when the schema has a change no migration records. GitHub
runs it, the type check and the tests on every push (`.github/workflows/ci.yml`).

### Sharing it for testing (Cloudflare Tunnel)

A free Cloudflare quick tunnel gives the app running on this computer a public https
address, with no Cloudflare account. It is off unless you start it.

| Task | Command |
| --- | --- |
| Start the tunnel | `docker compose up -d tunnel` |
| Show its address | `docker compose logs tunnel \| grep trycloudflare.com` |
| Stop the tunnel | `docker compose stop tunnel` |

- The address (`https://<random words>.trycloudflare.com`) changes whenever the tunnel
  restarts, including after this computer restarts. The site is up only while this computer
  and Docker are running.
- Anyone with the address can open the app. Change the demo passwords (`password123`,
  including `superadmin@cineflow.app`) before you share it.
- Links in emails and the Toyyibpay return address use `NEXT_PUBLIC_APP_URL`, which is
  fixed when the app is built, so they still point at localhost. For a fixed address, use
  your own domain ("Staging and production" below).

## Staging and production

CineFlow OS runs as three separate copies. Each has its own folder, settings (`.env`),
database, uploads, address and Cloudflare tunnel; nothing is shared between them.

| | Where | Used for | Data | Address |
| --- | --- | --- | --- | --- |
| **Dev** | this PC | building and testing changes | demo data | http://localhost:3000 |
| **Staging** | the 24/7 PC | checking a change before it goes live | demo data | `https://staging.<domain>`, only you can open it |
| **Production** | the 24/7 PC | real studios and their clients | real data | `https://app.<domain>` |

A change goes dev → `main` on GitHub → staging → production. Production only ever gets the
exact version staging ran.

### One-time setup of the 24/7 PC

1. Install [git](https://git-scm.com/), [Node.js 20 or later](https://nodejs.org/) and
   [Docker Desktop](https://www.docker.com/products/docker-desktop/). In Docker Desktop, turn
   on **Start Docker Desktop when you sign in**. In Windows, set the PC to sign in
   automatically and never sleep, so the site comes back on its own after a restart.
2. Make the folders and get the code (once each):
   ```
   CineFlow/
     staging/       git clone https://github.com/<you>/CineFlow-OS.git staging
     production/    git clone https://github.com/<you>/CineFlow-OS.git production
     backups/       (or a folder inside Google Drive / OneDrive, see BACKUP_DIR)
   ```
3. Copy `.env.staging.example` to `staging/.env` and `.env.production.example` to
   `production/.env`, and fill in the blanks. Each file explains every setting. Use a
   different `AUTH_SECRET` in each.
4. Your domain must be on Cloudflare (a free account; change the nameservers at your
   registrar to the two Cloudflare gives you). In **Zero Trust → Networks → Tunnels**, create
   two tunnels of type **Cloudflared**, and copy each one's token (the long text after
   `--token`) into that copy's `TUNNEL_TOKEN`:
   - staging's tunnel: public hostname `staging.<domain>` → service **HTTP**, URL **`app:3000`**;
   - production's tunnel: public hostname `app.<domain>` → service **HTTP**, URL **`app:3000`**.
5. Lock staging so only you can open it: in **Zero Trust → Access → Applications**, add a
   self-hosted application for `staging.<domain>` with a policy that allows only your email.
6. Set up real email for production: SMTP (for example Gmail with an app password) or
   Resend. Staging's emails go to its own test inbox at http://localhost:8125 on the 24/7 PC.
7. Deploy staging, then production (below). On the first production deploy, create your
   super-admin:
   ```
   cd production
   node scripts/ops.mjs create-super-admin you@example.com
   ```
   It prints a random password once. Studios then join through the studio sign-up page
   (`/create-studio`). The super-admin signs in on any studio's sign-in page
   (`/<studio>/login`) and then opens `/super-admin`, so that works once the first studio
   has joined.

### Releasing a change

Push the change to `main` and wait for GitHub's checks to pass. Then, on the 24/7 PC:

| Step | Run in | Command |
| --- | --- | --- |
| Put the latest `main` on staging | `staging/` | `node scripts/ops.mjs deploy staging` |
| Check it on `https://staging.<domain>` | | |
| Put staging's version live | `production/` | `node scripts/ops.mjs deploy production` |
| See what's running | either | `node scripts/ops.mjs status` |

`deploy production` lists what's new, builds the new version while the old one keeps
running, takes a backup just before swapping them, and waits until the site answers. If the
build fails, the old version simply stays live. If the new version doesn't come up, it prints
the command that puts the backup back. Both commands refuse to run in the wrong folder, or in a
folder with changed files.

### Backups

Production backs itself up every night at `BACKUP_TIME` (default 03:00), and before every
`deploy production`, into `BACKUP_DIR`:

- `db/<date_time>/` holds a copy of the database and the version it ran. These are kept for
  `BACKUP_KEEP_DAYS` (default 14).
- `files/` mirrors uploads and finished deliverables. It only adds and updates, so a file
  deleted in the app is still there.

Point `BACKUP_DIR` inside a Google Drive or OneDrive folder so a copy leaves the PC; make sure
it has room, because deliverables can be large.

| Task | Run in | Command |
| --- | --- | --- |
| Back up now | `production/` | `node scripts/ops.mjs backup now` |
| Put a backup back | `production/` | `node scripts/ops.mjs restore <date_time>` |

`restore` stops the app, puts the database and files back, switches to the version the
backup was taken on, and starts it again. Anything saved after that backup is lost. Each backup
records which copy it came from, and `restore` refuses one from another copy, so production's
client data can't end up in staging even if both point at the same backup folder.

### What production refuses to start with

Production checks its settings when it starts and stops, listing each problem, if:

- `AUTH_SECRET` is missing, shorter than 32 characters, or the built-in development one;
- `ALLOW_SIMULATED_CARD_PAYMENTS` is on;
- `NEXT_PUBLIC_APP_URL` isn't `https://`, points at this computer, or is still the example address;
- no real email is set up (no SMTP or Resend, or SMTP pointing at the Mailpit test inbox);
- `TOYYIBPAY_BASE_URL` is the Toyyibpay sandbox.

See the problems with `docker compose logs app` in `production/`, fix `.env`, and run
`docker compose up -d --force-recreate app` (or deploy again if you changed `NEXT_PUBLIC_APP_URL`,
which is fixed into the build).
