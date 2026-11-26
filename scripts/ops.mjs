#!/usr/bin/env node
// CineFlow OS — commands for the staging and production copies on the 24/7 PC.
// Run from a copy's folder (the one with its .env):
//
//   node scripts/ops.mjs deploy staging           latest main → staging
//   node scripts/ops.mjs deploy production        backup, then staging's version → production
//   node scripts/ops.mjs backup now               back up this copy's database and files
//   node scripts/ops.mjs check-backup <name>      check a backup could be restored
//   node scripts/ops.mjs restore <backup name>    put a backup back (and the version it ran)
//   node scripts/ops.mjs create-super-admin <email>
//   node scripts/ops.mjs email-report              list emails stored with capital letters, and duplicates (read-only)
//   node scripts/ops.mjs test-alert                email the super-admins a test backup alert
//   node scripts/ops.mjs status
//
// Needs only Node 20+, git and Docker. See README → "Staging and production".

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  backupName,
  changedFiles,
  deployTargetProblem,
  parseEnvFile,
  restoreSourceProblem,
  runProductionDeploy,
  waitForHealth,
} from "./ops/lib.mjs";

const CWD = process.cwd();
const RECORD = ".cineflow-deployed.json";

class Stop extends Error {}

function fail(message) {
  throw new Stop(message);
}

/** Runs a command with its output shown; stops on failure. */
function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: CWD, stdio: "inherit" });
  if (r.error) fail(`Couldn't run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} failed (exit ${r.status}).`);
}

/** Runs a command and returns its output; stops on failure. */
function read(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: CWD, encoding: "utf8" });
  if (r.error) fail(`Couldn't run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function loadEnv() {
  if (!existsSync(path.join(CWD, "docker-compose.yml"))) fail("Run this from a CineFlow OS folder (the one with docker-compose.yml).");
  const file = path.join(CWD, ".env");
  if (!existsSync(file)) fail("This folder has no .env. Copy .env.staging.example or .env.production.example to .env and fill it in.");
  return parseEnvFile(readFileSync(file, "utf8"));
}

function requireCleanFolder() {
  const files = changedFiles(read("git", ["status", "--porcelain"]));
  if (files.length > 0) {
    fail(`This folder has changed files, which a deploy would overwrite:\n  ${files.join("\n  ")}\nUndo or move them first.`);
  }
}

function readRecord(dir) {
  const file = path.join(dir, RECORD);
  if (!existsSync(file)) return null;
  try {
    const rec = JSON.parse(readFileSync(file, "utf8"));
    return typeof rec?.commit === "string" ? rec : null;
  } catch {
    return null;
  }
}

function writeRecord(commit) {
  writeFileSync(path.join(CWD, RECORD), JSON.stringify({ commit, at: new Date().toISOString() }, null, 2) + "\n");
}

function describe(commit) {
  return read("git", ["log", "-1", "--format=%h %s", commit]);
}

function commitExists(commit) {
  return spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: CWD }).status === 0;
}

function healthUrl(env) {
  return `http://127.0.0.1:${env.APP_PORT || "3000"}/api/health`;
}

/**
 * Builds every service of this copy (the app, and in production the backup service, so a change
 * to docker/backup reaches it too) while the old version keeps running.
 */
function buildAll() {
  run("docker", ["compose", "build"]);
}

/**
 * Asks the newly built version whether production would start with this folder's .env, without
 * starting it (scripts/start.ts --check-settings), so a refusal never takes the site down.
 */
function checkSettings() {
  console.log("\nChecking this folder's settings with the new version…");
  const args = ["compose", "run", "--rm", "--no-deps", "-T", "app", "pnpm", "tsx", "scripts/start.ts", "--check-settings"];
  const r = spawnSync("docker", args, { cwd: CWD, stdio: "inherit" });
  if (r.error) fail(`Couldn't run docker: ${r.error.message}`);
  if (r.status !== 0) fail("Production would refuse to start with this folder's .env (the problems are listed above). Fix .env, then run this again.");
}

/** Builds the new version while the old one keeps running, then swaps and waits for it. */
async function buildAndStart(env) {
  buildAll();
  if (env.APP_ENV === "production") checkSettings();
  run("docker", ["compose", "up", "-d"]);
  console.log(`\nWaiting for ${healthUrl(env)} …`);
  return waitForHealth(healthUrl(env));
}

/** Warns (never stops) when GitHub's checks for this version aren't all green. */
function warnIfChecksNotGreen(commit) {
  const r = spawnSync("gh", ["run", "list", "--commit", commit, "--json", "conclusion,status"], { cwd: CWD, encoding: "utf8" });
  if (r.error || r.status !== 0) {
    console.log("(Couldn't ask GitHub about this version's checks: gh isn't installed or signed in. Skipping.)");
    return;
  }
  let runs = [];
  try {
    runs = JSON.parse(r.stdout || "[]");
  } catch {
    runs = [];
  }
  if (runs.length === 0) console.warn("Warning: GitHub has no checks for this version yet.");
  else if (runs.some((x) => x.conclusion !== "success")) {
    console.warn("Warning: GitHub's checks for this version haven't all passed. Look before deploying it to production.");
  }
}

async function deployStaging(env) {
  requireCleanFolder();
  const branch = env.DEPLOY_BRANCH || "main";
  run("git", ["fetch", "origin"]);
  run("git", ["checkout", "--detach", `origin/${branch}`]);
  const commit = read("git", ["rev-parse", "HEAD"]);
  warnIfChecksNotGreen(commit);
  if (!(await buildAndStart(env))) {
    fail("Staging didn't come back healthy. Look at: docker compose logs app");
  }
  writeRecord(commit);
  console.log(`\nStaging is running ${describe(commit)}.`);
}

/** Backs up this copy's database and files. Returns the backup's name, or null if there was nothing yet. */
function backupNow() {
  const name = backupName(new Date());
  run("docker", ["compose", "run", "--rm", "backup", "backup", name]);
  const dir = path.resolve(CWD, loadEnv().BACKUP_DIR || "./backups");
  return existsSync(path.join(dir, "db", name)) ? name : null;
}

async function deployProduction(env) {
  requireCleanFolder();
  const stagingDir = path.resolve(CWD, env.STAGING_DIR || "../staging");
  try {
    const result = await runProductionDeploy({
      log: (m) => console.log(`\n${m}`),
      head: () => read("git", ["rev-parse", "HEAD"]),
      stagingRecord: () => readRecord(stagingDir),
      deployedCommit: () => readRecord(CWD)?.commit ?? null,
      fetch: () => run("git", ["fetch", "origin"]),
      commitExists,
      listNew: (from, to) => (from ? read("git", ["log", "--oneline", `${from}..${to}`]) : ""),
      checkout: (sha) => run("git", ["checkout", "--detach", sha]),
      build: buildAll,
      checkSettings,
      backupNow,
      start: () => run("docker", ["compose", "up", "-d"]),
      waitHealthy: () => {
        console.log(`\nWaiting for ${healthUrl(env)} …`);
        return waitForHealth(healthUrl(env));
      },
      writeRecord,
    });
    if (result.action === "deployed") console.log(`\nProduction is running ${describe(result.commit)}.`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function restore(env, name) {
  if (!name) fail("Say which backup: node scripts/ops.mjs restore <backup name> (they're in BACKUP_DIR/db).");
  requireCleanFolder();
  const dir = path.resolve(CWD, env.BACKUP_DIR || "./backups");
  const infoFile = path.join(dir, "db", name, "info.txt");
  if (!existsSync(infoFile)) fail(`There's no backup called ${name} in ${path.join(dir, "db")}.`);
  const info = parseEnvFile(readFileSync(infoFile, "utf8"));
  const wrongCopy = restoreSourceProblem(info, env.APP_ENV);
  if (wrongCopy) fail(wrongCopy);
  const commit = info.commit && info.commit !== "unknown" ? info.commit : null;

  run("docker", ["compose", "stop", "app"]);
  run("docker", ["compose", "run", "--rm", "backup", "restore", name]);
  if (commit && commitExists(commit)) run("git", ["checkout", "--detach", commit]);
  else console.warn("Warning: this backup doesn't say which version it was taken on; keeping the current version.");

  if (!(await buildAndStart(env))) fail("The app didn't come back healthy after the restore. Look at: docker compose logs app");
  const now = read("git", ["rev-parse", "HEAD"]);
  writeRecord(now);
  console.log(`\nRestored ${name} (${now.slice(0, 7)}).`);
}

async function status(env) {
  const rec = readRecord(CWD);
  console.log(`Copy:      ${env.APP_ENV || "(no APP_ENV: development)"}`);
  console.log(`Deployed:  ${rec ? `${describe(rec.commit)} at ${rec.at}` : "(never deployed from this folder)"}`);
  console.log(`Code here: ${describe("HEAD")}`);
  console.log("");
  run("docker", ["compose", "ps"]);
  const fetchWithLimit = (/** @type {string} */ url, /** @type {RequestInit} */ init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (await waitForHealth(healthUrl(env), { timeoutMs: 0, fetchImpl: fetchWithLimit })) {
    console.log(`\nThe app is answering at ${healthUrl(env)}.`);
    return;
  }
  // Not answering: starting up, stopped, or refused to start. The reason is at the end of its log.
  console.log(`\nThe app isn't answering at ${healthUrl(env)}. The end of its log:`);
  spawnSync("docker", ["compose", "logs", "--tail", "25", "--no-log-prefix", "app"], { cwd: CWD, stdio: "inherit" });
}

/** Shows free space (never stops a command); the nightly job emails when it's low. */
function showDiskSpace() {
  const r = spawnSync("docker", ["compose", "run", "--rm", "backup", "disk-check"], { cwd: CWD, stdio: "inherit" });
  if (r.status !== 0) console.warn("Warning: free space is low. See README → Backups.");
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  const env = loadEnv();
  switch (command) {
    case "deploy": {
      const problem = deployTargetProblem(arg ?? "", env);
      if (problem) fail(problem);
      if (arg === "staging") await deployStaging(env);
      else await deployProduction(env);
      return;
    }
    case "backup":
      if (arg !== "now") fail("Use: node scripts/ops.mjs backup now");
      {
        const name = backupNow();
        console.log(name ? `\nBackup ${name} taken and checked.` : "\nNo database yet, so nothing to back up.");
        showDiskSpace();
      }
      return;
    case "check-backup":
      if (!arg) fail("Say which backup: node scripts/ops.mjs check-backup <backup name> (they're in BACKUP_DIR/db).");
      run("docker", ["compose", "run", "--rm", "backup", "verify", arg]);
      return;
    case "restore":
      await restore(env, arg);
      return;
    case "create-super-admin":
      if (!arg) fail("Use: node scripts/ops.mjs create-super-admin <email>");
      run("docker", ["compose", "exec", "app", "pnpm", "tsx", "scripts/create-super-admin.ts", arg]);
      return;
    case "email-report":
      run("docker", ["compose", "exec", "app", "pnpm", "tsx", "scripts/report-email-case.ts"]);
      return;
    case "test-alert":
      run("docker", ["compose", "run", "--rm", "backup", "alert-test"]);
      console.log("\nTest alert sent. Check the super-admins' inboxes (staging: its test inbox).");
      return;
    case "status":
      await status(env);
      return;
    default:
      fail(
        "Commands: deploy staging | deploy production | backup now | check-backup <backup name> | restore <backup name> | create-super-admin <email> | email-report | test-alert | status"
      );
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Stop ? err.message : err?.stack || err}`);
  process.exit(1);
});
