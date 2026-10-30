import fs from "node:fs/promises";
import path from "node:path";

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

export async function setupPlaceholderAssets() {
  const rootDir = process.cwd();

  const directories = [
    "public/uploads/logos",
    "public/uploads/qrcodes",
    "public/uploads/receipts",
    "public/uploads/deliverables/previews",
    "public/uploads/deliverables/masters",
    "public/uploads/deliverables/thumbnails",
    "public/uploads/frames",
    "public/uploads/showcase",
  ];

  for (const dir of directories) {
    await fs.mkdir(path.join(rootDir, dir), { recursive: true });
  }

  // Logos (SVG)
  const luminaLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none">
    <rect width="200" height="60" rx="8" fill="#121215"/>
    <circle cx="35" cy="30" r="14" stroke="#f59e0b" stroke-width="3"/>
    <polygon points="32,23 42,30 32,37" fill="#f59e0b"/>
    <text x="60" y="36" fill="#fafafa" font-family="sans-serif" font-weight="700" font-size="16" letter-spacing="1.5">LUMINA</text>
    <text x="135" y="36" fill="#f59e0b" font-family="sans-serif" font-weight="400" font-size="14">CINE</text>
  </svg>`;

  const apexLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none">
    <rect width="200" height="60" rx="8" fill="#121215"/>
    <path d="M22 42 L35 18 L48 42 Z" stroke="#06b6d4" stroke-width="3" fill="none"/>
    <line x1="27" y1="34" x2="43" y2="34" stroke="#06b6d4" stroke-width="2"/>
    <text x="60" y="36" fill="#fafafa" font-family="sans-serif" font-weight="700" font-size="16" letter-spacing="1.5">APEX</text>
    <text x="115" y="36" fill="#06b6d4" font-family="sans-serif" font-weight="400" font-size="14">MOTION</text>
  </svg>`;

  await fs.writeFile(path.join(rootDir, "public/uploads/logos/lumina-logo.svg"), luminaLogo);
  await fs.writeFile(path.join(rootDir, "public/uploads/logos/apex-logo.svg"), apexLogo);

  // QR Codes
  await fs.writeFile(path.join(rootDir, "public/uploads/qrcodes/lumina_qr.png"), PNG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/qrcodes/apex_duitnow_qr.png"), PNG_BUFFER);

  // Receipts
  await fs.writeFile(path.join(rootDir, "public/uploads/receipts/receipt_sample_qr.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/receipts/duitnow_receipt_farah.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/receipts/duitnow_slip_kamarudin.jpg"), JPEG_BUFFER);

  // Deliverables Previews
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/previews/aurora_hero_01_watermarked.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/previews/aurora_hero_02_watermarked.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/previews/aurora_60s_stream_proxy.mp4"), MP4_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/previews/farah_convo_01_preview.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/previews/farah_family_02_preview.jpg"), JPEG_BUFFER);

  // Deliverables Masters
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/masters/aurora_hero_01_master.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/masters/aurora_hero_02_master.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/masters/aurora_60s_prores422hq_master.mov"), MP4_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/masters/farah_convo_01_master.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/masters/farah_family_02_master.jpg"), JPEG_BUFFER);

  // Deliverables Thumbnails
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/thumbnails/aurora_hero_01_thumb.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/thumbnails/aurora_hero_02_thumb.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/thumbnails/aurora_video_thumb.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/thumbnails/farah_convo_01_thumb.jpg"), JPEG_BUFFER);
  await fs.writeFile(path.join(rootDir, "public/uploads/deliverables/thumbnails/farah_family_02_thumb.jpg"), JPEG_BUFFER);

  // Frames
  const frames = [
    "matte-black.png",
    "warm-walnut.png",
    "champagne-gold.png",
    "apex-black.png",
    "apex-gold.png",
    "apex-teak.png",
  ];
  for (const frame of frames) {
    await fs.writeFile(path.join(rootDir, `public/uploads/frames/${frame}`), PNG_BUFFER);
  }

  // Showcase
  const showcaseFiles = [
    "lumina_showcase_01.jpg",
    "lumina_showcase_02.jpg",
    "lumina_01_a.jpg",
    "lumina_01_b.jpg",
    "apex_convo_showcase.jpg",
    "apex_raya_showcase.jpg",
    "apex_convo_01.jpg",
    "apex_convo_02.jpg",
  ];
  for (const item of showcaseFiles) {
    await fs.writeFile(path.join(rootDir, `public/uploads/showcase/${item}`), JPEG_BUFFER);
  }
}
