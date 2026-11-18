/**
 * Which copy of CineFlow OS this is: development (this PC), staging (the test copy on the
 * 24/7 PC) or production (the live one). NODE_ENV is "production" in every Docker copy, so
 * it can't tell them apart. Set APP_ENV in each copy's .env; it is also passed at build time
 * (see the Dockerfile) so pages rendered ahead of time agree with the running app.
 */

export type AppEnv = "development" | "staging" | "production";

const APP_ENVS: readonly AppEnv[] = ["development", "staging", "production"];

export function appEnvFrom(env: Record<string, string | undefined> = process.env): AppEnv {
  const value = env.APP_ENV?.trim();
  if (!value) return "development";
  if ((APP_ENVS as readonly string[]).includes(value)) return value as AppEnv;
  throw new Error(`Unknown APP_ENV "${value}"`);
}

export const APP_ENV: AppEnv = appEnvFrom();
