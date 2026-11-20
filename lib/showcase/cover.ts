/**
 * The image shown for a portfolio item. Items saved without a cover photo get a built-in
 * placeholder; so do older items saved with "/uploads/showcase/default.jpg", a file that never
 * existed. Safe to import from server and client code.
 */

export const SHOWCASE_PLACEHOLDER = "/showcase-placeholder.svg";

const MISSING_DEFAULT = "/uploads/showcase/default.jpg";

export function showcaseCover(url: string | null | undefined): string {
  const u = url?.trim();
  return !u || u === MISSING_DEFAULT ? SHOWCASE_PLACEHOLDER : u;
}

/**
 * A portfolio item's photos as the editor shows them: the cover first, then the gallery, with no
 * duplicates. The placeholder (or the old missing default) is never a photo, and never the cover:
 * the cover is "" until a real photo is chosen.
 */
export function editableShowcasePhotos(cover: string | null | undefined, galleryJson: string | null | undefined): { cover: string; images: string[] } {
  let gallery: string[] = [];
  try {
    const parsed: unknown = galleryJson ? JSON.parse(galleryJson) : [];
    if (Array.isArray(parsed)) gallery = parsed.filter((u): u is string => typeof u === "string" && u.trim() !== "");
  } catch {
    // Older items stored a comma-separated list.
    gallery = (galleryJson ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  const real = (u: string | null | undefined) => (u && showcaseCover(u) !== SHOWCASE_PLACEHOLDER ? u : "");
  const realCover = real(cover);
  const images = Array.from(new Set([realCover, ...gallery.map(real)].filter(Boolean)));
  return { cover: realCover, images };
}
