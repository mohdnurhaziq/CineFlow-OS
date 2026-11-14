"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Copy, PartyPopper, PlayCircle, X } from "lucide-react";
import type { SetupChecklist as SetupChecklistData, SetupStepId } from "@/lib/onboarding/checklist";
import { dismissSetupChecklist } from "@/lib/actions/onboarding-guide";

interface SetupChecklistProps {
  tenantSlug: string;
  checklist: SetupChecklistData;
  /** Public booking page, copied by the last step. */
  bookingUrl: string;
}

const STEP_COPY: Record<SetupStepId, { label: string; hint: string; path: string | null }> = {
  brand: { label: "Brand your studio", hint: "Add your logo so clients recognise you.", path: "settings" },
  services: { label: "Add your first service and price", hint: "What clients can book, and for how much.", path: "services" },
  availability: { label: "Open your booking times", hint: "Pick the dates and hours clients can book.", path: "calendar" },
  payments: { label: "Set up how clients pay you", hint: "A QR code, bank details or Toyyibpay.", path: "settings" },
  showcase: { label: "Show your best work", hint: "A few projects on your public page.", path: "cms" },
  firstBooking: { label: "Share your booking page", hint: "Send the link to clients to get your first booking.", path: null },
};

/**
 * Copies text to the clipboard. The Clipboard API only exists on secure pages (https or localhost),
 * so on plain http (e.g. the studio opened by LAN address) fall back to the older execCommand copy.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or not focused: try the fallback below.
    }
  }
  const previousFocus = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    previousFocus?.focus();
  }
}

export function SetupChecklist({ tenantSlug, checklist, bookingUrl }: SetupChecklistProps) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  const nextId = checklist.steps.find((s) => !s.done)?.id;
  const percent = Math.round((checklist.doneCount / checklist.total) * 100);

  const close = () => {
    setHidden(true);
    startTransition(async () => {
      const res = await dismissSetupChecklist(tenantSlug);
      if (!res.success) {
        setHidden(false);
        toast.error(res.error || "Could not close the guide. Please try again.");
      }
    });
  };

  const copyLink = async () => {
    // Without NEXT_PUBLIC_APP_URL the server sends a bare path: complete it with this site's address.
    const url = bookingUrl.startsWith("/") ? `${window.location.origin}${bookingUrl}` : bookingUrl;
    if (await copyText(url)) toast.success("Booking link copied");
    else toast.error(`Copy failed. Your booking link is ${url}`);
  };

  return (
    <section
      data-tour="checklist"
      data-state={checklist.allDone ? "ready" : "in-progress"}
      aria-labelledby="setup-guide-title"
      className="relative rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] to-transparent p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={close}
        disabled={pending}
        aria-label="Close setup guide"
        title="Close setup guide"
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <X className="size-4" />
      </button>

      {checklist.allDone ? (
        <div className="flex items-start gap-3 pr-8">
          <PartyPopper className="size-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 id="setup-guide-title" className="text-base font-semibold text-white">
              Your studio is ready
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Everything is set up and your first booking is in. You can close this guide.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pr-8">
            <div>
              <h2 id="setup-guide-title" className="text-base font-semibold text-white">
                Get your studio ready
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                A few steps to start taking bookings. Each one ticks itself off when it&apos;s done.
              </p>
            </div>
            <Link
              href={`/${tenantSlug}/admin?tour=1`}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <PlayCircle className="size-3.5 text-amber-400" aria-hidden="true" />
              Take the tour
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={checklist.total}
              aria-valuenow={checklist.doneCount}
            >
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
              {checklist.doneCount} of {checklist.total} done
            </span>
          </div>

          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {checklist.steps.map((step) => {
              const copy = STEP_COPY[step.id];
              const isNext = step.id === nextId;
              const rowClass = `flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                isNext
                  ? "border-amber-500/40 bg-amber-500/[0.07]"
                  : step.done
                    ? "border-zinc-800/60 bg-transparent"
                    : "border-zinc-800 bg-zinc-900/40"
              }`;
              const body = (
                <>
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                      step.done ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-zinc-600"
                    }`}
                    aria-hidden="true"
                  >
                    {step.done && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${step.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                      {copy.label}
                      <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                    </span>
                    {!step.done && <span className="block text-xs text-zinc-500 mt-0.5">{copy.hint}</span>}
                  </span>
                </>
              );

              if (copy.path === null) {
                return (
                  <li key={step.id} className={rowClass}>
                    {body}
                    <button
                      type="button"
                      onClick={copyLink}
                      className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded-md text-xs text-amber-400 hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      Copy link
                    </button>
                  </li>
                );
              }
              return (
                <li key={step.id}>
                  <Link
                    href={`/${tenantSlug}/admin/${copy.path}`}
                    className={`${rowClass} group hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500`}
                  >
                    {body}
                    {!step.done && (
                      <ArrowRight
                        className="size-4 shrink-0 text-zinc-500 group-hover:text-amber-400 transition-colors"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
