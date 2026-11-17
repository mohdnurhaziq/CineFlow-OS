/**
 * A page that stays open while a new version of the app is deployed still carries the old
 * version's server action ids. Its buttons then fail with Next's UnrecognizedActionError
 * ("Server Action … was not found on the server") until the page is reloaded. This reloads it
 * for the person instead of showing them that error.
 *
 * Client-safe; on the server it only answers whether the error is that one.
 */

const RELOADED_AT = "cineflow:stale-version-reloaded-at";
/** At most one automatic reload per minute: if a reload doesn't help, show the error instead. */
const MIN_GAP_MS = 60_000;

/** The error a button on an out-of-date page gets from the server. */
export function isStaleVersionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  // By name, not instanceof: the class can come from a different bundle chunk.
  if (e.name === "UnrecognizedActionError") return true;
  return typeof e.message === "string" && /Server Action .* was not found on the server/.test(e.message);
}

/**
 * If `error` means this page is out of date, reload it (once a minute at most) and return true.
 * Otherwise return false and leave the error to the caller.
 */
export function reloadIfStaleVersion(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleVersionError(error)) return false;
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(RELOADED_AT)) || 0;
  } catch {
    // Storage blocked: still reload; the guard just can't remember.
  }
  if (Date.now() - last < MIN_GAP_MS) return false;
  try {
    window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // As above.
  }
  window.location.reload();
  return true;
}

/** What to tell the person while the page reloads, when a caller shows a message anyway. */
export const STALE_VERSION_MESSAGE = "This page was out of date. Reloading…";
