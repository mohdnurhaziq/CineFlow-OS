"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { grantIncludedPrint, removeIncludedPrint } from "@/lib/actions/admin-included-prints";

export interface IncludedPrintRow {
  id: string;
  sizeName: string;
  sizeCode: string;
  frameName: string;
  quantity: number;
  source: string;
  note: string | null;
  claimed: number;
}

interface Option {
  id: string;
  label: string;
}

const SOURCE_LABEL: Record<string, string> = { PACKAGE: "Package", BACKFILL: "Package (earlier booking)", MANUAL: "Granted" };

const field =
  "h-9 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500/60";

/** The framed prints a booking includes, how many are used, and a form to gift more. */
export function IncludedPrintsCard({
  tenantId,
  tenantSlug,
  bookingId,
  lines,
  sizes,
  frames,
  canManage,
}: {
  tenantId: string;
  tenantSlug: string;
  bookingId: string;
  lines: IncludedPrintRow[];
  sizes: Option[];
  frames: Option[];
  /** Bookings MANAGE: may grant or remove prints. Without it the list is read-only. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [size, setSize] = useState(sizes[0]?.id ?? "");
  const [frame, setFrame] = useState(frames[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const grant = () =>
    start(async () => {
      setError(null);
      const res = await grantIncludedPrint({ tenantId, tenantSlug, bookingId, printSizeId: size, frameDesignId: frame, quantity, note });
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success("Included print granted.");
      setNote("");
      setQuantity(1);
      router.refresh();
    });

  const remove = (lineId: string) =>
    start(async () => {
      setError(null);
      const res = await removeIncludedPrint({ tenantId, tenantSlug, lineId });
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success("Included print removed.");
      router.refresh();
    });

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-4" aria-label="Included prints">
      <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Included prints</div>

      {lines.length === 0 ? (
        <p className="text-xs text-zinc-400">This booking includes no framed prints.</p>
      ) : (
        <ul className="divide-y divide-zinc-800/80">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white">
                  {l.quantity} × {l.sizeName} <span className="text-zinc-400">({l.sizeCode})</span>, {l.frameName}
                </div>
                {l.note && <div className="text-xs text-zinc-400">{l.note}</div>}
              </div>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-zinc-400">
                {SOURCE_LABEL[l.source] ?? l.source}
              </span>
              <span className="text-xs text-zinc-300 tabular-nums">
                {l.claimed} used, {Math.max(0, l.quantity - l.claimed)} left
              </span>
              {canManage && l.source === "MANUAL" && l.claimed === 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(l.id)}
                  aria-label="Remove this granted print"
                  className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
      <div className="space-y-2 border-t border-zinc-800 pt-4">
        <div className="text-xs font-medium text-zinc-300">Grant included print</div>
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Print size" className={field} value={size} onChange={(e) => setSize(e.target.value)}>
            {sizes.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select aria-label="Frame" className={field} value={frame} onChange={(e) => setFrame(e.target.value)}>
            {frames.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <input
            aria-label="Quantity"
            type="number"
            min={1}
            max={50}
            className={cn(field, "w-16")}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <input
            aria-label="Note"
            placeholder="Note (optional)"
            maxLength={200}
            className={cn(field, "min-w-40 flex-1")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className={buttonVariants()} disabled={pending || !size || !frame || quantity < 1} onClick={grant}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Grant
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      </div>
      )}
    </section>
  );
}
