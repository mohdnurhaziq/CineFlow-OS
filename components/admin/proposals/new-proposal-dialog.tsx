"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createProposal } from "@/lib/actions/admin-projects";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/projects/constants";
import { useDialog } from "@/lib/use-dialog";
import { formatMoney } from "@/lib/money";

interface NewProposalButtonProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  clients: Array<{ id: string; name: string; email: string }>;
  categories: Array<{ slug: string; name: string }>;
  templates: Array<{ id: string; name: string; price: number; unit: string; isDefault: boolean; isActive: boolean }>;
}

const field =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";
const label = "text-xs text-zinc-400";

/** "New proposal": a quote the client reviews, picks extras on, and signs online. Owner only. */
export function NewProposalButton({ tenantId, tenantSlug, currency, clients, categories, templates }: NewProposalButtonProps) {
  const router = useRouter();
  const active = templates.filter((t) => t.isActive);
  const [open, setOpen] = useState(false);
  const [clientMode, setClientMode] = useState<"existing" | "new">(clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "" });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [discipline, setDiscipline] = useState<"PHOTOGRAPHY" | "VIDEOGRAPHY" | "HYBRID">("PHOTOGRAPHY");
  const [basePrice, setBasePrice] = useState("");
  const [deposit, setDeposit] = useState("50");
  const [terms, setTerms] = useState(DEFAULT_CONTRACT_TERMS);
  const [addOns, setAddOns] = useState<string[]>(active.map((t) => t.id));
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ number: string; url: string } | null>(null);
  const [pending, start] = useTransition();
  const dialog = useDialog(open, () => setOpen(false));

  const total = useMemo(() => {
    const base = Number(basePrice) || 0;
    const extras = active.filter((t) => t.isDefault && addOns.includes(t.id)).reduce((s, t) => s + t.price, 0);
    return base + extras;
  }, [basePrice, addOns, active]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await createProposal({
        tenantId,
        tenantSlug,
        ...(clientMode === "existing" ? { clientId } : { newClient }),
        title,
        category,
        discipline,
        basePrice: Number(basePrice),
        depositPercentage: Number(deposit),
        contractTerms: terms,
        addOnTemplateIds: addOns,
        notifyClient: notify,
      });
      if (!res.success) {
        setError(res.message);
        return;
      }
      setCreated({ number: res.proposalNumber, url: `${window.location.origin}${res.shareUrl}` });
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setCreated(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium bg-amber-500 text-black hover:bg-amber-400"
      >
        <Plus className="size-4" /> New proposal
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            {...dialog}
            aria-labelledby="new-proposal-title"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="new-proposal-title" className="text-base font-bold text-white">
                {created ? "Proposal sent" : "New proposal"}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                <X className="size-4" />
              </button>
            </div>

            {created ? (
              <div className="space-y-3 text-sm">
                <p className="text-zinc-300">
                  {created.number} is ready.{notify ? " The client has been emailed a link." : ""} You can also send them this link:
                </p>
                <div className="flex gap-2">
                  <input readOnly value={created.url} className={`${field} font-mono text-xs`} aria-label="Proposal link" />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(created.url).then(() => toast.success("Link copied."))}
                    className="px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    aria-label="Copy link"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500">When the client signs, the project appears under Projects and their deposit invoice is issued.</p>
                <div className="flex justify-end">
                  <button type="button" onClick={close} className="px-3.5 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <fieldset className="space-y-2">
                  <legend className={label}>Client</legend>
                  <div className="flex gap-2 text-xs">
                    {(["existing", "new"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setClientMode(m)}
                        aria-pressed={clientMode === m}
                        className={`px-3 py-1.5 rounded-lg border ${clientMode === m ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-zinc-700 text-zinc-300"}`}
                      >
                        {m === "existing" ? "Existing client" : "New client"}
                      </button>
                    ))}
                  </div>
                  {clientMode === "existing" ? (
                    <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className={field} aria-label="Client">
                      <option value="">Choose a client…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input required placeholder="Name" aria-label="Client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className={field} />
                      <input required type="email" placeholder="Email" aria-label="Client email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className={field} />
                      <input placeholder="Phone (optional)" aria-label="Client phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className={field} />
                    </div>
                  )}
                </fieldset>

                <label className="block space-y-1">
                  <span className={label}>Project title</span>
                  <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spring collection campaign" className={field} />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className={label}>Category</span>
                    <select required value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={label}>Discipline</span>
                    <select value={discipline} onChange={(e) => setDiscipline(e.target.value as typeof discipline)} className={field}>
                      <option value="PHOTOGRAPHY">Photography</option>
                      <option value="VIDEOGRAPHY">Videography</option>
                      <option value="HYBRID">Photo &amp; video</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={label}>Base price ({currency})</span>
                    <input required type="number" min="1" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={field} />
                  </label>
                  <label className="block space-y-1">
                    <span className={label}>Deposit to book (%)</span>
                    <input required type="number" min="10" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={field} />
                  </label>
                </div>

                {active.length > 0 && (
                  <fieldset className="space-y-1.5">
                    <legend className={label}>Extras the client can add (ticked = offered)</legend>
                    {active.map((t) => (
                      <label key={t.id} className="flex items-center justify-between gap-3 text-xs text-zinc-200 px-3 py-2 rounded-lg border border-zinc-800">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={addOns.includes(t.id)}
                            onChange={(e) => setAddOns(e.target.checked ? [...addOns, t.id] : addOns.filter((x) => x !== t.id))}
                            className="size-4 rounded border-zinc-600 text-amber-500 focus:ring-0"
                          />
                          {t.name}
                          {t.isDefault && <span className="text-[10px] text-amber-400">pre-selected</span>}
                        </span>
                        <span className="font-mono text-zinc-400">{formatMoney(currency, t.price)}</span>
                      </label>
                    ))}
                  </fieldset>
                )}

                <label className="block space-y-1">
                  <span className={label}>Terms the client agrees to</span>
                  <textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${field} text-xs`} />
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 rounded border-zinc-600 text-amber-500 focus:ring-0" />
                  Email the proposal to the client
                </label>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-zinc-400">
                    Starts at <strong className="text-white">{formatMoney(currency, total)}</strong> · deposit{" "}
                    {formatMoney(currency, Math.round(total * Number(deposit || 0)) / 100)}
                  </span>
                  <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 disabled:opacity-50">
                    {pending && <Loader2 className="size-3.5 animate-spin" />} Send proposal
                  </button>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
