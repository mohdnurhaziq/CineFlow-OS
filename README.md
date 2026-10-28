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
