import { createHash, timingSafeEqual } from "node:crypto";
import { appEnvFrom } from "@/lib/app-env";
import { escapeEmailHtml } from "@/lib/notifications";

/**
 * Alerts from the backup service (docker/backup/backup.sh) to the app, which emails them to the
 * super-admins with its own email settings. The backup service proves it is ours with a key made
 * from AUTH_SECRET, which both have from .env:
 *
 *   key = sha256 hex of "<AUTH_SECRET>:backup-alert"
 *
 * so the secret itself never travels, and the key is useless for signing sessions.
 */

export const ALERT_KEY_HEADER = "x-cineflow-alert-key";
export const ALERT_KINDS = ["backup-failed", "disk-low", "test"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export function backupAlertKey(secret: string): string {
  return createHash("sha256").update(`${secret}:backup-alert`).digest("hex");
}

/** Whether `given` is this app's alert key (compared in constant time). */
export function alertKeyMatches(given: string | null, secret: string): boolean {
  if (!given) return false;
  const expected = Buffer.from(backupAlertKey(secret));
  const actual = Buffer.from(given.trim());
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The alert email: subject, title, HTML body (escaped) and plain text. */
export function alertEmail(kind: AlertKind, backup: string, detail: string, env: Record<string, string | undefined> = process.env) {
  const copy = appEnvFrom(env);
  const cleanDetail = detail.trim().slice(-4000);
  if (kind === "test") {
    const lines = [
      `This is a test alert from CineFlow OS (${copy}).`,
      "If you're reading this, a failed nightly backup will reach you here too.",
    ];
    return {
      subject: `[CineFlow ${copy}] Test alert`,
      title: "Test alert",
      bodyHtml: lines.map((l) => `<p>${escapeEmailHtml(l)}</p>`).join(""),
      text: lines.join("\n"),
    };
  }
  if (kind === "disk-low") {
    const intro = `The 24/7 PC running CineFlow OS ${copy} is low on disk space. When a disk fills up, backups fail and the app can't save uploads.`;
    const steps = [
      "1. Free space on that drive: empty the Recycle Bin, and move or delete large files you don't need.",
      "2. Each deploy leaves the previous app version's build behind. On the 24/7 PC, run: docker image prune -f",
      "   and: docker builder prune -f   (both remove only leftovers nothing uses).",
      "3. Backups are kept BACKUP_KEEP_DAYS days (in the production folder's .env). Lower it if the backup drive is small.",
      "The site keeps running meanwhile. This email repeats each night until there's enough room.",
    ];
    return {
      subject: `[CineFlow ${copy}] Low disk space`,
      title: "Low disk space",
      bodyHtml: [
        `<p>${escapeEmailHtml(intro)}</p>`,
        cleanDetail
          ? `<pre style="white-space:pre-wrap;word-break:break-word;background:#18181c;border:1px solid #27272a;border-radius:8px;padding:12px;font-size:12px;color:#fafafa;">${escapeEmailHtml(cleanDetail)}</pre>`
          : "",
        `<p style="margin-bottom:6px;color:#a1a1aa;">What to do:</p>`,
        `<p style="white-space:pre-line;">${escapeEmailHtml(steps.join("\n"))}</p>`,
      ].join(""),
      text: [intro, "", cleanDetail ? `${cleanDetail}\n` : "", "What to do:", ...steps].join("\n"),
    };
  }
  const next = [
    "1. On the 24/7 PC, in the production folder, run: node scripts/ops.mjs backup now",
    "   It shows the error. Often the backup folder is full or Google Drive / OneDrive isn't signed in.",
    "2. Once it works, the next nightly backup runs as usual. The site itself is not affected.",
  ];
  const intro = `Last night's backup${backup ? ` (${backup})` : ""} of CineFlow OS ${copy} didn't finish, so there's no new copy of today's data.`;
  return {
    subject: `[CineFlow ${copy}] Nightly backup failed`,
    title: "Nightly backup failed",
    bodyHtml: [
      `<p>${escapeEmailHtml(intro)}</p>`,
      cleanDetail
        ? `<p style="margin-bottom:6px;color:#a1a1aa;">What it said:</p><pre style="white-space:pre-wrap;word-break:break-word;background:#18181c;border:1px solid #27272a;border-radius:8px;padding:12px;font-size:12px;color:#fafafa;">${escapeEmailHtml(cleanDetail)}</pre>`
        : "",
      `<p style="margin-bottom:6px;color:#a1a1aa;">What to do:</p>`,
      `<p style="white-space:pre-line;">${escapeEmailHtml(next.join("\n"))}</p>`,
    ].join(""),
    text: [intro, "", cleanDetail ? `What it said:\n${cleanDetail}\n` : "", "What to do:", ...next].join("\n"),
  };
}
