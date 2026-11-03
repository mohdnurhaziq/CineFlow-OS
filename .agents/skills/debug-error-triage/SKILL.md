---
name: debug-error-triage
description: Use this skill when investigating bugs, diagnosing server or browser console errors, analyzing stack traces, resolving React hydration mismatches, reproducing regression failures, and executing test-driven debugging loops.
---

# Systematic Debugging & Error Triage Skill

## 1. Objectives
- Execute a deterministic, 5-step triage framework to diagnose full-stack bugs rapidly without speculative guesswork.
- Parse and classify browser console errors, network request failures (4xx/5xx), and server runtime exceptions.
- Resolve common modern web failure modes including React hydration mismatches, database connection pool exhaustion, and CORS issues.
- Enforce Test-Driven Debugging (TDD): write an isolated failing reproduction test before altering production code.
- Isolate regressions and stage atomic bugfix commits with verification evidence using Git MCP and Playwright MCP.

---

## 2. Triggers
Activate this skill when:
- An unhandled exception or stack trace appears in server logs or browser console.
- A test in Vitest, Jest, or Playwright fails unexpectedly.
- A user reports broken behavior, infinite spinners, or unresponsiveness.
- React throws a hydration error (`Text content does not match server-rendered HTML`).
- Next.js or Node.js logs database pool timeouts or deadlocks.
- Triggered explicitly via user prompt or slash command: `/debug`, `/triage`, `/fix-error`.

---

## 3. Inputs & Prerequisites
Before executing this skill, collect:
- **Verbatim Error Output:** Complete error message, error name/code, and stack trace.
- **Environment Context:** Browser, Node/Bun version, operating system, and recent code modifications.
- **Reproduction Steps:** Sequence of user actions, API payload, or route URL that triggers the fault.
- **Affected Artifacts:** File paths and suspected line numbers indicated in the stack trace.

---

## 4. Step-by-Step Triage Procedure (5-Step Framework)

```text
[Step 1: Classify Error] ──► [Step 2: Reproduce via Test] ──► [Step 3: Trace Root Cause]
                                                                        │
[Step 5: Verify & Commit] ◄── [Step 4: Minimal Atomic Fix] ◄────────────┘
```

### Step 4.1: Symptom Collection & Classification
Classify the error into one of six standard archetypes:
1. **Type & Compilation Error:** TypeScript `TS2xxx` or bundler syntax errors.
2. **Runtime Null/Undefined Reference:** `TypeError: Cannot read properties of undefined`.
3. **React Hydration Mismatch:** Server HTML differs from client initial render tree.
4. **Network & Protocol Error:** 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable, 502/504 Bad Gateway.
5. **Database Constraint / Pool Exhaustion:** Unique violation, foreign key failure, connection pool timeout.
6. **Asynchronous Race Condition:** Stale state update, unmounted component state set, out-of-order API responses.

### Step 4.2: Minimal Reproduction Case
Never modify application code until you have a reproducible failure. Create an automated test reproducing the bug:

```typescript
// tests/reproductions/issue-142.test.ts
import { describe, it, expect } from "vitest";
import { parseUserDisplayName } from "@/lib/user-utils";

describe("Bugfix Reproduction: Issue #142 - User Display Name with Null Profile", () => {
  it("should return fallback email when profile metadata object is null", () => {
    const input = {
      email: "engineer@vibe.dev",
      profile: null, // Previously caused: TypeError: Cannot read properties of null (reading 'fullName')
    };

    // This assertion should FAIL before the bugfix is applied
    expect(() => parseUserDisplayName(input)).not.toThrow();
    expect(parseUserDisplayName(input)).toBe("engineer@vibe.dev");
  });
});
```

### Step 4.3: Hypothesis Formulation & Call-Chain Tracing
1. Follow the stack trace from bottom to top to identify the exact line where invalid state was encountered.
2. Inspect upstream data callers to discover where `null`, `undefined`, or malformed data originated.
3. Formulate a single falsifiable hypothesis: *"Function X assumes property Y is non-null because schema Z was not validated at API boundary."*

### Step 4.4: Minimal Atomic Fix
Apply the smallest necessary change that satisfies the test without introducing side effects or unrelated refactoring.

**Anti-Pattern:** Rewriting whole functions or adding speculative optional chaining (`foo?.bar?.baz?.qux`) across unrelated files.  
**Best Practice:** Address the root cause directly at the boundary or point of consumption.

### Step 4.5: Regression Verification & Clean Up
1. Run the reproduction test: `pnpm vitest run tests/reproductions/issue-142.test.ts` (must pass).
2. Run the full test suite: `pnpm test`.
3. Run the typechecker: `pnpm tsc --noEmit`.
4. Stage an atomic commit with test and fix co-located.

---

## 5. Common Full-Stack Failure Modes & Remediation Guide

### 5.1 React Hydration Mismatches
* **Symptom:** `Warning: Text content did not match. Server: "..." Client: "..."` or `Hydration failed because the initial UI does not match what was rendered on the server.`
* **Causes:**
  1. Accessing browser-only APIs (`window`, `localStorage`, `navigator`) during initial render.
  2. Formatting dates with `new Date().toLocaleTimeString()` without a fixed timezone/locale.
  3. Generating random IDs during render (`Math.random()`) instead of using `useId()`.
* **Fix Pattern:** Defer client-only rendering using a mounting guard or dynamic import with `ssr: false`:
  ```tsx
  "use client";

  import { useState, useEffect } from "react";

  export function ClientOnlyTimestamp({ date }: { date: Date }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      // Render static placeholder matching server render
      return <span className="text-muted-foreground">Loading...</span>;
    }

    return <span>{date.toLocaleDateString()}</span>;
  }
  ```

### 5.2 Database Connection Pool Exhaustion
* **Symptom:** `PrismaClientInitializationError: Timed out fetching a new connection from the pool, please consider increasing the connection limit`.
* **Causes:** Instantiating `new PrismaClient()` or `postgres()` inside API route handlers or components, creating hundreds of leaked connections during Next.js hot reload.
* **Fix Pattern:** Use the global singleton pattern in `src/lib/db.ts`:
  ```typescript
  import { PrismaClient } from "@prisma/client";

  const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

  export const db = globalForPrisma.prisma ?? new PrismaClient();

  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
  ```

### 5.3 Next.js Server Action State Desynchronization
* **Symptom:** Server Action fails silently or returns unhandled promise rejections on the client.
* **Fix Pattern:** Combine `useActionState` with structured action responses:
  ```tsx
  "use client";

  import { useActionState } from "react";
  import { updateSettingsAction } from "@/server/actions/settings";

  export function SettingsForm() {
    const [state, formAction, isPending] = useActionState(updateSettingsAction, {
      success: false,
    });

    return (
      <form action={formAction}>
        {state.errors?._general && (
          <p className="text-destructive text-sm">{state.errors._general[0]}</p>
        )}
        <button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save Settings"}
        </button>
      </form>
    );
  }
  ```

---

## 6. Tool Synergies (Playwright MCP & Git MCP Integration)
Coordinate diagnosis and verification with MCP tools:

1. **Capture Browser Console Logs:**
   - Use Playwright MCP to navigate to the failing route: `playwright_navigate`.
   - Inspect console messages and unhandled network errors.
2. **Inspect Diff Regressions:**
   - Call `git_diff` via Git MCP to view recent file changes that may have introduced the bug.
   - Call `git_log` to inspect recent commit context.
3. **Commit Atomic Bugfix:**
   - After reproduction test passes, call `git_status` to ensure no unexpected files are modified.
   - Commit via `git_commit`:
     `fix: handle null user profile gracefully in display name formatter (resolves #142)`

---

## 7. Concrete Prompt Examples

### Example 1: Triaging a React Hydration Error
> "Our application logs a React hydration mismatch error on the dashboard overview page when formatting the user's last login date. Using the `debug-error-triage` skill, diagnose the root cause, create a reproduction unit test, and implement the deferred mounting fix."

### Example 2: Triaging a 500 API Route Crash
> "POST /api/posts is crashing with HTTP 500 when saving a draft post. The stack trace shows `PrismaClientKnownRequestError: Unique constraint failed on the fields: (slug)`. Using `debug-error-triage`, trace the issue and implement an atomic fix that appends an incremental counter or returns an RFC 7807 422 error."
