/**
 * Helpers to run server actions as a signed-in user in the E2E runner.
 * Backed by the `next/headers` stub (see next-headers-stub.mjs).
 */
import { COOKIE_NAME, createSessionToken, type SessionUser } from "../../../lib/auth/token";

interface CookieState {
  enabled: boolean;
  jar: Map<string, string>;
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

export { COOKIE_NAME };
