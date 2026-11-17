/**
 * Tier 28: A page left open across an update reloads itself
 * After a new version is deployed, buttons on a page that was already open fail with Next's
 * UnrecognizedActionError ("Server Action … was not found on the server"). The page reloads
 * instead of showing that error: once a minute at most, and never for any other error.
 */

import { TestHarness } from "./test-harness";
import { isStaleVersionError, reloadIfStaleVersion, STALE_VERSION_MESSAGE } from "@/lib/stale-version";
import { errorMessageOf } from "@/lib/action-error";

function unrecognized(): Error {
  const e = new Error('Server Action "008c04f1" was not found on the server.');
  e.name = "UnrecognizedActionError";
  return e;
}

/** A pretend browser window: counts reloads, keeps session storage in a Map. */
function fakeWindow() {
  const store = new Map<string, string>();
  const win = {
    reloads: 0,
    location: { reload: () => { win.reloads += 1; } },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    },
  };
  return win;
}

export async function runTier28StaleVersionTests(harness: TestHarness) {
  harness.setSuite("Tier 28", "A page left open across an update reloads itself");
  const g = globalThis as { window?: unknown };

  await harness.test("T28-STALE-01: only Next's 'action not found' error counts", async () => {
    harness.assert(isStaleVersionError(unrecognized()), "UnrecognizedActionError, by name");
    const byMessage = new Error('Server Action "abc" was not found on the server. Read more: …');
    harness.assert(isStaleVersionError(byMessage), "…or by its message");
    harness.assert(!isStaleVersionError(new Error("Could not save. Please try again.")), "An ordinary failure doesn't");
    harness.assert(!isStaleVersionError(null) && !isStaleVersionError("text"), "Nor a non-error");
  });

  await harness.test("T28-STALE-02: in the browser it reloads once, then leaves the error to the page", async () => {
    const saved = g.window;
    const win = fakeWindow();
    g.window = win;
    try {
      harness.assertEqual(reloadIfStaleVersion(new Error("Network down")), false, "Another error: no reload");
      harness.assertEqual(win.reloads, 0, "…none happened");
      harness.assertEqual(errorMessageOf(unrecognized()), STALE_VERSION_MESSAGE, "A caught stale error says the page is reloading");
      harness.assertEqual(win.reloads, 1, "…and reloads it");
      harness.assertEqual(reloadIfStaleVersion(unrecognized()), false, "A second time within a minute: no reload loop");
      harness.assertEqual(win.reloads, 1, "…still one reload");
      harness.assertEqual(errorMessageOf(new Error("Could not save.")), "Could not save.", "Other messages are unchanged");
    } finally {
      if (saved === undefined) delete g.window;
      else g.window = saved;
    }
  });

  await harness.test("T28-STALE-03: on the server nothing reloads", async () => {
    harness.assertEqual(typeof g.window, "undefined", "No window on the server");
    harness.assertEqual(reloadIfStaleVersion(unrecognized()), false, "No reload");
    harness.assertEqual(errorMessageOf(unrecognized()), 'Server Action "008c04f1" was not found on the server.', "The message passes through");
  });
}
