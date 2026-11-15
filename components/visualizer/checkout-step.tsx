"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { placePrintOrder, quotePrintOrder } from "@/lib/actions/print-orders";
import { MY_STATES } from "@/lib/prints/states";
import type { PlaceOrderInput } from "@/lib/validations/print-orders";
import { errorMessageOf } from "@/lib/action-error";
import { money, priceLine, toCartItems, type CartLine, type Catalog, type OrderingContext, type ShippingAddress } from "./cart";

interface CheckoutStepProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  ordering: OrderingContext;
  cart: CartLine[];
  catalog: Catalog;
  onBack: () => void;
  /** The order went in. `checkoutUrl` is null when nothing is left to pay. */
  onPlaced: (placed: { orderNumber: string; checkoutUrl: string | null }) => void;
}

const EMPTY_ADDRESS: ShippingAddress = { recipientName: "", recipientPhone: "", line1: "", line2: "", postcode: "", city: "", state: "" };

const fieldClass =
  "w-full min-h-10 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60";

export function CheckoutStep({ tenantId, tenantSlug, currency, ordering, cart, catalog, onBack, onPlaced }: CheckoutStepProps) {
  // Shipping goes only to states a zone covers, listed in the usual order.
  const covered = useMemo(() => {
    const set = new Set(ordering.zones.flatMap((z) => z.states));
    return MY_STATES.filter((s) => set.has(s));
  }, [ordering.zones]);
  const canShip = covered.length > 0;

  const [fulfilment, setFulfilment] = useState<"PICKUP" | "SHIP">("PICKUP");
  const [address, setAddress] = useState<ShippingAddress>(() => {
    const saved = ordering.savedAddress;
    if (!saved) return EMPTY_ADDRESS;
    // A saved state no zone covers any more is left for the client to choose again.
    return { ...saved, state: (covered as readonly string[]).includes(saved.state) ? saved.state : "" };
  });
  const [saveAddress, setSaveAddress] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = fulfilment === "SHIP" && address.state ? ordering.zones.find((z) => z.states.includes(address.state)) ?? null : null;

  // The local estimate, the same rule the server applies; the live quote below confirms it.
  const summary = useMemo(() => {
    let prints = 0;
    let mats = 0;
    let upgrades = 0;
    for (const line of cart) {
      const p = priceLine(line, catalog);
      if (!p) continue;
      if (line.kind === "PAID") {
        prints += p.sizePrice + p.framePrice;
        mats += p.matPrice;
      } else {
        upgrades += p.upgradeAmount;
      }
    }
    const shipping = zone?.fee ?? 0;
    return { prints, mats, upgrades, shipping, total: Math.round((prints + mats + upgrades + shipping) * 100) / 100 };
  }, [cart, catalog, zone]);

  const addressComplete =
    address.recipientName.trim().length >= 2 &&
    address.recipientPhone.trim().length >= 6 &&
    address.line1.trim().length >= 3 &&
    /^\d{5}$/.test(address.postcode.trim()) &&
    address.city.trim().length >= 2 &&
    !!address.state;

  const input: PlaceOrderInput | null = useMemo(() => {
    if (cart.length === 0) return null;
    if (fulfilment === "SHIP" && !addressComplete) return null;
    return {
      tenantId,
      tenantSlug,
      projectId: ordering.projectId,
      items: toCartItems(cart),
      fulfilment,
      ...(fulfilment === "SHIP"
        ? {
            address: {
              recipientName: address.recipientName.trim(),
              recipientPhone: address.recipientPhone.trim(),
              line1: address.line1.trim(),
              ...(address.line2.trim() ? { line2: address.line2.trim() } : {}),
              postcode: address.postcode.trim(),
              city: address.city.trim(),
              state: address.state as (typeof MY_STATES)[number],
            },
            saveAddress,
          }
        : {}),
    };
  }, [cart, fulfilment, addressComplete, address, saveAddress, tenantId, tenantSlug, ordering.projectId]);

  // Live quote from the server whenever the order changes (debounced).
  const [quote, setQuote] = useState<{ total: number } | { error: string } | null>(null);
  useEffect(() => {
    if (!input) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await quotePrintOrder(input);
        if (cancelled) return;
        setQuote(res.success ? { total: res.total } : { error: res.message });
      } catch (err) {
        if (!cancelled) setQuote({ error: errorMessageOf(err) || "Couldn't price this order." });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  const total = quote && "total" in quote ? quote.total : summary.total;
  const quoteError = quote && "error" in quote ? quote.error : null;

  const confirm = async () => {
    if (!input) {
      setError(fulfilment === "SHIP" ? "Fill in the delivery address, or choose pickup." : "Add at least one print.");
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const res = await placePrintOrder(input);
      if (!res.success) {
        setError(res.message);
        setPlacing(false);
        return;
      }
      onPlaced({ orderNumber: res.orderNumber, checkoutUrl: res.checkoutUrl });
    } catch (err) {
      setError(errorMessageOf(err) || "Couldn't place this order.");
      setPlacing(false);
    }
  };

  const set = (k: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setAddress((a) => ({ ...a, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <ArrowLeft className="size-3.5" />
        Back to cart
      </button>

      {/* Pickup or ship */}
      <fieldset className="space-y-2">
        <legend className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold mb-2">How you get them</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["PICKUP", "SHIP"] as const).map((f) => {
            const disabled = f === "SHIP" && !canShip;
            const Icon = f === "PICKUP" ? Store : Truck;
            return (
              <button
                key={f}
                type="button"
                disabled={disabled}
                aria-pressed={fulfilment === f}
                onClick={() => setFulfilment(f)}
                className={cn(
                  "min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                  fulfilment === f ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700"
                )}
              >
                <Icon className="size-4" />
                {f === "PICKUP" ? "Pickup" : "Ship"}
              </button>
            );
          })}
        </div>
        {!canShip && <p className="text-xs text-zinc-500">The studio doesn&apos;t ship prints yet. Collect them from the studio.</p>}
      </fieldset>

      {fulfilment === "SHIP" && (
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1.5">
            <MapPin className="size-3.5 text-amber-400" /> Delivery address
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-400">Recipient</span>
              <input className={fieldClass} value={address.recipientName} onChange={set("recipientName")} autoComplete="name" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-400">Phone</span>
              <input className={fieldClass} value={address.recipientPhone} onChange={set("recipientPhone")} autoComplete="tel" inputMode="tel" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Address</span>
            <input className={fieldClass} value={address.line1} onChange={set("line1")} autoComplete="address-line1" />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Address line 2 (optional)</span>
            <input className={fieldClass} value={address.line2} onChange={set("line2")} autoComplete="address-line2" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-400">Postcode</span>
              <input className={fieldClass} value={address.postcode} onChange={set("postcode")} autoComplete="postal-code" inputMode="numeric" maxLength={5} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-400">City</span>
              <input className={fieldClass} value={address.city} onChange={set("city")} autoComplete="address-level2" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">State</span>
            <select className={fieldClass} value={address.state} onChange={set("state")}>
              <option value="">Choose a state</option>
              {covered.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {zone && (
            <p className="text-xs text-zinc-400">
              Shipping ({zone.name}): <span className="font-mono text-white">{currency} {money(zone.fee)}</span>
            </p>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="accent-amber-500" />
            Save this address for next time
          </label>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-1.5 text-sm">
        <SummaryRow label={`Prints (${cart.length})`} value={`${currency} ${money(summary.prints)}`} />
        {summary.upgrades > 0 && <SummaryRow label="Upgrades" value={`${currency} ${money(summary.upgrades)}`} />}
        {summary.mats > 0 && <SummaryRow label="Mat boards" value={`${currency} ${money(summary.mats)}`} />}
        {fulfilment === "SHIP" && <SummaryRow label="Shipping" value={zone ? `${currency} ${money(zone.fee)}` : "Choose a state"} />}
        <div className="pt-2 mt-1 border-t border-zinc-800 flex items-center justify-between">
          <span className="font-semibold text-white">Total</span>
          <span className="font-mono font-bold text-lg text-white">
            {currency} {money(total)}
          </span>
        </div>
        {total === 0 && <p className="text-xs text-emerald-400">Nothing to pay: these prints are included.</p>}
      </div>

      {(error || quoteError) && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error || quoteError}
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={placing || cart.length === 0}
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        {placing && <Loader2 className="size-4 animate-spin" />}
        {total > 0 ? `Confirm and pay ${currency} ${money(total)}` : "Confirm order"}
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-zinc-400">
      <span>{label}</span>
      <span className="font-mono text-zinc-200">{value}</span>
    </div>
  );
}
