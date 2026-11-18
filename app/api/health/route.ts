import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Answers 200 when the app is up and can read its database, 503 otherwise. Used by the deploy
 * commands (scripts/ops.mjs). Public, so it shows no details: errors go to the server log.
 */
export async function GET() {
  let dbStatus: "connected" | "error" = "error";
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    console.error("Health check: database error:", err);
  }
  const ok = dbStatus === "connected";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db: dbStatus, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}
