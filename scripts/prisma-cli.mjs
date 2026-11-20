// Runs the Prisma command line without a shell: Node starts Prisma's own entry file directly, so
// arguments with spaces (a Windows temp folder under "C:\Users\First Last\...") reach Prisma whole.
// A shell (`npx` on Windows needs one) would split them at the spaces.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PRISMA_ENTRY = require.resolve("prisma/build/index.js");

/** Like spawnSync("npx", ["prisma", ...args], options), without a shell. */
export function runPrisma(args, options = {}) {
  return spawnSync(process.execPath, [PRISMA_ENTRY, ...args], { ...options, shell: false });
}
