/**
 * Test stand-in for `next/headers`.
 *
 * Outside a request scope the real `cookies()` throws, which the app treats as
 * "no session". This stub preserves that behaviour by default; a test opts in to
 * a signed-in request by enabling the shared jar (see ./session.ts).
 */
const state = (globalThis.__cineflowTestCookies ??= { enabled: false, jar: new Map(), ambient: null });
// The request's host (see withHost in ./session.ts) and a record of cookie writes, with their options.
state.host ??= null;
state.ip ??= null;
// The studio the request is for (what the middleware reports in x-cineflow-studio; see withStudio in ./session.ts).
state.studio ??= null;
state.calls ??= [];

export async function cookies() {
  if (!state.enabled) {
    // Optional runner-wide default session (see setAmbientSession). Writes are discarded.
    if (state.ambient) {
      const jar = new Map([[state.ambient.name, state.ambient.value]]);
      return {
        get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
        has: (name) => jar.has(name),
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        set: () => undefined,
        delete: () => undefined,
      };
    }
    throw new Error("`cookies` was called outside a request scope (test stub)");
  }
  return {
    get: (name) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    has: (name) => state.jar.has(name),
    getAll: () => Array.from(state.jar, ([name, value]) => ({ name, value })),
    set: (nameOrOptions, value, options) => {
      state.calls.push({ op: "set", args: [nameOrOptions, value, options] });
      if (typeof nameOrOptions === "string") state.jar.set(nameOrOptions, value);
      else state.jar.set(nameOrOptions.name, nameOrOptions.value);
    },
    delete: (name) => {
      state.calls.push({ op: "delete", args: [name] });
      return state.jar.delete(typeof name === "string" ? name : name.name);
    },
  };
}

export async function headers() {
  const h = new Headers(state.host ? { host: state.host } : {});
  // The visitor's IP as Cloudflare reports it (see withIp in ./session.ts).
  if (state.ip) h.set("cf-connecting-ip", state.ip);
  if (state.studio) h.set("x-cineflow-studio", state.studio);
  return h;
}

export async function draftMode() {
  return { isEnabled: false, enable() {}, disable() {} };
}
