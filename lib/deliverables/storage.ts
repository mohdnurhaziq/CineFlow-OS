import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";

/**
 * Where client deliverables live.
 *
 * Masters (full-resolution photos, master videos) are kept OUTSIDE /public, under
 * storage/, so they can only be fetched through /api/download, which checks that the
 * project's final balance is paid. Clients review watermarked, downsized previews that
 * are served publicly from /uploads/deliverables/.
 *
 * Not a "use server" module. Server-only (Node file system).
 */

export const PRIVATE_ROOT = path.join(process.cwd(), "storage");
/** downloadUrl values for private masters start with this; older seed data uses /uploads/... paths. */
export const PRIVATE_PREFIX = "private:";
const PREVIEW_DIR = path.join(process.cwd(), "public", "uploads", "deliverables", "previews");
const PREVIEW_MAX_PX = 1600;

/** Absolute path of a deliverable's master file, never outside storage/ or public/. */
export function masterFilePath(downloadUrl: string): string {
  if (downloadUrl.startsWith(PRIVATE_PREFIX)) {
    const target = path.resolve(PRIVATE_ROOT, downloadUrl.slice(PRIVATE_PREFIX.length));
    if (!target.startsWith(PRIVATE_ROOT + path.sep)) throw new Error("Invalid deliverable path");
    return target;
  }
  const publicRoot = path.join(process.cwd(), "public");
  const target = path.resolve(publicRoot, downloadUrl.replace(/^\/+/, ""));
  if (!target.startsWith(publicRoot + path.sep)) throw new Error("Invalid deliverable path");
  return target;
}

function humanSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function saveMaster(tenantId: string, projectId: string, data: Buffer, ext: string): Promise<string> {
  const rel = path.join("deliverables", tenantId, projectId, `${crypto.randomUUID()}${ext}`);
  const abs = path.join(PRIVATE_ROOT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return `${PRIVATE_PREFIX}${rel.split(path.sep).join("/")}`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/**
 * Stores a photo: the original privately, plus a public preview at most PREVIEW_MAX_PX on
 * its long side with the studio name tiled across it. Throws if the file isn't an image.
 */
export async function storeDeliverablePhoto(opts: {
  tenantId: string;
  projectId: string;
  data: Buffer;
  ext: string;
  watermark: string;
}): Promise<{ downloadUrl: string; previewUrl: string; resolution: string; fileSize: string }> {
  const meta = await sharp(opts.data).metadata();
  if (!meta.width || !meta.height) throw new Error("Not a readable image");

  const resized = await sharp(opts.data)
    .rotate()
    .resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const label = escapeXml(opts.watermark.toUpperCase());
  const fontSize = Math.max(18, Math.round(Math.min(width, height) / 18));
  // Room for the whole label plus a gap, so repeats never run into each other.
  const tileWidth = Math.round((label.length + 12) * fontSize * 0.7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><pattern id="w" width="${tileWidth}" height="${fontSize * 5}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${fontSize * 2}" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="white" fill-opacity="0.28">${label} · PROOF</text>
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#w)"/>
  </svg>`;
  const preview = await sharp(resized.data)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 72 })
    .toBuffer();

  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const previewName = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(PREVIEW_DIR, previewName), preview);

  return {
    downloadUrl: await saveMaster(opts.tenantId, opts.projectId, opts.data, opts.ext),
    previewUrl: `/uploads/deliverables/previews/${previewName}`,
    resolution: `${meta.width} × ${meta.height}`,
    fileSize: humanSize(opts.data.length),
  };
}

/** Stores a video master privately. Its streaming preview is a separate, studio-made review copy. */
export async function storeDeliverableVideoMaster(opts: {
  tenantId: string;
  projectId: string;
  data: Buffer;
  ext: string;
}): Promise<{ downloadUrl: string; fileSize: string }> {
  return { downloadUrl: await saveMaster(opts.tenantId, opts.projectId, opts.data, opts.ext), fileSize: humanSize(opts.data.length) };
}

/** Stores a review copy of a video publicly, for streaming in the client's vault. */
export async function storeVideoReviewCopy(data: Buffer, ext: string): Promise<string> {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(PREVIEW_DIR, name), data);
  return `/uploads/deliverables/previews/${name}`;
}

/** Deletes a deliverable's files (master and preview). Missing files are ignored. */
export async function deleteDeliverableFiles(item: { downloadUrl: string; previewUrl: string }) {
  for (const target of [item.downloadUrl, item.previewUrl]) {
    if (!target || /^https?:/i.test(target)) continue;
    try {
      await fs.unlink(masterFilePath(target));
    } catch {
      // already gone
    }
  }
}
