/**
 * Tier 32: Running on its own
 * - Production ships no demo files: they're made by the demo data, never kept in git or the
 *   image, and an older production's leftovers are removed when it starts
 * - A production start that refuses its settings says why once and waits, instead of
 *   restarting over and over; a deploy checks the settings before taking the old version down
 * - Each backup is checked the way a restore needs it; low disk space emails the super-admins
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TestHarness } from "./test-harness";
import { DEMO_UPLOADS, removeDemoUploads, writeDemoUploads } from "../../prisma/setup-assets";
import { settingsRefusal } from "../../scripts/start";
import { ALERT_KINDS, alertEmail } from "@/lib/ops-alert";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

const goodProduction: Record<string, string | undefined> = {
  APP_ENV: "production",
  AUTH_SECRET: "k".repeat(20) + "Q9".repeat(10),
  NEXT_PUBLIC_APP_URL: "https://app.luminacine.com",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "a@b.c",
  SMTP_PASS: "x",
};
const badProduction = { ...goodProduction, AUTH_SECRET: "short", ALLOW_SIMULATED_CARD_PAYMENTS: "true" };

/**
 * The environment for running scripts/start.ts as its own process, without this run's settings
 * leaking in. Blanked rather than removed: Prisma fills missing ones from the project's .env.
 */
function startEnv(settings: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  for (const k of ["AUTH_SECRET", "NEXT_PUBLIC_APP_URL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "RESEND_API_KEY", "ALLOW_SIMULATED_CARD_PAYMENTS", "TOYYIBPAY_BASE_URL"]) e[k] = "";
  for (const [k, v] of Object.entries(settings)) if (v !== undefined) e[k] = v;
  return e;
}

const START = [process.execPath, ["--import", "tsx", "scripts/start.ts"]] as const;

export async function runTier32Running247Tests(harness: TestHarness) {
  harness.setSuite("Tier 32", "Running on its own");

  // ── Demo files ──────────────────────────────────────────────────────────────

  await harness.test("T32-UPL-01: demo files aren't kept in git or the image; the demo data makes every one it uses", async () => {
    const tracked = spawnSync("git", ["ls-files", "public/uploads"], { cwd: ROOT, encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean);
    harness.assert(tracked.length > 0, "git lists public/uploads");
    harness.assertDeepEqual(tracked.filter((f) => !f.endsWith("/.gitkeep")), [], "Only folder placeholders are in git");

    const ignore = read(".dockerignore").split(/\r?\n/).map((l) => l.trim());
    harness.assert(ignore.includes("public/uploads/**"), "The image leaves out whatever is in public/uploads", ignore.join(" | "));
    harness.assert(ignore.includes("!public/uploads/**/.gitkeep"), "…except the folder placeholders");

    const made = new Set(DEMO_UPLOADS.map((u) => `/uploads/${u.file}`));
    const used = [...new Set(read("prisma/seed.ts").match(/\/uploads\/[A-Za-z0-9_./-]+\.[a-z0-9]+/g) ?? [])];
    harness.assert(used.length >= 30, "The demo data uses demo files", String(used.length));
    harness.assertDeepEqual(used.filter((u) => !made.has(u)), [], "Every file the demo data points at is made by it");

    for (const u of DEMO_UPLOADS) {
      harness.assert(existsSync(path.join(ROOT, "public", "uploads", u.file)), `The seed made ${u.file}`);
    }
  });

  await harness.test("T32-UPL-02: only untouched demo files are removed; real files with the same names stay", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cineflow-demo-uploads-"));
    try {
      await writeDemoUploads(dir);
      // A studio's own logo saved under a demo name, the same demo logo with Windows line endings,
      // and a real upload.
      writeFileSync(path.join(dir, "logos", "lumina-logo.svg"), "<svg><text>A real studio</text></svg>");
      const apex = DEMO_UPLOADS.find((u) => u.file === "logos/apex-logo.svg")!;
      writeFileSync(path.join(dir, apex.file), apex.bytes.toString("utf8").replace(/\n/g, "\r\n"));
      await mkdir(path.join(dir, "showcase"), { recursive: true });
      writeFileSync(path.join(dir, "showcase", "real-wedding.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0x01]));

      const removed = await removeDemoUploads(dir);
      harness.assertEqual(removed.length, DEMO_UPLOADS.length - 1, "Every demo file but the changed one", removed.join(", "));
      harness.assert(removed.includes("logos/apex-logo.svg"), "Line endings don't matter");
      harness.assert(!removed.includes("logos/lumina-logo.svg"), "A changed file is kept");
      harness.assert(existsSync(path.join(dir, "logos", "lumina-logo.svg")), "…and still there");
      harness.assert(existsSync(path.join(dir, "showcase", "real-wedding.jpg")), "A real upload stays");
      harness.assert(!existsSync(path.join(dir, "receipts", "duitnow_receipt_farah.jpg")), "A demo receipt is gone");
      harness.assert(statSync(path.join(dir, "receipts")).isDirectory(), "Folders stay");
      harness.assertDeepEqual(await removeDemoUploads(dir), [], "Running it again removes nothing");
      harness.assertDeepEqual(await removeDemoUploads(path.join(dir, "missing")), [], "A missing folder is fine");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await harness.test("T32-UPL-03: production removes demo files an older version left behind, and never makes any", async () => {
    const start = read("scripts/start.ts");
    const main = start.slice(start.indexOf("async function main"));
    harness.assert(/appEnv === "production"[\s\S]{0,200}removeDemoUploads\(/.test(main), "start.ts removes them in production");
    harness.assert(/result === "created" && appEnv !== "production"/.test(main), "The demo data (and its files) is never loaded in production");
  });

  // ── A refused start ─────────────────────────────────────────────────────────

  await harness.test("T32-START-01: the refusal names every problem and the command to start again", async () => {
    harness.assertEqual(settingsRefusal({ ...badProduction, APP_ENV: "staging" }), null, "Staging isn't checked");
    harness.assertEqual(settingsRefusal(goodProduction), null, "Safe production settings pass");
    const message = settingsRefusal(badProduction) ?? "";
    harness.assert(message.startsWith("Production can't start"), "Says production can't start", message);
    harness.assert(message.includes("AUTH_SECRET") && message.includes("ALLOW_SIMULATED_CARD_PAYMENTS"), "Names each problem");
    harness.assert(message.includes("docker compose up -d --force-recreate app"), "Says how to start it again");
  });

  await harness.test("T32-START-02: a refused start waits with the reason instead of restarting; --check-settings answers at once", async () => {
    const check = (settings: Record<string, string | undefined>) =>
      spawnSync(START[0], [...START[1], "--check-settings"], { cwd: ROOT, env: startEnv(settings), encoding: "utf8", timeout: 60000 });
    const bad = check(badProduction);
    harness.assertEqual(bad.status, 1, "Unsafe settings: exit 1", bad.stderr);
    harness.assert(bad.stderr.includes("AUTH_SECRET is shorter than 32 characters"), "…naming the problem", bad.stderr);
    const good = check(goodProduction);
    harness.assertEqual(good.status, 0, "Safe settings: exit 0", good.stderr + good.stdout);
    const staging = check({ ...badProduction, APP_ENV: "staging" });
    harness.assertEqual(staging.status, 0, "Not production: nothing to refuse", staging.stderr);

    // The real start-up, refused: it must still be running (waiting) after saying why.
    const child = spawn(START[0], [...START[1]], { cwd: ROOT, env: startEnv(badProduction) });
    let errText = "";
    child.stderr.on("data", (d) => (errText += String(d)));
    let exitCode: number | null = null;
    child.on("exit", (code) => (exitCode = code ?? -1));
    try {
      const deadline = Date.now() + 60000;
      while (!errText.includes("--force-recreate app") && exitCode === null && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      harness.assert(errText.includes("Production can't start"), "It says why", errText);
      await new Promise((r) => setTimeout(r, 2500));
      harness.assertEqual(exitCode, null, "…and waits instead of exiting (an exit would restart it, over and over)");
      harness.assertEqual(errText.split("Production can't start").length - 1, 1, "The reason is printed once");
    } finally {
      child.kill();
    }
  });

  await harness.test("T32-START-03: status shows an app that isn't answering, and why; deploys check settings first", async () => {
    const compose = read("docker-compose.yml");
    const app = compose.slice(compose.indexOf("\n  app:"), compose.indexOf("\n  mailpit:"));
    harness.assert(/healthcheck:[\s\S]*\/api\/health/.test(app), "The app has a health check, so `docker compose ps` shows unhealthy");

    const ops = read("scripts/ops.mjs");
    harness.assert(ops.includes('"scripts/start.ts", "--check-settings"'), "ops.mjs checks settings with the new version");
    const buildAndStart = ops.slice(ops.indexOf("async function buildAndStart"), ops.indexOf("/** Warns"));
    harness.assert(/production[\s\S]*checkSettings\(\)/.test(buildAndStart), "A production restore checks settings before starting");
    harness.assert(/checkSettings,/.test(ops), "…and so does deploy production (before the backup and the swap)");
    const status = ops.slice(ops.indexOf("async function status"), ops.indexOf("async function main"));
    harness.assert(status.includes("waitForHealth") && status.includes('"logs", "--tail"'), "status shows the end of the log when the app isn't answering");
  });

  // ── Backups and disk space ──────────────────────────────────────────────────

  await harness.test("T32-BAK-01: each backup is checked the way a restore needs it, and a damaged one is never restored", async () => {
    const script = read("docker/backup/backup.sh");
    const fn = (name: string) => {
      const start = script.indexOf(`\n${name}() {`);
      return start < 0 ? "" : script.slice(start, script.indexOf("\n}", start));
    };
    const verify = fn("verify");
    harness.assert(verify.includes("PRAGMA integrity_check"), "SQLite's full integrity check");
    harness.assert(verify.includes("_prisma_migrations"), "It records its database changes");
    harness.assert(/^TABLES="SELECT name FROM sqlite_master/m.test(script) && verify.includes('"$TABLES"'), "Same tables as the live database, when on the same version");

    const backup = fn("backup");
    harness.assert(/if ! verify "\$name"/.test(backup), "Every backup is checked as it's taken");
    harness.assert(backup.includes("--dry-run"), "…and every current file must be in the mirror");
    harness.assert(backup.indexOf("verify") < backup.indexOf("Old snapshots"), "Old snapshots go only after a checked backup");

    const restore = fn("restore");
    harness.assert(restore.includes("verify") && restore.indexOf("verify") < restore.indexOf('rm -f "$DB"'), "restore checks the backup before touching the database");

    const disk = fn("disk_check");
    harness.assert(disk.includes("df -Pk") && disk.includes("BACKUP_MIN_FREE_GB"), "Free space is measured against BACKUP_MIN_FREE_GB");
    harness.assert(/alert disk-low/.test(fn("daemon")), "The nightly loop emails when space is low");
    harness.assert(/verify\)/.test(script) && /disk-check\)/.test(script), "Both can be run on their own");
    const shell = spawnSync("sh", ["-n", path.join(ROOT, "docker/backup/backup.sh")], { encoding: "utf8" });
    if (!shell.error) harness.assertEqual(shell.status, 0, "backup.sh parses", shell.stderr);

    const compose = read("docker-compose.yml");
    harness.assert(compose.includes("BACKUP_MIN_FREE_GB: ${BACKUP_MIN_FREE_GB:-5}"), "The limit comes from .env (default 5 GB)");
    harness.assert(/^BACKUP_MIN_FREE_GB=/m.test(read(".env.production.example")), "…and is in the production example");

    const ops = read("scripts/ops.mjs");
    harness.assert(ops.includes('case "check-backup"') && ops.includes('"backup", "verify"'), "ops.mjs check-backup <name> checks any backup");
    const check = spawnSync(process.execPath, ["--check", path.join(ROOT, "scripts/ops.mjs")], { encoding: "utf8" });
    harness.assertEqual(check.status, 0, "ops.mjs loads", check.stderr);
  });

  await harness.test("T32-BAK-02: the low-disk email says where, how much, and what to do", async () => {
    harness.assert((ALERT_KINDS as readonly string[]).includes("disk-low"), "The app accepts disk-low alerts");
    const mail = alertEmail("disk-low", "", "Free space on the backup folder: 1.2 GB <b>\nBelow 5 GB", { APP_ENV: "production" });
    harness.assertEqual(mail.subject, "[CineFlow production] Low disk space", "Subject");
    harness.assert(mail.bodyHtml.includes("1.2 GB") && !mail.bodyHtml.includes("<b>"), "Shows the measurement, escaped");
    harness.assert(mail.text.includes("docker image prune") && mail.text.includes("BACKUP_KEEP_DAYS"), "Says how to free space", mail.text);
  });
}
