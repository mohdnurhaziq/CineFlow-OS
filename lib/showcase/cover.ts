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
