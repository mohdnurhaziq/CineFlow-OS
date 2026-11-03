import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { isRateLimited } from "@/lib/rate-limit";

const ALLOWED_FOLDERS = new Set([
  "logos",
  "qrcodes",
  "receipts",
  "deliverables",
  "frames",
  "showcase",
  "signatures",
  "general",
]);

/**
 * Folders that visitors without a session may write to: studio logos during
 * self-serve onboarding (no account exists yet) and payment receipts from
 * checkout. Everything else requires studio staff.
 */
const ANONYMOUS_FOLDERS = new Set(["logos", "receipts"]);
const ANONYMOUS_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ANONYMOUS_MAX_UPLOADS = 20; // per IP per window

const STAFF_ROLES = new Set(["SUPER_ADMIN", "STUDIO_OWNER", "PHOTOGRAPHER", "VIDEOGRAPHER", "CREW"]);

/** Extension is derived from the validated MIME type, never from the client-supplied filename. */
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
};

const MB = 1024 * 1024;
const MAX_BYTES_BY_KIND = { document: 10 * MB, video: 200 * MB };
const maxBytesFor = (type: string) => (type.startsWith("video/") ? MAX_BYTES_BY_KIND.video : MAX_BYTES_BY_KIND.document);
const MAX_REQUEST_BYTES = MAX_BYTES_BY_KIND.video + MB;

export async function POST(request: NextRequest) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestedFolder = (formData.get("folder") as string) || "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const extension = EXTENSION_BY_TYPE[file.type];
    if (!extension) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const folder = ALLOWED_FOLDERS.has(requestedFolder) ? requestedFolder : "general";

    // Authorization: staff may write anywhere; visitors only to the narrow public folders.
    const session = await getCurrentUser();
    const isStaff = !!session && STAFF_ROLES.has(session.role);
    if (!isStaff) {
      if (!ANONYMOUS_FOLDERS.has(folder)) {
        return NextResponse.json(
          { error: session ? "Not permitted to upload here" : "Sign in required" },
          { status: session ? 403 : 401 }
        );
      }
      if (!ANONYMOUS_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
      }
      const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
      if (isRateLimited(`upload:${ip}`, ANONYMOUS_MAX_UPLOADS)) {
        return NextResponse.json({ error: "Too many uploads. Please wait and try again." }, { status: 429 });
      }
    }

    if (file.size > maxBytesFor(file.type)) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const targetDir = path.join(process.cwd(), "public", "uploads", folder);
    await fs.mkdir(targetDir, { recursive: true });

    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
    const filePath = path.join(targetDir, uniqueName);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(filePath, buffer);

    const publicUrl = `/uploads/${folder}/${uniqueName}`;

    return NextResponse.json(
      {
        success: true,
        url: publicUrl,
        filename: uniqueName,
        size: buffer.length,
        mimeType: file.type,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
