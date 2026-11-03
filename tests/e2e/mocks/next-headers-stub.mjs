/**
 * Test stand-in for `next/headers`.
 *
 * Outside a request scope the real `cookies()` throws, which the app treats as
 * "no session". This stub preserves that behaviour by default; a test opts in to
 * a signed-in request by enabling the shared jar (see ./session.ts).
 */
const state = (globalThis.__cineflowTestCookies ??= { enabled: false, jar: new Map() });

export async function cookies() {
  if (!state.enabled) {
    throw new Error("`cookies` was called outside a request scope (test stub)");
  }
  return {
    get: (name) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    has: (name) => state.jar.has(name),
    getAll: () => Array.from(state.jar, ([name, value]) => ({ name, value })),
    set: (nameOrOptions, value) => {
      if (typeof nameOrOptions === "string") state.jar.set(nameOrOptions, value);
      else state.jar.set(nameOrOptions.name, nameOrOptions.value);
    },
    delete: (name) => state.jar.delete(typeof name === "string" ? name : name.name),
  };
}

export async function headers() {
  return new Headers();
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
