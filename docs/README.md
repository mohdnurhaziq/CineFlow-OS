# CineFlow OS — Complete System Documentation Suite

Welcome to the definitive documentation index for **CineFlow OS**: The Multi-Tenant Creative Operating System for Photographers, Videographers & Production Studios.

---

## 📚 Documentation Index

| Document | Purpose & Key Contents |
| :--- | :--- |
| **[01. Product Requirements Specification (PRD)](01_PRODUCT_REQUIREMENTS_SPECIFICATION.md)** | Executive vision, persona pain points, high-level feature matrix, and non-functional requirements (NFRs). |
| **[02. System Architecture & Data Flows](02_SYSTEM_ARCHITECTURE_AND_DATA_FLOWS.md)** | High-level system architecture, multi-tenant custom domain routing, and Mermaid sequence diagrams for slot holding, proposals, paywalls, and QR/cash verification. |
| **[03. Database Schema & Data Models](03_DATABASE_SCHEMA_AND_MODELS.md)** | Full Prisma ORM schema reference for all 18+ models, field types, relationships, constraints, and cascade behaviors. |
| **[04. Server Actions & API Specification](04_API_AND_SERVER_ACTIONS_SPECIFICATION.md)** | Complete contract specifications for all Next.js Server Actions with Zod schemas, payloads, atomic operations, and return types. |
| **[05. Design System & UI Guidelines ("Nocturne Cine")](05_DESIGN_SYSTEM_AND_UI_GUIDELINES.md)** | Visual standards, "Nocturne Cine" obsidian/amber tokens, Emil Kowalski micro-interaction rules, typography, and on-set HUD layout strategies. |
| **[06. User Journey & Operations Manual](06_USER_JOURNEY_AND_OPERATIONS_MANUAL.md)** | Step-by-step operational workflows for Clients, Studio Producers, Photographers, Videographers, and Super Admins. |
| **[07. Deployment & Configuration Guide](07_DEPLOYMENT_AND_CONFIGURATION_GUIDE.md)** | Environment variables, local quickstart, custom domain DNS CNAME setup, and mobile PWA installation. |
| **[Architecture Plan (Detailed)](ARCHITECTURE_PLAN.md)** | Comprehensive implementation roadmap and modular execution blueprint. |

---

## 🚀 Quick Reference
- **Local Dev Database**: SQLite (`dev.db`) via Prisma ORM
- **Framework**: Next.js 15 App Router + React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui + Radix UI + Lucide Icons
- **Design Aesthetic**: "Nocturne Cine" (Deep Obsidian `#09090b`, Brushed Amber `#f59e0b`, Titanium `#27272a`)
