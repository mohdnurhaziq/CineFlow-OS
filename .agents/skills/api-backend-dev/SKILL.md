---
name: api-backend-dev
description: Use this skill when implementing REST endpoints, Next.js route handlers, Server Actions, tRPC routers, Zod schema validation, error-handling middleware, and authentication/authorization guards.
---

# API & Backend Implementation Skill

## 1. Objectives
- Develop strictly typed, secure REST endpoints and Next.js 15 Server Actions.
- Enforce contract-driven validation using Zod for all request bodies, query strings, headers, and route parameters.
- Standardize all API error responses in compliance with RFC 7807 Problem Details for HTTP APIs.
- Implement robust session authentication and role-based access control (RBAC) guards before executing business logic.
- Verify live endpoint contracts and error paths via automated HTTP requests using Fetch MCP.

---

## 2. Triggers
Activate this skill when:
- Creating or updating API routes (`src/app/api/**/route.ts`).
- Writing Next.js Server Actions for form submissions and mutations.
- Implementing tRPC routers or GraphQL resolvers.
- Adding request validation, sanitization, or rate limiting.
- Designing standard error envelopes or authentication guards.
- Triggered explicitly via user prompt or slash command: `/api`, `/backend`, `/route-handler`.

---

## 3. Inputs & Prerequisites
Before executing this skill, identify or request:
- **HTTP Method & Path:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE` at `/api/<resource>/...`.
- **Request Contract:** Zod schema defining query parameters, URL slug params, and JSON body payload.
- **Authentication & RBAC Scopes:** Public vs. authenticated session required, required user roles (`USER`, `ADMIN`, `OWNER`).
- **Response Format:** Success envelope (`{ data: T, meta?: PaginationMeta }`) and specific error scenarios.

---

## 4. RFC 7807 Problem Details Specification
All non-2xx API responses must adhere to the standard RFC 7807 Problem Details structure:

```typescript
export interface ProblemDetails {
  type: string;                  // Absolute or relative URI identifying problem category
  title: string;                 // Short, human-readable summary of the problem type
  status: number;                // HTTP status code matching response
  detail: string;                // Specific explanation of this occurrence
  instance?: string;             // URI reference of the resource where error occurred
  errors?: Record<string, string[]>; // Field-level validation error maps
}
```

Standard Problem Types:
- `400`: `https://api.vibe.dev/errors/bad-request`
- `401`: `https://api.vibe.dev/errors/unauthorized`
- `403`: `https://api.vibe.dev/errors/forbidden`
- `404`: `https://api.vibe.dev/errors/not-found`
- `422`: `https://api.vibe.dev/errors/validation-error`
- `429`: `https://api.vibe.dev/errors/rate-limited`
- `500`: `https://api.vibe.dev/errors/internal-error`

---

## 5. Step-by-Step Implementation Procedure

### Step 5.1: Create Standard Error Helper
Create `src/lib/api-error.ts`:

```typescript
import { NextResponse } from "next/server";
import { ProblemDetails } from "@/types";

export function createErrorResponse(
  status: number,
  title: string,
  detail: string,
  options?: {
    type?: string;
    instance?: string;
    errors?: Record<string, string[]>;
  }
) {
  const problem: ProblemDetails = {
    type: options?.type ?? `https://api.vibe.dev/errors/http-${status}`,
    title,
    status,
    detail,
    instance: options?.instance,
    errors: options?.errors,
  };

  return NextResponse.json(problem, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
    },
  });
}
```

### Step 5.2: Implement Next.js 15 REST Route Handler
Create `src/app/api/posts/route.ts` with authentication, Zod validation, and database mutation:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createErrorResponse } from "@/lib/api-error";

// Request Body Validation Schema
const CreatePostInputSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title cannot exceed 120 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  content: z.string().optional(),
  published: z.boolean().default(false),
  organizationId: z.string().min(1, "Organization ID is required"),
});

// Mock Session Extractor (replace with real auth library like Lucia or NextAuth)
async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.replace("Bearer ", "");
  if (token === "invalid") return null;
  return { id: "user_mock_123", email: "user@vibe.dev", role: "ADMIN" };
}

export async function POST(req: NextRequest) {
  const instance = req.nextUrl.pathname;

  try {
    // 1. Authentication Guard
    const user = await authenticateRequest(req);
    if (!user) {
      return createErrorResponse(
        401,
        "Unauthorized",
        "Authentication credentials are missing or invalid.",
        { type: "https://api.vibe.dev/errors/unauthorized", instance }
      );
    }

    // 2. Request Parsing & Validation
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return createErrorResponse(
        400,
        "Bad Request",
        "Malformed JSON payload provided.",
        { type: "https://api.vibe.dev/errors/bad-request", instance }
      );
    }

    const parseResult = CreatePostInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return createErrorResponse(
        422,
        "Validation Failed",
        "One or more fields failed input validation constraints.",
        {
          type: "https://api.vibe.dev/errors/validation-error",
          instance,
          errors: parseResult.error.flatten().fieldErrors,
        }
      );
    }

    const { title, slug, content, published, organizationId } = parseResult.data;

    // 3. Authorization / Membership Check
    const membership = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (!membership && user.role !== "ADMIN") {
      return createErrorResponse(
        403,
        "Forbidden",
        "You do not possess permission to publish posts in this organization.",
        { type: "https://api.vibe.dev/errors/forbidden", instance }
      );
    }

    // 4. Persistence Execution
    const post = await db.post.create({
      data: {
        title,
        slug,
        content,
        published,
        authorId: user.id,
        organizationId,
      },
    });

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (err: unknown) {
    console.error("Unhandled API error in POST /api/posts:", err);
    return createErrorResponse(
      500,
      "Internal Server Error",
      "An unexpected system exception occurred while processing the request.",
      { type: "https://api.vibe.dev/errors/internal-error", instance }
    );
  }
}
```

### Step 5.3: Next.js 15 Server Action Pattern
Create `src/server/actions/create-post.ts` for form-based mutations:

```typescript
"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

const ActionSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  content: z.string().optional(),
});

export type ActionState = {
  success: boolean;
  errors?: Record<string, string[]>;
  message?: string;
};

export async function createPostAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = {
    title: formData.get("title"),
    content: formData.get("content"),
  };

  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
      message: "Validation failed.",
    };
  }

  try {
    // In real app: retrieve session user id
    const authorId = "user_mock_123";
    const organizationId = "org_mock_123";

    await db.post.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.title.toLowerCase().replace(/\s+/g, "-"),
        content: parsed.data.content,
        authorId,
        organizationId,
      },
    });

    revalidatePath("/posts");
    return { success: true, message: "Post created successfully." };
  } catch (error) {
    return {
      success: false,
      message: "Failed to persist post to database.",
    };
  }
}
```

---

## 6. Tool Synergies (Fetch MCP & Postgres MCP Integration)
Verify the endpoint live using Fetch MCP and Postgres MCP:

1. **Verify 401 Unauthorized Response:**
   - Call `fetch_request` with `url: "http://localhost:3000/api/posts"`, `method: "POST"`, no auth headers.
   - Assert `status === 401` and `response.body.type === "https://api.vibe.dev/errors/unauthorized"`.
2. **Verify 422 Validation Error Response:**
   - Call `fetch_request` with valid `Authorization: Bearer <token>`, but body payload `{ title: "a" }` (too short).
   - Assert `status === 422` and `response.body.errors.title` contains `"Title must be at least 3 characters"`.
3. **Verify 201 Created Response:**
   - Call `fetch_request` with valid bearer token and valid body `{ title: "Vibe Coding Guide", slug: "vibe-guide", organizationId: "org_1" }`.
   - Assert `status === 201` and `response.body.data.id` is defined.
4. **Inspect Database Mutation:**
   - Use `postgres_read_query` to query the `posts` table:
     ```sql
     SELECT id, title, slug FROM posts WHERE slug = 'vibe-guide';
     ```
   - Assert the row exists and was properly committed.

---

## 7. Concrete Prompt Examples

### Example 1: Creating a Validated REST Route
> "Using the `api-backend-dev` skill, build the `/api/organizations/[orgId]/invites` route handler supporting POST. It must authenticate the user, validate the email input with Zod, verify organization admin permissions, and return an RFC 7807 problem details response on error."

### Example 2: Building a Typed Server Action
> "Create a Next.js Server Action in `src/server/actions/update-profile.ts` following `api-backend-dev`. It must parse form inputs with Zod, support useActionState, update the user profile in the database, and revalidate the `/settings` path."
