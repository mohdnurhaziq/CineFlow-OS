export type Orientation = "PORTRAIT" | "LANDSCAPE";

export type PhotoSize = { width: number; height: number };

export type PrintDimensions = { widthInches: number; heightInches: number; orientation: Orientation };

/** A photo taller than wide is portrait, wider than tall is landscape; a square photo is portrait. */
export function orientationFor(width: number, height: number): Orientation {
  return width > height ? "LANDSCAPE" : "PORTRAIT";
}

/**
 * The print's real size for a photo: the catalog size's short side as listed, the long side
 * stretched (or shrunk) to the photo's shape, rounded to 0.1". The photo fills it with no crop
 * and no border. A square photo prints square at the short side.
 */
export function printDimensionsFor(size: { widthInches: number; heightInches: number }, photo: PhotoSize): PrintDimensions {
  const short = Math.min(size.widthInches, size.heightInches);
  const ratio = Math.max(photo.width, photo.height) / Math.min(photo.width, photo.height);
  const long = Math.round(short * ratio * 10) / 10;
  const orientation = orientationFor(photo.width, photo.height);
  return orientation === "PORTRAIT"
    ? { widthInches: short, heightInches: long, orientation }
    : { widthInches: long, heightInches: short, orientation };
}

/** A stored resolution ("6000 × 4000", "6000x4000") as pixels; null when missing or unreadable. */
export function parseResolution(resolution: string | null | undefined): PhotoSize | null {
  const m = resolution?.match(/(\d+)\s*[×xX*]\s*(\d+)/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** "8 × 12 in" (one decimal only when needed). */
export function formatPrintInches(d: { widthInches: number; heightInches: number }): string {
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  return `${n(d.widthInches)} × ${n(d.heightInches)} in`;
}
