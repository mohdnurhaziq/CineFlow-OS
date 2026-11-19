import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/guard";
import { loadAccess, type AccessArea, type AccessLevel } from "@/lib/auth/access";
import { isRateLimited } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/client-ip";

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
const ANONYMOUS_MAX_UPLOADS = 20; // per visitor IP, per hour

/**
 * Team folders that belong to an access area: a team member needs one of `levels` there to upload.
 * The upload only stores a file; the record it is attached to is checked again by its own action
 * (e.g. /api/deliverables checks the project). The other folders are open to the whole team.
 * Deliverables are gallery work: Galleries OWN (their own galleries) or MANAGE, not the read-only VIEW.
 */
const FOLDER_ACCESS: Record<string, { area: AccessArea; levels: AccessLevel[] }> = {
  deliverables: { area: "galleries", levels: ["OWN", "MANAGE"] },
  frames: { area: "catalog", levels: ["MANAGE"] },
  showcase: { area: "catalog", levels: ["MANAGE"] },
  signatures: { area: "production", levels: ["VIEW", "MANAGE"] },
};


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

const ANONYMOUS_MAX_REQUEST_BYTES = MAX_BYTES_BY_KIND.document + MB;
const HOUR = 60 * 60 * 1000;
const ANONYMOUS_MAX_UPLOADS_ALL = 300; // all visitors together, per hour
const STAFF_MAX_UPLOADS = 300; // per team member, per hour
const CLIENT_MAX_UPLOADS = 60; // per signed-in client, per hour

class TooLarge extends Error {}

/**
 * The request body, read up to `max` bytes: a body that says it's bigger, or turns out bigger
 * (a chunked upload declares no size), is refused without reading the rest.
 */
async function readCapped(request: NextRequest, max: number): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) throw new TooLarge();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel().catch(() => {});
        throw new TooLarge();
      }
      chunks.push(value);
    }
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}

export async function POST(request: NextRequest) {
  try {
    // Who is uploading decides how much is read: visitors only small documents, the team videos too.
    const session = await getCurrentUser();
    const isStaff = !!session && STAFF_ROLES.has(session.role);

    let formData: FormData;
    try {
      formData = await readCapped(request, isStaff ? MAX_REQUEST_BYTES : ANONYMOUS_MAX_REQUEST_BYTES);
    } catch (err) {
      if (err instanceof TooLarge) return NextResponse.json({ error: "File too large" }, { status: 413 });
      throw err;
    }
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

    // Authorization: the team may write to the folders their access covers; visitors only to the
    // narrow public folders.
    const need = FOLDER_ACCESS[folder];
    if (isStaff && need) {
      const access = await loadAccess({ id: session.id, role: session.role, tenantId: session.tenantId });
      if (!need.levels.includes(access.areas[need.area])) {
        return NextResponse.json({ error: "Not permitted to upload here" }, { status: 403 });
      }
    }
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
      if (session) {
        // A signed-in client (payment slips): their own allowance, not the visitors' shared one,
        // so a flood of anonymous uploads can't block their checkout.
        if (isRateLimited(`upload:user:${session.id}`, CLIENT_MAX_UPLOADS, HOUR)) {
          return NextResponse.json({ error: "Too many uploads. Please wait and try again." }, { status: 429 });
        }
      } else {
        // Per visitor (Cloudflare's IP: X-Forwarded-For is the visitor's to fake), and for all
        // visitors together, so no one can fill the disk.
        const ip = clientIpFrom((name) => request.headers.get(name));
        if ((ip && isRateLimited(`upload:${ip}`, ANONYMOUS_MAX_UPLOADS, HOUR)) || isRateLimited("upload:anonymous", ANONYMOUS_MAX_UPLOADS_ALL, HOUR)) {
          return NextResponse.json({ error: "Too many uploads. Please wait and try again." }, { status: 429 });
        }
      }
    } else if (isRateLimited(`upload:staff:${session.id}`, STAFF_MAX_UPLOADS, HOUR)) {
      return NextResponse.json({ error: "Too many uploads. Please wait and try again." }, { status: 429 });
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
