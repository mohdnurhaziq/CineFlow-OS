# Implementation Plan: CineFlow OS — The Multi-Tenant Operating System for Photographers & Videographers

A unified, design-forward SaaS platform engineered for **Photographers, Videographers / Filmmakers, and Creative Studios** to run their entire business. Available on **Desktop Web and Mobile/Tablet PWA**, it combines a multi-tenant platform with custom domain support, Awwwards-level dynamic showcases, **100% dynamic settings with full CRUD (Create, Read, Update, Delete) across every module**, campaign & session category grouping (Convocation, Hari Raya, Weddings, Commercial), cinema-style slot holding engine, flexible payment options (Online Card, Studio QR Code, and Cash with manual verification), interactive proposal builder with live add-ons, automated 50% milestone billing paywalls, on-set mobile logistics, gear BOM inventory, direct-to-client photo/video deliverables vaults, and an **AI-assisted Print & Frame Wall Visualizer**.

---

## 1. System Identity & Multi-Tenant SaaS Architecture

**Product Name**: **CineFlow OS**  
**Tagline**: *The Complete Operating System for Photographers & Filmmakers.*

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CINEFLOW OS: SAAS PLATFORM                                │
│   • Marketing Landing (cineflow.app): Sells the OS to photographers & videographers   │
│   • Studio Onboarding (/create-studio): Instant studio creation + slug selection       │
│   • Super-Admin Console (/super-admin): Platform metrics, studios, subscriptions & MRR │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               TENANT STUDIO WORKSPACE (e.g. "Apex Media Works" or custom domain)       │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ 1. Public Showcase & Campaign Booking    │ 2. Studio Suite (100% Dynamic CRUD)         │
│ • Custom domain (e.g. apexfilms.com)     │ • Full CRUD: Service Packages & Pricing     │
│   or platform slug (/[tenantSlug])       │ • Full CRUD: Campaign Categories & Tags     │
│ • Category Filtering:                    │ • Full CRUD: Calendar Slots & Time Rules    │
│   - 🎓 Convocation Sessions              │ • Full CRUD: Frame Moldings & Print Sizes   │
│   - 🌙 Hari Raya Festive Specials        │ • Full CRUD: Proposal Add-ons & Contracts   │
│   - 💍 Weddings & Solemnization          │ • Full CRUD: Gear Inventory & Kit BOMs      │
│   - 🎬 Commercial & Corporate            │ • Full CRUD: Portfolio Showcase Items (CMS) │
│ • Cinema-Style Live Slot Holding         │ • Studio Brand, QR Code & Payment Settings  │
│ • Flexible Payment (Card / QR / Cash)    │ • Manual QR/Cash Payment Verification       │
├──────────────────────────────────────────┴─────────────────────────────────────────────┤
│ 3. Authenticated Client Portal (/[tenantSlug]/client)                                  │
│ • Ultra-lean 3-field onboarding (Name, Email, Phone) + email invite link to set password│
│ • Interactive Proposal Builder: live add-on toggles (Drone, RAW drive, Frames, etc.)   │
│ • Automated Milestone Billing: 50% Retainer (locks shoot calendar)                     │
│ • Private Deliverables Vault with Paywall:                                             │
│   - Watermarked photo proofing, hearting favorites & streaming video (pending)         │
│   - Unlocked high-res photo ZIP & 4K master video downloads (paid)                     │
│ • Interactive Print & Frame Wall Visualizer (8R, 12R, 16R scale & room mockups)        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 100% Dynamic Settings & Studio Admin CRUD Suite (NEW)

Nothing in CineFlow OS is hardcoded. Studio Admins have full control to **Create, Read, Update, and Delete (CRUD)** all configuration entities via intuitive management interfaces:

| Module | What the Admin Can Create, Edit & Delete | Where in Dashboard |
| :--- | :--- | :--- |
| **Service Packages** | Add new packages, edit pricing, change required deposit amount, update turnaround times, edit deliverable bullet points, or delete obsolete packages. | `/[tenantSlug]/studio/services` |
| **Campaign Categories** | Add new seasonal categories (e.g. *Deepavali Special*, *Christmas Mini*, *Matriculation Convo*), edit labels/badges, or delete categories. | `/[tenantSlug]/studio/services/categories` |
| **Calendar Time Slots** | Create single or batch slots for any date, edit start/end times and capacity, change slot prices, block out dates, or delete slots. | `/[tenantSlug]/studio/calendar` |
| **Frame Moldings** | Upload new frame designs (Matte Black, Walnut, Gold), set material & border width, update pricing offsets, or delete frame styles. | `/[tenantSlug]/studio/frames` |
| **Print Sizes** | Add new print sizes (e.g. 4R, 5R, 8R, 10R, 12R, 16R, 20R, 24x36"), edit physical dimensions and base prices, or delete sizes. | `/[tenantSlug]/studio/frames` |
| **Proposal Add-Ons** | Create custom proposal add-ons (Drone, 2nd Shooter, RAW Drive, Extra Hours), edit prices and descriptions, or delete items. | `/[tenantSlug]/studio/proposals/addons` |
| **Gear & Kit Bundles (BOM)** | Create equipment items, update condition/serial numbers/status, create modular kit packages, or delete items. | `/[tenantSlug]/studio/inventory` |
| **Showcase Portfolio (CMS)**| Add new portfolio projects (images, video reels, category, client name), reorder, edit, or delete items live. | `/[tenantSlug]/studio/cms` |
| **Studio Brand & Payment Settings** | Update studio name, slug, custom domain, logo URL, brand color, currency, payment QR code image, bank details, and deposit policies. | `/[tenantSlug]/studio/settings` |

---

## 3. Cinema-Style Real-Time Slot Holding Engine

1. **Instant Temporary Hold upon Slot Selection**:
   - When a client clicks an available slot (e.g. *Hari Raya Session, Sunday 2:00 PM*), the system places a **10-minute hold lock** in the database.
2. **Immediate Lockout for Concurrent Visitors**:
   - Any other customer browsing at the same time sees that slot as disabled with a badge: `HELD BY ANOTHER CLIENT`. Zero double bookings.
3. **Live 10-Minute Checkout Countdown**:
   - The booking client sees a countdown timer bar:
     > ⏱️ **Slot reserved for you: 09:59 remaining** to complete your booking & deposit.
4. **Resolution Outcomes**:
   - **Payment Settled**: Client pays via Card, scans Studio QR, or selects Cash. The slot status permanently locks as `BOOKED`.
   - **Timeout or Abandonment**: Hold automatically releases, and the slot immediately returns to `AVAILABLE` for other customers.

---

## 4. Multi-Tenant Data Model with Dynamic Settings (Prisma SQLite)

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

// Tenant / Studio Workspace
model Tenant {
  id                 String              @id @default(cuid())
  name               String
  slug               String              @unique
  customDomain       String?             @unique
  discipline         String              @default("HYBRID") // PHOTOGRAPHY, VIDEOGRAPHY, HYBRID
  tagline            String?
  bio                String?
  logoUrl            String?
  brandColor         String?             @default("#f59e0b")
  currency           String              @default("USD")
  qrCodeUrl          String?             // Studio payment QR code image URL
  bankDetails        String?             // Bank name, account number, account holder
  subscriptionTier   String              @default("PRO") // STARTER, PRO, STUDIO_UNLIMITED
  subscriptionStatus String              @default("ACTIVE") // ACTIVE, TRIALING, CANCELLED
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  users              User[]
  proposals          Proposal[]
  proposalAddOnTemplates ProposalAddOnTemplate[]
  invoices           MilestoneInvoice[]
  projects           Project[]
  inventoryItems     InventoryItem[]
  kitBundles         KitBundle[]
  frameDesigns       FrameDesign[]
  printSizes         PrintSize[]
  clientBookings     ClientBooking[]
  bookingSlots       BookingSlot[]
  servicePackages    ServicePackage[]
  campaignCategories CampaignCategory[]
  showcaseItems      ShowcaseItem[]
}

// Dynamic Campaign & Session Categories (Admin CRUD)
model CampaignCategory {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // e.g. "Convocation", "Hari Raya Festive", "Wedding", "Studio Portrait"
  slug        String   // e.g. "convocation", "hari-raya"
  badgeIcon   String?  // emoji or icon name e.g. "🎓", "🌙", "💍"
  description String?
  isActive    Boolean  @default(true)
  sortOrder   Int      @default(0)

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, slug])
}

// Dynamic Proposal Add-on Catalog Templates (Admin CRUD)
model ProposalAddOnTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // e.g. "Drone 4K Aerial Coverage", "RAW Unedited Footage Drive"
  description String
  price       Float
  unit        String   @default("fixed") // fixed, per_hour, per_day
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// Live Booking Calendar Time Slots with Campaign Category & Cinema Hold (Admin CRUD)
model BookingSlot {
  id              String         @id @default(cuid())
  tenantId        String
  category        String         @default("STUDIO_PORTRAIT")
  campaignTitle   String?
  date            DateTime
  startTime       String         // e.g. "10:00 AM"
  endTime         String         // e.g. "11:00 AM"
  status          String         @default("AVAILABLE") // AVAILABLE, HELD, PENDING_VERIFICATION, BOOKED, BLOCKED
  heldUntil       DateTime?
  heldBySessionId String?
  price           Float          @default(0.0)
  depositRequired Float          @default(50.0)

  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  booking         ClientBooking?
}

// Frame Moldings & Print Sizes Catalog (Admin CRUD)
model FrameDesign {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  material     String
  moldingWidth Float
  frameColor   String
  previewAsset String
  priceOffset  Float    @default(0.0)
  isAvailable  Boolean  @default(true)

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model PrintSize {
  id           String   @id @default(cuid())
  tenantId     String
  code         String   // e.g. "8R", "12R", "16R"
  name         String
  widthInches  Float
  heightInches Float
  basePrice    Float

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// User & Role
model User {
  id                 String              @id @default(cuid())
  tenantId           String?
  name               String
  email              String              @unique
  phone              String?
  role               String              @default("CLIENT") // SUPER_ADMIN, STUDIO_OWNER, PHOTOGRAPHER, VIDEOGRAPHER, CREW, CLIENT
  passwordHash       String?
  inviteToken        String?             @unique
  inviteTokenExpires DateTime?
  isQuickCreated     Boolean             @default(false)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  tenant             Tenant?             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clientBookings     ClientBooking[]
  clientProposals    Proposal[]          @relation("ClientProposals")
  studioProposals    Proposal[]          @relation("StudioProposals")
  clientProjects     Project[]           @relation("ClientProjects")
  studioProjects     Project[]           @relation("StudioProjects")
  invoices           MilestoneInvoice[]
}

// Proposals & Real-time Add-Ons
model Proposal {
  id                   String              @id @default(cuid())
  tenantId             String
  proposalNumber       String              @unique
  clientId             String
  studioId             String
  title                String
  category             String              @default("COMMERCIAL")
  discipline           String              // PHOTOGRAPHY, VIDEOGRAPHY, HYBRID
  basePrice            Float
  totalPrice           Float
  depositPercentage    Float               @default(50.0)
  depositAmount        Float
  finalBalanceAmount   Float
  status               String              @default("SENT")
  contractTerms        String
  clientSignature      String?
  signedAt             DateTime?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  tenant               Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client               User                @relation("ClientProposals", fields: [clientId], references: [id])
  studio               User                @relation("StudioProposals", fields: [studioId], references: [id])
  addOns               ProposalAddOn[]
  invoices             MilestoneInvoice[]
  project              Project?
}

model ProposalAddOn {
  id          String   @id @default(cuid())
  proposalId  String
  name        String
  description String
  price       Float
  unit        String   @default("fixed")
  quantity    Int      @default(1)
  isSelected  Boolean  @default(false)

  proposal    Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
}

// Milestone Billing with Flexible Payment Methods
model MilestoneInvoice {
  id               String    @id @default(cuid())
  tenantId         String
  invoiceNumber    String    @unique
  proposalId       String?
  projectId        String?
  clientId         String
  milestoneType    String    // RETAINER_50, FINAL_BALANCE_50, PRINT_FRAME_ORDER, BOOKING_DEPOSIT
  amount           Float
  status           String    @default("PENDING") // PENDING, PENDING_VERIFICATION, PAID, OVERDUE
  paymentMethod    String?   // CARD, QR_CODE, CASH, BANK_TRANSFER
  paymentProofUrl  String?
  paymentReference String?
  verifiedBy       String?
  dueDate          DateTime
  paidAt           DateTime?
  createdAt        DateTime  @default(now())

  tenant           Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  proposal         Proposal? @relation(fields: [proposalId], references: [id])
  project          Project?  @relation(fields: [projectId], references: [id])
  client           User      @relation(fields: [clientId], references: [id])
}

// Projects & Operations
model Project {
  id                 String              @id @default(cuid())
  tenantId           String
  projectNumber      String              @unique
  title              String
  category           String              @default("STUDIO_PORTRAIT")
  clientId           String
  studioLeadId       String
  discipline         String
  proposalId         String?             @unique
  status             String              @default("PRE_PRODUCTION")
  shootDates         String?
  budget             Float
  isFinalBalancePaid Boolean             @default(false)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  tenant             Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client             User                @relation("ClientProjects", fields: [clientId], references: [id])
  studioLead         User                @relation("StudioProjects", fields: [studioLeadId], references: [id])
  proposal           Proposal?           @relation(fields: [proposalId], references: [id])
  callSheets         CallSheet[]
  shotItems          ShotItem[]
  digitalReleases    DigitalRelease[]
  deliverables       ClientDeliverable[]
  invoices           MilestoneInvoice[]
  reservations       EquipmentReservation[]
}

// Call Sheets with Golden Hour & Logistics
model CallSheet {
  id                 String   @id @default(cuid())
  projectId          String
  title              String
  shootDate          DateTime
  generalCallTime    String
  locationName       String
  locationAddress    String
  locationPinUrl     String?
  parkingNotes       String?
  hospitalName       String?
  hospitalAddress    String?
  weatherSummary     String?
  temperature        String?
  sunriseTime        String?
  sunsetTime         String?
  goldenHourMorning  String?
  goldenHourEvening  String?
  notes              String?
  crewJson           String?
  createdAt          DateTime @default(now())

  project            Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

// Visual Shot List & Storyboarder
model ShotItem {
  id                String   @id @default(cuid())
  projectId         String
  sceneNumber       String
  shotNumber        String
  framing           String
  cameraLens        String
  lightingSetup     String
  referenceImageUrl String?
  description       String
  status            String   @default("PENDING")
  sortOrder         Int      @default(0)
  createdAt         DateTime @default(now())

  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

// Digital Release Forms
model DigitalRelease {
  id               String   @id @default(cuid())
  projectId        String
  releaseType      String
  signerName       String
  signerEmail      String
  signerPhone      String?
  signerRole       String?
  termsContent     String
  signatureDataUrl String
  signedAt         DateTime @default(now())
  notes            String?

  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

// Direct-to-Client Deliverables Vault
model ClientDeliverable {
  id             String            @id @default(cuid())
  projectId      String
  title          String
  discipline     String
  versionTag     String            @default("v1.0")
  status         String            @default("READY")
  createdAt      DateTime          @default(now())

  project        Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  items          DeliverableItem[]
}

model DeliverableItem {
  id             String            @id @default(cuid())
  deliverableId  String
  itemType       String
  title          String
  previewUrl     String
  downloadUrl    String
  thumbnailUrl   String?
  resolution     String?
  duration       String?
  fileSize       String?
  isClientFav    Boolean           @default(false)
  clientNotes    String?

  deliverable    ClientDeliverable @relation(fields: [deliverableId], references: [id], onDelete: Cascade)
}

// Equipment Inventory & BOM (Admin CRUD)
model InventoryItem {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  sku          String   @unique
  serialNumber String?
  discipline   String   @default("UNIVERSAL")
  category     String
  condition    String   @default("EXCELLENT")
  status       String   @default("AVAILABLE")
  dailyRate    Float?
  location     String?

  tenant         Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  kitBundleItems KitBundleItem[]
  reservations   EquipmentReservation[]
}

model KitBundle {
  id          String          @id @default(cuid())
  tenantId    String
  name        String
  description String
  discipline  String
  dailyRate   Float?

  tenant      Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  items       KitBundleItem[]
}

model KitBundleItem {
  id          String        @id @default(cuid())
  bundleId    String
  itemId      String
  quantity    Int           @default(1)

  bundle      KitBundle     @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  item        InventoryItem @relation(fields: [itemId], references: [id])
}

model EquipmentReservation {
  id           String        @id @default(cuid())
  projectId    String
  itemId       String
  startDate    DateTime
  endDate      DateTime
  status       String        @default("RESERVED")

  project      Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  item         InventoryItem @relation(fields: [itemId], references: [id])
  inspection   InspectionLog?
}

model InspectionLog {
  id               String               @id @default(cuid())
  reservationId    String               @unique
  inspectorName    String
  checkoutCondition String
  checkinCondition  String?
  notes            String?
  createdAt        DateTime             @default(now())

  reservation      EquipmentReservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
}

// Inbound Booking Inquiry & Calendar Slot Binding
model ClientBooking {
  id             String       @id @default(cuid())
  tenantId       String
  trackingCode   String       @unique
  category       String       @default("STUDIO_PORTRAIT")
  clientName     String
  clientEmail    String
  clientPhone    String
  discipline     String
  serviceTier    String
  targetDate     String?
  creativeBrief  String?
  status         String       @default("PENDING")
  depositPaid    Boolean      @default(false)
  depositAmount  Float        @default(0.0)
  paymentMethod  String?
  slotId         String?      @unique
  userId         String?
  createdAt      DateTime     @default(now())

  tenant         Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  slot           BookingSlot? @relation(fields: [slotId], references: [id])
  user           User?        @relation(fields: [userId], references: [id])
}

// Service Packages (Admin CRUD)
model ServicePackage {
  id           String         @id @default(cuid())
  tenantId     String
  category     String         @default("STUDIO_PORTRAIT")
  name         String
  discipline   String
  price        Float
  depositPrice Float          @default(50.0)
  description  String
  deliverables String
  turnaround   String
  isFeatured   Boolean        @default(false)

  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  showcases    ShowcaseItem[]
}

// Showcase Portfolio Items (Admin CRUD)
model ShowcaseItem {
  id               String          @id @default(cuid())
  tenantId         String
  category         String          @default("STUDIO_PORTRAIT")
  title            String
  clientName       String
  discipline       String
  coverImageUrl    String
  videoEmbedUrl    String?
  galleryImages    String?
  servicePackageId String?
  isFeatured       Boolean         @default(true)
  sortOrder        Int             @default(0)

  tenant           Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  servicePackage   ServicePackage? @relation(fields: [servicePackageId], references: [id])
}
```

---

## 5. Verification Plan

### Automated Verification
1. `pnpm install`: Clean installation.
2. `npx prisma db push`: Synchronizes SQLite schema in `dev.db`.
3. `npx prisma db seed`: Populates comprehensive test data:
   - Super Admin user.
   - Two tenant studios: **Lumina CineWorks** and **Apex Photo & Motion**.
   - Dynamic Campaign Categories (Convocation 🎓, Hari Raya 🌙, Wedding 💍, Studio Portrait 📸, Commercial 🎬).
   - Dynamic Service Packages with full CRUD capability.
   - Dynamic Proposal Add-on Templates.
   - Live booking slots with cinema holding and QR/Cash verification records.
   - Dynamic Frame Catalog & Print Sizes.
   - Gear inventory, kit bundles (BOM), and showcase CMS items.
4. `pnpm exec tsc --noEmit`: Strict TypeScript compilation passes with 0 errors.
5. `pnpm build`: Next.js production build succeeds for all routes.

### End-to-End Workflow Verification Flow
1. **Dynamic Settings & CRUD Operations**:
   - In `/lumina-cine/studio/services`: Create a new package "Hari Raya Exclusive Family Special", update its price and deposit, verify it appears live on the public booking page.
   - In `/lumina-cine/studio/frames`: Add a new frame "Smoked Acrylic Shadowbox", edit dimensions, and verify it immediately becomes selectable in the client Print & Frame Visualizer.
   - In `/lumina-cine/studio/settings`: Update studio logo, brand color, and bank QR details, and verify changes propagate immediately.
2. **Category & Campaign Filtered Booking**:
   - Filter by Convocation and Hari Raya tabs; verify isolated slots and packages.
3. **Cinema-Style Slot Holding**:
   - Select slot, verify 10-minute hold lock and countdown timer; verify concurrent visitor sees `HELD BY ANOTHER CLIENT`.
4. **QR & Cash Studio Manual Verification**:
   - Submit QR reference code and verify manual verification in studio invoices.
5. **Interactive Print & Frame Wall Visualizer**:
   - Preview photo in 8R/16R with new frame styles and room scale environment.
6. **Pre-Production Logistics & Paywalled Deliverables**:
   - Test golden hour calculation, WhatsApp dispatch, mobile shot list checkoff, and paywall unlock upon final invoice payment.
