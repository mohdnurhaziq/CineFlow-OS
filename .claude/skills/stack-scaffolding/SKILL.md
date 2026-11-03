---
name: stack-scaffolding
description: Use this skill when initializing or scaffolding a new full-stack web project, setting up modern tooling (Next.js 15 App Router, React 19, Vite, Tailwind CSS v4, TypeScript), configuring package managers (pnpm/bun), linting, Zod environment validation, and baseline health checks.
---

# Full-Stack Application Scaffolding Skill

## 1. Objectives
- Establish a production-grade, strictly typed full-stack workspace adhering to Next.js 15 App Router or Vite React 19 standards.
- Enforce fail-fast runtime environment variable validation using Zod.
- Configure modern styling pipelines via Tailwind CSS v4 and PostCSS.
- Establish clean directory modularity separating client UI, server business logic, and database schemas.
- Ensure automated build, typecheck, and health-check verification pass with zero warnings or errors.

---

## 2. Triggers
Activate this skill when:
- Initializing a new greenfield web application or microservice.
- Bootstrapping a repository workspace with Next.js 15, React 19, or Vite.
- Setting up TypeScript strict mode, path aliases, ESLint, or Prettier.
- Adding full-stack infrastructure foundations (Prisma, Drizzle, Zod env schemas).
- Triggered explicitly via user prompt or slash command: `/scaffold`, `/init-stack`, `/bootstrap`.

---

## 3. Inputs & Prerequisites
Before executing this skill, identify or request:
- **Project Name & Target Directory:** Absolute or relative path for workspace root.
- **Framework Choice:** Next.js 15 (App Router with SSR/RSC) vs. Vite React 19 SPA.
- **Package Manager:** `pnpm` (default/recommended) or `bun` / `npm`.
- **Database / ORM Preference:** PostgreSQL with Prisma ORM or Drizzle ORM (or SQLite for embedded apps).
- **Styling Preference:** Tailwind CSS v4 with `@tailwindcss/typography` and utility class helpers (`clsx`, `tailwind-merge`).

---

## 4. Directory Layout Standard

```text
├── .env.example              # Canonical template for all environment variables (no secrets)
├── .env.local                # Local development credentials (strictly gitignored)
├── .gitignore                # Standard Node/Next ignore file
├── package.json              # Module configuration with "type": "module"
├── tsconfig.json             # Strict TypeScript configuration with @/* path aliases
├── postcss.config.mjs        # PostCSS configuration for Tailwind
├── next.config.ts            # Next.js 15 build and security headers config
├── src/
│   ├── app/                  # Next.js 15 App Router root
│   │   ├── layout.tsx        # Root HTML layout with font optimization & theme provider
│   │   ├── page.tsx          # Default landing / hero page
│   │   ├── error.tsx         # Client error boundary
│   │   ├── not-found.tsx     # 404 handler
│   │   ├── loading.tsx       # Suspense streaming fallback skeleton
│   │   └── api/              # Route handlers
│   │       └── health/       # Health check smoke test endpoint
│   │           └── route.ts
│   ├── components/
│   │   ├── ui/               # Primitive headless UI components (shadcn / Radix)
│   │   └── shared/           # Composed layout modules (Navbar, Footer, Sidebar)
│   ├── lib/
│   │   ├── db.ts             # Singleton Prisma or Drizzle database client
│   │   ├── env.ts            # Runtime Zod validation for process.env
│   │   └── utils.ts          # Common utility functions (cn helper: clsx + twMerge)
│   ├── server/               # Server-only business actions and data queries
│   │   ├── actions/          # Next.js Server Actions
│   │   └── services/         # Domain business logic
│   ├── styles/
│   │   └── globals.css       # Tailwind directives and CSS token variables
│   └── types/
│       └── index.ts          # Shared TypeScript domain interfaces
```

---

## 5. Step-by-Step Scaffolding Procedure

### Step 5.1: Package Manifest & TypeScript Initialization
Initialize `package.json` with ESM support and strict TypeScript configuration:

1. Create `package.json`:
```json
{
  "name": "fullstack-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

2. Create `tsconfig.json` with strict compiler flags:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Step 5.2: Tailwind CSS v4 & Styling Setup
1. Configure `src/styles/globals.css` with CSS custom properties (HSL/OKLCH) for clean dark mode switching:
```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-feature-settings: "rlig" 1, "calt" 1;
}
```

2. Establish class concatenation helper in `src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

### Step 5.3: Fail-Fast Zod Environment Validation
Create `src/lib/env.ts` to ensure the application fails at build/boot time if required secrets or URLs are missing or malformed:
```typescript
import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URI"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters long"),
  PORT: z.coerce.number().default(3000),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const mergedSchema = serverEnvSchema.merge(clientEnvSchema);

export type Env = z.infer<typeof mergedSchema>;

function validateEnv(): Env {
  const result = mergedSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables detected:", result.error.format());
    throw new Error("Invalid environment configuration. Check your .env file against .env.example.");
  }
  return result.data;
}

export const env = validateEnv();
```

Populate `.env.example` with exact dummy templates:
```bash
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vibe_app?schema=public"
AUTH_SECRET="your-32-char-random-secret-key-change-me"
PORT=3000
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Step 5.4: Baseline Smoke & Health Check Endpoint
Create `src/app/api/health/route.ts` for automated container, ingress, and agent verification:
```typescript
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const uptime = process.uptime();
  return NextResponse.json(
    {
      status: "ok",
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(uptime),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
```

### Step 5.5: Database Client Singleton
Configure `src/lib/db.ts` to prevent hot-reload connection leaks:
```typescript
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

---

## 6. Tool Synergies (MCP Integration)
When executing this skill, leverage the following MCP tools for deterministic verification:

- **Filesystem MCP (`@modelcontextprotocol/server-filesystem`):**
  - Use `write_file` to construct the directory structure and file skeletons atomically.
  - Use `read_file` to inspect `package.json` and ensure dependencies are aligned.
  - Verify path safety within designated workspace boundaries.
- **Fetch MCP (`@modelcontextprotocol/server-fetch`):**
  - Once the dev server is started, issue a GET request to `http://localhost:3000/api/health`.
  - Assert that the response returns HTTP 200 and `{ status: "ok" }`.
- **Git MCP (`mcp-server-git`):**
  - Call `git_status` to verify clean scaffolding.
  - Stage all files and create an initial commit: `feat: scaffold modern fullstack next.js 15 app router workspace`.

---

## 7. Concrete Prompt Examples

### Example 1: Full-Stack Greenfield Scaffolding
> "Using the `stack-scaffolding` skill, initialize a new Next.js 15 App Router project in the current workspace with TypeScript strict mode, Tailwind CSS v4, Zod environment validation for DATABASE_URL and AUTH_SECRET, and an initial /api/health endpoint. Use pnpm."

### Example 2: Scaffolding a Module within Existing Project
> "I need to bootstrap the `/server` and `/types` architecture for our authentication module according to the `stack-scaffolding` skill standard. Create the directory layout, env validation, and baseline types."
