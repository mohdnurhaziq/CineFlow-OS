import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Serves files written to public/uploads at runtime.
 *
 * `next start` only serves public/ files that existed at build time, so anything saved by
 * /api/upload afterwards (studio logos, receipts, previews…) would 404. next.config.ts
 * rewrites /uploads/* here when no build-time file matches.
 */

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
};

// Same policy next.config.ts applies to /uploads: uploaded files must never run script.
const SAFE_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filePath = path.resolve(UPLOADS_ROOT, ...segments);

  // Refuse anything that escapes the uploads folder (e.g. ../../.env).
  if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = CONTENT_TYPE_BY_EXT[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new NextResponse("Not found", { status: 404 });
    const data = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        ...SAFE_HEADERS,
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        // Upload names are unique (timestamp + random), so a file never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
