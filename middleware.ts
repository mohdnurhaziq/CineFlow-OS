import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_BASE_DOMAINS, platformSubdomainSlug, studioExists, tenantSlugForDomain } from "@/lib/tenant-domain";
import { APP_BASE_DOMAIN, platformUrl, studioPath, studioSubdomainsOn, studioUrl } from "@/lib/domain-name";
import { RESERVED_SLUGS } from "@/lib/validations/onboarding";
import { hostFrom, sessionCookieFor } from "@/lib/auth/cookie-name";

// ─── Auth helpers (Web Crypto only) ────────────────────────
const ADMIN_PATTERN = /^\/([^/]+)\/admin(\/|$)/i;
const DEV_FALLBACK_AUTH_SECRET = "cineflow_super_secure_random_session_secret_32_chars_min";

interface EdgeSession {
  role: string;
  tenantSlug: string | null;
}

function base64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Fully verifies the signed session cookie (HMAC-SHA256 + expiry) in the Edge
 * runtime. This runs BEFORE any page renders, which matters: Next.js renders
 * layouts and pages in parallel, so a redirect inside a layout does not stop
 * the page's data fetching or keep its output out of the response.
 */
async function readSession(request: NextRequest): Promise<EdgeSession | null> {
  try {
    // The cookie that belongs to this host (lib/auth/cookie-name.ts).
    const token = request.cookies.get(sessionCookieFor(hostFrom((name) => request.headers.get(name))).name)?.value;
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payloadB64, signature] = parts;

    const secret = process.env.AUTH_SECRET || DEV_FALLBACK_AUTH_SECRET;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expected = bytesToBase64url(
      new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)))
    );

    // Constant-time comparison
    if (expected.length !== signature.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (diff !== 0) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.role !== "string") return null;

    return { role: payload.role, tenantSlug: payload.tenantSlug ?? null };
  } catch {
    return null;
  }
}

// Hosts that are the platform itself, never a studio: every base domain (driven by
// NEXT_PUBLIC_APP_DOMAIN) plus its www. form, and the loopback addresses.
const PLATFORM_HOSTS = new Set([
  "127.0.0.1",
  "0.0.0.0",
  ...PLATFORM_BASE_DOMAINS.flatMap((base) => [base, `www.${base}`]),
]);

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  // 1. Bypass Next internals, API routes, local uploads, and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Extract Host Header
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostname = (rawHost.split(":")[0] ?? "").toLowerCase();

  // With studio subdomains on (production), each studio lives at <slug>.<domain> and its paths
  // carry no slug. `to` builds an address on the host the visitor used (behind Cloudflare the
  // app itself is reached over http, so the visitor's scheme comes from X-Forwarded-Proto).
  const subdomains = studioSubdomainsOn();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "");
  const to = (path: string) => (subdomains ? new URL(`${proto}://${rawHost}${path}`) : new URL(path, request.url));

  if (subdomains) {
    // www.<domain> and app.<domain> (the old platform address) → <domain>
    if (hostname === `www.${APP_BASE_DOMAIN}` || hostname === `app.${APP_BASE_DOMAIN}`) {
      return NextResponse.redirect(platformUrl(`${pathname}${url.search}`), 308);
    }
    // <domain>/<studio>/… (the old studio address) → <studio>.<domain>/…
    if (hostname === APP_BASE_DOMAIN) {
      const [first = "", ...rest] = pathname.split("/").slice(1);
      // A reserved name is always the platform's own page, even if some studio holds that name.
      if (first && !RESERVED_SLUGS.has(first.toLowerCase()) && (await studioExists(first))) {
        return NextResponse.redirect(studioUrl(first.toLowerCase(), `/${rest.join("/")}${url.search}`), 308);
      }
    }
  }

  // Test simulation headers (essential for automated E2E testing without DNS edits)
  // Never in production (anyone could send them), and only as a plain studio name or domain.
  const testHeaders = process.env.NODE_ENV !== "production";
  const rawSimulatedDomain = testHeaders ? request.headers.get("x-custom-domain") : null;
  const rawSimulatedSlug = testHeaders ? request.headers.get("x-tenant-slug") : null;
  const simulatedCustomDomain = rawSimulatedDomain && /^[a-z0-9.-]+$/i.test(rawSimulatedDomain) ? rawSimulatedDomain : null;
  const simulatedSlug = rawSimulatedSlug && /^[a-z0-9-]+$/.test(rawSimulatedSlug) ? rawSimulatedSlug : null;

  // 3. Resolve Tenant Slug
  let resolvedTenantSlug: string | null = null;

  if (simulatedSlug) {
    resolvedTenantSlug = simulatedSlug;
  } else if (simulatedCustomDomain) {
    resolvedTenantSlug = await tenantSlugForDomain(simulatedCustomDomain);
  } else if (!PLATFORM_HOSTS.has(hostname) && hostname.length > 0) {
    // <slug>.<APP_DOMAIN> (or <slug>.localhost) is a platform subdomain; any other host is a
    // studio's own domain, looked up from the domain saved in its settings.
    resolvedTenantSlug = platformSubdomainSlug(hostname) ?? (await tenantSlugForDomain(hostname));
  }

  // A path that starts with the whole segment /<slug> (case-insensitive).
  const startsWithSlug = (p: string, slug: string) => {
    const lower = p.toLowerCase();
    const prefix = `/${slug.toLowerCase()}`;
    return lower === prefix || lower.startsWith(`${prefix}/`);
  };

  // On a studio's own host with subdomains on, the slug never stays in the path: a link that
  // still carries it (or a typed old address) is sent to the same page without it.
  if (subdomains && resolvedTenantSlug && startsWithSlug(pathname, resolvedTenantSlug)) {
    return NextResponse.redirect(to(`${pathname.slice(resolvedTenantSlug.length + 1) || "/"}${url.search}`), 308);
  }

  // 4. Admin Route Guard. Runs on the effective (post-rewrite) path so custom
  // domains and subdomains cannot reach /admin unguarded, and on a normalised
  // path so encoded or doubled slashes cannot slip past the pattern.
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    // keep raw path
  }
  decodedPath = decodedPath.replace(/\/{2,}/g, "/");
  const effectivePath =
    resolvedTenantSlug && !decodedPath.toLowerCase().startsWith(`/${resolvedTenantSlug.toLowerCase()}/`) &&
    decodedPath.toLowerCase() !== `/${resolvedTenantSlug.toLowerCase()}`
      ? `/${resolvedTenantSlug}${decodedPath}`
      : decodedPath;

  const adminMatch = ADMIN_PATTERN.exec(effectivePath);
  if (adminMatch) {
    const slug = adminMatch[1] ?? "";
    const session = await readSession(request);
    // After signing in, return to the exact admin page that was asked for (e.g. one invoice).
    const loginUrl = to(studioPath(slug, "/login"));
    loginUrl.searchParams.set("callbackUrl", `${studioPath(slug, effectivePath.slice(slug.length + 1) || "/")}${url.search}`);
    if (!session) {
      return NextResponse.redirect(loginUrl);
    }
    if (session.role === "CLIENT") {
      return NextResponse.redirect(to(studioPath(slug, "/account")));
    }
    if (session.role !== "SUPER_ADMIN" && session.tenantSlug?.toLowerCase() !== slug.toLowerCase()) {
      return NextResponse.redirect(loginUrl);
    }
  }

  // 5. Handle Custom Domain / Subdomain Rewrites
  if (resolvedTenantSlug) {
    // Avoid double-prefixing if the path already starts with the tenant slug (as a whole segment:
    // /lumina-cinema-tips on lumina-cine's host is a page of lumina-cine, not lumina-cine itself)
    const targetPath = startsWithSlug(pathname, resolvedTenantSlug)
      ? pathname
      : `/${resolvedTenantSlug}${pathname}`;

    // Keep the query: reset and invite links carry their token in it, payments their invoice.
    const rewriteUrl = new URL(`${targetPath}${url.search}`, request.url);
    const response = NextResponse.rewrite(rewriteUrl);

    // Pass tenant identification downstream to Server Components
    response.headers.set("x-tenant-slug", resolvedTenantSlug);
    response.headers.set("x-is-custom-domain", "true");
    return response;
  }

  // 6. Standard Platform Request
  const response = NextResponse.next();
  response.headers.set("x-platform-host", hostname);
  return response;
}

export const config = {
  // Node.js runtime so custom domains can be looked up in the database.
  runtime: "nodejs",
  matcher: [
    /*
     * Match all request paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /uploads (local public media files)
     * 4. all static files with extensions
     */
    "/((?!api|_next/static|_next/image|uploads|favicon.ico).*)",
  ],
};
