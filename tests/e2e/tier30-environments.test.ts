/**
 * Tier 30: Dev, staging and production
 * The container's start-up brings the database up to date with recorded changes (migrations),
 * adopting an existing database only when it matches exactly; production refuses unsafe
 * settings; the host commands that deploy, back up and restore make the right decisions.
 */

import { TestHarness } from "./test-harness";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { prepareDatabase, sqlitePathFromUrl } from "../../scripts/start";
import { appEnvFrom } from "@/lib/app-env";
import { productionSettingProblems } from "@/lib/production-settings";
import { DEV_FALLBACK_AUTH_SECRET } from "@/lib/auth/dev-secret";
import robots from "@/app/robots";
import { GET as healthGET } from "@/app/api/health/route";
import {
  backupName,
  changedFiles,
  deployTargetProblem,
  parseEnvFile,
  planProductionDeploy,
  waitForHealth,
} from "../../scripts/ops/lib.mjs";
import { createOrResetSuperAdmin } from "../../scripts/create-super-admin";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

const ROOT = process.cwd();

/** A Prisma client on a throwaway SQLite file. */
function clientFor(url: string) {
  return new PrismaClient({ datasourceUrl: url });
}

async function tableNames(url: string): Promise<string[]> {
  const c = clientFor(url);
  try {
    const rows = await c.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table'");
    return rows.map((r) => r.name);
  } finally {
    await c.$disconnect();
  }
}

async function appliedMigrations(url: string): Promise<string[]> {
  const c = clientFor(url);
  try {
    const rows = await c.$queryRawUnsafe<{ migration_name: string }[]>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    return rows.map((r) => r.migration_name);
  } finally {
    await c.$disconnect();
  }
}

/** Builds a database the old way (db push), as every existing copy was made. */
function dbPush(url: string) {
  const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`db push failed: ${r.stderr || r.stdout}`);
}

export async function runTier30EnvironmentsTests(harness: TestHarness) {
  harness.setSuite("Tier 30", "Dev, staging and production");

  const dir = mkdtempSync(path.join(os.tmpdir(), "cineflow-t30-"));
  harness.registerTeardown(() => rmSync(dir, { recursive: true, force: true }));
  const urlFor = (name: string) => `file:${path.join(dir, name).replace(/\\/g, "/")}`;
  const quiet = () => {};

  const freshUrl = urlFor("fresh.db");
  await harness.test("T30-DB-01: a new database is created from the recorded changes", async () => {
    const result = await prepareDatabase({ databaseUrl: freshUrl, cwd: ROOT, log: quiet });
    harness.assertEqual(result, "created", "Reported as created");
    harness.assert((await tableNames(freshUrl)).includes("Proposal"), "Has the app's tables");
    harness.assertEqual((await appliedMigrations(freshUrl)).join(","), "0_init", "Records the starting point");
  });

  await harness.test("T30-DB-02: an existing database that matches is adopted, its data untouched", async () => {
    const url = urlFor("pushed.db");
    dbPush(url);
    const c = clientFor(url);
    await c.$executeRawUnsafe(
      `INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ('t30_keep','Keep Me','t30-keep',CURRENT_TIMESTAMP)`
    );
    await c.$disconnect();
    const result = await prepareDatabase({ databaseUrl: url, cwd: ROOT, log: quiet });
    harness.assertEqual(result, "adopted", "Reported as adopted");
    harness.assertEqual((await appliedMigrations(url)).join(","), "0_init", "Starting point recorded as applied");
    const after = clientFor(url);
    const rows = await after.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Tenant" WHERE id='t30_keep'`);
    await after.$disconnect();
    harness.assertEqual(rows.length, 1, "Existing rows are still there");
  });

  await harness.test("T30-DB-03: an existing database that doesn't match stops start-up and is left alone", async () => {
    const url = urlFor("drifted.db");
    dbPush(url);
    const c = clientFor(url);
    await c.$executeRawUnsafe(`ALTER TABLE "Proposal" DROP COLUMN "declinedAt"`);
    await c.$disconnect();
    await harness.assertRejects(
      () => prepareDatabase({ databaseUrl: url, cwd: ROOT, log: quiet }),
      "The database doesn't match",
      "Refuses with an explanation"
    );
    harness.assert(!(await tableNames(url)).includes("_prisma_migrations"), "Nothing was recorded on it");
  });

  await harness.test("T30-DB-04: an up-to-date database is just checked; database paths resolve like Prisma's", async () => {
    harness.assertEqual(await prepareDatabase({ databaseUrl: freshUrl, cwd: ROOT, log: quiet }), "migrated", "Second start: migrated");
    harness.assertEqual(
      sqlitePathFromUrl("file:./dev.db", "/app/prisma").replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""),
      "/app/prisma/dev.db",
      "Relative paths are next to the schema"
    );
    harness.assertEqual(
      sqlitePathFromUrl("file:/app/data/dev.db", "/x").replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""),
      "/app/data/dev.db",
      "Absolute paths stay"
    );
    harness.assert(existsSync(sqlitePathFromUrl(freshUrl, ROOT)), "A test database path resolves to its file");
  });

  await harness.test("T30-ENV-01: APP_ENV is development, staging or production", async () => {
    harness.assertEqual(appEnvFrom({}), "development", "Unset means development");
    harness.assertEqual(appEnvFrom({ APP_ENV: "staging" }), "staging", "staging");
    harness.assertEqual(appEnvFrom({ APP_ENV: "production" }), "production", "production");
    let threw = "";
    try {
      appEnvFrom({ APP_ENV: "prod" });
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    harness.assertEqual(threw, 'Unknown APP_ENV "prod"', "Anything else is refused");
  });

  const goodProduction: Record<string, string | undefined> = {
    APP_ENV: "production",
    AUTH_SECRET: "k".repeat(20) + "Q9".repeat(10),
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: "a@b.c",
    SMTP_PASS: "x",
  };
  const problemsWith = (change: Record<string, string | undefined>, remove: string[] = []) => {
    const e: Record<string, string | undefined> = { ...goodProduction, ...change };
    for (const k of remove) delete e[k];
    return productionSettingProblems(e);
  };

  await harness.test("T30-ENV-02: safe production settings pass", async () => {
    harness.assertDeepEqual(productionSettingProblems(goodProduction), [], "No problems");
    harness.assertDeepEqual(
      problemsWith({ RESEND_API_KEY: "re_123" }, ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]),
      [],
      "Resend alone is real email"
    );
  });

  await harness.test("T30-ENV-03: each unsafe production setting is named", async () => {
    const cases: Array<[string, Record<string, string | undefined>, string[], string]> = [
      ["AUTH_SECRET missing", {}, ["AUTH_SECRET"], "AUTH_SECRET"],
      ["AUTH_SECRET short", { AUTH_SECRET: "short" }, [], "AUTH_SECRET"],
      ["AUTH_SECRET is the development one", { AUTH_SECRET: DEV_FALLBACK_AUTH_SECRET }, [], "AUTH_SECRET"],
      ["Fake card payments on", { ALLOW_SIMULATED_CARD_PAYMENTS: "true" }, [], "ALLOW_SIMULATED_CARD_PAYMENTS"],
      ["http address", { NEXT_PUBLIC_APP_URL: "http://app.example.com" }, [], "NEXT_PUBLIC_APP_URL"],
      ["localhost address", { NEXT_PUBLIC_APP_URL: "https://localhost:3000" }, [], "NEXT_PUBLIC_APP_URL"],
      ["127.0.0.1 address", { NEXT_PUBLIC_APP_URL: "https://127.0.0.1" }, [], "NEXT_PUBLIC_APP_URL"],
      ["No email", {}, ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"], "email"],
      ["Mailpit", { SMTP_HOST: "mailpit", SMTP_PORT: "1025" }, ["SMTP_USER", "SMTP_PASS"], "SMTP_HOST"],
      ["Toyyibpay sandbox", { TOYYIBPAY_BASE_URL: "https://dev.toyyibpay.com" }, [], "TOYYIBPAY_BASE_URL"],
    ];
    for (const [label, change, remove, mentions] of cases) {
      const problems = problemsWith(change, remove);
      harness.assertEqual(problems.length, 1, `${label}: one problem`);
      harness.assert((problems[0] ?? "").includes(mentions), `${label}: names ${mentions}`, problems[0]);
    }
  });

  await harness.test("T30-ENV-04: staging is hidden from search engines; the health check shows no details", async () => {
    const saved = process.env.APP_ENV;
    try {
      process.env.APP_ENV = "staging";
      const staging = robots();
      harness.assertDeepEqual(staging.rules, [{ userAgent: "*", disallow: "/" }], "Staging: everything disallowed");
      delete process.env.APP_ENV;
      const dev = robots();
      const rule = Array.isArray(dev.rules) ? dev.rules[0] : dev.rules;
      harness.assert(Array.isArray(rule?.allow) && rule.allow.includes("/create-studio"), "Otherwise the usual rules");
    } finally {
      if (saved === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = saved;
    }
    const res = await healthGET();
    const body = (await res.json()) as Record<string, unknown>;
    harness.assertDeepEqual(Object.keys(body).sort(), ["db", "status", "timestamp"], "Only status, db and timestamp");
    harness.assertEqual(res.status, 200, "Healthy");
  });

  await harness.test("T30-OPS-01: a copy's .env is read like Docker Compose reads it", async () => {
    const vars = parseEnvFile(
      [
        "# a comment",
        "",
        "APP_ENV=staging",
        'NEXT_PUBLIC_APP_URL="https://staging.example.com"',
        "TZ='Asia/Kuala_Lumpur'",
        "  APP_PORT = 3100  ",
        "EMPTY=",
      ].join("\r\n")
    );
    harness.assertDeepEqual(
      vars,
      {
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_URL: "https://staging.example.com",
        TZ: "Asia/Kuala_Lumpur",
        APP_PORT: "3100",
        EMPTY: "",
      },
      "Values, quoted or not; comments and blank lines skipped"
    );
  });

  await harness.test("T30-OPS-02: a deploy only runs in the folder of the copy it names", async () => {
    const wrong = deployTargetProblem("staging", { APP_ENV: "production" });
    harness.assert(Boolean(wrong) && wrong!.includes("staging") && wrong!.includes("production"), "Staging command in production's folder: refused", wrong ?? "");
    harness.assert(Boolean(deployTargetProblem("production", {})), "A folder with no APP_ENV: refused");
    harness.assert(Boolean(deployTargetProblem("prod", { APP_ENV: "prod" })), "An unknown copy: refused");
    harness.assertEqual(deployTargetProblem("production", { APP_ENV: "production" }), null, "The right folder: allowed");
  });

  await harness.test("T30-OPS-03: changed files in a deploy folder are listed", async () => {
    harness.assertDeepEqual(changedFiles(" M lib/a.ts\n?? new.txt\n"), ["lib/a.ts", "new.txt"], "Both listed");
    harness.assertDeepEqual(changedFiles(""), [], "A clean folder: none");
  });

  await harness.test("T30-OPS-04: production takes exactly what staging runs", async () => {
    const none = planProductionDeploy({ stagingRecord: null, productionDeployed: "aaa" });
    harness.assertEqual(none.action, "error", "Staging never deployed: stop");
    harness.assert("message" in none && none.message.includes("deploy staging"), "…and say to deploy staging first");
    const first = planProductionDeploy({ stagingRecord: { commit: "aaa", at: "2026-11-18T00:00:00Z" }, productionDeployed: null });
    harness.assertDeepEqual(first, { action: "deploy", commit: "aaa" }, "Production never deployed: deploy, even if its folder already has that code");
    const same = planProductionDeploy({ stagingRecord: { commit: "aaa", at: "2026-11-18T00:00:00Z" }, productionDeployed: "aaa" });
    harness.assertEqual(same.action, "nothing", "Same version: nothing to do");
    const next = planProductionDeploy({ stagingRecord: { commit: "bbb", at: "2026-11-18T00:00:00Z" }, productionDeployed: "aaa" });
    harness.assertDeepEqual(next, { action: "deploy", commit: "bbb" }, "A newer staging version: deploy it");
  });

  await harness.test("T30-OPS-05: backups are named by time; the health wait retries, then gives up", async () => {
    harness.assertEqual(backupName(new Date(2026, 10, 18, 3, 0, 5)), "2026-11-18_030005", "Local date and time");
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      return new Response("", { status: calls < 3 ? 503 : 200 });
    }) as unknown as typeof fetch;
    harness.assertEqual(await waitForHealth("http://x/api/health", { intervalMs: 1, fetchImpl: flaky }), true, "Healthy on the third try");
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    harness.assertEqual(await waitForHealth("http://x/api/health", { timeoutMs: 50, intervalMs: 5, fetchImpl: down }), false, "Never healthy: false");
    const offline = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    harness.assertEqual(await waitForHealth("http://x/api/health", { timeoutMs: 30, intervalMs: 5, fetchImpl: offline }), false, "Not even listening: false");
  });

  await harness.test("T30-ADMIN-01: the super-admin is created with a one-time random password, and can be reset", async () => {
    harness.registerTeardown(async () => {
      await db.user.deleteMany({ where: { email: "t30-root@example.test" } });
    });
    const first = await createOrResetSuperAdmin("  T30-Root@Example.test ");
    harness.assertEqual(first.created, true, "Created");
    harness.assert(/^[A-Za-z0-9]{20}$/.test(first.password), "20 letters and digits", first.password);
    const user = await db.user.findFirst({ where: { email: "t30-root@example.test", tenantId: null } });
    harness.assertEqual(user?.role, "SUPER_ADMIN", "A super-admin, with the email in lower case");
    harness.assert(bcrypt.compareSync(first.password, user?.passwordHash ?? ""), "The password signs in");

    const second = await createOrResetSuperAdmin("t30-root@example.test");
    harness.assertEqual(second.created, false, "Run again: reset, not a second account");
    harness.assertNotEqual(second.password, first.password, "A new password");
    const after = await db.user.findFirst({ where: { email: "t30-root@example.test", tenantId: null } });
    harness.assert(!bcrypt.compareSync(first.password, after?.passwordHash ?? ""), "The old password no longer works");
    harness.assertEqual(await db.user.count({ where: { email: "t30-root@example.test" } }), 1, "Still one account");

    await harness.assertRejects(
      () => createOrResetSuperAdmin("alex@luminacine.com"),
      "already a studio account",
      "A studio team member's email is refused"
    );
    await harness.assertRejects(() => createOrResetSuperAdmin("not-an-email"), "isn't an email address", "A non-email is refused");
  });
}
