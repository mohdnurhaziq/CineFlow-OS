/**
 * Creates the platform's super-admin, or resets its password, with a random password shown
 * once. Production starts with no accounts; run this inside the app container:
 *
 *   node scripts/ops.mjs create-super-admin you@example.com
 *   (which runs: docker compose exec app pnpm tsx scripts/create-super-admin.ts you@example.com)
 */

import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomPassword(length = 20): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export async function createOrResetSuperAdmin(rawEmail: string): Promise<{ password: string; created: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${rawEmail.trim()}" isn't an email address.`);

  const staff = await db.user.findFirst({ where: { email, tenantId: { not: null }, role: { not: "CLIENT" } } });
  if (staff) throw new Error(`${email} is already a studio account. Use a different email for the super-admin.`);

  const existing = await db.user.findFirst({ where: { email, tenantId: null } });
  if (existing && existing.role !== "SUPER_ADMIN") {
    throw new Error(`${email} already belongs to another kind of account (${existing.role}).`);
  }

  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { passwordHash } });
    return { password, created: false };
  }
  await db.user.create({ data: { email, name: "Platform Admin", role: "SUPER_ADMIN", tenantId: null, passwordHash } });
  return { password, created: true };
}

const invokedDirectly =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]!).endsWith(path.join("scripts", "create-super-admin.ts"));
if (invokedDirectly) {
  const email = process.argv[2];
  if (!email) {
    console.error("Use: pnpm tsx scripts/create-super-admin.ts <email>");
    process.exit(1);
  }
  createOrResetSuperAdmin(email)
    .then(({ password, created }) => {
      console.log(`${created ? "Super-admin created" : "Super-admin password reset"}: ${email.trim().toLowerCase()}`);
      console.log(`Password: ${password}`);
      console.log("Save it now; it won't be shown again.");
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
