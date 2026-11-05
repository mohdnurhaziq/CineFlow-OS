import type { ReactNode } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatSlotDate } from "@/lib/slot-time";
import type { InvoiceDocument } from "@/lib/invoices/document";

/**
 * A printable invoice. Once paid it reads as a receipt. Rendered on a light "paper"
 * card so it prints well; everything outside the card is hidden when printing.
 */

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Unpaid", className: "text-amber-700 border-amber-600" },
  OVERDUE: { label: "Overdue", className: "text-red-700 border-red-600" },
  PENDING_VERIFICATION: { label: "Payment under review", className: "text-blue-700 border-blue-600" },
  PAID: { label: "Paid", className: "text-emerald-700 border-emerald-600" },
  REJECTED: { label: "Payment rejected", className: "text-red-700 border-red-600" },
  VOID: { label: "Cancelled", className: "text-zinc-500 border-zinc-400" },
};

export function invoiceStatus(doc: Pick<InvoiceDocument, "status" | "dueDate">, now: Date = new Date()): string {
  return doc.status === "PENDING" && new Date(doc.dueDate) < now ? "OVERDUE" : doc.status;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function method(m: string | null): string {
  switch (m) {
    case "CARD":
      return "Card / FPX (online)";
    case "QR_CODE":
      return "QR transfer";
    case "CASH":
      return "Cash";
    case "BANK_TRANSFER":
      return "Bank transfer";
    default:
      return "—";
  }
}

export function InvoiceDocumentView({ doc, actions }: { doc: InvoiceDocument; actions?: ReactNode }) {
  const status = invoiceStatus(doc);
  const style = STATUS[status] ?? { label: status, className: "text-zinc-600 border-zinc-400" };
  const isReceipt = status === "PAID";
  const money = (n: number) => formatCurrency(n, doc.currency);
  const b = doc.booking;
  const balance = b && b.sessionPrice != null ? Math.max(0, b.sessionPrice - b.depositAmount) : null;

  return (
    <div className="space-y-4">
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">{actions}</div>}

      <article className="bg-white text-zinc-900 rounded-2xl shadow-2xl print:shadow-none print:rounded-none p-6 sm:p-10 space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="space-y-1">
            {doc.studio.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.studio.logoUrl} alt="" className="h-10 w-auto mb-2" />
            )}
            <div className="text-xl font-black tracking-tight">{doc.studio.name}</div>
            {doc.studio.tagline && <div className="text-xs text-zinc-500">{doc.studio.tagline}</div>}
            {doc.studio.contactEmail && <div className="text-xs text-zinc-500">{doc.studio.contactEmail}</div>}
          </div>
          <div className="sm:text-right space-y-1">
            <div className="text-3xl font-black tracking-tight">{isReceipt ? "RECEIPT" : "INVOICE"}</div>
            <div className="font-mono text-sm">{doc.invoiceNumber}</div>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded border-2 text-xs font-bold uppercase tracking-wider ${style.className}`}>
              {style.label}
            </span>
          </div>
        </header>

        {/* Verified Receipt Stamp / Settlement Confirmation */}
        {isReceipt && (
          <div className="border border-emerald-600/40 bg-emerald-500/10 text-emerald-900 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print-break-inside-avoid">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full border border-emerald-500 bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="size-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                  Official Studio Payment Receipt • Paid in Full
                </div>
                <div className="text-[11px] text-emerald-800 font-mono">
                  Settled {doc.paidAt ? day(doc.paidAt) : ""} {doc.paymentMethod ? `via ${method(doc.paymentMethod)}` : ""}
                  {doc.paymentReference ? ` • Ref: ${doc.paymentReference}` : ""}
                </div>
              </div>
            </div>
            {doc.verifiedBy && (
              <div className="text-left sm:text-right text-[11px] font-mono text-emerald-900 shrink-0">
                <span className="block text-[9px] uppercase tracking-wider text-emerald-700 font-sans font-bold">Authorized & Verified</span>
                <span>{doc.verifiedBy}</span>
              </div>
            )}
          </div>
        )}

        {/* Parties & dates */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Billed to</div>
            <div className="font-semibold">{doc.client.name}</div>
            <div className="text-zinc-600">{doc.client.email}</div>
            {doc.client.phone && <div className="text-zinc-600">{doc.client.phone}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 sm:justify-self-end">
            <dt className="text-zinc-500">Issued</dt>
            <dd>{day(doc.issuedAt)}</dd>
            {isReceipt && doc.paidAt ? (
              <>
                <dt className="text-zinc-500">Paid</dt>
                <dd>{day(doc.paidAt)}</dd>
              </>
            ) : (
              <>
                <dt className="text-zinc-500">Due</dt>
                <dd className={status === "OVERDUE" ? "text-red-700 font-semibold" : ""}>{day(doc.dueDate)}</dd>
              </>
            )}
            {b && (
              <>
                <dt className="text-zinc-500">Booking</dt>
                <dd className="font-mono">{b.trackingCode}</dd>
              </>
            )}
            {doc.project && (
              <>
                <dt className="text-zinc-500">Project</dt>
                <dd className="font-mono">{doc.project.projectNumber}</dd>
              </>
            )}
          </dl>
        </section>

        {/* Lines */}
        <section className="print-break-inside-avoid">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-900 text-left text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="py-2 font-bold">Description</th>
                <th className="py-2 font-bold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} className="border-b border-zinc-200 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{line.description}</div>
                    {b?.sessionDate && i === 0 ? (
                      <div className="text-xs text-zinc-500">
                        Session {formatSlotDate(b.sessionDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        {b.startTime && b.endTime ? `, ${b.startTime} – ${b.endTime}` : ""}
                      </div>
                    ) : (
                      line.detail && <div className="text-xs text-zinc-500">{line.detail}</div>
                    )}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums whitespace-nowrap">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right font-bold pr-4">{isReceipt ? "Amount paid" : "Amount due"}</td>
                <td className="pt-4 text-right font-mono font-black text-lg tabular-nums whitespace-nowrap">{money(doc.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* How this fits the whole session */}
        {b && b.sessionPrice != null && (doc.milestoneType === "BOOKING_DEPOSIT" || doc.milestoneType === "BOOKING_BALANCE") && (
          <section className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-xs space-y-1">
            <div className="font-bold uppercase tracking-widest text-[10px] text-zinc-500 mb-1">Session payment plan</div>
            <div className="flex justify-between"><span>Session price{b.packageName ? ` (${b.packageName})` : ""}</span><span className="font-mono">{money(b.sessionPrice)}</span></div>
            <div className="flex justify-between"><span>Deposit</span><span className="font-mono">{money(b.depositAmount)}</span></div>
            <div className="flex justify-between"><span>Balance, due after the session</span><span className="font-mono">{money(balance ?? 0)}</span></div>
          </section>
        )}

        {/* Payment */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 content-start">
            <dt className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">Payment</dt>
            <dt className="text-zinc-500">Method</dt>
            <dd>{doc.paymentMethod ? method(doc.paymentMethod) : "Not paid yet"}</dd>
            {doc.verifiedBy && (
              <>
                <dt className="text-zinc-500">{isReceipt ? "Received by" : "Reviewed by"}</dt>
                <dd>{doc.verifiedBy}</dd>
              </>
            )}
            {doc.rejectionReason && (
              <>
                <dt className="text-zinc-500">Slip rejected</dt>
                <dd className="text-red-700">{doc.rejectionReason}</dd>
              </>
            )}
            {doc.paymentProofUrl && (
              <>
                <dt className="text-zinc-500">Slip</dt>
                <dd>
                  <a href={doc.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="underline print:no-underline">
                    View uploaded slip
                  </a>
                </dd>
              </>
            )}
          </dl>
          {!isReceipt && status !== "VOID" && doc.studio.bankDetails && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Bank transfer details</div>
              <p className="whitespace-pre-line text-zinc-700">{doc.studio.bankDetails}</p>
              <p className="text-xs text-zinc-500">Use {doc.invoiceNumber} as the payment reference.</p>
            </div>
          )}
        </section>

        <footer className="pt-6 border-t border-zinc-200 text-xs text-zinc-500">
          {isReceipt
            ? `Thank you. This receipt confirms ${money(doc.amount)} received by ${doc.studio.name}.`
            : status === "VOID"
              ? "This invoice was cancelled and is no longer payable."
              : `Please pay by ${day(doc.dueDate)}. Questions? Contact ${doc.studio.contactEmail ?? doc.studio.name}.`}
        </footer>
      </article>
    </div>
  );
}
