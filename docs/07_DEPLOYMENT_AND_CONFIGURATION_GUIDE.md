# CineFlow OS — Deployment & Configuration Guide

**Document Version**: 1.0.0  
**Target Environments**: Local Development (SQLite) & Cloud Production (Vercel / Docker / PostgreSQL)  

---

## 1. Environment Prerequisites

- **Node.js**: v20.x or v22.x+ (v24 LTS supported)
- **Package Manager**: `pnpm` (recommended) or `npm`
- **Database**:
  - Local Dev: SQLite (`file:./dev.db`)
  - Production: PostgreSQL (Supabase, Neon, or Railway)
- **Operating Systems**: macOS, Linux (Ubuntu/Debian), Windows (WSL2)

---

## 2. Environment Variables Specification

Create `.env` based on the following canonical specification:

```bash
# ==============================================================================
# CineFlow OS Canonical Environment Configuration
# ==============================================================================

# Database Connection (SQLite for local dev, PostgreSQL for cloud production)
DATABASE_URL="file:./dev.db"

# Platform Base Domain (used for multi-tenant slug routing)
NEXT_PUBLIC_APP_DOMAIN="cineflow.app"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Authentication & Session Secrets
AUTH_SECRET="cineflow_super_secure_random_session_secret_32_chars_min"

# Optional Cloud Storage (AWS S3 / Cloudflare R2 / Uploadthing for media assets)
# S3_BUCKET_NAME="cineflow-assets"
# S3_REGION="us-east-1"
# S3_ACCESS_KEY_ID="your_access_key"
# S3_SECRET_ACCESS_KEY="your_secret_key"

# Optional Payment Gateway Simulation / Live Keys (Stripe)
# STRIPE_SECRET_KEY="sk_test_..."
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Node Environment
NODE_ENV="development"
```

---

## 3. Local Development Quickstart

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Initialize Database Schema**:
   ```bash
   npx prisma db push
   ```

3. **Seed Database with Multi-Tenant Demo Data**:
   ```bash
   npx prisma db seed
   ```
   *Seeds Lumina CineWorks (`/lumina-cine`), Apex Photo & Motion (`/apex-media`), realistic gear BOMs, convocation and Hari Raya session slots, proposals, call sheets, frame catalogs, and deliverables.*

4. **Start Development Server**:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the CineFlow OS Platform landing page.
   Open [http://localhost:3000/lumina-cine](http://localhost:3000/lumina-cine) to view Lumina's public showcase and booking portal.

---

## 4. Custom Domain DNS Configuration (For Pro Studios)

To enable custom domains (e.g. `studio.apexfilms.com`):

1. **Studio Admin Setup**:
   - The studio owner enters `studio.apexfilms.com` in `/[tenantSlug]/studio/settings`.
2. **Client DNS Record**:
   - In their domain registrar (GoDaddy, Namecheap, Cloudflare), the studio adds a CNAME record:
     | Type | Host / Name | Target / Value | TTL |
     | :--- | :--- | :--- | :--- |
     | `CNAME` | `studio` | `cname.cineflow.app` (or Vercel CNAME) | Automatic / 300 |
3. **Middleware Resolution**:
   - Next.js middleware inspects `req.headers.get("host")`. If it matches a verified tenant `customDomain`, it renders that studio's showcase and portal transparently.

---

## 5. Mobile Progressive Web App (PWA) Installation

CineFlow OS is configured with `manifest.json` and mobile meta tags:
- **iOS (iPhone & iPad)**: Open Safari, tap the Share icon, tap **"Add to Home Screen"**. The app opens full-screen without Safari browser bars.
- **Android**: Open Chrome, tap the menu, tap **"Install App"** or **"Add to Home screen"**.
- Ideal for **On-Set Live Mode** during shoot days.
