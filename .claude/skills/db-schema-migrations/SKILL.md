---
name: db-schema-migrations
description: Use this skill when designing relational or document database schemas, generating and applying Prisma or Drizzle migrations, writing idempotent seed scripts, optimizing query performance, and configuring database indexes.
---

# Database Schema Design & Migrations Skill

## 1. Objectives
- Design normalized, scalable database schemas for PostgreSQL and SQLite using Prisma or Drizzle ORM.
- Execute zero-downtime, non-destructive schema migrations with strict rollback consideration.
- Mandate explicit indexing strategies: B-tree indexes on foreign keys, compound indexes for composite filtering, and partial indexes for sparse flags.
- Implement idempotent seed routines using `upsert` or `ON CONFLICT DO UPDATE` to ensure safe, repeatable execution.
- Validate database performance and query plans using `EXPLAIN (ANALYZE, BUFFERS)` via Postgres MCP.

---

## 2. Triggers
Activate this skill when:
- Creating new database models or tables (users, teams, posts, billing, audit logs).
- Altering existing schemas (adding columns, renaming fields, introducing relations).
- Generating and applying migrations (`prisma migrate dev`, `drizzle-kit generate`).
- Crafting reproducible mock/seed datasets for testing and local development.
- Investigating slow query performance or missing database indexes.
- Triggered explicitly via user prompt or slash command: `/migrate`, `/db-schema`, `/seed-db`.

---

## 3. Inputs & Prerequisites
Before executing this skill, identify or request:
- **Database Engine:** PostgreSQL (production standard) or SQLite (embedded/local development).
- **ORM / Query Builder:** Prisma (`prisma/schema.prisma`) or Drizzle (`src/server/db/schema.ts`).
- **Entity Relationships:** One-to-one, one-to-many, many-to-many junction tables, and referential actions (`CASCADE`, `SET NULL`, `RESTRICT`).
- **Query Patterns:** Primary read paths, filtering attributes, sorting requirements, and pagination strategies.

---

## 4. Architectural Rules & Naming Standards

1. **Table & Column Naming:**
   - Tables: `snake_case` plural (e.g., `users`, `project_memberships`, `audit_logs`).
   - Columns: `snake_case` singular (e.g., `id`, `user_id`, `created_at`, `updated_at`).
   - Foreign Keys: `<singular_table>_id` with foreign key constraints.
2. **Foreign Key Indexing Rule:**
   - Every foreign key column MUST have an explicit index. Relational joins without indexes cause full sequential table scans, degrading performance as tables grow.
3. **Non-Destructive Migration Rule:**
   - Never drop or rename a production column in a single migration step.
   - Use the **Expand and Contract** pattern:
     1. *Expand:* Add new column as nullable; update application code to write to both old and new columns.
     2. *Backfill:* Populate historical rows in background script.
     3. *Contract:* Update application code to read from new column; make column non-nullable; deprecate/drop old column in subsequent release.

---

## 5. Step-by-Step Implementation Procedure

### Step 5.1: Prisma Schema Modeling
Define models with explicit mappings to snake_case table names and foreign key indexes in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  USER
  ADMIN
  OWNER
}

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  name          String?
  role          UserRole     @default(USER)
  avatarUrl     String?      @map("avatar_url")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  memberships   Membership[]
  authoredPosts Post[]

  @@index([role])
  @@map("users")
}

model Organization {
  id          String       @id @default(cuid())
  name        String
  slug        String       @unique
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  memberships Membership[]
  posts       Post[]

  @@map("organizations")
}

model Membership {
  id             String       @id @default(cuid())
  role           String       @default("member")
  userId         String       @map("user_id")
  organizationId String       @map("organization_id")
  createdAt      DateTime     @default(now()) @map("created_at")

  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@index([userId])
  @@index([organizationId])
  @@map("memberships")
}

model Post {
  id             String       @id @default(cuid())
  title          String
  slug           String
  content        String?
  published      Boolean      @default(false)
  authorId       String       @map("author_id")
  organizationId String       @map("organization_id")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  author         User         @relation(fields: [authorId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, slug])
  @@index([authorId])
  @@index([organizationId, published, createdAt])
  @@map("posts")
}
```

### Step 5.2: Drizzle ORM Schema Alternative
Define equivalent models in TypeScript using `drizzle-orm/pg-core` at `src/server/db/schema.ts`:

```typescript
import { pgTable, text, timestamp, boolean, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN", "OWNER"]);

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRoleEnum("role").default("USER").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("users_role_idx").on(table.role),
]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content"),
  published: boolean("published").default(false).notNull(),
  authorId: text("author_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("posts_author_idx").on(table.authorId),
  index("posts_published_created_idx").on(table.published, table.createdAt),
]);
```

### Step 5.3: Idempotent Database Seeding
Create `prisma/seed.ts` ensuring duplicate runs never crash or duplicate records:

```typescript
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  console.log("🌱 Starting idempotent database seed...");

  // Upsert Admin User
  const admin = await prisma.user.upsert({
    where: { email: "admin@vibe.dev" },
    update: { name: "Lead Admin" },
    create: {
      email: "admin@vibe.dev",
      name: "Lead Admin",
      role: UserRole.ADMIN,
    },
  });

  // Upsert Organization
  const org = await prisma.organization.upsert({
    where: { slug: "acme-corp" },
    update: { name: "Acme Corporation" },
    create: {
      name: "Acme Corporation",
      slug: "acme-corp",
    },
  });

  // Upsert Membership
  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: org.id,
      },
    },
    update: { role: "owner" },
    create: {
      userId: admin.id,
      organizationId: org.id,
      role: "owner",
    },
  });

  console.log("✅ Seed completed successfully.");
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## 6. Tool Synergies (Postgres MCP Integration)
Verify migrations and query optimization directly using Postgres MCP:

1. **Introspect Live Schema:**
   - Call `postgres_describe_table` with `tableName: "posts"`.
   - Confirm all columns, primary keys, and foreign keys match the schema specification.
2. **Verify Index Creation:**
   - Execute query via `postgres_read_query`:
     ```sql
     SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'posts';
     ```
   - Verify that `posts_author_id_idx` and `posts_organization_id_published_created_at_idx` exist.
3. **Execution Plan Validation (`EXPLAIN ANALYZE`):**
   - Execute query via `postgres_read_query`:
     ```sql
     EXPLAIN (ANALYZE, BUFFERS)
     SELECT id, title FROM posts
     WHERE organization_id = 'org_123' AND published = true
     ORDER BY created_at DESC LIMIT 10;
     ```
   - Confirm plan indicates `Bitmap Index Scan` or `Index Scan` using the composite index, and verifies 0 `Seq Scan` occurrences.

---

## 7. Concrete Prompt Examples

### Example 1: Creating a Team Multi-Tenancy Migration
> "Using the `db-schema-migrations` skill, add Organization and Membership models to our Prisma schema with foreign key cascade deletions, compound indexes for querying posts by organization and publication date, and an idempotent upsert seed routine."

### Example 2: Optimizing a Slow Query
> "Our query filtering posts by author and published date is taking 240ms on 100k rows. Using the `db-schema-migrations` skill, analyze the index requirements, generate a migration to add the composite index, and formulate the EXPLAIN ANALYZE query to verify the fix."
