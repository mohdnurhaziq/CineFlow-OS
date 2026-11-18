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
}
