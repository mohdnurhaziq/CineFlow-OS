/**
 * Runs before `next start` in the container (see the Dockerfile's CMD):
 *   1. brings the database up to date with the recorded changes in prisma/migrations;
 *   2. fills a brand-new database with demo data, except in production.
 *
 * A database made before migrations existed (by `prisma db push`) is adopted only when it
 * matches the starting point (0_init) exactly; otherwise start-up stops and nothing changes.
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const SCHEMA = "prisma/schema.prisma";
const BASELINE = "0_init";

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
  const appEnv = process.env.APP_ENV?.trim() || "development";

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
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]!).endsWith(path.join("scripts", "start.ts"));
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
