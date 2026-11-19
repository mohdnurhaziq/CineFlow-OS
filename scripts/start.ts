/**
 * Runs before `next start` in the container (see the Dockerfile's CMD):
 *   0. in production, refuses to start with unsafe settings (lib/production-settings.ts);
 *   1. brings the database up to date with the recorded changes in prisma/migrations;
 *   2. fills a brand-new database with demo data, except in production;
 *   3. in production, removes demo files an older version left in the uploads.
 *
 * A database made before migrations existed (by `prisma db push`) is adopted only when it
 * matches the starting point (0_init) exactly; otherwise start-up stops and nothing changes.
 *
 * When start-up stops, it says why once and then waits instead of exiting: an exit would make
 * Docker restart it over and over, burying the reason in the log. `docker compose ps` shows it
 * as unhealthy (the health check in docker-compose.yml).
 *
 *   --check-settings   only check production's settings: exit 1 listing the problems, or 0.
 *                      `node scripts/ops.mjs deploy production` runs this with the new version
 *                      before taking the old one down.
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { appEnvFrom } from "@/lib/app-env";
import { isLiveAddress, productionSettingProblems } from "@/lib/production-settings";
import { removeDemoUploads } from "../prisma/setup-assets";

const SCHEMA = "prisma/schema.prisma";
const BASELINE = "0_init";
const START_AGAIN = "docker compose up -d --force-recreate app";

/** Why production must not start with these settings (each problem, then how to start again), or null. */
export function settingsRefusal(env: Record<string, string | undefined> = process.env): string | null {
  // No APP_ENV means development: demo data and a demo super-admin. Never on a live address.
  if (!env.APP_ENV?.trim() && isLiveAddress(env.NEXT_PUBLIC_APP_URL)) {
    return [
      `This copy has no APP_ENV, but its address (${env.NEXT_PUBLIC_APP_URL}) is a live one, so it would start as a demo site with demo accounts.`,
      "",
      `Set APP_ENV=production (or APP_ENV=staging) in this copy's .env, then run: ${START_AGAIN}`,
    ].join("\n");
  }
  if (appEnvFrom(env) !== "production") return null;
  const problems = productionSettingProblems(env);
  if (problems.length === 0) return null;
  return [
    "Production can't start:",
    ...problems.map((p) => `- ${p}`),
    "",
    `Fix these in this copy's .env, then run: ${START_AGAIN}`,
    "(If you changed NEXT_PUBLIC_APP_URL, deploy again instead: it's fixed into the build.)",
  ].join("\n");
}

/** "file:./dev.db" → <schemaDir>/dev.db; absolute paths stay. Like Prisma, relative is next to the schema. */
export function sqlitePathFromUrl(url: string, schemaDir: string): string {
  if (!url.startsWith("file:")) throw new Error(`Only SQLite file databases are supported (got "${url}").`);
  const p = url.slice("file:".length).split("?")[0] ?? "";
  return path.isAbsolute(p) ? path.resolve(p) : path.resolve(schemaDir, p);
}

interface PrismaRun {
  status: number;
  output: string;
}

function prisma(args: string[], cwd: string, databaseUrl: string): PrismaRun {
  const r = spawnSync("npx", ["prisma", ...args], {
    cwd,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { status: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function mustPrisma(args: string[], cwd: string, databaseUrl: string): void {
  const r = prisma(args, cwd, databaseUrl);
  if (r.status !== 0) throw new Error(`prisma ${args.join(" ")} failed:\n${r.output}`);
}

async function hasMigrationTable(databaseUrl: string): Promise<boolean> {
  const client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const rows = await client.$queryRawUnsafe<unknown[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'"
    );
    return rows.length > 0;
  } finally {
    await client.$disconnect();
  }
}

/** Only the lines that describe the difference, not Prisma's banners. */
function diffSummary(output: string): string {
  return output
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^(warn|Environment variables|Prisma schema loaded|For more information)/i.test(l.trim()))
    .slice(0, 30)
    .join("\n");
}

export async function prepareDatabase(opts: {
  databaseUrl: string;
  cwd: string;
  log?: (m: string) => void;
}): Promise<"created" | "adopted" | "migrated"> {
  const { databaseUrl, cwd } = opts;
  const log = opts.log ?? ((m: string) => console.log(m));
  const dbPath = sqlitePathFromUrl(databaseUrl, path.join(cwd, "prisma"));
  const deploy = () => mustPrisma(["migrate", "deploy", "--schema", SCHEMA], cwd, databaseUrl);

  if (!existsSync(dbPath)) {
    log("New database: applying the recorded database changes.");
    deploy();
    return "created";
  }

  if (await hasMigrationTable(databaseUrl)) {
    deploy();
    log("Database is up to date.");
    return "migrated";
  }

  // Made before migrations existed: adopt it only if it is exactly the starting point.
  const shadow = path.join(os.tmpdir(), `cineflow-shadow-${process.pid}-${Date.now()}.db`);
  try {
    const diff = prisma(
      [
        "migrate", "diff",
        "--from-url", databaseUrl,
        "--to-migrations", "prisma/migrations",
        "--shadow-database-url", `file:${shadow.replace(/\\/g, "/")}`,
        "--exit-code",
      ],
      cwd,
      databaseUrl
    );
    if (diff.status === 2) {
      throw new Error(
        `The database doesn't match the recorded starting point (${BASELINE}), so it can't be adopted.\n` +
          `${diffSummary(diff.output)}\n` +
          "Back it up and bring it in line with prisma/migrations by hand; nothing was changed."
      );
    }
    if (diff.status !== 0) throw new Error(`Couldn't compare the database with the recorded changes:\n${diff.output}`);
  } finally {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${shadow}${suffix}`, { force: true });
  }

  mustPrisma(["migrate", "resolve", "--applied", BASELINE, "--schema", SCHEMA], cwd, databaseUrl);
  deploy();
  log(`Existing database adopted: recorded as ${BASELINE}, then brought up to date.`);
  return "adopted";
}

async function main() {
  const cwd = process.cwd();
  const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  const appEnv = appEnvFrom();

  const refusal = settingsRefusal();
  if (refusal) throw new Error(refusal);

  const result = await prepareDatabase({ databaseUrl, cwd });

  if (result === "created" && appEnv !== "production" && process.env.SEED_ON_FIRST_RUN !== "false") {
    console.log("Filling the new database with demo data.");
    const r = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) throw new Error("Demo data couldn't be added.");
  }

  if (appEnv === "production") {
    const removed = await removeDemoUploads(path.join(cwd, "public", "uploads"));
    if (removed.length > 0) console.log(`Removed ${removed.length} demo files an older version left in the uploads.`);
  }
}

/** Says why start-up stopped, once, then keeps the process alive so Docker doesn't restart it. */
function stopAndWait(err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  console.error(reason);
  if (!reason.includes(START_AGAIN)) console.error(`\nFix it, then run: ${START_AGAIN}`);
  console.error(
    "\nCineFlow OS isn't running. It waits here instead of restarting over and over, so this stays at the end of the log."
  );
  setInterval(() => {}, 1 << 30);
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]!).endsWith(path.join("scripts", "start.ts"));
if (invokedDirectly) {
  if (process.argv.includes("--check-settings")) {
    const refusal = settingsRefusal();
    if (refusal) {
      console.error(refusal);
      process.exit(1);
    }
    console.log(appEnvFrom() === "production" ? "Production's settings are fine." : "Not production: no settings to check.");
    process.exit(0);
  }
  main().catch(stopAndWait);
}
