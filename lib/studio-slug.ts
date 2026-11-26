/**
 * A studio's web address from its name: "Aina's Photography" → "ainas-photography". Used on every
 * keystroke of the sign-up wizard, so it must work from the whole name each time. Client-safe.
 */
export function slugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents: é → e
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, "") // "aina's" is one word
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 50) // SlugSchema's longest
    .replace(/-+$/, "");
}
