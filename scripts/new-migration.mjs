#!/usr/bin/env node
// Writes the next recorded database change after you edit prisma/schema.prisma:
//
//   npm run db:migration -- add_gift_cards
//
// It compares prisma/migrations with the schema on a throwaway database, so it never touches
// prisma/dev.db. Then apply it to dev with `npx prisma migrate deploy`, and commit the new
// folder under prisma/migrations with the schema change.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "";
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error("Give the change a short name in lower case, digits and underscores: npm run db:migration -- add_gift_cards");
  process.exit(1);
}

const shadow = path.join(os.tmpdir(), `cineflow-new-migration-${process.pid}.db`);
const r = spawnSync(
  "npx",
  [
    "prisma", "migrate", "diff",
    "--from-migrations", "prisma/migrations",
    "--to-schema-datamodel", "prisma/schema.prisma",
    "--shadow-database-url", `file:${shadow.replace(/\\/g, "/")}`,
    "--script",
  ],
  { encoding: "utf8", shell: process.platform === "win32" }
);
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${shadow}${suffix}`, { force: true });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}

const sql = r.stdout;
const statements = sql.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("--"));
if (statements.length === 0) {
  console.log("No schema changes.");
  process.exit(0);
}

const d = new Date();
const p = (n) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
const dir = path.join("prisma", "migrations", `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "migration.sql"), sql.replace(/\r\n/g, "\n"));
console.log(`Wrote ${path.join(dir, "migration.sql")}`);
console.log("Read it, then apply it to dev with: npx prisma migrate deploy");
