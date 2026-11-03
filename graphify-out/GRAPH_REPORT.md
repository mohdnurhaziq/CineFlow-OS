# Graph Report - Production Management System  (2026-11-03)

## Corpus Check
- 311 files · ~593,132 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: .css 5, .example 1, (none) 1)

## Summary
- 2332 nodes · 4878 edges · 169 communities (155 shown, 14 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 147 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `60ebca9f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- assets.mjs
- cinema-booking-shell.tsx
- Skeleton
- Draw Tool Scripts
- Payment Verification Actions
- Calendar & Slot Generator
- Inspect Tool Scripts
- Booking Slot Management
- actions/visualizer.ts
- Runtime Dependencies
- Dev Dependencies
- Set HUD & Call Sheets
- onboardStudio
- Charts Library
- Frames Admin
- Wall Art Visualizer
- App-Draw Scripts
- E2E Test Harness
- scenes.mjs
- Upload Route
- Services Admin
- Showcase Gallery UI
- Checkout Flow
- Error Boundaries
- TypeScript Config
- Animation Recipes
- Proposal Page
- 6. Recipes
- Gear Inventory
- actions/admin-settings.ts
- Logistics & Visualizer Actions
- Prisma Enums
- Proposals Admin
- shadcn Config
- Gear Bundles & WhatsApp
- Services Validation
- Gear Actions & Schemas
- getOne
- Lint Tooling
- actions/admin-cms.ts
- admin/layout.tsx
- NPM Scripts
- Imagery
- Multi-Tenant Architecture
- Zip Download Route
- Digital Releases
- Proposal Templates
- Notifications
- Health Check & Env
- Login & Not-Found
- session.ts
- Studio Settings
- Stage Tooling
- cdp.mjs
- Verification Console
- Prisma Client Deps
- README Feature Set
- Docs Suite
- Admin Dashboard
- booking-intake-modal.tsx
- my-booking.ts
- @radix-ui/react-dialog@^1.1.6
- ref_node_path
- Milestones M1-M4
- vault-shell.tsx
- pnpm Workspace
- Hardening & E2E Tiers
- Proposal & Invoicing Features
- Design Skill App Data
- OpenAI Agent Config
- SaaS Layout & Footer
- CineFlow OS — Server Actions & API Specification
- On-Set Logistics Toolkit
- Client Delivery Vault
- Graphify Rules
- OpenAI Agent Yaml
- Design Skill Screen Data 76
- Design Skill Screen Data 77
- Design Skill Screen Data 78
- Design Skill Screen Data 79
- Design Skill Screen Data 80
- Design Skill Screen Data 81
- Design Skill Screen Data 82
- Design Skill Screen Data 83
- Design Skill Screen Data 84
- Design Skill Screen Data 85
- Design Skill Screen Data 86
- Design Skill Screen Data 87
- Design Skill Screen Data 88
- cn
- Radix Popover
- clsx
- Systematic Debugging & Error Triage Skill
- client-dashboard.tsx
- React DOM
- Gear Inspection Docs
- 2. Model Definitions & Field Specifications
- The run
- docs/README.md
- base
- The Design System Page
- Commands
- The study
- getJson
- Full-Stack Application Scaffolding Skill
- Accessible UI Component Design & Styling Skill
- Database Schema Design & Migrations Skill
- Find Skills
- Customization & Theming
- API & Backend Implementation Skill
- Layout
- Design Systems from DESIGN.md
- Component Composition
- Styling & Customization
- Colour
- Scroll scenes
- Tools
- shadcn/ui
- App screens
- Tells — the dated registry
- Type
- Chat & Messaging
- 7. Tables and lists
- Words
- 2. The Studio Operations Journey: Full Day-to-Day Control
- Build Awwwards-Quality Sites
- 2. The run for an app screen
- Critique — judging the render
- Design Engineering
- Base vs Radix
- CineFlow OS — Product Requirements Specification (PRD)
- Implementation Plan: CineFlow OS — The Multi-Tenant Operating System for Photographers & Videographers
- phone
- Component Building Principles
- Step 4: Map Tokens to the Theme
- Registry Authoring and Addresses
- Forms & Inputs
- Critical Rules
- 1. The Client Journey: From Discovery to Master Delivery
- tasteskill v2 (`design-taste-frontend`)
- Foundations
- app/layout.tsx
- CineFlow OS — Design System & UI Guidelines ("Nocturne Cine")
- 9. Type and colour
- The Animation Decision Framework
- clip-path for Animation
- Performance Rules
- Gesture and Drag Interactions
- color-pair.tsx
- CineFlow OS — Deployment & Configuration Guide
- 3. The shell
- 4. The canvas and the page title
- 6. Charts
- CSS Transform Mastery
- The Sonner Principles (Building Loved Components)
- Spring Animations
- Icons
- 8. Forms and settings
- Core Philosophy
- Debugging Animations
- date-fns@^4.1.0
- @radix-ui/react-avatar@^1.1.3
- @radix-ui/react-checkbox@^1.1.4
- @radix-ui/react-toggle@^1.1.2
- @radix-ui/react-tooltip@^1.1.8

## God Nodes (most connected - your core abstractions)
1. `next` - 96 edges
2. `lucide-react` - 91 edges
3. `db` - 77 edges
4. `react` - 67 edges
5. `runAdminVerificationTests()` - 34 edges
6. `holdBookingSlot()` - 33 edges
7. `getOne()` - 31 edges
8. `runTier4RealWorldScenariosTests()` - 29 edges
9. `runChallengerSuite()` - 28 edges
10. `TestHarness` - 27 edges

## Surprising Connections (you probably didn't know these)
- ``CampaignCategory`` --references--> `slug()`  [INFERRED]
  docs/03_DATABASE_SCHEMA_AND_MODELS.md → .agents/skills/design-taste-frontend/scripts/assets.mjs
- ``Tenant`` --references--> `slug()`  [INFERRED]
  docs/03_DATABASE_SCHEMA_AND_MODELS.md → .agents/skills/design-taste-frontend/scripts/assets.mjs
- `Component Selection` --references--> `Skeleton()`  [INFERRED]
  .agents/skills/shadcn/SKILL.md → components/ui/skeleton.tsx
- `Use Components, Not Custom Markup → [composition.md](./rules/composition.md)` --references--> `Skeleton()`  [INFERRED]
  .agents/skills/shadcn/SKILL.md → components/ui/skeleton.tsx
- `Type scale` --references--> `cn()`  [INFERRED]
  .agents/skills/shadcn/design-system.md → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **On-Set Logistics Toolkit** — project_solar_engine, project_whatsapp_dispatch, project_call_sheet_hud, project_digital_releases [EXTRACTED 0.95]
- **Final Balance Paywall Delivery Flow** — project_payment_verification_console, project_payment_paywall_contract, project_final_balance_paywall, project_download_route, project_delivery_vault [EXTRACTED 0.95]
- **graphify Knowledge Graph Workflow** — claude_graphify_rules, claude_graphify_query_first, claude_graphify_update, claude_graphify_out, _claude_claude_graphify [INFERRED 0.85]

## Communities (169 total, 14 thin omitted)

### Community 0 - "assets.mjs"
Cohesion: 0.09
Nodes (26): AIC_FIELDS, AIC_HEADERS, ARCHIVE_LICENCE, args, argv, fail(), fits(), FLAGS (+18 more)

### Community 1 - "cinema-booking-shell.tsx"
Cohesion: 0.14
Nodes (15): BookingPage(), BookingPageProps, CategoryData, CinemaBookingShell(), CinemaBookingShellProps, TenantData, BookingSlotItem, CinemaSlotGrid() (+7 more)

### Community 2 - "Skeleton"
Cohesion: 0.18
Nodes (11): SaasLoading(), AdminLoading(), BookLoading(), CheckoutLoading(), TenantShowcaseLoading(), ProposalLoading(), ReleaseLoading(), SetHudLoading() (+3 more)

### Community 3 - "Draw Tool Scripts"
Cohesion: 0.10
Nodes (41): adjustments(), argv, assetQueries(), ASSETS_PATH, briefStop(), briefWords(), deal(), dealHero() (+33 more)

### Community 4 - "Payment Verification Actions"
Cohesion: 0.11
Nodes (41): approvePaymentVerification(), ApprovePaymentVerificationInput, ApprovePaymentVerificationSchema, rejectPaymentVerification(), RejectPaymentVerificationInput, RejectPaymentVerificationSchema, safeRevalidate(), CreateBookingInput (+33 more)

### Community 5 - "Calendar & Slot Generator"
Cohesion: 0.11
Nodes (31): AdminCalendarPage(), CalendarPageProps, BatchGeneratorDialog(), BatchGeneratorDialogProps, DAYS, CalendarAdminDashboard(), CalendarAdminDashboardProps, ForceReleaseDialog() (+23 more)

### Community 6 - "Inspect Tool Scripts"
Cohesion: 0.07
Nodes (29): allow, appMode, args, asJson, dealtFonts, fails, film, HEIGHT (+21 more)

### Community 7 - "Booking Slot Management"
Cohesion: 0.23
Nodes (40): 7. Dynamic Settings CRUD Actions (`src/server/actions/settings.ts`), batchDeleteBookingSlots(), batchGenerateBookingSlots(), cleanupExpiredHolds(), createSingleBookingSlot(), deleteBookingSlot(), forceReleaseHeldSlot(), safeRevalidate() (+32 more)

### Community 8 - "actions/visualizer.ts"
Cohesion: 0.31
Nodes (6): safeRevalidate(), CreatePrintOrderInput, CreatePrintOrderSchema, check(), findings, runReviewerAdversarialTests()

### Community 9 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, bcryptjs@^2.4.3, canvas-confetti@^1.9.4, class-variance-authority@^0.7.1, lucide-react@^0.475.0, next@^15.1.0, next-themes@^0.4.4, @radix-ui/react-accordion@^1.2.3 (+25 more)

### Community 10 - "Dev Dependencies"
Cohesion: 0.08
Nodes (33): devDependencies, eslint@^9.19.0, eslint-config-next@^15.1.0, postcss@^8.5.1, prisma@^6.3.0, tailwindcss@^4.0.0, @tailwindcss/postcss@^4.0.0, tsx@^4.19.2 (+25 more)

### Community 11 - "Set HUD & Call Sheets"
Cohesion: 0.13
Nodes (23): SetHudPage(), SetHudPageProps, CallSheetDetails, CallSheetShell(), CallSheetShellProps, CrewRosterCard(), CrewRosterCardProps, ShotItemData (+15 more)

### Community 12 - "onboardStudio"
Cohesion: 0.06
Nodes (55): COLOR_PRESETS, CreateStudioPage(), metadata, SuperAdminPage(), SuperAdminView(), SuperAdminViewProps, TenantSummaryItem, getTenantBookingSlots() (+47 more)

### Community 13 - "Charts Library"
Cohesion: 0.20
Nodes (26): axes(), bars(), dayHeads(), diverging(), frame(), hits(), kindStyle(), lane() (+18 more)

### Community 14 - "Frames Admin"
Cohesion: 0.11
Nodes (31): AdminFramesPage(), FramesPageProps, FrameDesignDialog(), FrameDesignDialogProps, FrameDesignRow, MATERIALS, PRESET_COLORS, FramesManager() (+23 more)

### Community 15 - "Wall Art Visualizer"
Cohesion: 0.16
Nodes (20): VisualizerPage(), VisualizerPageProps, ConfiguratorPanel(), ConfiguratorPanelProps, FrameDesignOption, PhotoOption, PrintSizeOption, FrameCanvas() (+12 more)

### Community 16 - "App-Draw Scripts"
Cohesion: 0.12
Nodes (22): argv, deal(), dealScreen(), dealShell(), dealStyle(), fontLink(), HERE, kebab() (+14 more)

### Community 17 - "E2E Test Harness"
Cohesion: 0.20
Nodes (11): GET(), runMasterTestSuite(), SuiteSummary, TestHarness, TestResult, runFrameworkStorageTests(), runCheckoutVaultTests(), runTier3CrossFeatureTests() (+3 more)

### Community 18 - "scenes.mjs"
Cohesion: 0.21
Nodes (9): args, go(), only, outDir, problems, rel(), run(), sheet() (+1 more)

### Community 19 - "Upload Route"
Cohesion: 0.11
Nodes (12): 3. Inputs & Prerequisites, ALLOWED_FOLDERS, ALLOWED_TYPES, POST(), challengeBusinessInvariants(), challengeMultiTenantIsolation(), ChallengeResult, challengeSeedIdempotency() (+4 more)

### Community 20 - "Services Admin"
Cohesion: 0.19
Nodes (15): AdminServicesPage(), ServicesPageProps, CategoryDialog(), CategoryDialogProps, CategoryRow, EMOJI_PRESETS, CategoryList(), CategoryListProps (+7 more)

### Community 21 - "Showcase Gallery UI"
Cohesion: 0.08
Nodes (32): PageProps, TenantShowcasePage(), CategoryFilterBar(), CategoryFilterBarProps, CategoryItem, ClientTestimonials(), ClientTestimonialsProps, TESTIMONIALS (+24 more)

### Community 22 - "Checkout Flow"
Cohesion: 0.16
Nodes (14): CardPaymentForm(), CardPaymentFormProps, CashPaymentForm(), CashPaymentFormProps, CheckoutShell(), CheckoutShellProps, OrderSummaryCard(), OrderSummaryCardProps (+6 more)

### Community 23 - "Error Boundaries"
Cohesion: 0.15
Nodes (12): metadata, SaasLandingPage(), FeaturesGrid(), PILLARS, InteractiveTeasers(), PricingTiers(), TIERS, SaasHero() (+4 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, jsx, lib (+13 more)

### Community 25 - "Animation Recipes"
Cohesion: 0.06
Nodes (31): Accordion / collapse, Animation Recipes, Button press, Drag to dismiss, Drawer / sheet, Dropdown, popover, menu, select, Hold to confirm, Masking a crossfade that won't settle (+23 more)

### Community 26 - "Proposal Page"
Cohesion: 0.15
Nodes (14): ProposalPage(), ProposalPageProps, AddOnItem, AddonsSelector(), AddonsSelectorProps, PricingBreakdown(), PricingBreakdownProps, ProposalViewer() (+6 more)

### Community 27 - "6. Recipes"
Cohesion: 0.06
Nodes (31): 10. Rules for motion, 1. The budget, 2. What strong pages do with motion, 3. Four questions before any animation, 4. Tokens, 5. Scroll behaviours, ranked, 6. Recipes, 7. Signature moves (+23 more)

### Community 28 - "Gear Inventory"
Cohesion: 0.14
Nodes (22): InventoryPage(), InventoryPageProps, GearDashboard(), GearDashboardProps, CATEGORIES, CONDITIONS, DISCIPLINES, GearItemDialog() (+14 more)

### Community 29 - "actions/admin-settings.ts"
Cohesion: 0.47
Nodes (3): safeRevalidate(), UpdateStudioSettingsInput, UpdateStudioSettingsSchema

### Community 30 - "Logistics & Visualizer Actions"
Cohesion: 0.31
Nodes (6): SubmitDigitalReleaseInput, SubmitDigitalReleaseSchema, ToggleShotCompletionInput, ToggleShotCompletionSchema, assert(), runChallengerSuite()

### Community 31 - "Prisma Enums"
Cohesion: 0.11
Nodes (18): BookingStatus, DeliverableItemType, DeliverableStatus, InventoryCondition, InventoryStatus, InvoiceStatus, MilestoneType, PaymentMethod (+10 more)

### Community 32 - "Proposals Admin"
Cohesion: 0.22
Nodes (13): AdminProposalsPage(), ProposalsPageProps, AddOnTemplateDialog(), AddOnTemplateDialogProps, ProposalAddOnTemplateRow, UNITS, AddOnTemplateTable(), AddOnTemplateTableProps (+5 more)

### Community 33 - "shadcn Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 34 - "Gear Bundles & WhatsApp"
Cohesion: 0.27
Nodes (25): checkBundleAvailability(), createEquipmentReservation(), createGearItem(), createKitBundle(), deleteGearItem(), logPostShootInspection(), logPreShootInspection(), safeRevalidate() (+17 more)

### Community 35 - "Services Validation"
Cohesion: 0.22
Nodes (16): CreateCampaignCategoryInput, CreateCampaignCategorySchema, CreateServicePackageInput, CreateServicePackageSchema, DeleteCampaignCategoryInput, DeleteCampaignCategorySchema, DeleteServicePackageInput, DeleteServicePackageSchema (+8 more)

### Community 36 - "Gear Actions & Schemas"
Cohesion: 0.20
Nodes (16): updateGearConditionStatus(), CreateGearItemInput, CreateGearItemSchema, CreateKitBundleInput, CreateKitBundleSchema, CreateReservationInput, CreateReservationSchema, KitBundleItemInputSchema (+8 more)

### Community 37 - "getOne"
Cohesion: 0.20
Nodes (26): clock(), credit(), creditRequired(), creditsPath(), dims(), esc(), getAll(), getOne() (+18 more)

### Community 38 - "Lint Tooling"
Cohesion: 0.14
Nodes (13): APP_LEVEL, appMode, args, asJson, byId, EXT, files, findings (+5 more)

### Community 39 - "actions/admin-cms.ts"
Cohesion: 0.16
Nodes (23): AdminCmsPage(), CmsPageProps, CmsManager(), CmsManagerProps, CategoryOption, DISCIPLINES, PackageOption, ShowcaseItemDialog() (+15 more)

### Community 40 - "admin/layout.tsx"
Cohesion: 0.43
Nodes (5): AdminLayout(), AdminLayoutProps, AdminNavBar(), AdminNavBarProps, AdminUserNav()

### Community 41 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:push, db:seed, db:studio, dev, lint, prisma:generate (+6 more)

### Community 42 - "Imagery"
Cohesion: 0.09
Nodes (22): 10. Markup and credits, 11. Video, 12. Where pictures and footage go, 1. What the study measured, 2. Decide what imagery exists, 3. Real pictures from the open collections, 4. The dealt photographs, 5. Cropping and placing (+14 more)

### Community 43 - "Multi-Tenant Architecture"
Cohesion: 0.18
Nodes (11): CineFlow OS (Multi-Tenant Creative Operating System), Local Media Storage (public/uploads), Nocturne Cine Aesthetic, 24-Model Prisma Schema (SQLite dev.db), SaaS Platform Layer (landing, create-studio onboarding, super-admin), Multi-Tenant Seed Script (prisma/seed.ts), Tech Stack (Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma, SQLite), Public Tenant Showcase and Campaign Category Filters (+3 more)

### Community 44 - "Zip Download Route"
Cohesion: 0.18
Nodes (12): safeRevalidate(), submitRetouchNote(), SubmitRetouchNoteSchema, toggleClientFavorite(), ToggleFavoriteSchema, createZipArchive(), ZipFileEntry, assert() (+4 more)

### Community 45 - "Digital Releases"
Cohesion: 0.23
Nodes (8): ReleasesPage(), ReleasesPageProps, ExistingRelease, ReleaseFormShell(), ReleaseFormShellProps, Point, ReleaseSignaturePad(), ReleaseSignaturePadProps

### Community 46 - "Proposal Templates"
Cohesion: 0.32
Nodes (10): CreateProposalAddOnTemplateInput, CreateProposalAddOnTemplateSchema, DeleteProposalAddOnTemplateInput, DeleteProposalAddOnTemplateSchema, ToggleTemplateActiveInput, ToggleTemplateActiveSchema, ToggleTemplateDefaultInput, ToggleTemplateDefaultSchema (+2 more)

### Community 47 - "Notifications"
Cohesion: 0.15
Nodes (12): BookingConfirmedPayload, getNotificationHistory(), NotificationChannel, NotificationEvent, notificationLog, NotificationPayload, NotificationResult, PaymentApprovedPayload (+4 more)

### Community 48 - "Health Check & Env"
Cohesion: 0.18
Nodes (8): dynamic, robots(), sitemap(), DEV_FALLBACK_AUTH_SECRET, Env, env, envSchema, runM1Verification()

### Community 49 - "Login & Not-Found"
Cohesion: 0.31
Nodes (6): LoginPageProps, StudioLoginPage(), StudioLoginForm(), StudioLoginFormProps, nextConfig, next

### Community 50 - "session.ts"
Cohesion: 0.18
Nodes (16): AdminUserNavProps, ClientAuthPanelProps, registerClient(), RegisterClientInput, RegisterClientResult, RegisterSchema, loginWithCredentials(), COOKIE_NAME (+8 more)

### Community 51 - "Studio Settings"
Cohesion: 0.24
Nodes (8): AdminSettingsPage(), SettingsPageProps, BRAND_PRESET_COLORS, CURRENCIES, DISCIPLINES, StudioSettingsForm(), StudioSettingsFormProps, StudioTenantData

### Community 53 - "cdp.mjs"
Cohesion: 0.18
Nodes (6): alive(), Browser, findChrome(), Page, sleep(), sweepProfiles()

### Community 54 - "Verification Console"
Cohesion: 0.29
Nodes (6): AdminVerificationPage(), VerificationPageProps, AdminVerificationConsole(), AdminVerificationConsoleProps, ReceiptLightboxModal(), ReceiptLightboxModalProps

### Community 55 - "Prisma Client Deps"
Cohesion: 0.29
Nodes (9): @prisma/client@^6.3.0, @prisma/client, prisma, recordFail(), recordPass(), results, runEmpiricalStressSuite(), testFk() (+1 more)

### Community 56 - "README Feature Set"
Cohesion: 0.24
Nodes (9): CineFlow OS README (Complete OS for Photographers, Videographers and Studios), Frictionless 3-Field Client Onboarding, 100% Dynamic Settings (Full CRUD), Kanban Production Pipeline, Flexible Payment Methods (Card, Studio QR DuitNow, Cash), Interactive Proposal Engine with Digital Signature, Public Showcase and Cinema-Style Calendar Booking, Studio Operations and Gear BOM (+1 more)

### Community 57 - "Docs Suite"
Cohesion: 0.20
Nodes (10): docs/01 Product Requirements Specification, docs/02 System Architecture and Data Flows, docs/03 Database Schema and Data Models, docs/04 Server Actions and API Specification, docs/05 Design System and UI Guidelines, docs/06 User Journey and Operations Manual, docs/07 Deployment and Configuration Guide, docs/ARCHITECTURE_PLAN Detailed Architecture Plan (+2 more)

### Community 58 - "Admin Dashboard"
Cohesion: 0.42
Nodes (6): AdminDashboardPage(), AdminPageProps, StudioDashboard(), StudioDashboardProps, getStudioAnalytics(), StudioAnalyticsData

### Community 59 - "booking-intake-modal.tsx"
Cohesion: 0.16
Nodes (15): CheckoutPage(), CheckoutPageProps, ClientRegisterPage(), metadata, RegisterPageProps, ClientAuthPanel(), ClientRegisterCard(), ClientRegisterCardProps (+7 more)

### Community 60 - "my-booking.ts"
Cohesion: 0.13
Nodes (17): MyBookingPage(), MyBookingPageProps, humanize(), MyBookingLookup(), MyBookingLookupProps, STATUS_STYLES, StatusBadge(), attempts (+9 more)

### Community 62 - "ref_node_path"
Cohesion: 0.13
Nodes (13): Address Schemes, components, missing, source, [uiArg, ...roots], uiDir, walk(), main() (+5 more)

### Community 63 - "Milestones M1-M4"
Cohesion: 0.25
Nodes (7): Milestone M1 m1_scaffolding_database (DONE), Milestone M2 m2_saas_onboarding_showcase (DONE), Milestone M3 m3_checkout_proposals_vault (DONE), Milestone M4 m4_logistics_gear_wall (DONE), Slot Countdown Timer UI, Slot Holding Contract (HoldSlotInput, HoldSlotResult), Cinema-Style 10-Minute Slot Holding Engine

### Community 64 - "vault-shell.tsx"
Cohesion: 0.18
Nodes (14): ProjectVaultPage(), VaultPageProps, PaywallBanner(), PaywallBannerProps, PhotoGrid(), PhotoGridProps, PhotoItem, RetouchNotesModal() (+6 more)

### Community 65 - "pnpm Workspace"
Cohesion: 0.29
Nodes (6): allowBuilds, esbuild, prisma, @prisma/client, @prisma/engines, unrs-resolver

### Community 66 - "Hardening & E2E Tiers"
Cohesion: 0.29
Nodes (7): Adversarial Coverage Hardening (Tier 5), TypeScript and Production Build Verification (tsc, pnpm build), Parallel E2E Testing Track (Tiers 1-4, opaque-box), Milestone M5 m5_admin_crud_production_verification (DONE), Milestone M6 m6_e2e_integration_verification (PLANNED), Server Actions by Domain (lib/actions), Studio Admin Console (CRUD across 9 domains, no hardcoded business logic)

### Community 67 - "Proposal & Invoicing Features"
Cohesion: 0.29
Nodes (7): Digital Talent and Location Releases, Interactive Proposal Builder with Live Deposit Recalculator, 1-Click Print Order Invoicing (PRINT_FRAME_ORDER), 50% Retainer Milestone Invoicing (RETAINER_50), Touchscreen Digital Signature Pad (canvas), Wall Art Visualizer (84-inch sofa anchor, frames, print sizes), Interactive Print and Frame Wall Visualizer

### Community 68 - "Design Skill App Data"
Cohesion: 0.33
Nodes (5): about, patterns, shells, styles, version

### Community 69 - "OpenAI Agent Config"
Cohesion: 0.33
Nodes (5): interface, display_name, icon_large, icon_small, short_description

### Community 70 - "SaaS Layout & Footer"
Cohesion: 0.60
Nodes (3): SaasLayout(), SaasFooter(), SaasNavbar()

### Community 71 - "CineFlow OS — Server Actions & API Specification"
Cohesion: 0.10
Nodes (20): 2. Cinema-Style Booking Actions (`src/server/actions/booking.ts`), 3. Milestone Billing & Payment Verification Actions (`src/server/actions/payments.ts`), 4. Interactive Proposal Actions (`src/server/actions/proposals.ts`), 5. Pre-Production & On-Set Logistics Actions (`src/server/actions/logistics.ts`), 6. Deliverables Vault & Print Visualizer Actions (`src/server/actions/deliverables.ts`), `calculateGoldenHour(latitude: number, longitude: number, date: string)`, CineFlow OS — Server Actions & API Specification, `confirmBookingWithDeposit(data: z.infer<typeof ConfirmBookingSchema>)` (+12 more)

### Community 72 - "On-Set Logistics Toolkit"
Cohesion: 0.33
Nodes (6): On-Set Call Sheet and Mobile Shot List HUD, Solar Golden Hour Calculation Engine (lib/solar.ts), 1-Click WhatsApp Dispatch Links (lib/whatsapp.ts), Dynamic Call Sheet Generator (Golden Hour, WhatsApp Dispatch), Digital Release Forms, Pre-Production and On-Set Mobile Companion (PWA)

### Community 73 - "Client Delivery Vault"
Cohesion: 0.40
Nodes (5): Client Delivery Vault (Dual-Tier Access), Secure Paywall Gated Download Route (app/api/download/route.ts), Multi-Mode Checkout (Card, QR, Cash), Payment Verification and Paywall Contract (VerifyPaymentInput), Studio Manual Payment Verification Console

### Community 74 - "Graphify Rules"
Cohesion: 0.70
Nodes (4): graphify Skill (/graphify trigger), graphify-out (graph.json, GRAPH_REPORT.md, wiki/index.md), graphify Knowledge Graph Usage Rules, graphify update Rule (rebuild graph after code changes)

### Community 75 - "OpenAI Agent Yaml"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 76 - "Design Skill Screen Data 76"
Cohesion: 0.40
Nodes (5): note, screens, styles, kinds, analytics

### Community 77 - "Design Skill Screen Data 77"
Cohesion: 0.50
Nodes (4): note, screens, styles, builder

### Community 78 - "Design Skill Screen Data 78"
Cohesion: 0.50
Nodes (4): note, screens, styles, commerce

### Community 79 - "Design Skill Screen Data 79"
Cohesion: 0.50
Nodes (4): note, screens, styles, community

### Community 80 - "Design Skill Screen Data 80"
Cohesion: 0.50
Nodes (4): note, screens, styles, creator

### Community 81 - "Design Skill Screen Data 81"
Cohesion: 0.50
Nodes (4): note, screens, styles, devtools

### Community 82 - "Design Skill Screen Data 82"
Cohesion: 0.50
Nodes (4): note, screens, styles, finance

### Community 83 - "Design Skill Screen Data 83"
Cohesion: 0.50
Nodes (4): markets, note, screens, styles

### Community 84 - "Design Skill Screen Data 84"
Cohesion: 0.50
Nodes (4): report, note, screens, styles

### Community 85 - "Design Skill Screen Data 85"
Cohesion: 0.50
Nodes (4): smb-admin, note, screens, styles

### Community 86 - "Design Skill Screen Data 86"
Cohesion: 0.50
Nodes (4): support, note, screens, styles

### Community 87 - "Design Skill Screen Data 87"
Cohesion: 0.50
Nodes (4): wallet, note, screens, styles

### Community 88 - "Design Skill Screen Data 88"
Cohesion: 0.50
Nodes (4): workspace, note, screens, styles

### Community 90 - "cn"
Cohesion: 0.18
Nodes (14): Badge(), BadgeProps, badgeVariants, Button, ButtonProps, buttonVariants, Card, CardContent (+6 more)

### Community 92 - "clsx"
Cohesion: 0.20
Nodes (6): clsx@^2.1.1, @radix-ui/react-aspect-ratio@^1.1.2, @radix-ui/react-progress@^1.1.2, clsx, @radix-ui/react-aspect-ratio, @radix-ui/react-progress

### Community 93 - "Systematic Debugging & Error Triage Skill"
Cohesion: 0.11
Nodes (18): 1. Objectives, 2. Triggers, 3. Inputs & Prerequisites, 4. Step-by-Step Triage Procedure (5-Step Framework), 5.1 React Hydration Mismatches, 5.2 Database Connection Pool Exhaustion, 5.3 Next.js Server Action State Desynchronization, 5. Common Full-Stack Failure Modes & Remediation Guide (+10 more)

### Community 94 - "client-dashboard.tsx"
Cohesion: 0.16
Nodes (16): AccountPageProps, ClientAccountPage(), dynamic, metadata, BADGE, Badge(), BOOKING_STATUS_TEXT, BookingRow (+8 more)

### Community 99 - "2. Model Definitions & Field Specifications"
Cohesion: 0.11
Nodes (19): 2.2 Booking, Campaign Categories & Cinema Slots, 2.3 Proposals, Milestones & Payments, 2.4 Production Logistics, Call Sheets & Visual Shot Lists, 2.5 Deliverables Vault & Frame Visualizer, 2.6 Gear Inventory & BOM (Bill of Materials), 2. Model Definitions & Field Specifications, `BookingSlot`, `CallSheet` (+11 more)

### Community 100 - "The run"
Cohesion: 0.11
Nodes (17): 10. Report, 1. Read the brief and the project, 2. Write the argument, 3. Draw the direction, 4. Find the idea, 5. Write the words, 6. Build it, still, 7. Gate (+9 more)

### Community 101 - "docs/README.md"
Cohesion: 0.11
Nodes (14): 1. High-Level System Architecture, 2. Multi-Tenant Custom Domain & Slug Resolution, 3. Core Transactional Sequence Flows, CineFlow OS — System Architecture & Data Flows, Flow 1: Cinema-Style Real-Time Slot Holding & Deposit Checkout, Flow 2: Interactive Proposal Customization & Retainer Milestone Billing, Flow 3: Direct-to-Client Delivery & Milestone Paywall Unlock, Flow 4: QR Code & Cash Manual Studio Verification Flow (+6 more)

### Community 102 - "base"
Cohesion: 0.21
Nodes (17): base(), commonsLicence(), first(), fromAic(), fromArchive(), fromCommons(), fromCommonsVideo(), fromMet() (+9 more)

### Community 103 - "The Design System Page"
Cohesion: 0.13
Nodes (16): defaultStates, previewState(), StateMatrix(), Block anatomy, Checklist, Components: Tiers and Block Anatomy, Contents, Do and Don't (+8 more)

### Community 104 - "Commands"
Cohesion: 0.12
Nodes (17): `add` — Add components, `apply` — Apply a preset to an existing project, `build` — Build a custom registry, Commands, Contents, `diff` — Check for updates, `docs` — Get component documentation URLs, Dry-Run Mode (+9 more)

### Community 105 - "The study"
Cohesion: 0.12
Nodes (15): 10. The 25 highest-scored sites and their ideas, 11. How the skill was tested, 12. The October 2026 study: 100 Sites of the Day, 13. The app-screen study, 1. Method and its limits, 2. Scores, 3. Where the idea comes from, 4. Headlines (+7 more)

### Community 106 - "getJson"
Cohesion: 0.20
Nodes (16): applyThumb(), commonsApi(), commonsInfo(), getJson(), keyOf(), mapLimit(), noQuery(), onSubject() (+8 more)

### Community 107 - "Full-Stack Application Scaffolding Skill"
Cohesion: 0.12
Nodes (15): 1. Objectives, 2. Triggers, 3. Inputs & Prerequisites, 4. Directory Layout Standard, 5. Step-by-Step Scaffolding Procedure, 6. Tool Synergies (MCP Integration), 7. Concrete Prompt Examples, Example 1: Full-Stack Greenfield Scaffolding (+7 more)

### Community 108 - "Accessible UI Component Design & Styling Skill"
Cohesion: 0.13
Nodes (14): 1. Objectives, 2. Triggers, 3. Inputs & Prerequisites, 4. Architectural Rules & Best Practices, 5. Step-by-Step Component Creation Procedure, 6. Tool Synergies (Playwright MCP Integration), 7. Concrete Prompt Examples, Accessible UI Component Design & Styling Skill (+6 more)

### Community 109 - "Database Schema Design & Migrations Skill"
Cohesion: 0.14
Nodes (13): 1. Objectives, 2. Triggers, 3. Inputs & Prerequisites, 4. Architectural Rules & Naming Standards, 5. Step-by-Step Implementation Procedure, 6. Tool Synergies (Postgres MCP Integration), 7. Concrete Prompt Examples, Database Schema Design & Migrations Skill (+5 more)

### Community 110 - "Find Skills"
Cohesion: 0.14
Nodes (13): Common Skill Categories, Find Skills, How to Help Users Find Skills, Step 1: Understand What They Need, Step 2: Check the Leaderboard First, Step 3: Search for Skills, Step 4: Verify Quality Before Recommending, Step 5: Present Options to the User (+5 more)

### Community 111 - "Customization & Theming"
Cohesion: 0.14
Nodes (14): 1. Built-in variants, 2. Tailwind classes via `className`, 3. Add a new variant, 4. Wrapper components, Adding Custom Colors, Border Radius, Changing the Theme, Checking for Updates (+6 more)

### Community 112 - "API & Backend Implementation Skill"
Cohesion: 0.15
Nodes (12): 1. Objectives, 2. Triggers, 4. RFC 7807 Problem Details Specification, 5. Step-by-Step Implementation Procedure, 6. Tool Synergies (Fetch MCP & Postgres MCP Integration), 7. Concrete Prompt Examples, API & Backend Implementation Skill, Example 1: Creating a Validated REST Route (+4 more)

### Community 113 - "Layout"
Cohesion: 0.15
Nodes (12): 10. How pages fail, 1. What strong pages do, 2. Margins and the grid, 3. Where text sits, 4. Empty space, 5. The frame: margins, balance and titles, 6. Sections: carry the idea, vary the arrangement, 7. Navigation (+4 more)

### Community 114 - "Design Systems from DESIGN.md"
Cohesion: 0.15
Nodes (13): Contents, Coverage check, Design Systems from DESIGN.md, Inputs to Confirm, Known traps, Picking a style, Report Back, Step 1: Scaffold (+5 more)

### Community 115 - "Component Composition"
Cohesion: 0.15
Nodes (13): Avatar always needs AvatarFallback, Button has no isPending or isLoading prop, Callouts use Alert, Card structure, Choosing between overlay components, Component Composition, Contents, Dialog, Sheet, and Drawer always need a Title (+5 more)

### Community 116 - "Styling & Customization"
Cohesion: 0.15
Nodes (13): Built-in variants first, className for layout only, Contents, No manual dark: color overrides, No manual z-index on overlay components, No raw color values for status/state indicators, No space-x-* / space-y-*, Prefer size-* over w-* h-* when equal (+5 more)

### Community 117 - "Colour"
Cohesion: 0.17
Nodes (11): 1. What the study measured, 2. The roles, 3. Proportion, 4. Surfaces without lines or shadows, 5. Colour fields, 6. Dark pages, 7. Colour and photographs, 8. Contrast (+3 more)

### Community 118 - "Scroll scenes"
Cohesion: 0.17
Nodes (11): 1. What a scene is, 2. Putting a scene on a page, 3. Filling it, 4. Fitting it to the page, 5. The phone, reduced motion, no script, 6. Checking it, 7. Rules for scenes, 8. When no scene in the library fits (+3 more)

### Community 119 - "Tools"
Cohesion: 0.17
Nodes (11): Configuring Registries, Setup, `shadcn:get_add_command_for_items`, `shadcn:get_audit_checklist`, `shadcn:get_item_examples_from_registries`, `shadcn:get_project_registries`, `shadcn:list_items_in_registries`, shadcn MCP Server (+3 more)

### Community 120 - "shadcn/ui"
Cohesion: 0.17
Nodes (12): Component Docs, Examples, and Usage, Component Selection, Current Project Context, Design Systems from DESIGN.md, Detailed References, Key Fields, Key Patterns, Principles (+4 more)

### Community 121 - "App screens"
Cohesion: 0.18
Nodes (10): 10. Density, 11. Empty, zero, loading and error states, 12. The phone, 13. House rules for app screens, 14. Tells of generated dashboards, 1. When this applies, 5. KPIs, App screens (+2 more)

### Community 122 - "Tells — the dated registry"
Cohesion: 0.18
Nodes (10): 1. First wave (2023–2024), 2. Second wave (2025), 3. Third wave (2025–2026): the "fix" that became the look, 4. Gallery fashion, banned as house style, 5. Structural tells, 6. Copy tells, 7. Motion tells, 8. Why removal is not enough (+2 more)

### Community 123 - "Type"
Cohesion: 0.18
Nodes (10): 1. What the study measured, 2. The scale: few sizes, far apart, 3. Setting display type, 4. Setting text, 5. Loading the fonts properly, 6. One family or two, 7. Details that separate set type from typed text, 8. Mistakes the inspector cannot see (+2 more)

### Community 125 - "Chat & Messaging"
Cohesion: 0.18
Nodes (11): Assistant activity uses Trace, Attachments use Attachment, Chat & Messaging, Code and tool output use CodeBlock, Contents, Escape hatch: the scroller hooks, Message rows use Message, Message surfaces use Bubble (+3 more)

### Community 126 - "7. Tables and lists"
Cohesion: 0.20
Nodes (10): 7.1 Rows, 7.2 Header, 7.3 Dividers, 7.4 Figures and alignment, 7.5 Ink inside rows, 7.6 Status pills, 7.7 Media, 7.8 Actions and paging (+2 more)

### Community 127 - "Words"
Cohesion: 0.20
Nodes (9): 1. Write the argument first, 2. The two-line headline, 3. Headline shapes that work, 4. Supporting line, body, buttons, 5. Proof without inventing it, 6. Things that read as generated, 7. Micro-typography, Contents (+1 more)

### Community 128 - "2. The Studio Operations Journey: Full Day-to-Day Control"
Cohesion: 0.20
Nodes (9): 1. Studio Configuration & Dynamic Settings (CRUD), 2. Schedule & Slot Management, 2. The Studio Operations Journey: Full Day-to-Day Control, 3. Manual Payment Verification Console, 3. The Super-Admin Journey: Platform SaaS Management, 4. Pre-Production Logistics & On-Set Operations, 5. Gear Inventory & Kit Bundles (BOM), 6. Direct Delivery Publishing (+1 more)

### Community 129 - "Build Awwwards-Quality Sites"
Cohesion: 0.22
Nodes (8): 1. Set the art direction, 2. Build an honest asset system, 3. Compose the hero, 4. Build the motion system, 5. Add Three.js only with purpose, 6. Meet the quality bar, 7. Validate before handoff, Build Awwwards-Quality Sites

### Community 130 - "2. The run for an app screen"
Cohesion: 0.22
Nodes (9): 2.1 Inventory the data and the jobs, 2.2 Name the screen's one question, 2.3 Choose a style, 2.4 Build the shell, 2.5 Put in the data, 2.6 Build the states, 2.7 The check, 2.8 Report (+1 more)

### Community 131 - "Critique — judging the render"
Cohesion: 0.22
Nodes (8): 1. How to look, 2. The score, 3. Caps, 4. Writing the critique, 5. What to fix first, 6. When to stop, Contents, Critique — judging the render

### Community 132 - "Design Engineering"
Cohesion: 0.22
Nodes (8): Accessibility, Design Engineering, Initial Response, prefers-reduced-motion, Review Checklist, Review Format (Required), Stagger Animations, Touch device hover states

### Community 133 - "Base vs Radix"
Cohesion: 0.22
Nodes (9): Accordion, Base vs Radix, Button / trigger as non-button element (base only), Composition: asChild (radix) vs render (base), Contents, Select, Select — multiple selection and object values (base only), Slider (+1 more)

### Community 134 - "CineFlow OS — Product Requirements Specification (PRD)"
Cohesion: 0.22
Nodes (8): 1. Executive Summary & Vision, 2. User Personas & Problems Solved, 3. High-Level Feature Matrix, 4. Non-Functional Requirements (NFRs), CineFlow OS — Product Requirements Specification (PRD), Persona 1: The Studio Owner / Lead Creator (e.g. Alex), Persona 2: The Studio Client (e.g. Elena — Graduate / Brand Manager / Bride), Persona 3: On-Set Crew & Talent (e.g. DPs, Camera Ops, Models, Gaffers)

### Community 135 - "Implementation Plan: CineFlow OS — The Multi-Tenant Operating System for Photographers & Videographers"
Cohesion: 0.22
Nodes (8): 1. System Identity & Multi-Tenant SaaS Architecture, 2. 100% Dynamic Settings & Studio Admin CRUD Suite (NEW), 3. Cinema-Style Real-Time Slot Holding Engine, 4. Multi-Tenant Data Model with Dynamic Settings (Prisma SQLite), 5. Verification Plan, Automated Verification, End-to-End Workflow Verification Flow, Implementation Plan: CineFlow OS — The Multi-Tenant Operating System for Photographers & Videographers

### Community 136 - "phone"
Cohesion: 0.29
Nodes (8): phone(), 2.1 Workspace & Multitenancy, `Tenant`, `User`, 1. Authentication & Session Actions (`src/server/actions/auth.ts`), `quickCreateClient(formData: z.infer<typeof QuickClientSchema>)`, `registerClient(formData: z.infer<typeof RegisterClientSchema>)`, `setupPasswordWithInvite(formData: z.infer<typeof SetupPasswordSchema>)`

### Community 137 - "Component Building Principles"
Cohesion: 0.25
Nodes (8): Animate enter states with @starting-style, Buttons must feel responsive, Component Building Principles, Make popovers origin-aware, Never animate from scale(0), Tooltips: skip delay on subsequent hovers, Use blur to mask imperfect transitions, Use CSS transitions over keyframes for interruptible UI

### Community 138 - "Step 4: Map Tokens to the Theme"
Cohesion: 0.25
Nodes (8): Dark mode, Elevation, Focus, Fonts, Radius, Role mapping, Step 4: Map Tokens to the Theme, Type scale

### Community 139 - "Registry Authoring and Addresses"
Cohesion: 0.25
Nodes (8): Build and Verify, GitHub Registries, Include, Item Definitions, Mental Model, Registry Authoring and Addresses, Registry Dependencies, Root `registry.json`

### Community 140 - "Forms & Inputs"
Cohesion: 0.25
Nodes (8): Buttons inside inputs use InputGroup + InputGroupAddon, Contents, Field validation and disabled states, FieldSet + FieldLegend for grouping related fields, Forms & Inputs, Forms use FieldGroup + Field, InputGroup requires InputGroupInput/InputGroupTextarea, Option sets (2–7 choices) use ToggleGroup

### Community 141 - "Critical Rules"
Cohesion: 0.25
Nodes (8): Chat & Messaging → [chat.md](./rules/chat.md), CLI, Component Structure → [composition.md](./rules/composition.md), Critical Rules, Forms & Inputs → [forms.md](./rules/forms.md), Icons → [icons.md](./rules/icons.md), Styling & Tailwind → [styling.md](./rules/styling.md), Use Components, Not Custom Markup → [composition.md](./rules/composition.md)

### Community 142 - "1. The Client Journey: From Discovery to Master Delivery"
Cohesion: 0.25
Nodes (8): 1. The Client Journey: From Discovery to Master Delivery, Step 1: Browse Showcase & Filter Category, Step 2: Pick Time Slot with Cinema-Style Hold, Step 3: Settle Deposit (Online Card, QR Code, or Cash), Step 4: Customize Proposal & Settle Retainer, Step 5: Shoot Day & Call Sheet, Step 6: Deliverables Vault & Frame Visualizer, Step 7: Settle Final Balance & Unlock Masters

### Community 143 - "tasteskill v2 (`design-taste-frontend`)"
Cohesion: 0.29
Nodes (6): Contents, How it works, Install, Notes, Requirements, tasteskill v2 (`design-taste-frontend`)

### Community 144 - "Foundations"
Cohesion: 0.29
Nodes (7): Color roles, Elevation, Foundations, Motion and icons, Radius, Spacing, Typography

### Community 145 - "app/layout.tsx"
Cohesion: 0.29
Nodes (4): geistMono, geistSans, metadata, viewport

### Community 146 - "CineFlow OS — Design System & UI Guidelines ("Nocturne Cine")"
Cohesion: 0.29
Nodes (6): 1. Visual Philosophy: Anti-Slop & Cinematic Craft, 2. Color Tokens & Palette, 3. Typography Scale & Hierarchy, 4. Micro-Interactions & Emil Kowalski Standards, 5. Web vs. Mobile/Tablet PWA Layout Strategies, CineFlow OS — Design System & UI Guidelines ("Nocturne Cine")

### Community 147 - "9. Type and colour"
Cohesion: 0.33
Nodes (6): 9.1 Type, 9.2 Colour on light screens, 9.3 Colour on dark screens, 9.4 Surfaces, radius, icons, spacing, 9.5 Default tokens, 9. Type and colour

### Community 148 - "The Animation Decision Framework"
Cohesion: 0.33
Nodes (6): 1. Should this animate at all?, 2. What is the purpose?, 3. What easing should it use?, 4. How fast should it be?, Perceived performance, The Animation Decision Framework

### Community 149 - "clip-path for Animation"
Cohesion: 0.33
Nodes (6): clip-path for Animation, Comparison sliders, Hold-to-delete pattern, Image reveals on scroll, Tabs with perfect color transitions, The inset shape

### Community 150 - "Performance Rules"
Cohesion: 0.33
Nodes (6): CSS animations beat JS under load, CSS variables are inheritable, Framer Motion hardware acceleration caveat, Only animate transform and opacity, Performance Rules, Use WAAPI for programmatic CSS animations

### Community 151 - "Gesture and Drag Interactions"
Cohesion: 0.33
Nodes (6): Damping at boundaries, Friction instead of hard stops, Gesture and Drag Interactions, Momentum-based dismissal, Multi-touch protection, Pointer capture for drag

### Community 152 - "color-pair.tsx"
Cohesion: 0.60
Nodes (5): ColorPair(), contrast(), luminance(), toHex(), toRgb()

### Community 153 - "CineFlow OS — Deployment & Configuration Guide"
Cohesion: 0.33
Nodes (6): 1. Environment Prerequisites, 2. Environment Variables Specification, 3. Local Development Quickstart, 4. Custom Domain DNS Configuration (For Pro Studios), 5. Mobile Progressive Web App (PWA) Installation, CineFlow OS — Deployment & Configuration Guide

### Community 154 - "3. The shell"
Cohesion: 0.40
Nodes (5): 3.1 Five archetypes, 3.2 Sidebar, 3.3 Top bar, 3.4 Right rail and pinned columns, 3. The shell

### Community 155 - "4. The canvas and the page title"
Cohesion: 0.40
Nodes (5): 4.1 Width and gutters, 4.2 One left edge, one right edge, 4.3 The title, 4.4 Tabs, filters and the date range, 4. The canvas and the page title

### Community 156 - "6. Charts"
Cohesion: 0.40
Nodes (5): 6.1 Which chart for which question, 6.2 One question, one series, 6.3 Axes and gridlines, 6.4 Marks, 6. Charts

### Community 157 - "CSS Transform Mastery"
Cohesion: 0.40
Nodes (5): 3D transforms for depth, CSS Transform Mastery, scale() scales children too, transform-origin, translateY with percentages

### Community 158 - "The Sonner Principles (Building Loved Components)"
Cohesion: 0.40
Nodes (5): Asymmetric enter/exit timing, Cohesion matters, Review your work the next day, The opacity + height combination, The Sonner Principles (Building Loved Components)

### Community 159 - "Spring Animations"
Cohesion: 0.40
Nodes (5): Interruptibility advantage, Spring Animations, Spring-based mouse interactions, Spring configuration, When to use springs

### Community 160 - "Icons"
Cohesion: 0.40
Nodes (4): Icons, Icons in Button use data-icon attribute, No sizing classes on icons inside components, Pass icons as component objects, not string keys

### Community 161 - "8. Forms and settings"
Cohesion: 0.50
Nodes (4): 8.1 Fields, 8.2 Settings layout, 8.3 Buttons, 8. Forms and settings

### Community 162 - "Core Philosophy"
Cohesion: 0.50
Nodes (4): Beauty is leverage, Core Philosophy, Taste is trained, not innate, Unseen details compound

### Community 163 - "Debugging Animations"
Cohesion: 0.50
Nodes (4): Debugging Animations, Frame-by-frame inspection, Slow motion testing, Test on real devices

## Ambiguous Edges - Review These
- `24-Model Prisma Schema (SQLite dev.db)` → `docs/03 Database Schema and Data Models`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **24 isolated node(s):** `Multi-Tenant Seed Script (prisma/seed.ts)`, `Local File Upload Route (app/api/upload/route.ts)`, `Frictionless 3-Field Client Onboarding`, `100% Dynamic Settings (Full CRUD)`, `Kanban Production Pipeline` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1076 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Login & Not-Found` to `cinema-booking-shell.tsx`, `Payment Verification Actions`, `Calendar & Slot Generator`, `actions/visualizer.ts`, `Runtime Dependencies`, `Dev Dependencies`, `Set HUD & Call Sheets`, `onboardStudio`, `Frames Admin`, `Wall Art Visualizer`, `app/layout.tsx`, `Upload Route`, `Services Admin`, `Showcase Gallery UI`, `Checkout Flow`, `Error Boundaries`, `Proposal Page`, `Gear Inventory`, `actions/admin-settings.ts`, `Logistics & Visualizer Actions`, `Proposals Admin`, `Gear Bundles & WhatsApp`, `Services Validation`, `Gear Actions & Schemas`, `actions/admin-cms.ts`, `admin/layout.tsx`, `Zip Download Route`, `Digital Releases`, `Proposal Templates`, `Health Check & Env`, `session.ts`, `Studio Settings`, `Verification Console`, `Admin Dashboard`, `booking-intake-modal.tsx`, `my-booking.ts`, `vault-shell.tsx`, `SaaS Layout & Footer`, `client-dashboard.tsx`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runAdminVerificationTests()` (e.g. with `.assert()` and `.assertEqual()`) actually correct?**
  _`runAdminVerificationTests()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Multi-Tenant Seed Script (prisma/seed.ts)`, `Local File Upload Route (app/api/upload/route.ts)`, `Frictionless 3-Field Client Onboarding` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `assets.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08831908831908832 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Checkout Flow` to `cinema-booking-shell.tsx`, `Calendar & Slot Generator`, `Runtime Dependencies`, `Dev Dependencies`, `Set HUD & Call Sheets`, `onboardStudio`, `Frames Admin`, `Wall Art Visualizer`, `Services Admin`, `Showcase Gallery UI`, `Error Boundaries`, `color-pair.tsx`, `Proposal Page`, `Gear Inventory`, `Proposals Admin`, `actions/admin-cms.ts`, `Digital Releases`, `Login & Not-Found`, `session.ts`, `Studio Settings`, `Verification Console`, `booking-intake-modal.tsx`, `my-booking.ts`, `vault-shell.tsx`, `cn`, `client-dashboard.tsx`, `The Design System Page`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `cinema-booking-shell.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `24-Model Prisma Schema (SQLite dev.db)` and `docs/03 Database Schema and Data Models`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._