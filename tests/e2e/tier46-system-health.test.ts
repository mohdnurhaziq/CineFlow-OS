/**
 * Tier 46: the super-admin's "System health" card
 * - The newest backup is read from the backup folder's info.txt files (the app sees that folder read-only)
 * - Backups: fresh is fine; stale or missing is a warning on production, plain information elsewhere
 * - Email: the same settings check production start-up uses, in words; never shows a key
 * - The app and database lines, and the card in the console
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TestHarness } from "./test-harness";
import { provideReactGlobal } from "./react-tree";
import { backupHealth, emailHealth, getSystemHealth, lastBackupTime } from "@/lib/ops/system-health";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";
import type { PlatformMetrics } from "@/lib/actions/super-admin";

const NOW = new Date("2026-11-27T04:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

export async function runTier46SystemHealthTests(harness: TestHarness) {
  harness.setSuite("Tier 46", "Super-admin system health");
  await provideReactGlobal();

  const root = mkdtempSync(path.join(tmpdir(), "cineflow-health-"));
  const backup = (name: string, info: string | null) => {
    mkdirSync(path.join(root, name), { recursive: true });
    if (info !== null) writeFileSync(path.join(root, name, "info.txt"), info);
  };
  harness.registerTeardown(() => rmSync(root, { recursive: true, force: true }));

  await harness.test("T46-HEALTH-01: the newest backup is read from info.txt; a missing folder or odd entries are not a crash", async () => {
    harness.assertEqual(await lastBackupTime(path.join(root, "nope")), null, "No folder: null");
    harness.assertEqual(await lastBackupTime(root), null, "Empty folder: null");
    backup("2026-11-25_030000", "env=production\ncommit=abc\ntaken=2026-11-25T03:00:04+08:00\n");
    backup("2026-11-26_030000", "env=production\ncommit=abc\ntaken=2026-11-26T03:00:09+08:00\n");
    backup("no-info", null);
    backup("garbage", "taken=yesterday-ish\n");
    const last = await lastBackupTime(root);
    harness.assertEqual(last?.name, "2026-11-26_030000", "The newest valid one");
    harness.assertEqual(last?.takenAt.toISOString(), "2026-11-25T19:00:09.000Z", "Its time, as an instant");
  });

  await harness.test("T46-HEALTH-02: a backup is fine within 36 hours; older or missing warns on production, only informs elsewhere", async () => {
    harness.assertEqual(backupHealth({ name: "a", takenAt: hoursAgo(1) }, NOW, "production").state, "ok", "1 hour old");
    harness.assertEqual(backupHealth({ name: "a", takenAt: hoursAgo(35) }, NOW, "production").state, "ok", "35 hours old");
    const stale = backupHealth({ name: "a", takenAt: hoursAgo(40) }, NOW, "production");
    harness.assertEqual(stale.state, "warn", "40 hours old");
    harness.assert(/40 hours ago/.test(stale.detail), "Says how old, in words", stale.detail);
    const none = backupHealth(null, NOW, "production");
    harness.assertEqual(none.state, "warn", "None on production");
    harness.assert(/backup/i.test(none.detail), "Says what is missing", none.detail);
    harness.assertEqual(backupHealth(null, NOW, "development").state, "info", "None on the laptop is expected");
    harness.assertEqual(backupHealth(null, NOW, "staging").state, "info", "None on staging is expected");
    harness.assert(/Fri|27 Nov|26 Nov/.test(backupHealth({ name: "a", takenAt: hoursAgo(2) }, NOW, "production").detail), "Shows the date");
  });

  await harness.test("T46-HEALTH-03: email health says where mail goes, warns on production when real people would get nothing, and never shows a key", async () => {
    const live = { SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.c", SMTP_PASS: "pw-secret-123" };
    const smtp = emailHealth(live, "production");
    harness.assertEqual(smtp.state, "ok", "Real SMTP");
    harness.assert(smtp.detail.includes("smtp.gmail.com"), "Names the host", smtp.detail);
    harness.assert(!smtp.detail.includes("pw-secret-123"), "No password");

    const resendOk = emailHealth({ RESEND_API_KEY: "re_key_secret_999", RESEND_FROM_EMAIL: "CineFlow OS <hello@cineflow-os.my>" }, "production");
    harness.assertEqual(resendOk.state, "ok", "Resend with its own domain");
    harness.assert(resendOk.detail.includes("hello@cineflow-os.my"), "Names the sender", resendOk.detail);
    harness.assert(!resendOk.detail.includes("re_key_secret_999"), "No key");

    const noSender = emailHealth({ RESEND_API_KEY: "re_key_secret_999" }, "production");
    harness.assertEqual(noSender.state, "warn", "Resend without a sender on production");
    harness.assert(noSender.detail.includes("RESEND_FROM_EMAIL"), "Names the setting to fix", noSender.detail);

    harness.assertEqual(emailHealth({ SMTP_HOST: "mailpit" }, "development").state, "info", "A test inbox on the laptop is normal");
    harness.assertEqual(emailHealth({ SMTP_HOST: "mailpit" }, "staging").state, "info", "A test inbox on staging is normal");
    harness.assertEqual(emailHealth({ SMTP_HOST: "mailpit" }, "production").state, "warn", "A test inbox on production is not");
    harness.assertEqual(emailHealth({}, "production").state, "warn", "Nothing on production");
  });

  await harness.test("T46-HEALTH-04: the health list has the app, database, email and backup lines, and leaks no secret", async () => {
    backup("2026-11-27_030000", "env=production\ncommit=abc\ntaken=2026-11-27T03:00:05+08:00\n");
    const items = await getSystemHealth({
      env: { APP_ENV: "production", RESEND_API_KEY: "re_key_secret_999", RESEND_FROM_EMAIL: "hello@cineflow-os.my", AUTH_SECRET: "auth-secret-xyz" },
      now: NOW,
      backupDir: root,
    });
    harness.assertDeepEqual(items.map((i) => i.key), ["app", "database", "email", "backup"], "The four lines, in order");
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    harness.assertEqual(byKey.database?.state, "ok", "The test database answers");
    const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    harness.assert(Boolean(byKey.app?.detail.includes(version) && byKey.app.detail.includes("production")), "App line: version and copy", byKey.app?.detail);
    harness.assertEqual(byKey.backup?.state, "ok", "The backup written above is 1 hour old");
    const text = JSON.stringify(items);
    harness.assert(!text.includes("re_key_secret_999") && !text.includes("auth-secret-xyz"), "No secret anywhere");
  });

  await harness.test("T46-HEALTH-05: the console shows the card when given health, and still renders without it", async () => {
    const metrics = {
      totalStudios: 0, byState: { TRIAL: 0, ACTIVE: 0, OVERDUE: 0, PAUSED: 0, CLOSED: 0 }, revenueThisMonth: 0, revenue12m: 0, endingSoon: [],
    } as unknown as PlatformMetrics;
    const html = (props: Record<string, unknown>) =>
      renderToStaticMarkup(createElement(SuperAdminView, { metrics, tenants: [], ...props } as never));
    const withCard = html({
      health: [
        { key: "backup", label: "Backups", state: "warn", detail: "No backup found yet" },
        { key: "email", label: "Email", state: "ok", detail: "Resend, sending as hello@cineflow-os.my" },
      ],
    });
    harness.assert(withCard.includes("System health"), "Has the heading");
    harness.assert(withCard.includes("No backup found yet") && withCard.includes("hello@cineflow-os.my"), "Shows each line");
    harness.assert(/Needs attention|Check this/i.test(withCard), "A warning is marked in words, not only by colour");
    harness.assert(!html({}).includes("System health"), "No health, no card");
  });

  await harness.test("T46-HEALTH-06: the app container can read the backup folder, read-only", async () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    const appBlock = compose.slice(compose.indexOf("\n  app:"), compose.indexOf("\n  mailpit:"));
    harness.assert(/\$\{BACKUP_DIR:-\.\/backups\}:\/backups:ro/.test(appBlock), "app mounts BACKUP_DIR at /backups, read-only");
  });
}
