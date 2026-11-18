import { PrismaClient } from "@prisma/client";
import { withKeyedLock } from "@/lib/keyed-lock";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Runs this app's database transactions one at a time.
 *
 * SQLite allows one writer at a time, and a transaction waiting for the write lock holds one of
 * the database engine's threads (it has one per CPU core). With more waiting transactions than
 * cores, the transaction holding the lock had no thread left to finish on, so all of them stalled
 * for 5 seconds and failed: a burst of bookings or payments on a small PC. Queueing them here
 * instead costs nothing, since SQLite would only have let one write at a time anyway.
 */
function oneTransactionAtATime(client: PrismaClient): PrismaClient {
  // Loaded this way, not imported, because browser code reaches this file through shared
  // helpers (lib/auth/access.ts), and browsers have no async_hooks. They never run transactions.
  const hooks = typeof process !== "undefined" ? process.getBuiltinModule?.("node:async_hooks") : undefined;
  if (!hooks) return client;
  // Set while a transaction runs, so one started inside it doesn't wait for itself.
  const inTransaction = new hooks.AsyncLocalStorage<true>();
  const original = client.$transaction.bind(client) as (...args: unknown[]) => Promise<unknown>;
  const queued = (...args: unknown[]) =>
    inTransaction.getStore()
      ? original(...args)
      : withKeyedLock("db:transaction", () => inTransaction.run(true, () => original(...args)));
  Object.defineProperty(client, "$transaction", { value: queued, configurable: true, writable: true });
  return client;
}

export const db = globalForPrisma.prisma ?? oneTransactionAtATime(new PrismaClient());

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
