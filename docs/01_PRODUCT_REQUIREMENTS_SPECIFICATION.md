# CineFlow OS — Product Requirements Specification (PRD)

**Document Version**: 1.0.0  
**Status**: Approved for Scaffolding  
**System Name**: CineFlow OS  
**Target Domain**: Media Production, Commercial Photography, Cinematography & Creative Studios  

---

## 1. Executive Summary & Vision

CineFlow OS is an all-in-one, multi-tenant operating system designed for **Photographers, Videographers / Filmmakers, and Creative Production Studios**. It resolves the fragmentation visual creators face by unifying:
1. **Awwwards-Level Brand Showcase**: Public website to attract clients with cinematic video reels and photo lightboxes.
2. **Client Self-Service Portal**: Frictionless 3-field booking, cinema-style slot holding, interactive proposals with live add-on toggles, and private deliverables vaults.
3. **Automated Milestone Billing**: 50% deposit on signing and 50% final balance paywalls for deliverable downloads, supporting Online Card, Studio QR Code, and Cash in person.
4. **On-Set Mobile Companion (PWA)**: High-contrast on-set HUD with solar/golden hour calculations, WhatsApp schedule dispatch, visual shot lists with check-off, and touchscreen talent release forms.
5. **Interactive Print & Frame Wall Visualizer**: Real-world scale preview (8R, 12R, 16R) with custom frame moldings and room mockups to drive physical print sales.
6. **Multi-Tenancy & Custom Domains**: Platform owner can sell CineFlow OS to other creators, with custom domain support (`studio.clientbrand.com`).
7. **100% Dynamic Settings**: Complete admin CRUD on packages, campaign categories, calendar slots, frame designs, print sizes, gear BOMs, and studio settings.

---

## 2. User Personas & Problems Solved

### Persona 1: The Studio Owner / Lead Creator (e.g. Alex)
- **Pain Points**:
  - Double bookings during high-demand seasons (Convocation, Hari Raya, Wedding seasons).
  - Clients failing to pay final balances after receiving high-res files.
  - Manual, tedious PDF quote creation that clients take days to sign.
  - Tracking expensive gear kits across simultaneous shoot days.
  - Friction receiving payments via local QR code or cash at the studio counter.
- **CineFlow OS Solutions**:
  - Cinema-style slot holding locks calendar slots for 10 minutes during checkout.
  - Automatic paywall keeps high-res downloads locked until final 50% balance is verified.
  - Interactive proposal with live add-ons that clients sign on their phones.
  - Kit Bundles (BOM) with check-in/out inspection condition logs.
  - Dedicated Studio Manual Payment Verification Console for QR and Cash payments.

### Persona 2: The Studio Client (e.g. Elena — Graduate / Brand Manager / Bride)
- **Pain Points**:
  - Hates filling out long, exhausting 15-field booking questionnaires.
  - Unclear about how big an 8R or 12R photo actually looks on a living room wall.
  - Awkward email back-and-forth negotiating shoot add-ons (drone, extra hours).
  - Difficulties downloading and organizing delivered photo proofs.
- **CineFlow OS Solutions**:
  - Ultra-lean 3-field booking (Name, Email, Phone).
  - Interactive Wall Visualizer previewing framed photos mounted over real furniture.
  - Real-time add-on toggles on interactive proposals with instant price recalculations.
  - Private Deliverables Vault to heart favorites, leave retouch notes, stream video, and download master files.

### Persona 3: On-Set Crew & Talent (e.g. DPs, Camera Ops, Models, Gaffers)
- **Pain Points**:
  - Cluttered PDF call sheets sent on email that are illegible on a phone screen.
  - Missed Golden Hour lighting windows on outdoor shoot days.
  - Paper talent release forms that get crumpled, stained, or lost on location.
- **CineFlow OS Solutions**:
  - Mobile-first responsive call sheet with 1-tap GPS map pins and hospital details.
  - Solar calculator displaying sunrise, sunset, and morning/evening golden hour.
  - 1-click WhatsApp schedule alert dispatch.
  - Mobile touchscreen digital release forms that link directly into the project folder.

---

## 3. High-Level Feature Matrix

| Feature Module | Capabilities | Target User |
| :--- | :--- | :--- |
| **SaaS Multi-Tenancy** | Custom domain mapping, subpath routing, studio workspace isolation, Super-Admin console, MRR tracking. | Platform Owner & Studios |
| **Public Showcase** | Dark "Nocturne Cine" aesthetic, category-filtered portfolio (Photo/Video/Hybrid), video reel modal, client testimonials. | Public Visitors & Clients |
| **Cinema-Style Booking** | Real-time calendar, 10-minute slot holding lock, live countdown timer, 0% double booking guarantee. | Clients & Studio |
| **Flexible Payments** | Online Card, Studio QR Code Scan (e.g. DuitNow/Bank QR) with receipt proof upload, and Cash at Studio Counter with 1-click studio verification. | Clients & Studio Staff |
| **Interactive Proposals** | Base package selection, real-time add-on toggles (Drone, RAW drive, 2nd shooter, extra hours), live contract updates, digital signature. | Clients & Studio Admins |
| **Milestone Paywall** | 50% retainer locks calendar; 50% final balance unlocks uncompressed high-res photo ZIP and 4K video downloads. | Clients & Studio Admins |
| **Print & Frame Visualizer**| 8R, 12R, 16R size scaling, custom studio moldings (Matte Black, Walnut, Gold), room scale mockups, 1-click print order invoicing. | Photography Clients |
| **On-Set Logistics** | Solar/Golden hour calculations, weather forecast, 1-click WhatsApp dispatch, visual shot list with check-off, digital release touch signatures. | On-set Crew & Talent |
| **Gear BOM Inventory** | Cinema/photo equipment registry, modular kit packages (BOM), pre/post-shoot inspection condition logs. | Studio Equipment Techs |
| **100% Dynamic CRUD** | Full create, read, update, delete control for packages, categories, slots, frames, print sizes, add-ons, and studio settings. | Studio Administrators |

---

## 4. Non-Functional Requirements (NFRs)

1. **Performance**:
   - Time-to-Interactive (TTI) < 1.5s on desktop, < 2.5s on 4G mobile.
   - Atomic database slot holding transactions executed in < 50ms to prevent race conditions.
2. **Security & Data Isolation**:
   - Strict tenant scoping (`where: { tenantId }`) on every relational query.
   - High-res master file download URLs signed or paywall-protected server-side.
   - Passwords hashed using bcrypt with salt rounds >= 10.
3. **Responsive & Mobile Accessibility (PWA)**:
   - Full support for touch gestures (swipe photo lightbox, canvas signature pad).
   - High-contrast On-Set HUD readable in direct sunlight on shooting locations.
   - WCAG 2.1 AA compliant color contrast ratios on all text and controls.
4. **Reliability & Portability**:
   - Zero-dependency local development via SQLite (`dev.db`).
   - 100% Prisma ORM schema compatibility with PostgreSQL for cloud deployment.
