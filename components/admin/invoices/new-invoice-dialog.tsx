"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createInvoice } from "@/lib/actions/admin-invoices";
import { useDialog } from "@/lib/use-dialog";

interface NewInvoiceButtonProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  clients: Array<{ id: string; name: string; email: string }>;
}

const field =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";

function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "New invoice" for anything outside bookings and proposals: extra hours, prints, a reshoot. Owner only. */
export function NewInvoiceButton({ tenantId, tenantSlug, currency, clients }: NewInvoiceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(inDays(14));
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialog = useDialog(open, () => setOpen(false));

  const reset = () => {
    setClientId("");
    setDescription("");
    setAmount("");
    setDueDate(inDays(14));
    setNotify(true);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await createInvoice({ tenantId, tenantSlug, clientId, description, amount: Number(amount), dueDate, notifyClient: notify });
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success(`Invoice ${res.invoiceNumber} created.`);
      setOpen(false);
      reset();
      router.push(`/${tenantSlug}/admin/invoices/${res.invoiceId}`);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400"
      >
        <Plus className="size-4" /> New invoice
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div {...dialog} aria-labelledby="new-invoice-title" className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 id="new-invoice-title" className="text-base font-bold text-white">
                New invoice
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Client</span>
                <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className={field}>
                  <option value="">Choose a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">What is it for?</span>
                <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Extra hour of coverage" className={field} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Amount ({currency})</span>
                  <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">Due</span>
                  <input required type="date" min={inDays(0)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 rounded border-zinc-600 text-amber-500 focus:ring-0" />
                Email the invoice to the client
              </label>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-3.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 disabled:opacity-50">
                  {pending && <Loader2 className="size-3.5 animate-spin" />} Create invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
