"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where the invoice can also be saved as a PDF. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 transition-colors"
    >
      <Printer className="size-4" />
      Print / Save as PDF
    </button>
  );
}
