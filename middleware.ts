import { NextRequest, NextResponse } from "next/server";

// Static domain map for seeded and custom tenants (Edge runtime compatible)
const CUSTOM_DOMAIN_MAP: Record<string, string> = {
  "studio.luminacine.com": "lumina-cine",
  "studio.apexfilms.com": "apex-media",
};

// Known platform hosts
const PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "cineflow.app",
  "www.cineflow.app",
  "cineflow.local",
]);

export function middleware(request: NextRequest) {
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

  // Test simulation headers (essential for automated E2E testing without DNS edits)
  const simulatedCustomDomain = request.headers.get("x-custom-domain");
  const simulatedSlug = request.headers.get("x-tenant-slug");

  // 3. Resolve Tenant Slug
  let resolvedTenantSlug: string | null = null;

  if (simulatedSlug) {
    resolvedTenantSlug = simulatedSlug;
  } else if (simulatedCustomDomain && CUSTOM_DOMAIN_MAP[simulatedCustomDomain.toLowerCase()]) {
    resolvedTenantSlug = CUSTOM_DOMAIN_MAP[simulatedCustomDomain.toLowerCase()] ?? null;
  } else if (CUSTOM_DOMAIN_MAP[hostname]) {
    resolvedTenantSlug = CUSTOM_DOMAIN_MAP[hostname] ?? null;
  } else if (!PLATFORM_HOSTS.has(hostname) && hostname.length > 0) {
    // Check for subdomain pattern: e.g. <slug>.cineflow.app or <slug>.localhost
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      const subdomain = parts[0];
      if (subdomain && subdomain !== "www" && subdomain !== "app") {
        resolvedTenantSlug = subdomain;
      }
    }
  }

  // 4. Handle Custom Domain / Subdomain Rewrites
  if (resolvedTenantSlug) {
    // Avoid double-prefixing if the path already starts with the tenant slug
    const targetPath = pathname.startsWith(`/${resolvedTenantSlug}`)
      ? pathname
      : `/${resolvedTenantSlug}${pathname}`;

    const rewriteUrl = new URL(targetPath, request.url);
    const response = NextResponse.rewrite(rewriteUrl);

    // Pass tenant identification downstream to Server Components
    response.headers.set("x-tenant-slug", resolvedTenantSlug);
    response.headers.set("x-is-custom-domain", "true");
    return response;
  }

  // 5. Standard Platform Request
  const response = NextResponse.next();
  response.headers.set("x-platform-host", hostname);
  return response;
}

export const config = {
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
