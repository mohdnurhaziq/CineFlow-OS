/**
 * A long random id (at least 128 bits), in any browser. crypto.randomUUID exists only on https
 * and localhost pages, so a page opened over plain http (a phone testing http://192.168.x.x)
 * falls back to crypto.getRandomValues.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
