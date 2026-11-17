import { sameCategory } from "@/lib/bookings/pricing-shared";

/**
 * The studio's name for a category code, e.g. "studio-portrait" → "Studio Portraits".
 * Falls back to a readable form of the code when the category no longer exists. Client-safe.
 */
export function categoryName(categories: ReadonlyArray<{ slug: string; name: string }>, code: string | null | undefined): string {
  if (!code) return "Session";
  const found = categories.find((c) => sameCategory(c.slug, code));
  if (found) return found.name;
  const words = code.replace(/[-_]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
