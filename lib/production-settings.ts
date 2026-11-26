/**
 * Settings production must not start with. scripts/start.ts refuses to start the live copy
 * while this list is not empty; each entry names the setting to fix.
 */

import { DEV_FALLBACK_AUTH_SECRET } from "@/lib/auth/dev-secret";
import { smtpConfigFromEnv } from "@/lib/email/smtp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "mailpit"]);

/** Addresses reserved for examples and tests (RFC 2606), e.g. the one in .env.production.example. */
export function isPlaceholderHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return (
    /(^|\.)example\.(com|net|org)$/.test(h) ||
    /\.(example|test|invalid|localhost)$/.test(h) ||
    h === "example"
  );
}

/**
 * Whether `appUrl` is a live public address: https, and not this computer or an example. A copy
 * at such an address must say which copy it is (APP_ENV), or it would start as a demo site.
 */
export function isLiveAddress(appUrl: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(appUrl ?? "");
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !LOCAL_HOSTS.has(host) && !isPlaceholderHost(host);
}

/** The address inside "Name <addr>", or a bare address; null when it isn't one. */
export function senderAddress(from: string | undefined): string | null {
  const text = (from ?? "").trim();
  const inside = /<([^<>]+)>\s*$/.exec(text);
  const addr = (inside?.[1] ?? text).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) ? addr : null;
}

export interface EmailSetup {
  /** How the app sends: SMTP, Resend, a local test inbox, or nothing. */
  kind: "smtp" | "resend" | "test-inbox" | "none";
  /** What it is, in words, for the super-admin's health card. */
  summary: string;
  /** Why real people would not get email with these settings; null when they would. */
  problem: string | null;
}

/**
 * Where the app's email goes with these settings, the way lib/notifications.ts picks it: SMTP
 * first, then Resend. Resend without a sender on your own domain falls back to Resend's test
 * sender, which only delivers to the Resend account's owner, so it counts as a problem.
 */
export function emailSetup(env: Record<string, string | undefined> = process.env): EmailSetup {
  const smtp = smtpConfigFromEnv(env as NodeJS.ProcessEnv);
  const resend = Boolean(env.RESEND_API_KEY?.trim());
  if (smtp && LOCAL_HOSTS.has(smtp.host.toLowerCase())) {
    return {
      kind: "test-inbox",
      summary: `A test inbox (${smtp.host}): nothing is delivered to real people`,
      problem: `SMTP_HOST is "${smtp.host}", a test inbox: emails would never reach anyone. Set a real email service.`,
    };
  }
  if (smtp) return { kind: "smtp", summary: `SMTP through ${smtp.host}`, problem: null };
  if (!resend) {
    return {
      kind: "none",
      summary: "Not set up: no email is sent",
      problem: "No email is set up: add SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY.",
    };
  }
  const raw = env.RESEND_FROM_EMAIL?.trim() ?? "";
  const addr = senderAddress(raw);
  const host = addr ? addr.slice(addr.lastIndexOf("@") + 1).toLowerCase() : "";
  if (!addr) {
    return {
      kind: "resend",
      summary: raw ? `Resend, but the sender "${raw}" isn't an address` : "Resend, with no sender set: only the Resend account owner would get email",
      problem: raw
        ? `RESEND_FROM_EMAIL ("${raw}") isn't an email address. Use something like "CineFlow OS <hello@your-domain>".`
        : 'RESEND_FROM_EMAIL is missing. Without it Resend only delivers to your own address, so clients would get nothing. Set it to an address on your verified domain, like "CineFlow OS <hello@your-domain>".',
    };
  }
  if (host === "resend.dev" || host.endsWith(".resend.dev") || isPlaceholderHost(host)) {
    return {
      kind: "resend",
      summary: `Resend, sending as ${addr}: a test address that only reaches the account owner`,
      problem: `RESEND_FROM_EMAIL (${addr}) is a test address, so clients would get nothing. Use an address on your verified domain.`,
    };
  }
  return { kind: "resend", summary: `Resend, sending as ${addr}`, problem: null };
}

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
  else if (isPlaceholderHost(url.hostname)) {
    problems.push(`NEXT_PUBLIC_APP_URL is still the example address (${url.hostname}); use your own domain.`);
  }

  // Studio subdomains (<slug>.<domain>) need the site to live at the bare domain: www. and app.
  // redirect to NEXT_PUBLIC_APP_URL, so an address there would redirect to itself forever.
  if (url && env.NEXT_PUBLIC_STUDIO_SUBDOMAINS?.trim() === "true") {
    const domain = (env.NEXT_PUBLIC_APP_DOMAIN ?? "").trim().toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
    const site = url.hostname.toLowerCase();
    if (/^(www|app)\./.test(site)) {
      problems.push(
        `NEXT_PUBLIC_APP_URL must be your bare domain (https://${site.replace(/^(www|app)\./, "")}) when NEXT_PUBLIC_STUDIO_SUBDOMAINS is on: www. and app. redirect to it.`
      );
    } else if (domain !== site) {
      problems.push(
        `NEXT_PUBLIC_STUDIO_SUBDOMAINS is on, but NEXT_PUBLIC_APP_DOMAIN (${domain || "empty"}) isn't the address in NEXT_PUBLIC_APP_URL (${site}). Set both to your domain.`
      );
    }
  }

  const email = emailSetup(env);
  if (email.problem) problems.push(email.problem);

  if (/(^|\/\/)dev\.toyyibpay\.com/i.test(env.TOYYIBPAY_BASE_URL?.trim() ?? "")) {
    problems.push("TOYYIBPAY_BASE_URL is the Toyyibpay sandbox, so payments wouldn't be real. Remove it.");
  }

  return problems;
}
