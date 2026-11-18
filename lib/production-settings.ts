/**
 * Settings production must not start with. scripts/start.ts refuses to start the live copy
 * while this list is not empty; each entry names the setting to fix.
 */

import { DEV_FALLBACK_AUTH_SECRET } from "@/lib/auth/dev-secret";
import { smtpConfigFromEnv } from "@/lib/email/smtp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "mailpit"]);

export function productionSettingProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];

  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (!secret) problems.push("AUTH_SECRET is missing. Set a long random value.");
  else if (secret === DEV_FALLBACK_AUTH_SECRET) problems.push("AUTH_SECRET is the built-in development secret. Set your own long random value.");
  else if (secret.length < 32) problems.push("AUTH_SECRET is shorter than 32 characters.");

  if (env.ALLOW_SIMULATED_CARD_PAYMENTS?.trim().toLowerCase() === "true") {
    problems.push("ALLOW_SIMULATED_CARD_PAYMENTS is on, so anyone could mark a bill as paid. Remove it.");
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  let url: URL | null = null;
  try {
    url = new URL(appUrl);
  } catch {
    url = null;
  }
  if (!url) problems.push("NEXT_PUBLIC_APP_URL is missing or not a web address.");
  else if (url.protocol !== "https:") problems.push("NEXT_PUBLIC_APP_URL must start with https://.");
  else if (LOCAL_HOSTS.has(url.hostname)) problems.push("NEXT_PUBLIC_APP_URL points at this computer; use the live address.");

  const smtp = smtpConfigFromEnv(env as NodeJS.ProcessEnv);
  const resend = Boolean(env.RESEND_API_KEY?.trim());
  if (smtp && LOCAL_HOSTS.has(smtp.host.toLowerCase())) {
    problems.push(`SMTP_HOST is "${smtp.host}", a test inbox: emails would never reach anyone. Set a real email service.`);
  } else if (!smtp && !resend) {
    problems.push("No email is set up: add SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY.");
  }

  if (/(^|\/\/)dev\.toyyibpay\.com/i.test(env.TOYYIBPAY_BASE_URL?.trim() ?? "")) {
    problems.push("TOYYIBPAY_BASE_URL is the Toyyibpay sandbox, so payments wouldn't be real. Remove it.");
  }

  return problems;
}
