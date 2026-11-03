import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

/**
 * Helpers for client (customer) accounts. Not a "use server" module on purpose.
 */

/**
 * Returns the signed-in client's fresh DB record when the session belongs to
 * a CLIENT of the given studio; otherwise null.
 */
export async function getSessionClient(tenantId: string) {
  const session = await getCurrentUser();
  if (!session || session.role !== "CLIENT" || session.tenantId !== tenantId) return null;
  return db.user.findFirst({ where: { id: session.id, tenantId, role: "CLIENT" } });
}

/**
 * Finds a studio's user by email (case-insensitive for legacy mixed-case rows)
 * or creates a passwordless quick-created CLIENT. Used by the legacy guest
 * booking path only; the normal flow uses a signed-in account.
 */
export async function findOrCreateGuestClient(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; name: string; email: string; phone?: string | null }
) {
  const raw = input.email.trim();
  const lower = raw.toLowerCase();

  const existing = await tx.user.findFirst({
    where: { tenantId: input.tenantId, email: { in: Array.from(new Set([lower, raw])) } },
  });
  if (existing) return existing;

  return tx.user.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      email: lower,
      phone: input.phone ?? null,
      role: "CLIENT",
      isQuickCreated: true,
    },
  });
}
