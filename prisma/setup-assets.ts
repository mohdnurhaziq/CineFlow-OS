import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * The demo studios' files (logos, receipts, showcase, deliverables…): tiny placeholders the demo
 * data points at. They are made here when the demo data is loaded (prisma/seed.ts), never kept in
 * git or the Docker image, so production, which never loads demo data, has none. A production
 * started by an older version that still shipped them removes them (scripts/start.ts).
 *
 * The showcase and delivered photos are real sample photos, kept in prisma/demo-images (same paths
 * as public/uploads) so the demo studios' websites and galleries aren't empty. They are used only
 * when that folder is there; otherwise the tiny placeholder is written instead.
 */

// 1x1 valid PNG buffer
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// 1x1 valid JPEG buffer
const JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

// Minimal MP4 container header
const MP4_BUFFER = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAsbZGF0",
  "base64"
);

const LUMINA_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none">
    <rect width="200" height="60" rx="8" fill="#121215"/>
    <circle cx="35" cy="30" r="14" stroke="#f59e0b" stroke-width="3"/>
    <polygon points="32,23 42,30 32,37" fill="#f59e0b"/>
    <text x="60" y="36" fill="#fafafa" font-family="sans-serif" font-weight="700" font-size="16" letter-spacing="1.5">LUMINA</text>
    <text x="135" y="36" fill="#f59e0b" font-family="sans-serif" font-weight="400" font-size="14">CINE</text>
  </svg>`;

const APEX_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none">
    <rect width="200" height="60" rx="8" fill="#121215"/>
    <path d="M22 42 L35 18 L48 42 Z" stroke="#06b6d4" stroke-width="3" fill="none"/>
    <line x1="27" y1="34" x2="43" y2="34" stroke="#06b6d4" stroke-width="2"/>
    <text x="60" y="36" fill="#fafafa" font-family="sans-serif" font-weight="700" font-size="16" letter-spacing="1.5">APEX</text>
    <text x="115" y="36" fill="#06b6d4" font-family="sans-serif" font-weight="400" font-size="14">MOTION</text>
  </svg>`;

type DemoUpload = {
  file: string;
  /** Exactly what the demo writes: the sample photo when there is one, else the placeholder. */
  bytes: Buffer;
  /** The tiny placeholder an older version wrote in place of the photo (set only when `bytes` is a photo). */
  stub?: Buffer;
};

const files = (folder: string, names: string[], bytes: Buffer): DemoUpload[] => names.map((n) => ({ file: `${folder}/${n}`, bytes }));

/** A sample photo from prisma/demo-images, or null when this copy has none. */
function demoPhoto(file: string): Buffer | null {
  try {
    return readFileSync(path.join(process.cwd(), "prisma", "demo-images", ...file.split("/")));
  } catch {
    return null;
  }
}

const withPhotos = (entries: DemoUpload[]): DemoUpload[] =>
  entries.map((e) => {
    const photo = e.file.endsWith(".jpg") ? demoPhoto(e.file) : null;
    return photo ? { file: e.file, bytes: photo, stub: e.bytes } : e;
  });

/** Every demo file: its path inside public/uploads and its exact content. */
export const DEMO_UPLOADS: ReadonlyArray<DemoUpload> = withPhotos([
  { file: "logos/lumina-logo.svg", bytes: Buffer.from(LUMINA_LOGO) },
  { file: "logos/apex-logo.svg", bytes: Buffer.from(APEX_LOGO) },
  ...files("qrcodes", ["lumina_qr.png", "apex_duitnow_qr.png"], PNG_BUFFER),
  ...files("receipts", ["receipt_sample_qr.jpg", "duitnow_receipt_farah.jpg", "duitnow_slip_kamarudin.jpg"], JPEG_BUFFER),
  ...files("deliverables/previews", ["aurora_hero_01_watermarked.jpg", "aurora_hero_02_watermarked.jpg", "farah_convo_01_preview.jpg", "farah_family_02_preview.jpg"], JPEG_BUFFER),
  ...files("deliverables/previews", ["aurora_60s_stream_proxy.mp4"], MP4_BUFFER),
  ...files("deliverables/masters", ["aurora_hero_01_master.jpg", "aurora_hero_02_master.jpg", "farah_convo_01_master.jpg", "farah_family_02_master.jpg"], JPEG_BUFFER),
  ...files("deliverables/masters", ["aurora_60s_prores422hq_master.mov"], MP4_BUFFER),
  ...files(
    "deliverables/thumbnails",
    ["aurora_hero_01_thumb.jpg", "aurora_hero_02_thumb.jpg", "aurora_video_thumb.jpg", "farah_convo_01_thumb.jpg", "farah_family_02_thumb.jpg"],
    JPEG_BUFFER
  ),
  ...files("frames", ["matte-black.png", "warm-walnut.png", "champagne-gold.png", "apex-black.png", "apex-gold.png", "apex-teak.png"], PNG_BUFFER),
  ...files(
    "showcase",
    [
      "lumina_showcase_01.jpg",
      "lumina_showcase_02.jpg",
      "lumina_01_a.jpg",
      "lumina_01_b.jpg",
      "apex_convo_showcase.jpg",
      "apex_raya_showcase.jpg",
      "apex_convo_01.jpg",
      "apex_convo_02.jpg",
    ],
    JPEG_BUFFER
  ),
]);

/** Writes every demo file into `uploadsRoot` (public/uploads), with the upload folders. */
export async function writeDemoUploads(uploadsRoot: string): Promise<void> {
  for (const folder of ["general", "signatures"]) await fs.mkdir(path.join(uploadsRoot, folder), { recursive: true });
  for (const { file, bytes } of DEMO_UPLOADS) {
    const target = path.join(uploadsRoot, ...file.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

/** Same content, ignoring Windows line endings (a git checkout on Windows can add them to the SVGs). */
function sameContent(a: Buffer, b: Buffer): boolean {
  if (a.equals(b)) return true;
  const crlf = Buffer.from("\r\n");
  return a.includes(crlf) && Buffer.from(a.toString("latin1").replace(/\r\n/g, "\n"), "latin1").equals(b);
}

/**
 * Removes the demo files from `uploadsRoot`, but only ones still exactly as the demo made them:
 * a studio's own file saved under the same name is kept. Folders stay. Returns what it removed.
 */
export async function removeDemoUploads(uploadsRoot: string): Promise<string[]> {
  const removed: string[] = [];
  for (const { file, bytes, stub } of DEMO_UPLOADS) {
    const target = path.join(uploadsRoot, ...file.split("/"));
    const current = await fs.readFile(target).catch(() => null);
    if (current && (sameContent(current, bytes) || (stub && sameContent(current, stub)))) {
      await fs.rm(target, { force: true });
      removed.push(file);
    }
  }
  return removed;
}

/**
 * Swaps a demo file that is still the tiny placeholder for its sample photo, so a demo copy created
 * before the photos existed gets them on its next start. A file a studio has replaced (anything but
 * the exact placeholder) is left alone. Returns what it replaced.
 */
export async function upgradeDemoUploads(uploadsRoot: string): Promise<string[]> {
  const upgraded: string[] = [];
  for (const { file, bytes, stub } of DEMO_UPLOADS) {
    if (!stub) continue;
    const target = path.join(uploadsRoot, ...file.split("/"));
    const current = await fs.readFile(target).catch(() => null);
    if (current && current.equals(stub)) {
      await fs.writeFile(target, bytes);
      upgraded.push(file);
    }
  }
  return upgraded;
}

/** For prisma/seed.ts: the demo files in this project's public/uploads. */
export async function setupPlaceholderAssets() {
  await writeDemoUploads(path.join(process.cwd(), "public", "uploads"));
}
