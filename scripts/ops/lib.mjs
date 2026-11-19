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
 * The file paths in `git status --porcelain` output: each line is a one- or two-letter status,
 * then the path. Tolerates output whose first line lost its leading space to a trim.
 * @param {string} porcelain
 * @returns {string[]}
 */
export function changedFiles(porcelain) {
  return porcelain
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.replace(/^\s*\S{1,2}\s+/, "").trim());
}

/**
 * What `deploy production` should do, given what staging runs and what production last
 * deployed (its own record, not the code in its folder: a fresh clone already has the latest).
 * @param {{ stagingRecord: { commit: string; at: string } | null; productionDeployed: string | null }} input
 * @returns {{ action: "deploy"; commit: string } | { action: "nothing"; message: string } | { action: "error"; message: string }}
 */
export function planProductionDeploy({ stagingRecord, productionDeployed }) {
  if (!stagingRecord?.commit) {
    return { action: "error", message: "Staging hasn't been deployed yet. Run `node scripts/ops.mjs deploy staging` in the staging folder first." };
  }
  if (stagingRecord.commit === productionDeployed) {
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

/**
 * @typedef {object} ProductionDeployDeps
 * @property {(m: string) => void} log
 * @property {() => string} head                      the commit checked out in the production folder
 * @property {() => { commit: string; at: string } | null} stagingRecord
 * @property {() => string | null} deployedCommit     what production last deployed (its record)
 * @property {() => void} fetch
 * @property {(sha: string) => boolean} commitExists
 * @property {(from: string | null, to: string) => string} listNew   one line per commit going live
 * @property {(sha: string) => void} checkout
 * @property {() => void} build                       builds the new image; the old one keeps serving
 * @property {() => void} checkSettings               throws when the new image would refuse this folder's .env
 * @property {() => string | null} backupNow          the backup's name, or null when there's no database yet
 * @property {() => void} start                       swaps to the new image (docker compose up -d)
 * @property {() => Promise<boolean>} waitHealthy
 * @property {(sha: string) => void} writeRecord
 */

/**
 * `deploy production`: staging's version goes live. The new version is built while the old one
 * keeps serving, and the backup is taken only after that, just before the swap, so it misses
 * seconds of work rather than the minutes a build takes.
 * @param {ProductionDeployDeps} d
 * @returns {Promise<{ action: "nothing" } | { action: "deployed"; commit: string; backup: string | null }>}
 */
export async function runProductionDeploy(d) {
  const deployed = d.deployedCommit();
  const plan = planProductionDeploy({ stagingRecord: d.stagingRecord(), productionDeployed: deployed });
  if (plan.action === "error") throw new Error(plan.message);
  if (plan.action === "nothing") {
    d.log(plan.message);
    return { action: "nothing" };
  }
  const { commit } = plan;

  d.fetch();
  if (!d.commitExists(commit)) throw new Error(`Staging's version ${commit.slice(0, 7)} isn't on GitHub (origin). Push it, then try again.`);
  const list = d.listNew(deployed, commit);
  d.log(deployed ? `Going live (staging's version). New since production's version:\n${list || "(none: an older version)"}` : "First production deploy.");

  const running = d.head();
  d.checkout(commit);
  try {
    d.build();
  } catch (err) {
    d.checkout(running);
    throw new Error(`Building the new version failed, so production keeps running the old one. ${err instanceof Error ? err.message : err}`);
  }
  // Production refuses unsafe settings at start-up; find out now, while the old version still serves.
  try {
    d.checkSettings();
  } catch (err) {
    d.checkout(running);
    throw new Error(`The new version wouldn't start with this folder's settings, so production keeps running the old one. ${err instanceof Error ? err.message : err}`);
  }

  const backup = d.backupNow();
  d.log(backup ? `Backup taken: ${backup}` : "No database yet, so nothing to back up.");

  const why = "See why: docker compose logs app.";
  const back = backup ? ` To go back to how it was: node scripts/ops.mjs restore ${backup}` : "";
  let healthy = false;
  try {
    d.start();
    healthy = await d.waitHealthy();
  } catch (err) {
    throw new Error(`Starting the new version failed (${err instanceof Error ? err.message : err}). ${why}${back}`);
  }
  if (!healthy) throw new Error(`Production didn't come back healthy. ${why}${back}`);

  d.writeRecord(commit);
  return { action: "deployed", commit, backup };
}

/**
 * Why a backup mustn't be restored here, or null. Each backup's info.txt says which copy it
 * came from (env=…), so production's real data can't be loaded into staging by mistake.
 * Backups from before that was recorded don't say, and are allowed.
 * @param {Record<string, string>} info the backup's info.txt
 * @param {string | undefined} appEnv this folder's APP_ENV
 * @returns {string | null}
 */
export function restoreSourceProblem(info, appEnv) {
  const from = info.env?.trim();
  const here = appEnv?.trim() || "development";
  if (!from || from === here) return null;
  return `This backup came from ${from}, but this folder is ${here}. Restore it from ${from}'s folder.`;
}
