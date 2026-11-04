import type { db } from "@/lib/db";
import { sameCategory } from "@/lib/bookings/pricing-shared";

/**
 * What a booking costs.
 *
 * Studios price sessions with service packages (Admin > Services): each has a full
 * price and a deposit. When the studio offers packages for a slot's category the
 * client must pick one; it sets the deposit charged now and the session price the
 * balance invoice is based on. Without packages for that category the slot's own
 * deposit and price apply, as before.
 *
 * Not a "use server" module. Safe inside a transaction.
 */

type Tx = Pick<typeof db, "servicePackage">;

export interface BookingPricing {
  deposit: number;
  /** Full session price, or null when unknown (no package and no slot price). */
  sessionPrice: number | null;
  packageId: string | null;
  packageName: string | null;
}

export type PricingResult = { ok: true; pricing: BookingPricing } | { ok: false; error: string; message: string };

export { sameCategory };

export async function packagesForCategory(tx: Tx, tenantId: string, category: string) {
  const all = await tx.servicePackage.findMany({ where: { tenantId }, orderBy: { price: "asc" } });
  return all.filter((p) => sameCategory(p.category, category));
}

/**
 * Resolves the deposit and session price for booking `slot`.
 * `packageRequired` is true for client bookings; staff may book without a package.
 */
export async function resolveBookingPricing(
  tx: Tx,
  input: {
    tenantId: string;
    slot: { category: string; price: number; depositRequired: number };
    packageId?: string | null;
    packageRequired: boolean;
  }
): Promise<PricingResult> {
  const { tenantId, slot, packageId, packageRequired } = input;

  if (packageId) {
    const pkg = await tx.servicePackage.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) return { ok: false, error: "PACKAGE_NOT_FOUND", message: "The selected package is not available." };
    if (!sameCategory(pkg.category, slot.category)) {
      return { ok: false, error: "PACKAGE_MISMATCH", message: "The selected package is not offered for this session." };
    }
    if (pkg.depositPrice > pkg.price) {
      return { ok: false, error: "PACKAGE_INVALID", message: "This package's deposit is higher than its price. Please contact the studio." };
    }
    return {
      ok: true,
      pricing: { deposit: pkg.depositPrice, sessionPrice: pkg.price, packageId: pkg.id, packageName: pkg.name },
    };
  }

  if (packageRequired && (await packagesForCategory(tx, tenantId, slot.category)).length > 0) {
    return { ok: false, error: "PACKAGE_REQUIRED", message: "Please choose a package for this session." };
  }

  return {
    ok: true,
    pricing: {
      deposit: slot.depositRequired,
      sessionPrice: slot.price > 0 ? slot.price : null,
      packageId: null,
      packageName: null,
    },
  };
}
