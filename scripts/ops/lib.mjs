// Pure helpers for scripts/ops.mjs (deploy, backup, restore). Node built-ins only, so the
// 24/7 PC needs nothing but Node, git and Docker to run them.

const COPIES = ["staging", "production"];

/**
 * Reads a .env file the way Docker Compose does: KEY=value lines, optional quotes, # comments.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: a " #" starts a trailing comment.
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    vars[key] = value;
  }
  return vars;
}

/**
 * Why a deploy of `target` must not run in a folder with these settings, or null when it may.
 * @param {string} target
 * @param {Record<string, string>} envVars
 * @returns {string | null}
 */
export function deployTargetProblem(target, envVars) {
  if (!COPIES.includes(target)) return `Unknown copy "${target}". Use "staging" or "production".`;
  const here = envVars.APP_ENV?.trim();
  if (!here) return `This folder's .env has no APP_ENV, so it isn't a ${target} folder. Run this in the ${target} folder.`;
  if (here !== target) return `This folder is ${here} (APP_ENV in .env), not ${target}. Run this in the ${target} folder.`;
  return null;
}

/**
 * The file paths in `git status --porcelain` output.
 * @param {string} porcelain
 * @returns {string[]}
 */
export function changedFiles(porcelain) {
  return porcelain
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.slice(3).trim());
}

/**
 * What `deploy production` should do, given what staging runs and what production has.
 * @param {{ stagingRecord: { commit: string; at: string } | null; productionHead: string }} input
 * @returns {{ action: "deploy"; commit: string } | { action: "nothing"; message: string } | { action: "error"; message: string }}
 */
export function planProductionDeploy({ stagingRecord, productionHead }) {
  if (!stagingRecord?.commit) {
    return { action: "error", message: "Staging hasn't been deployed yet. Run `node scripts/ops.mjs deploy staging` in the staging folder first." };
  }
  if (stagingRecord.commit === productionHead) {
    return { action: "nothing", message: `Production already runs ${stagingRecord.commit.slice(0, 7)}, the same version as staging.` };
  }
  return { action: "deploy", commit: stagingRecord.commit };
}

/**
 * A backup's name from the local date and time: 2026-11-18_030005.
 * @param {Date} date
 * @returns {string}
 */
export function backupName(date) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/**
 * Polls the health check until it answers 200 (true) or the time runs out (false).
 * @param {string} url
 * @param {{ timeoutMs?: number; intervalMs?: number; fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<boolean>}
 */
export async function waitForHealth(url, opts = {}) {
  const { timeoutMs = 180000, intervalMs = 3000, fetchImpl = fetch } = opts;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetchImpl(url, { cache: "no-store" });
      if (res.status === 200) return true;
    } catch {
      // Not listening yet.
    }
    if (Date.now() + intervalMs > deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
