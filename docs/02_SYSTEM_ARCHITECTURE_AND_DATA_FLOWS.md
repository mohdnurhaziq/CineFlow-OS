# CineFlow OS — System Architecture & Data Flows

**Document Version**: 1.0.0  
**Scope**: High-Level Architecture, Multi-Tenant Routing & Core Transactional Sequence Flows  

---

## 1. High-Level System Architecture

CineFlow OS is structured as a modular full-stack application built on Next.js 15 App Router, TypeScript, Tailwind CSS, and Prisma ORM.

```mermaid
flowchart TB
    ClientDevice["Client Devices (Desktop / Mobile PWA)"]
    CrewDevice["On-Set Mobile HUD (iPads / Phones)"]
    AdminDevice["Studio Desktop Dashboard"]

    subgraph EdgeLayer["Edge / Middleware Layer (Next.js)"]
        DomainRouter["Custom Domain & Tenant Slug Router"]
        AuthGuard["Role & Session Validator"]
    end

    subgraph AppLayer["Application Layer (Next.js 15 App Router)"]
        PublicApp["/(public) Showcase & Booking Wizard"]
        ClientApp["/client/* Deliverables Vault & Proposals"]
        StudioApp["/studio/* Operations, BOM & CMS CRUD"]
        SuperAdmin["/super-admin Platform Console"]
    end

    subgraph ServiceLayer["Business Logic & Server Actions"]
        BookingEngine["Cinema Slot Holding Engine"]
        BillingEngine["Milestone Paywall & QR/Cash Verifier"]
        LogisticsEngine["Solar Golden Hour & WhatsApp Dispatch"]
        DeliveryEngine["Direct Vault Publishing & Frame Visualizer"]
        CrudEngine["Dynamic Settings CRUD Services"]
    end

    subgraph DataLayer["Persistence Layer"]
        PrismaClient["Prisma ORM (Strict Multi-Tenant Scoping)"]
        Database["SQLite (dev.db) / PostgreSQL"]
    end

    ClientDevice --> DomainRouter
    CrewDevice --> DomainRouter
    AdminDevice --> DomainRouter

    DomainRouter --> AuthGuard
    AuthGuard --> PublicApp
    AuthGuard --> ClientApp
    AuthGuard --> StudioApp
    AuthGuard --> SuperAdmin

    PublicApp --> BookingEngine
    ClientApp --> BillingEngine
    ClientApp --> DeliveryEngine
    StudioApp --> LogisticsEngine
    StudioApp --> CrudEngine

    BookingEngine --> PrismaClient
    BillingEngine --> PrismaClient
    LogisticsEngine --> PrismaClient
    DeliveryEngine --> PrismaClient
    CrudEngine --> PrismaClient

    PrismaClient --> Database
```

---

## 2. Multi-Tenant Custom Domain & Slug Resolution

Every HTTP request passes through Next.js middleware, which inspects the `Host` header:
1. **Custom Domain Path**: If `Host` equals a registered tenant's `customDomain` (e.g. `studio.apexfilms.com`), the middleware resolves the tenant record and rewrites the path internally to `/[tenantSlug]/*`, masking the slug from the URL bar.
2. **Platform Subpath**: If `Host` is the platform domain (e.g. `cineflow.app`), requests are routed directly to `/[tenantSlug]/*` for studios or `/` for the platform marketing landing.
3. **Data Scoping Rule**: Every database query across all repositories mandates `where: { tenantId }`, ensuring zero cross-tenant data leakage.

---

## 3. Core Transactional Sequence Flows

### Flow 1: Cinema-Style Real-Time Slot Holding & Deposit Checkout

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Browser
    participant API as Booking Server Action
    participant DB as SQLite / Prisma
    actor Concurrent as Other Visitors

    Client->>API: Select Time Slot (e.g. Saturday 11:15 AM)
    Note over API,DB: Atomic Conditional Lock Check
    API->>DB: UPDATE BookingSlot SET status='HELD', heldUntil=now+10m WHERE id=X AND status='AVAILABLE'
    alt Slot is already held or booked
        DB-->>API: 0 Rows Updated
        API-->>Client: Error ("Slot was just held by another client")
    else Slot is available
        DB-->>API: 1 Row Updated (Lock acquired)
        API-->>Client: Success (Countdown timer 10:00 begins)
        Concurrent->>DB: Query Calendar Slots
        DB-->>Concurrent: Slot X has status='HELD' (Disabled UI)
    end

    opt Timer Reaches 00:00 without payment
        DB->>DB: Auto-expire slot back to status='AVAILABLE'
    end

    Client->>API: Submit Deposit (Card, QR Reference, or Cash)
    API->>DB: UPDATE BookingSlot SET status='BOOKED' (or 'PENDING_VERIFICATION')
    API->>DB: Create ClientBooking & MilestoneInvoice
    API-->>Client: Booking Confirmed + Calendar Invite (.ics)
```

---

### Flow 2: Interactive Proposal Customization & Retainer Milestone Billing

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Portal
    participant API as Proposal Server Action
    participant DB as SQLite / Prisma
    actor Studio as Studio Dashboard

    Studio->>API: Create Proposal with Available Add-Ons
    API->>DB: Store Proposal & AddOnTemplates (Status: SENT)
    Client->>API: Open Proposal Link
    API->>DB: Fetch Proposal Details & Add-Ons
    DB-->>Client: Render Interactive Customizer

    loop Client Toggles Add-Ons (Drone, RAW drive, 2nd shooter)
        Client->>Client: Live Client-Side Recalculation (Subtotal, 50% Deposit, Final Balance, Contract Clauses)
    end

    Client->>API: Sign Digitally & Accept Proposal
    API->>DB: Update Proposal (Status: ACCEPTED, Signature Data)
    API->>DB: Create Project (Status: PRE_PRODUCTION)
    API->>DB: Generate Retainer Milestone Invoice (50%)
    API-->>Client: Render Retainer Invoice Checkout
    API-->>Studio: Notify Studio: Project Scheduled
```

---

### Flow 3: Direct-to-Client Delivery & Milestone Paywall Unlock

```mermaid
sequenceDiagram
    autonumber
    actor Studio as Studio Staff
    participant API as Delivery Server Action
    participant DB as SQLite / Prisma
    actor Client as Client Portal

    Studio->>API: Upload/Publish Photos & 4K Video Links to Project
    API->>DB: Store ClientDeliverable & DeliverableItems
    API->>DB: Generate Final Balance Milestone Invoice (50%)
    API-->>Client: Delivery Ready Notification

    Client->>API: Open Deliverables Vault
    API->>DB: Check isFinalBalancePaid on Project
    alt Final Balance is PENDING
        API-->>Client: Return Watermarked Previews & Video Stream<br/>(Master Download Buttons LOCKED with Paywall Banner)
        Client->>API: Settle Final Balance (Card, QR, or Cash)
        API->>DB: Update Invoice status='PAID' & Project isFinalBalancePaid=true
    end

    API-->>Client: UNLOCK High-Res Photo ZIP & 4K Master Video Downloads
```

---

### Flow 4: QR Code & Cash Manual Studio Verification Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Checkout
    participant API as Payment Server Action
    participant DB as SQLite / Prisma
    actor Studio as Studio Invoices Console

    Client->>API: Select "Pay via Studio QR Code"
    API-->>Client: Display Studio QR Code Image & Bank Account Details
    Client->>Client: Scans with Banking App & Completes Transfer
    Client->>API: Submit Transfer Reference (e.g. "DUITNOW-8921")
    API->>DB: Update Invoice status='PENDING_VERIFICATION', method='QR_CODE'
    API-->>Client: "Payment Submitted — Awaiting Studio Verification"

    Studio->>Studio: Inspects Bank Mobile App & Sees Funds Received
    Studio->>API: Click "Verify & Mark Paid" (with reference notes)
    API->>DB: Update Invoice status='PAID', verifiedBy='Alex Vance'
    API->>DB: Update BookingSlot status='BOOKED'
    API->>DB: If deliverable invoice: Unlock master downloads
    API-->>Studio: Receipt Generated & Client Vault Updated
```

---

### Flow 5: Pre-Production Logistics & Mobile Call Sheet Dispatch

```mermaid
sequenceDiagram
    autonumber
    actor Studio as Studio Producer
    participant Engine as Solar & Logistics Engine
    participant API as Call Sheet Action
    actor Crew as Crew & Talent (WhatsApp)

    Studio->>API: Open Project Call Sheet Builder
    API->>Engine: Calculate Solar Times (Lat/Lng, Shoot Date)
    Engine-->>API: Return Sunrise, Sunset, Morning Golden Hour, Evening Golden Hour
    Studio->>API: Add Location Pin, Parking Notes, Hospital & Department Call Times
    API->>API: Save Call Sheet Record
    Studio->>API: Click "Dispatch WhatsApp Update"
    API-->>Studio: Generate Formatted wa.me URL with Golden Hour & Mobile Call Sheet Link
    Studio->>Crew: Broadcasts WhatsApp Message
    Crew->>Crew: Tap Link to Open High-Contrast Mobile Call Sheet on Set
```
