/** Category slugs are compared loosely ("studio-portrait" == "STUDIO_PORTRAIT"). Client-safe. */
export function sameCategory(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return norm(a) === norm(b);
}
