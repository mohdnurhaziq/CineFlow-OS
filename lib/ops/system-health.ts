/**
 * The super-admin's "System health" card: a few plain lines about this copy of the app.
 * Read-only, and never shows a key, password or secret: only words about them.
 *
 * Backups are written by the backup container to BACKUP_DIR. The app sees that folder read-only
 * at /backups (docker-compose.yml) and reads the newest backup's info.txt ("taken=<time>").
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { appEnvFrom, type AppEnv } from "@/lib/app-env";
import { emailSetup } from "@/lib/production-settings";
import pkg from "@/package.json";

export type HealthState = "ok" | "warn" | "info";

export interface HealthItem {
  key: "app" | "database" | "email" | "backup";
  label: string;
  state: HealthState;
  detail: string;
}

/** Where the app sees the backup folder's snapshots inside its container. */
export const DEFAULT_BACKUP_DIR = "/backups/db";

/** Nightly backups: one older than this (a missed night plus some slack) is worth a look. */
const STALE_AFTER_HOURS = 36;

const TIME_ZONE = "Asia/Kuala_Lumpur";

/** The time of the newest backup under `dbDir` (one folder per backup, each with an info.txt). */
export async function lastBackupTime(dbDir: string): Promise<{ name: string; takenAt: Date } | null> {
  let names: string[];
  try {
    names = await readdir(dbDir);
  } catch {
    return null;
  }
  let best: { name: string; takenAt: Date } | null = null;
  for (const name of names) {
    let info: string;
    try {
      info = await readFile(path.join(dbDir, name, "info.txt"), "utf8");
    } catch {
      continue;
    }
    const taken = /^taken=(.+)$/m.exec(info)?.[1]?.trim();
    const takenAt = taken ? new Date(taken) : null;
    if (!takenAt || Number.isNaN(takenAt.getTime())) continue;
    if (!best || takenAt > best.takenAt) best = { name, takenAt };
  }
  return best;
}

function howLongAgo(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 120) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function whenInStudioTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export function backupHealth(last: { name: string; takenAt: Date } | null, now: Date, appEnv: AppEnv): HealthItem {
  const label = "Backups";
  if (!last) {
    return appEnv === "production"
      ? { key: "backup", label, state: "warn", detail: "No backup found. Check that the backup service is running (node scripts/ops.mjs status) and that BACKUP_DIR is set." }
      : { key: "backup", label, state: "info", detail: "No backups on this copy. Only production keeps nightly backups." };
  }
  const detail = `Last backup ${whenInStudioTime(last.takenAt)} (${howLongAgo(last.takenAt, now)})`;
  const stale = now.getTime() - last.takenAt.getTime() > STALE_AFTER_HOURS * 3_600_000;
  if (stale && appEnv === "production") {
    return { key: "backup", label, state: "warn", detail: `${detail}. A nightly backup should have run since: check the backup service and the alert emails.` };
  }
  return { key: "backup", label, state: stale ? "info" : "ok", detail };
}

export function emailHealth(env: Record<string, string | undefined>, appEnv: AppEnv): HealthItem {
  const label = "Email";
  const setup = emailSetup(env);
  if (!setup.problem) return { key: "email", label, state: "ok", detail: setup.summary };
  // A test inbox or no email is normal on the laptop and on staging; on production it is a fault.
  if (appEnv === "production") return { key: "email", label, state: "warn", detail: `${setup.summary}. ${setup.problem}` };
  return { key: "email", label, state: "info", detail: setup.summary };
}

export async function getSystemHealth(
  opts: { env?: Record<string, string | undefined>; now?: Date; backupDir?: string } = {}
): Promise<HealthItem[]> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const appEnv = appEnvFrom(env);

  let database: HealthItem;
  try {
    await db.$queryRaw`SELECT 1`;
    database = { key: "database", label: "Database", state: "ok", detail: "Answering" };
  } catch {
    database = { key: "database", label: "Database", state: "warn", detail: "Not answering. See the app log (docker compose logs app)." };
  }

  return [
    { key: "app", label: "App", state: "info", detail: `Version ${pkg.version}, ${appEnv} copy` },
    database,
    emailHealth(env, appEnv),
    backupHealth(await lastBackupTime(opts.backupDir ?? env.BACKUP_READ_DIR ?? DEFAULT_BACKUP_DIR), now, appEnv),
  ];
}
