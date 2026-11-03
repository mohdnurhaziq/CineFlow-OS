# Graph Report - Production Management System  (2026-11-03)

## Corpus Check
- Large corpus: 329 files · ~581,085 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1534 nodes · 3932 edges · 99 communities (87 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Asset Builder Scripts
- Root Layout & Globals
- Color Pair Tooling
- Draw Tool Scripts
- Payment Verification Actions
- Calendar & Slot Generator
- Inspect Tool Scripts
- Booking Slot Management
- Booking & Hold Actions
- Runtime Dependencies
- Dev Dependencies
- Set HUD & Call Sheets
- Studio Onboarding
- Charts Library
- Frames Admin
- Wall Art Visualizer
- App-Draw Scripts
- E2E Test Harness
- CDP Browser Driver
- Upload Route
- Services Admin
- Showcase Gallery UI
- Checkout Flow
- Error Boundaries
- TypeScript Config
- Tenant Showcase Page
- Proposal Page
- Super Admin
- Gear Inventory
- Admin CMS & Settings Actions
- Logistics & Visualizer Actions
- Prisma Enums
- Proposals Admin
- shadcn Config
- Gear Bundles & WhatsApp
- Services Validation
- Gear Actions & Schemas
- Frames Actions & Schemas
- Lint Tooling
- CMS Admin
- Admin Layout & Nav
- NPM Scripts
- Gear Inspection Dialog
- Multi-Tenant Architecture
- Zip Download Route
- Digital Releases
- Proposal Templates
- Notifications
- Health Check & Env
- Login & Not-Found
- SEO Robots & Sitemap
- Studio Settings
- Stage Tooling
- Playwright Page API
- Verification Console
- Prisma Client Deps
- README Feature Set
- Docs Suite
- Admin Dashboard
- Gear Item Dialog
- Proposal Actions
- Radix UI Deps
- Seed & Setup
- Milestones M1-M4
- Showcase Coverage Script
- pnpm Workspace
- Hardening & E2E Tiers
- Proposal & Invoicing Features
- Design Skill App Data
- OpenAI Agent Config
- SaaS Layout & Footer
- Checkout Actions
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
- Radix Dropdown
- Radix Popover
- Radix Progress
- Radix Switch
- Radix Tabs
- React DOM
- Gear Inspection Docs

## God Nodes (most connected - your core abstractions)
1. `next` - 87 edges
2. `lucide-react` - 87 edges
3. `db` - 71 edges
4. `react` - 64 edges
5. `runAdminVerificationTests()` - 34 edges
6. `holdBookingSlot()` - 33 edges
7. `getOne()` - 31 edges
8. `runTier4RealWorldScenariosTests()` - 29 edges
9. `runChallengerSuite()` - 28 edges
10. `TestHarness` - 27 edges

## Surprising Connections (you probably didn't know these)
- `docs/03 Database Schema and Data Models` --conceptually_related_to--> `24-Model Prisma Schema (SQLite dev.db)`  [AMBIGUOUS]
  README.md → PROJECT.md
- `StateMatrix()` --calls--> `cn()`  [EXTRACTED]
  .agents/skills/shadcn/assets/showcase/state-matrix.tsx → lib/utils.ts
- `SaasLoading()` --calls--> `Skeleton()`  [EXTRACTED]
  app/(saas)/loading.tsx → components/ui/skeleton.tsx
- `AdminCalendarPage()` --calls--> `CalendarAdminDashboard()`  [EXTRACTED]
  app/[tenantSlug]/admin/calendar/page.tsx → components/admin/calendar/calendar-admin-dashboard.tsx
- `AdminCmsPage()` --calls--> `CmsManager()`  [EXTRACTED]
  app/[tenantSlug]/admin/cms/page.tsx → components/admin/cms/cms-manager.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Final Balance Paywall Delivery Flow** — project_payment_verification_console, project_payment_paywall_contract, project_final_balance_paywall, project_download_route, project_delivery_vault [EXTRACTED 0.95]
- **On-Set Logistics Toolkit** — project_solar_engine, project_whatsapp_dispatch, project_call_sheet_hud, project_digital_releases [EXTRACTED 0.95]
- **graphify Knowledge Graph Workflow** — claude_graphify_rules, claude_graphify_query_first, claude_graphify_update, claude_graphify_out, _claude_claude_graphify [INFERRED 0.85]

## Communities (99 total, 12 thin omitted)

### Community 0 - "Asset Builder Scripts"
Cohesion: 0.07
Nodes (85): AIC_FIELDS, AIC_HEADERS, applyThumb(), ARCHIVE_LICENCE, args, argv, base(), clock() (+77 more)

### Community 1 - "Root Layout & Globals"
Cohesion: 0.06
Nodes (38): geistMono, geistSans, metadata, viewport, BookingPage(), BookingPageProps, ProjectVaultPage(), VaultPageProps (+30 more)

### Community 2 - "Color Pair Tooling"
Cohesion: 0.07
Nodes (34): ColorPair(), contrast(), luminance(), toHex(), toRgb(), defaultStates, StateMatrix(), SaasLoading() (+26 more)

### Community 3 - "Draw Tool Scripts"
Cohesion: 0.10
Nodes (41): adjustments(), argv, assetQueries(), ASSETS_PATH, briefStop(), briefWords(), deal(), dealHero() (+33 more)

### Community 4 - "Payment Verification Actions"
Cohesion: 0.17
Nodes (29): GET(), approvePaymentVerification(), ApprovePaymentVerificationInput, ApprovePaymentVerificationSchema, rejectPaymentVerification(), RejectPaymentVerificationInput, RejectPaymentVerificationSchema, safeRevalidate() (+21 more)

### Community 5 - "Calendar & Slot Generator"
Cohesion: 0.11
Nodes (30): AdminCalendarPage(), CalendarPageProps, BatchGeneratorDialog(), BatchGeneratorDialogProps, DAYS, CalendarAdminDashboard(), CalendarAdminDashboardProps, ForceReleaseDialog() (+22 more)

### Community 6 - "Inspect Tool Scripts"
Cohesion: 0.07
Nodes (29): allow, appMode, args, asJson, dealtFonts, fails, film, HEIGHT (+21 more)

### Community 7 - "Booking Slot Management"
Cohesion: 0.24
Nodes (34): SlotTable(), AddOnTemplateTable(), batchDeleteBookingSlots(), batchGenerateBookingSlots(), cleanupExpiredHolds(), createSingleBookingSlot(), deleteBookingSlot(), forceReleaseHeldSlot() (+26 more)

### Community 8 - "Booking & Hold Actions"
Cohesion: 0.11
Nodes (24): CreateBookingInputSchema, CreateBookingOutput, createClientBooking(), getTenantBookingSlots(), HoldSlotSchema, releaseBookingSlot(), ReleaseSlotSchema, db (+16 more)

### Community 9 - "Runtime Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, bcryptjs@^2.4.3, canvas-confetti@^1.9.4, clsx@^2.1.1, date-fns@^4.1.0, lucide-react@^0.475.0, next@^15.1.0, next-themes@^0.4.4 (+25 more)

### Community 10 - "Dev Dependencies"
Cohesion: 0.09
Nodes (31): devDependencies, eslint@^9.19.0, eslint-config-next@^15.1.0, postcss@^8.5.1, prisma@^6.3.0, tailwindcss@^4.0.0, @tailwindcss/postcss@^4.0.0, tsx@^4.19.2 (+23 more)

### Community 11 - "Set HUD & Call Sheets"
Cohesion: 0.12
Nodes (24): SetHudPage(), SetHudPageProps, CallSheetDetails, CallSheetShell(), CallSheetShellProps, CrewRosterCard(), CrewRosterCardProps, ShotItemData (+16 more)

### Community 12 - "Studio Onboarding"
Cohesion: 0.14
Nodes (23): COLOR_PRESETS, CreateStudioPage(), checkSlugAvailability(), onboardStudio(), CheckSlugSchema, CurrencyEnum, OnboardStudioInput, OnboardStudioOutput (+15 more)

### Community 13 - "Charts Library"
Cohesion: 0.21
Nodes (24): axes(), bars(), dayHeads(), diverging(), frame(), hits(), kindStyle(), lane() (+16 more)

### Community 14 - "Frames Admin"
Cohesion: 0.16
Nodes (22): AdminFramesPage(), FramesPageProps, FrameDesignDialog(), FrameDesignDialogProps, FrameDesignRow, MATERIALS, PRESET_COLORS, FramesManager() (+14 more)

### Community 15 - "Wall Art Visualizer"
Cohesion: 0.16
Nodes (20): VisualizerPage(), VisualizerPageProps, ConfiguratorPanel(), ConfiguratorPanelProps, FrameDesignOption, PhotoOption, PrintSizeOption, FrameCanvas() (+12 more)

### Community 16 - "App-Draw Scripts"
Cohesion: 0.11
Nodes (22): argv, deal(), dealScreen(), dealShell(), dealStyle(), fontLink(), HERE, kebab() (+14 more)

### Community 17 - "E2E Test Harness"
Cohesion: 0.20
Nodes (9): runMasterTestSuite(), SuiteSummary, TestHarness, TestResult, runFrameworkStorageTests(), runSaaSShowcaseTests(), runTier2BoundaryTests(), runTier4RealWorldScenariosTests() (+1 more)

### Community 18 - "CDP Browser Driver"
Cohesion: 0.12
Nodes (14): alive(), Browser, findChrome(), sleep(), sweepProfiles(), args, go(), only (+6 more)

### Community 19 - "Upload Route"
Cohesion: 0.13
Nodes (11): ALLOWED_FOLDERS, ALLOWED_TYPES, POST(), challengeBusinessInvariants(), challengeMultiTenantIsolation(), ChallengeResult, challengeSeedIdempotency(), challengeUploadApi() (+3 more)

### Community 20 - "Services Admin"
Cohesion: 0.17
Nodes (18): AdminServicesPage(), ServicesPageProps, CategoryDialog(), CategoryDialogProps, CategoryRow, EMOJI_PRESETS, CategoryList(), CategoryListProps (+10 more)

### Community 21 - "Showcase Gallery UI"
Cohesion: 0.14
Nodes (18): CategoryFilterBar(), CategoryFilterBarProps, CategoryItem, LightboxItem, MediaLightboxModal(), MediaLightboxModalProps, PackageGrid(), PackageGridProps (+10 more)

### Community 22 - "Checkout Flow"
Cohesion: 0.15
Nodes (15): CheckoutPage(), CheckoutPageProps, CardPaymentForm(), CardPaymentFormProps, CashPaymentForm(), CashPaymentFormProps, CheckoutShell(), CheckoutShellProps (+7 more)

### Community 23 - "Error Boundaries"
Cohesion: 0.15
Nodes (12): metadata, SaasLandingPage(), FeaturesGrid(), PILLARS, InteractiveTeasers(), PricingTiers(), TIERS, SaasHero() (+4 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, jsx, lib (+13 more)

### Community 25 - "Tenant Showcase Page"
Cohesion: 0.15
Nodes (14): PageProps, TenantShowcasePage(), ClientTestimonials(), ClientTestimonialsProps, TESTIMONIALS, ShowcaseFooter(), ShowcaseFooterProps, ShowcaseHero() (+6 more)

### Community 26 - "Proposal Page"
Cohesion: 0.15
Nodes (14): ProposalPage(), ProposalPageProps, AddOnItem, AddonsSelector(), AddonsSelectorProps, PricingBreakdown(), PricingBreakdownProps, ProposalViewer() (+6 more)

### Community 27 - "Super Admin"
Cohesion: 0.18
Nodes (14): metadata, SuperAdminPage(), SuperAdminView(), SuperAdminViewProps, TenantSummaryItem, getAllTenantsSummary(), getPlatformMetrics(), PlatformMetrics (+6 more)

### Community 28 - "Gear Inventory"
Cohesion: 0.22
Nodes (14): InventoryPage(), InventoryPageProps, GearDashboard(), GearDashboardProps, InventoryItemRow, GearKpiSummary(), GearKpiSummaryProps, ReservationWithDetails (+6 more)

### Community 29 - "Admin CMS & Settings Actions"
Cohesion: 0.18
Nodes (14): safeRevalidate(), updateStudioSettings(), CreateShowcaseItemInput, CreateShowcaseItemSchema, DeleteShowcaseItemInput, DeleteShowcaseItemSchema, ToggleShowcaseFeaturedInput, ToggleShowcaseFeaturedSchema (+6 more)

### Community 30 - "Logistics & Visualizer Actions"
Cohesion: 0.19
Nodes (13): safeRevalidate(), submitDigitalRelease(), toggleShotCompletion(), createPrintOrder(), safeRevalidate(), SubmitDigitalReleaseInput, SubmitDigitalReleaseSchema, ToggleShotCompletionInput (+5 more)

### Community 31 - "Prisma Enums"
Cohesion: 0.11
Nodes (18): BookingStatus, DeliverableItemType, DeliverableStatus, InventoryCondition, InventoryStatus, InvoiceStatus, MilestoneType, PaymentMethod (+10 more)

### Community 32 - "Proposals Admin"
Cohesion: 0.22
Nodes (12): AdminProposalsPage(), ProposalsPageProps, AddOnTemplateDialog(), AddOnTemplateDialogProps, ProposalAddOnTemplateRow, UNITS, AddOnTemplateTableProps, ProposalAdminDashboard() (+4 more)

### Community 33 - "shadcn Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 34 - "Gear Bundles & WhatsApp"
Cohesion: 0.31
Nodes (12): checkBundleAvailability(), createEquipmentReservation(), createKitBundle(), deleteGearItem(), formatShootDate(), generateWhatsAppCallSheetUrl(), parseCrewJson(), assert() (+4 more)

### Community 35 - "Services Validation"
Cohesion: 0.22
Nodes (16): CreateCampaignCategoryInput, CreateCampaignCategorySchema, CreateServicePackageInput, CreateServicePackageSchema, DeleteCampaignCategoryInput, DeleteCampaignCategorySchema, DeleteServicePackageInput, DeleteServicePackageSchema (+8 more)

### Community 36 - "Gear Actions & Schemas"
Cohesion: 0.22
Nodes (15): CreateGearItemInput, CreateGearItemSchema, CreateKitBundleInput, CreateKitBundleSchema, CreateReservationInput, CreateReservationSchema, KitBundleItemInputSchema, LogPostShootInspectionInput (+7 more)

### Community 37 - "Frames Actions & Schemas"
Cohesion: 0.24
Nodes (14): CreateFrameDesignInput, CreateFrameDesignSchema, CreatePrintSizeInput, CreatePrintSizeSchema, DeleteFrameDesignInput, DeleteFrameDesignSchema, DeletePrintSizeInput, DeletePrintSizeSchema (+6 more)

### Community 38 - "Lint Tooling"
Cohesion: 0.14
Nodes (13): APP_LEVEL, appMode, args, asJson, byId, EXT, files, findings (+5 more)

### Community 39 - "CMS Admin"
Cohesion: 0.30
Nodes (10): AdminCmsPage(), CmsPageProps, CmsManager(), CmsManagerProps, CategoryOption, DISCIPLINES, PackageOption, ShowcaseItemDialog() (+2 more)

### Community 40 - "Admin Layout & Nav"
Cohesion: 0.27
Nodes (10): AdminLayout(), AdminLayoutProps, AdminNavBar(), AdminNavBarProps, AdminUserNav(), AdminUserNavProps, getCurrentUser(), logoutAction() (+2 more)

### Community 41 - "NPM Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:push, db:seed, db:studio, dev, lint, prisma:generate (+6 more)

### Community 42 - "Gear Inspection Dialog"
Cohesion: 0.27
Nodes (11): CONDITIONS, InspectionDialog(), InspectionDialogProps, logPostShootInspection(), logPreShootInspection(), safeRevalidate(), updateGearConditionStatus(), updateKitBundle() (+3 more)

### Community 43 - "Multi-Tenant Architecture"
Cohesion: 0.18
Nodes (11): CineFlow OS (Multi-Tenant Creative Operating System), Local Media Storage (public/uploads), Nocturne Cine Aesthetic, 24-Model Prisma Schema (SQLite dev.db), SaaS Platform Layer (landing, create-studio onboarding, super-admin), Multi-Tenant Seed Script (prisma/seed.ts), Tech Stack (Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/ui, Prisma, SQLite), Public Tenant Showcase and Campaign Category Filters (+3 more)

### Community 44 - "Zip Download Route"
Cohesion: 0.24
Nodes (7): createZipArchive(), ZipFileEntry, assert(), AssertionRecord, execAsync, records, runSecuritySuite()

### Community 45 - "Digital Releases"
Cohesion: 0.23
Nodes (8): ReleasesPage(), ReleasesPageProps, ExistingRelease, ReleaseFormShell(), ReleaseFormShellProps, Point, ReleaseSignaturePad(), ReleaseSignaturePadProps

### Community 46 - "Proposal Templates"
Cohesion: 0.32
Nodes (10): CreateProposalAddOnTemplateInput, CreateProposalAddOnTemplateSchema, DeleteProposalAddOnTemplateInput, DeleteProposalAddOnTemplateSchema, ToggleTemplateActiveInput, ToggleTemplateActiveSchema, ToggleTemplateDefaultInput, ToggleTemplateDefaultSchema (+2 more)

### Community 47 - "Notifications"
Cohesion: 0.17
Nodes (11): BookingConfirmedPayload, NotificationChannel, NotificationEvent, notificationLog, NotificationPayload, NotificationResult, PaymentApprovedPayload, PaymentRejectedPayload (+3 more)

### Community 48 - "Health Check & Env"
Cohesion: 0.25
Nodes (5): dynamic, Env, env, envSchema, runM1Verification()

### Community 49 - "Login & Not-Found"
Cohesion: 0.24
Nodes (6): LoginPageProps, StudioLoginPage(), StudioLoginForm(), StudioLoginFormProps, nextConfig, next

### Community 50 - "SEO Robots & Sitemap"
Cohesion: 0.36
Nodes (8): robots(), sitemap(), createSessionToken(), createSignature(), loginWithCredentials(), verifySessionToken(), getNotificationHistory(), runTier6ProductionHardeningTests()

### Community 51 - "Studio Settings"
Cohesion: 0.24
Nodes (8): AdminSettingsPage(), SettingsPageProps, BRAND_PRESET_COLORS, CURRENCIES, DISCIPLINES, StudioSettingsForm(), StudioSettingsFormProps, StudioTenantData

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

### Community 59 - "Gear Item Dialog"
Cohesion: 0.28
Nodes (8): CATEGORIES, CONDITIONS, DISCIPLINES, GearItemDialog(), GearItemDialogProps, STATUSES, createGearItem(), updateGearItem()

### Community 60 - "Proposal Actions"
Cohesion: 0.36
Nodes (7): safeRevalidate(), signAndAcceptProposal, toggleProposalAddOn(), SignProposalInput, SignProposalSchema, ToggleAddOnInput, ToggleAddOnSchema

### Community 61 - "Radix UI Deps"
Cohesion: 0.14
Nodes (8): @radix-ui/react-dialog@^1.1.6, @radix-ui/react-slot@^1.1.2, @radix-ui/react-tooltip@^1.1.8, prisma, seed, @radix-ui/react-dialog, @radix-ui/react-slot, @radix-ui/react-tooltip

### Community 62 - "Seed & Setup"
Cohesion: 0.32
Nodes (6): main(), prisma, JPEG_BUFFER, MP4_BUFFER, PNG_BUFFER, setupPlaceholderAssets()

### Community 63 - "Milestones M1-M4"
Cohesion: 0.25
Nodes (7): Milestone M1 m1_scaffolding_database (DONE), Milestone M2 m2_saas_onboarding_showcase (DONE), Milestone M3 m3_checkout_proposals_vault (DONE), Milestone M4 m4_logistics_gear_wall (DONE), Slot Countdown Timer UI, Slot Holding Contract (HoldSlotInput, HoldSlotResult), Cinema-Style 10-Minute Slot Holding Engine

### Community 64 - "Showcase Coverage Script"
Cohesion: 0.29
Nodes (6): components, missing, source, [uiArg, ...roots], uiDir, walk()

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

### Community 71 - "Checkout Actions"
Cohesion: 0.60
Nodes (4): ProcessBookingCheckoutInput, ProcessBookingCheckoutSchema, ProcessInvoicePaymentInput, ProcessInvoicePaymentSchema

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

## Ambiguous Edges - Review These
- `24-Model Prisma Schema (SQLite dev.db)` → `docs/03 Database Schema and Data Models`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **24 isolated node(s):** `Slot Holding Contract (HoldSlotInput, HoldSlotResult)`, `Slot Countdown Timer UI`, `Interactive Proposal Builder with Live Deposit Recalculator`, `Solar Golden Hour Calculation Engine (lib/solar.ts)`, `1-Click WhatsApp Dispatch Links (lib/whatsapp.ts)` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 481 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Login & Not-Found` to `Root Layout & Globals`, `Payment Verification Actions`, `Calendar & Slot Generator`, `Booking & Hold Actions`, `Runtime Dependencies`, `Dev Dependencies`, `Set HUD & Call Sheets`, `Studio Onboarding`, `Frames Admin`, `Wall Art Visualizer`, `Upload Route`, `Services Admin`, `Showcase Gallery UI`, `Checkout Flow`, `Error Boundaries`, `Tenant Showcase Page`, `Proposal Page`, `Super Admin`, `Gear Inventory`, `Admin CMS & Settings Actions`, `Logistics & Visualizer Actions`, `Proposals Admin`, `Services Validation`, `Gear Actions & Schemas`, `Frames Actions & Schemas`, `CMS Admin`, `Admin Layout & Nav`, `Zip Download Route`, `Digital Releases`, `Proposal Templates`, `Health Check & Env`, `SEO Robots & Sitemap`, `Studio Settings`, `Verification Console`, `Admin Dashboard`, `Proposal Actions`, `SaaS Layout & Footer`, `Checkout Actions`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runAdminVerificationTests()` (e.g. with `.assert()` and `.assertEqual()`) actually correct?**
  _`runAdminVerificationTests()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Slot Holding Contract (HoldSlotInput, HoldSlotResult)`, `Slot Countdown Timer UI`, `Interactive Proposal Builder with Live Deposit Recalculator` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Asset Builder Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.06648426812585499 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `Error Boundaries` to `Root Layout & Globals`, `Calendar & Slot Generator`, `Runtime Dependencies`, `Dev Dependencies`, `Set HUD & Call Sheets`, `Studio Onboarding`, `Frames Admin`, `Wall Art Visualizer`, `E2E Test Harness`, `Services Admin`, `Showcase Gallery UI`, `Checkout Flow`, `Tenant Showcase Page`, `Proposal Page`, `Super Admin`, `Gear Inventory`, `Proposals Admin`, `CMS Admin`, `Admin Layout & Nav`, `Gear Inspection Dialog`, `Digital Releases`, `Login & Not-Found`, `Studio Settings`, `Verification Console`, `Admin Dashboard`, `Gear Item Dialog`, `SaaS Layout & Footer`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Should `Root Layout & Globals` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `24-Model Prisma Schema (SQLite dev.db)` and `docs/03 Database Schema and Data Models`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._