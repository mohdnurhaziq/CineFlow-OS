/**
 * Helpers to run server actions as a signed-in user in the E2E runner.
 * Backed by the `next/headers` stub (see next-headers-stub.mjs).
 */
import { COOKIE_NAME, createSessionToken, liveAccounts, type SessionUser } from "../../../lib/auth/token";

interface CookieState {
  enabled: boolean;
  jar: Map<string, string>;
  ambient: { name: string; value: string } | null;
  host: string | null;
  ip: string | null;
  studio: string | null;
  calls: Array<{ op: "set" | "delete"; args: unknown[] }>;
}

/**
 * Sets a default session used by every call NOT wrapped in withSession/withRequest.
 * The runner uses this so the many feature tiers that drive admin actions act as a
 * platform admin; authorization itself is tested explicitly with withSession(null|user).
 */
export async function setAmbientSession(user: SessionUser | null) {
  const state = cookieState();
  state.ambient = user ? { name: COOKIE_NAME, value: await createSessionToken(user) } : null;
}

function cookieState(): CookieState {
  const g = globalThis as unknown as { __cineflowTestCookies?: CookieState };
  if (!g.__cineflowTestCookies) {
    throw new Error("next/headers stub is not active. Run via `npm run test:e2e` (needs --import mocks/register.mjs).");
  }
  return g.__cineflowTestCookies;
}

/** Runs `fn` inside a simulated request carrying a valid session for `user` (or none). */
export async function withSession<T>(user: SessionUser | null, fn: () => Promise<T>): Promise<T> {
  const state = cookieState();
  state.jar.clear();
  if (user) state.jar.set(COOKIE_NAME, await createSessionToken(user));
  state.enabled = true;
  try {
    return await fn();
  } finally {
    state.enabled = false;
    state.jar.clear();
  }
}

/** Like withSession, but exposes the cookie jar so tests can inspect cookies a call sets. */
export async function withRequest<T>(fn: (jar: Map<string, string>) => Promise<T>): Promise<T> {
  const state = cookieState();
  state.jar.clear();
  state.enabled = true;
  try {
    return await fn(state.jar);
  } finally {
    state.enabled = false;
    state.jar.clear();
  }
}

/**
 * Runs `fn` as if the request came to `host` (what `headers()` reports), and returns what it did
 * to cookies: each set/delete with its arguments, options included.
 */
export async function withHost<T>(host: string, fn: () => Promise<T>): Promise<{ result: T; calls: CookieState["calls"] }> {
  const state = cookieState();
  const saved = state.host;
  state.host = host;
  state.calls = [];
  try {
    const result = await fn();
    return { result, calls: [...state.calls] };
  } finally {
    state.host = saved;
    state.calls = [];
  }
}

/** Runs `fn` as if the request is for studio `slug` (what the middleware reports in x-cineflow-studio). */
export async function withStudio<T>(slug: string | null, fn: () => Promise<T>): Promise<T> {
  const state = cookieState();
  const saved = state.studio;
  state.studio = slug;
  try {
    return await fn();
  } finally {
    state.studio = saved;
  }
}

/** Like withSession, but for a person's one login: the token lists all their accounts, `activeUserId` is the active one. */
export async function withLoginSession<T>(loginId: string, activeUserId: string, fn: () => Promise<T>): Promise<T> {
  const state = cookieState();
  const accounts = await liveAccounts(loginId);
  const active = accounts.find((a) => a.userId === activeUserId);
  if (!active) throw new Error("withLoginSession: the active account isn't one of the login's live accounts");
  state.jar.clear();
  state.jar.set(COOKIE_NAME, await createSessionToken(active.user, accounts.map(({ tenantSlug, userId, role }) => ({ tenantSlug, userId, role }))));
  state.enabled = true;
  try {
    return await fn();
  } finally {
    state.enabled = false;
    state.jar.clear();
  }
}

/** Runs `fn` as if the request came from visitor IP `ip` (what Cloudflare would report). */
export async function withIp<T>(ip: string, fn: () => Promise<T>): Promise<T> {
  const state = cookieState();
  const saved = state.ip;
  state.ip = ip;
  try {
    return await fn();
  } finally {
    state.ip = saved;
  }
}

export { COOKIE_NAME };
