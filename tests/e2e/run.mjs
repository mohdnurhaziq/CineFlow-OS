// Runs the E2E suite against a throwaway prisma/test.db so it never writes to dev.db.
// Each run starts from a fresh schema + seed, so results don't depend on earlier runs.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = { ...process.env, DATABASE_URL: "file:./test.db" };

function run(args) {
  const result = spawnSync("npx", args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(path.join(root, "prisma", `test.db${suffix}`), { force: true });
}

run(["prisma", "db", "push", "--skip-generate"]);
run(["tsx", "prisma/seed.ts"]);
run(["tsx", "--import", "./tests/e2e/mocks/register.mjs", "tests/e2e/runner.ts"]);
