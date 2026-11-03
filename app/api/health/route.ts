import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbStatus: "connected" | "error" = "error";
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    // Lightweight query — just checks that Prisma can reach the database
    await db.$queryRaw`SELECT 1`;
    dbStatus = "connected";
    dbLatencyMs = Date.now() - start;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown database error";
  }

  const isHealthy = dbStatus === "connected";

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      db: dbStatus,
      ...(dbLatencyMs !== null && { dbLatencyMs }),
      ...(dbError && { dbError }),
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
