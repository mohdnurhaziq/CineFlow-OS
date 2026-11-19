/**
 * Tier 30: Dev, staging and production
 * The container's start-up brings the database up to date with recorded changes (migrations),
 * adopting an existing database only when it matches exactly; production refuses unsafe
 * settings; the host commands that deploy, back up and restore make the right decisions.
 */

import { TestHarness } from "./test-harness";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  restoreSourceProblem,
  runProductionDeploy,
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

  await harness.test("T30-DB-05: a burst of simultaneous write transactions, more than the CPU cores, all finish", async () => {
    // SQLite has one writer at a time. Waiting transactions used to hold the database engine's
    // threads (one per core), so with more of them than cores, all stalled for 5 s and failed.
    const tenant = await db.tenant.create({
      data: { name: "Burst 0", slug: `t30-burst-${Date.now()}`, discipline: "HYBRID", currency: "MYR" },
    });
    try {
      const n = os.cpus().length + 4;
      const started = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: n }, () =>
          db.$transaction(async (tx) => {
            const row = await tx.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { name: true } });
            await new Promise((r) => setTimeout(r, 5));
            await tx.tenant.update({ where: { id: tenant.id }, data: { name: `Burst ${Number(row.name.split(" ")[1]) + 1}` } });
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      harness.assertEqual(failed.length, 0, `All ${n} transactions finish`, failed.map((r) => String((r as PromiseRejectedResult).reason).split("\n").pop()).join(" | "));
      harness.assertEqual((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).name, `Burst ${n}`, "Each saw the one before it: none lost");
      harness.assert(Date.now() - started < 4000, "Without stalling", `${Date.now() - started} ms`);
    } finally {
      await db.tenant.delete({ where: { id: tenant.id } });
    }
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
    NEXT_PUBLIC_APP_URL: "https://app.luminacine.com",
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
      ["The example address left in", { NEXT_PUBLIC_APP_URL: "https://app.example.com" }, [], "NEXT_PUBLIC_APP_URL"],
      ["example.com itself", { NEXT_PUBLIC_APP_URL: "https://example.com" }, [], "NEXT_PUBLIC_APP_URL"],
      ["A .test address", { NEXT_PUBLIC_APP_URL: "https://studio.example.test" }, [], "NEXT_PUBLIC_APP_URL"],
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
      const staging = await robots();
      harness.assertDeepEqual(staging.rules, [{ userAgent: "*", disallow: "/" }], "Staging: everything disallowed");
      delete process.env.APP_ENV;
      const dev = await robots();
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
    harness.assertDeepEqual(
      changedFiles("M lib/a.ts\n M lib/b.ts"),
      ["lib/a.ts", "lib/b.ts"],
      "Output whose leading space was trimmed keeps every file name whole"
    );
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

  await harness.test("T30-OPS-07: a backup is only restored into the copy it came from", async () => {
    const wrong = restoreSourceProblem({ env: "production", commit: "abc" }, "staging");
    harness.assert(Boolean(wrong) && wrong!.includes("production") && wrong!.includes("staging"), "Production's backup into staging: refused", wrong ?? "");
    harness.assertEqual(restoreSourceProblem({ env: "staging" }, "staging"), null, "Its own copy: allowed");
    harness.assertEqual(restoreSourceProblem({ env: "production" }, undefined), "This backup came from production, but this folder is development. Restore it from production's folder.", "No APP_ENV counts as development");
    harness.assertEqual(restoreSourceProblem({ commit: "abc" }, "production"), null, "An older backup that doesn't say: allowed");
    const compose = readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
    const backupService = compose.slice(compose.indexOf("\n  backup:"), compose.indexOf("\nvolumes:"));
    harness.assert(/APP_ENV: \$\{APP_ENV/.test(backupService), "The backup service is told which copy it backs up");
    harness.assert(readFileSync(path.join(ROOT, "docker/backup/backup.sh"), "utf8").includes("env=%s"), "…and writes it into info.txt");
  });

  await harness.test("T30-OPS-08: backups and deploy records stay out of the image; staging and production share a clock", async () => {
    const ignored = readFileSync(path.join(ROOT, ".dockerignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
    harness.assert(ignored.includes("backups"), ".dockerignore leaves out a backups folder");
    harness.assert(ignored.includes(".cineflow-deployed.json"), ".dockerignore leaves out the deploy record");
    const staging = parseEnvFile(readFileSync(path.join(ROOT, ".env.staging.example"), "utf8"));
    const production = parseEnvFile(readFileSync(path.join(ROOT, ".env.production.example"), "utf8"));
    harness.assert(Boolean(production.TZ), "Production sets TZ");
    harness.assertEqual(staging.TZ, production.TZ, "Staging uses the same time zone");
  });

  /** A pretend 24/7 PC: records every step a production deploy takes, and can fail any of them. */
  function fakeProduction(opts: { failAt?: string; healthy?: boolean; deployed?: string | null } = {}) {
    const steps: string[] = [];
    let record: string | null = opts.deployed === undefined ? "old1234" : opts.deployed;
    const step = (name: string) => {
      steps.push(name);
      if (opts.failAt === name) throw new Error(`${name} failed`);
    };
    const deps = {
      log: () => {},
      head: () => "old1234",
      stagingRecord: () => ({ commit: "new5678", at: "2026-11-18T00:00:00Z" }),
      deployedCommit: () => record,
      fetch: () => step("fetch"),
      commitExists: () => true,
      listNew: (from: string | null, to: string) => {
        steps.push(`list ${from ?? "first"}..${to}`);
        return "";
      },
      checkout: (sha: string) => step(`checkout ${sha}`),
      build: () => step("build"),
      checkSettings: () => step("settings"),
      backupNow: () => {
        step("backup");
        return "2026-11-18_030000";
      },
      start: () => step("start"),
      waitHealthy: async () => {
        steps.push("health");
        return opts.healthy ?? true;
      },
      writeRecord: (sha: string) => {
        steps.push(`record ${sha}`);
        record = sha;
      },
    };
    return { steps, deps, record: () => record };
  }

  await harness.test("T30-OPS-06: production is built before the backup, so the backup misses only seconds of work", async () => {
    const ok = fakeProduction();
    await runProductionDeploy(ok.deps);
    harness.assertDeepEqual(
      ok.steps,
      ["fetch", "list old1234..new5678", "checkout new5678", "build", "settings", "backup", "start", "health", "record new5678"],
      "Build and check settings while the old version serves, then back up, then swap"
    );

    const badSettings = fakeProduction({ failAt: "settings" });
    await harness.assertRejects(() => runProductionDeploy(badSettings.deps), "keeps running the old one", "Settings the new version would refuse: the old version stays live");
    harness.assert(!badSettings.steps.includes("backup") && !badSettings.steps.includes("start"), "…no backup taken, nothing swapped");
    harness.assertEqual(badSettings.steps[badSettings.steps.length - 1], "checkout old1234", "…and the folder goes back to the running version");

    const first = fakeProduction({ deployed: null });
    await runProductionDeploy(first.deps);
    harness.assert(first.steps.includes("list first..new5678"), "A first deploy lists from nothing, not from the folder's code");

    const badBuild = fakeProduction({ failAt: "build" });
    await harness.assertRejects(() => runProductionDeploy(badBuild.deps), "keeps running", "A failed build says the old version is still live");
    harness.assert(!badBuild.steps.includes("backup") && !badBuild.steps.includes("start"), "…no backup taken, nothing swapped");
    harness.assertEqual(badBuild.steps[badBuild.steps.length - 1], "checkout old1234", "…and the folder goes back to the running version");
    harness.assertEqual(badBuild.record(), "old1234", "…and the record still names it");

    for (const [label, fx] of [
      ["unhealthy", fakeProduction({ healthy: false })],
      ["start fails", fakeProduction({ failAt: "start" })],
    ] as const) {
      let message = "";
      try {
        await runProductionDeploy(fx.deps);
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      harness.assert(message.includes("restore 2026-11-18_030000"), `${label}: names the backup to restore`, message);
      harness.assert(message.includes("docker compose logs app"), `${label}: says where to see why`, message);
      harness.assertEqual(fx.record(), "old1234", `${label}: the record isn't moved on`);
    }
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
