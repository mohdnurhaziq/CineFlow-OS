import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isRateLimited } from "@/lib/rate-limit";
import { sendPlatformEmail } from "@/lib/notifications";
import { ALERT_KEY_HEADER, ALERT_KINDS, alertEmail, alertKeyMatches, type AlertKind } from "@/lib/ops-alert";

export const dynamic = "force-dynamic";

/**
 * POST /api/ops/alert?kind=backup-failed&backup=<name>   body: what the backup printed (text)
 * POST /api/ops/alert?kind=disk-low                     body: the free space it measured
 * POST /api/ops/alert?kind=test
 *
 * Called by the backup service (docker/backup/backup.sh) with the alert key (lib/ops-alert).
 * Emails every active super-admin. Replies 200 when at least one email was sent, 409 when there
 * is no super-admin, 502 when every send failed, so `ops.mjs test-alert` can say what's wrong.
 */
export async function POST(request: Request) {
  if (!alertKeyMatches(request.headers.get(ALERT_KEY_HEADER), env.AUTH_SECRET)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (isRateLimited("ops-alert", 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many alerts this hour." }, { status: 429 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  if (!(ALERT_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: `Unknown kind "${kind}".` }, { status: 400 });
  }
  const backup = (url.searchParams.get("backup") ?? "").replace(/[^0-9A-Za-z_.-]/g, "").slice(0, 64);
  const detail = (await request.text().catch(() => "")).slice(-8000);

  const admins = await db.user.findMany({
    where: { role: "SUPER_ADMIN", deactivatedAt: null },
    select: { email: true },
  });
  if (admins.length === 0) {
    return NextResponse.json(
      { error: "There's no super-admin to email. Create one with: node scripts/ops.mjs create-super-admin <email>" },
      { status: 409 }
    );
  }

  const mail = alertEmail(kind as AlertKind, backup, detail);
  const results = await Promise.all(admins.map((a) => sendPlatformEmail({ to: a.email, ...mail })));
  const sent = results.filter((r) => r.delivery === "SENT").length;
  const problems = [...new Set(results.filter((r) => r.delivery !== "SENT").map((r) => r.error ?? "No email service is set up."))];
  if (sent === 0) {
    return NextResponse.json({ sent, error: `No alert email could be sent: ${problems.join("; ")}` }, { status: 502 });
  }
  return NextResponse.json({ sent, ...(problems.length ? { problems } : {}) });
}
