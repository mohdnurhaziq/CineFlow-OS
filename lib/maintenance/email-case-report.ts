import type { PrismaClient } from "@prisma/client";

/**
 * A read-only look at how emails are stored: accounts and bookings whose email has capital letters or
 * spaces, and accounts of one studio that are the same address in two spellings. Emails are meant to be
 * lowercase; older rows may not be. This never changes anything, so a person can look at the result
 * (and decide about any duplicates) before a clean-up is written.
 */

export interface EmailCaseReport {
  users: {
    total: number;
    mixedCase: Array<{ id: string; tenantSlug: string | null; email: string; role: string }>;
    duplicates: Array<{ tenantSlug: string | null; email: string; accounts: Array<{ id: string; email: string; role: string }> }>;
  };
  bookings: { total: number; mixedCase: number };
}

const normal = (email: string) => email.trim().toLowerCase();

export async function findEmailCaseIssues(db: PrismaClient, options: { tenantSlug?: string } = {}): Promise<EmailCaseReport> {
  const tenantFilter = options.tenantSlug ? { tenant: { slug: options.tenantSlug } } : {};
  const users = await db.user.findMany({
    where: tenantFilter,
    select: { id: true, email: true, role: true, tenantId: true, tenant: { select: { slug: true } } },
  });
  const bookings = await db.clientBooking.findMany({
    where: options.tenantSlug ? { tenant: { slug: options.tenantSlug } } : {},
    select: { clientEmail: true },
  });

  const mixedCase = users
    .filter((u) => u.email !== normal(u.email))
    .map((u) => ({ id: u.id, tenantSlug: u.tenant?.slug ?? null, email: u.email, role: u.role }));

  // The same studio and the same address once case and spaces are ignored.
  const groups = new Map<string, typeof users>();
  for (const u of users) {
    const key = `${u.tenantId ?? ""}|${normal(u.email)}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  const duplicates = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      tenantSlug: g[0]?.tenant?.slug ?? null,
      email: normal(g[0]!.email),
      accounts: g.map((u) => ({ id: u.id, email: u.email, role: u.role })),
    }));

  return {
    users: { total: users.length, mixedCase, duplicates },
    bookings: { total: bookings.length, mixedCase: bookings.filter((b) => b.clientEmail !== normal(b.clientEmail)).length },
  };
}
