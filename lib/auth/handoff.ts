import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requestHost } from "@/lib/auth/token";
import { tenantSlugForDomain } from "@/lib/tenant-domain";
import { isPlatformHost, isSafeRelativePath, studioSubdomainOf, studioSubdomainsOn } from "@/lib/domain-name";

/**
 * Carrying a sign-in begun on a studio's own domain (studio.com) over to the platform host. A
 * studio's own domain can't share the platform's cookie, so after signing in there the browser goes
 * to /auth/handoff on the platform with a one-time code, which signs it in there too and sends it
 * back. The code is single use, valid for a minute, and only its hash is stored. Server-only.
 */

export const HANDOFF_TTL_SECONDS = 60;

const bareHost = (host: string) => (host.split(":")[0] ?? "").toLowerCase().replace(/\.$/, "");

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * A one-time code for this login to be signed in on the platform host, with `activeUserId` as the active
 * account. Tied to `host`, the studio domain that issued it: only a return address on that domain may use it.
 */
export async function issueHandoff(loginId: string, activeUserId: string, host: string): Promise<string> {
  // Used and expired codes have no use after a day.
  await db.signInHandoff.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
  const code = randomBytes(32).toString("base64url");
  await db.signInHandoff.create({
    data: { codeHash: hashCode(code), loginId, activeUserId, host: bareHost(host), expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000) },
  });
  return code;
}

/**
 * Uses up a code: the login and account it was issued for, or null if it is unknown, used, expired or was
 * issued by another host. A refusal for the wrong host doesn't use the code up.
 */
export async function redeemHandoff(code: string, host: string): Promise<{ loginId: string; activeUserId: string } | null> {
  const codeHash = hashCode(code);
  const now = new Date();
  // One update decides who gets it: only the first of two simultaneous uses changes a row.
  const { count } = await db.signInHandoff.updateMany({ where: { codeHash, host: bareHost(host), usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (count === 0) return null;
  const row = await db.signInHandoff.findUnique({ where: { codeHash } });
  return row ? { loginId: row.loginId, activeUserId: row.activeUserId } : null;
}

/** Whether `host` is a studio's own domain: studio subdomains are on, and it is neither the platform nor a studio subdomain. */
export async function isCustomDomainHost(host: string): Promise<boolean> {
  if (!studioSubdomainsOn()) return false;
  const h = bareHost(host);
  if (!h || isPlatformHost(h) || studioSubdomainOf(h)) return false;
  return (await tenantSlugForDomain(h)) !== null;
}

/** A handoff code to include in a sign-in result when this request is on a studio's own domain, else undefined. */
export async function handoffForRequest(loginId: string, activeUserId: string): Promise<string | undefined> {
  const host = await requestHost();
  return (await isCustomDomainHost(host)) ? issueHandoff(loginId, activeUserId, host) : undefined;
}

/**
 * The address to return to after a handoff or a sign-out detour: only ever a studio's own domain
 * (looked up in the studios' saved domains) with a safe path, never another site, the platform, or a
 * studio subdomain. The same address back, or null.
 */
export async function safeHandoffReturn(next: string): Promise<string | null> {
  if (!next || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && process.env.NODE_ENV !== "production");
  if (!secure || url.username || url.password || url.port) return null;
  if (!isSafeRelativePath(`${url.pathname}${url.search}`)) return null;
  if (isPlatformHost(url.hostname) || studioSubdomainOf(url.hostname)) return null;
  if ((await tenantSlugForDomain(url.hostname)) === null) return null;
  return url.href;
}
