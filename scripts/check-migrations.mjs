#!/usr/bin/env node
// Fails when prisma/schema.prisma has changes that no migration in prisma/migrations records
// (run `npm run db:migration -- <name>` to add one). Uses a throwaway shadow database.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const shadow = path.join(os.tmpdir(), `cineflow-check-migrations-${process.pid}.db`);
const r = spawnSync(
  "npx",
  [
    "prisma", "migrate", "diff",
    "--from-migrations", "prisma/migrations",
    "--to-schema-datamodel", "prisma/schema.prisma",
    "--shadow-database-url", `file:${shadow.split(path.sep).join("/")}`,
    "--exit-code",
  ],
  { encoding: "utf8", shell: process.platform === "win32" }
);
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${shadow}${suffix}`, { force: true });

if (r.status === 0) {
  console.log("The recorded database changes match the schema.");
} else if (r.status === 2) {
  console.error("prisma/schema.prisma has changes no migration records. Run: npm run db:migration -- <name>");
  console.error(r.stdout);
} else {
  console.error(r.stderr || r.stdout);
}
process.exit(r.status ?? 1);
