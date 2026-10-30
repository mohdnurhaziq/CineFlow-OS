# Project: CineFlow OS — The Multi-Tenant Creative Operating System

## Architecture
CineFlow OS is built as a production-grade multi-tenant creative operating system for boutique photography and videography studios.
- **Framework & Core**: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/ui ("Nocturne Cine" aesthetic).
- **Database & Persistence**: Prisma ORM with SQLite (`dev.db`), 24 models covering full multi-tenant studio lifecycle.
- **Storage & Infrastructure**: 100% local self-contained execution. Local media storage in `public/uploads/` (watermarked previews, high-res masters, QR receipt slips, showcase galleries, signatures).
- **Payment & Verification**: Multi-mode checkout (Simulated Online Card, Studio QR code scan with receipt proof upload, Cash counter payment) with studio manual verification console.
- **Multi-Tenant Routing**: Next.js middleware supporting path-based (`/[tenantSlug]`) and custom domain host matching, strictly scoping database queries with `where: { tenantId }`.
- **Client Delivery Vault**: Dual-tier access governed by `Project.isFinalBalancePaid` (50% final paywall) locking master photo ZIPs and 4K ProRes master video downloads until verified settlement.
- **On-Set Logistics & HUD**: Solar Golden Hour calculation engine, 1-click WhatsApp dispatch links (`wa.me/?text=...`), touch-first shot list check-offs, and HTML5 canvas digital release signatures.
- **Wall Art Visualizer**: Living room scale mockup anchored to an 84-inch sofa with real-time frame molding rendering (Matte Black, Walnut, Gold) and print sizing (8R, 12R, 16R).
- **Studio Admin Console**: Full dynamic CRUD across 9 administrative domains with zero hardcoded business logic.

---

## Code Layout
```
/home/mohd-nur-haziq/Dev Folder/Production Management System/
├── app/
│   ├── (saas)/
│   │   ├── page.tsx                           # SaaS Platform Landing Page
│   │   ├── create-studio/page.tsx             # Studio Onboarding Form
│   │   └── super-admin/page.tsx               # Platform Super-Admin Console
│   ├── [tenantSlug]/
│   │   ├── page.tsx                           # Public Studio Tenant Showcase
│   │   ├── book/page.tsx                      # Cinema-Style Booking & Slot Hold
│   │   ├── checkout/page.tsx                  # Checkout (Card, QR, Cash)
│   │   ├── proposals/[proposalId]/page.tsx    # Interactive Proposal Builder
│   │   ├── vault/[projectId]/page.tsx         # Delivery Vault & 50% Paywall
│   │   ├── set-hud/[callSheetId]/page.tsx     # On-Set Mobile Companion / Call Sheet
│   │   ├── releases/[projectId]/page.tsx      # Digital Talent/Location Release Form
│   │   ├── visualizer/page.tsx                # Interactive Print & Frame Wall Visualizer
│   │   └── admin/                             # Studio Admin Portal
│   │       ├── layout.tsx                     # Tenant Admin Shell & Navigation
│   │       ├── page.tsx                       # Studio Admin Dashboard & Metrics
│   │       ├── verification/page.tsx          # Manual Payment Verification Console
│   │       ├── services/page.tsx              # Packages & Categories CRUD
│   │       ├── calendar/page.tsx              # Calendar Slots & Holding CRUD
│   │       ├── proposals/page.tsx             # Proposal & Add-On Templates CRUD
│   │       ├── inventory/page.tsx             # Gear Inventory & Kit BOM CRUD
│   │       ├── frames/page.tsx                # Frames & Print Sizes CRUD
│   │       ├── cms/page.tsx                   # Showcase Portfolio CMS CRUD
│   │       └── settings/page.tsx              # Studio Settings & Bank Details CRUD
│   ├── api/
│   │   ├── upload/route.ts                    # Local File Upload Route Handler
│   │   └── download/route.ts                  # Secure Paywall Gated Download Handler
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                                    # shadcn/ui Primitive Components
│   ├── showcase/                              # Showcase & Booking UI
│   ├── checkout/                              # Checkout & Verification Components
│   ├── proposals/                             # Proposal & Add-On Components
│   ├── vault/                                 # Delivery Vault & Paywall Banners
│   ├── logistics/                             # Call Sheet, Solar HUD & Release Canvas
│   ├── gear/                                  # Gear Inventory & BOM Inspectors
│   └── visualizer/                            # Wall Mockup & Frame Configurator
├── lib/
│   ├── db.ts                                  # Prisma Client Singleton
│   ├── actions/                               # Server Actions by Domain
│   │   ├── onboarding.ts
│   │   ├── booking.ts
│   │   ├── checkout.ts
│   │   ├── proposals.ts
│   │   ├── vault.ts
│   │   ├── logistics.ts
│   │   ├── gear.ts
│   │   ├── visualizer.ts
│   │   └── admin-crud.ts
│   ├── solar.ts                               # Solar Golden Hour Algorithmic Calculations
│   ├── whatsapp.ts                            # WhatsApp URL & Dispatch Message Formatter
│   └── utils.ts
├── prisma/
│   ├── schema.prisma                          # Full 24-Model Prisma Schema
│   ├── migrations/                            # SQLite Migration Files
│   └── seed.ts                                # Rich Multi-Tenant Demonstration Seed Script
├── public/
│   └── uploads/                               # Local Media Storage Root
└── tests/
    └── e2e/                                   # Opaque-Box E2E Test Suite (Tiers 1-4 & Tier 5)
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Framework & Tooling Scaffolding | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui setup | M1 | R1, docs/07 |
| 2 | Complete 24-Model Prisma Schema | Relational schema with all models, indexes, and cascades | M1 | R1, docs/03, docs/ARCHITECTURE_PLAN |
| 3 | SQLite Migration & Database Engine | Portable `dev.db` database initialized cleanly | M1 | R1, docs/03, docs/07 |
| 4 | Rich Multi-Tenant Seed Script | Comprehensive seed data covering 2 studios and all 24 models | M1 | R1, docs/03, docs/07 |
| 5 | Local Media Storage Infrastructure | `public/uploads` local file storage & upload route handler | M1 | R1, docs/07 |
| 6 | Multi-Tenant Path & Domain Middleware | Next.js middleware for tenant resolution via path and host | M2 | R2, docs/02 |
| 7 | SaaS Platform Landing Page (`/`) | Brand landing page, value props, feature overview, CTA | M2 | R2, docs/01 |
| 8 | Self-Service Studio Onboarding (`/create-studio`) | Dynamic multi-step studio registration & tenant creation | M2 | R2, docs/01, docs/06 |
| 9 | Platform Super-Admin Console (`/super-admin`) | Platform-level metrics across all registered studio tenants | M2 | R2, docs/01 |
| 10 | Public Tenant Showcase (`/[tenantSlug]`) | Hero, portfolio grid, testimonials, about, category filters | M2 | R2, docs/01, docs/05 |
| 11 | Campaign Category Filters | Filter portfolio & slots by Convocation, Hari Raya, Weddings, Commercial | M2 | R2, docs/01 |
| 12 | Cinema-Style Slot Selection Grid | Interactive calendar slot grid displaying status and pricing | M2 | R2, docs/01, docs/06 |
| 13 | 10-Minute Slot Holding Engine | Atomic conditional hold query preventing race conditions | M2 | R2, docs/02, docs/04 |
| 14 | Slot Countdown Timer UI | Monospaced tabular countdown with warning pulse under 2 mins | M2 | R2, docs/05 |
| 15 | Multi-Option Checkout System | Checkout supporting Online Card, QR code scan, and Cash counter | M3 | R3, docs/01, docs/04 |
| 16 | Simulated Online Card Checkout | Local self-contained card checkout with instant confirmation | M3 | R3, docs/04, docs/07 |
| 17 | Studio QR Code Scan & Receipt Upload | QR code display with receipt slip image upload | M3 | R3, docs/01, docs/04 |
| 18 | Cash Counter Payment Option | Walk-in / counter booking with cash invoice generation | M3 | R3, docs/01, docs/04 |
| 19 | Studio Manual Verification Console | Pending transaction queue with 1-click approve/reject actions | M3 | R3, docs/01, docs/04 |
| 20 | Interactive Proposal Builder | Proposal viewer with dynamic line-item add-on toggling | M3 | R3, docs/01, docs/04 |
| 21 | Live Deposit & Balance Recalculator | Real-time animated subtotal, 50% deposit, and 50% balance update | M3 | R3, docs/01, docs/05 |
| 22 | Touchscreen Digital Signature Pad | 60fps canvas signature capture for proposal acceptance | M3 | R3, docs/01, docs/05 |
| 23 | 50% Retainer Milestone Invoicing | Automatic generation of RETAINER_50 invoice upon proposal sign | M3 | R3, docs/01, docs/04 |
| 24 | Direct Delivery Vault UI | Client asset review gallery with photo grid and video player | M3 | R3, docs/01, docs/05 |
| 25 | 50% Final Balance Paywall Gating | Restricted watermarked previews and streaming video proxy | M3 | R3, docs/02, docs/04 |
| 26 | Master Deliverable Download Unlock | Instant high-res photo ZIP and 4K ProRes master unlock on payment | M3 | R3, docs/02, docs/04 |
| 27 | Client Favorites & Retouch Feedback | Hearting favorite photos and submitting retouch notes | M3 | R3, docs/04 |
| 28 | Dynamic On-Set Call Sheet | Call sheet with call times, location pin, parking, hospital info | M4 | R4, docs/01, docs/06 |
| 29 | Solar Golden Hour Calculation Engine | Algorithm computing sunrise, sunset, morning/evening golden hours | M4 | R4, docs/04 |
| 30 | 1-Click WhatsApp Dispatch Links | Pre-formatted `wa.me/?text=...` call sheet dispatch generation | M4 | R4, docs/04 |
| 31 | Mobile On-Set Shot List HUD | High-contrast mobile shot list with 48px touch check-offs | M4 | R4, docs/01, docs/05 |
| 32 | Digital Talent & Location Releases | Mobile touchscreen release forms capturing legal signatures | M4 | R4, docs/01, docs/04 |
| 33 | Gear Inventory Management | Inventory registry with serials, conditions, and availability | M4 | R4, docs/01, docs/03 |
| 34 | Kit Bundles & Equipment BOM | Pre-configured gear bundle recipes (BOM) for shoots | M4 | R4, docs/01, docs/03 |
| 35 | Pre/Post-Shoot Inspection Logs | Check-out and check-in condition logs with maintenance flagging | M4 | R4, docs/01, docs/04 |
| 36 | Interactive Wall Art Visualizer | Dual-pane visualizer with living room mockup & 84" sofa anchor | M4 | R4, docs/01, docs/05 |
| 37 | Real-Scale Print Sizing Engine | Accurate scaling for 8R, 12R, 16R print dimensions | M4 | R4, docs/01, docs/04 |
| 38 | Custom Frame Molding Renderer | Dynamic frame moldings (Matte Black, Walnut, Gold) | M4 | R4, docs/01, docs/05 |
| 39 | 1-Click Print Order Invoicing | Instant generation of PRINT_FRAME_ORDER milestone invoice | M4 | R4, docs/01, docs/04 |
| 40 | Studio Admin Packages & Categories CRUD | Full CRUD for service packages and campaign categories | M5 | R5, docs/01, docs/04 |
| 41 | Studio Admin Calendar Slots CRUD | Full CRUD for calendar slots, pricing, and availability | M5 | R5, docs/01, docs/04 |
| 42 | Studio Admin Proposal Add-Ons CRUD | Full CRUD for proposal add-on templates | M5 | R5, docs/01, docs/04 |
| 43 | Studio Admin Frames & Print Sizes CRUD | Full CRUD for frame moldings and print dimensions | M5 | R5, docs/01, docs/04 |
| 44 | Studio Admin Gear Inventory & BOM CRUD | Full CRUD for equipment items and kit bundle recipes | M5 | R5, docs/01, docs/04 |
| 45 | Studio Admin Showcase CMS & Settings CRUD | Full CRUD for portfolio showcase items and studio branding/bank | M5 | R5, docs/01, docs/04 |
| 46 | Strict TypeScript Compilation Verification | `tsc --noEmit` exits with status 0 and zero errors | M5 | R5 |
| 47 | Production Build Verification | `pnpm build` completes with status 0 and zero errors | M5 | R5 |
| 48 | Comprehensive E2E Test Suite (Tiers 1-4) | Opaque-box requirement-driven test suite passing 100% | M6 | Acceptance Criteria |
| 49 | Adversarial Coverage Hardening (Tier 5) | White-box stress testing and boundary hardening | M6 | Acceptance Criteria |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | `m1_scaffolding_database` | Framework Scaffolding, 24 Prisma Models, SQLite DB, Seeding, Local Media Uploads (Features 1-5) | none | DONE |
| M2 | `m2_saas_onboarding_showcase` | SaaS Landing, Studio Onboarding, Super-Admin, Showcase, Category Filters, 10-Min Slot Holding (Features 6-14) | M1 | DONE |
| M3 | `m3_checkout_proposals_vault` | Multi-Mode Checkout, Verification Console, Proposal Builder, 50% Retainer, Paywall Vault, Master Unlocking (Features 15-27) | M1, M2 | DONE |
| M4 | `m4_logistics_gear_wall` | Call Sheets, Solar Engine, WhatsApp Dispatch, Mobile Shot List, Releases, Gear BOM, Wall Visualizer (Features 28-39) | M1, M3 | DONE |
| M5 | `m5_admin_crud_production_verification` | Dynamic Admin CRUD (9 domains), TypeScript Compilation (`tsc`), Production Build (`pnpm build`) (Features 40-47) | M1, M2, M3, M4 | DONE |
| M6 | `m6_e2e_integration_verification` | Final Integration: Pass 100% E2E Tests (Tiers 1-4) + Adversarial Hardening (Tier 5) (Features 48-49) | M5, E2E Track | PLANNED |

### Parallel Track: E2E Testing
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | `e2e_testing_track` | Opaque-box test infrastructure and comprehensive test suite across Tiers 1-4 (Features 1-47) | M1 (Schema ready) | PLANNED |

---

## Interface Contracts

### 1. Database & Multi-Tenant Scoping Contract (`lib/db.ts`)
- All database operations utilize a shared PrismaClient singleton.
- Every tenant-scoped entity query MUST enforce `{ where: { tenantId } }`.
- Models without direct `tenantId` MUST be reached via tenant-scoped relations (e.g. `Project -> Tenant`).

### 2. Slot Holding Contract (`lib/actions/booking.ts`)
```typescript
interface HoldSlotInput {
  slotId: string;
  sessionId: string;
}
interface HoldSlotResult {
  success: boolean;
  heldUntil?: Date;
  error?: string;
}
// Atomically leases slot for exactly 10 minutes if AVAILABLE or expired HELD
```

### 3. Payment Verification & Paywall Contract (`lib/actions/checkout.ts`, `lib/actions/vault.ts`)
```typescript
interface VerifyPaymentInput {
  invoiceId: string;
  staffName: string;
  notes?: string;
}
// When invoice.milestoneType === 'FINAL_BALANCE_50' and status is set to 'PAID',
// MUST atomically set Project.isFinalBalancePaid = true.
// Vault download route checks Project.isFinalBalancePaid before serving high-res photo ZIP and 4K master video.
```

### 4. Solar Golden Hour Contract (`lib/solar.ts`)
```typescript
interface SolarTimes {
  sunrise: string;       // HH:mm format
  sunset: string;        // HH:mm format
  goldenHourMorning: string; // e.g. "06:45 - 07:30"
  goldenHourEvening: string; // e.g. "18:15 - 19:00"
}
function calculateGoldenHour(lat: number, lng: number, date: Date): SolarTimes;
```

### 5. WhatsApp Call Sheet Dispatch Contract (`lib/whatsapp.ts`)
```typescript
function generateWhatsAppCallSheetUrl(callSheet: CallSheetWithDetails): {
  url: string; // "https://wa.me/?text=..."
  previewText: string;
};
```
