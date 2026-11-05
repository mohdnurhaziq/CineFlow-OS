"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";

interface ConfirmOptions {
  title: string;
  message?: string;
  /** Text on the confirm button, e.g. "Delete". */
  confirmLabel?: string;
  /** Red confirm button for destructive actions (the default). */
  destructive?: boolean;
}

/**
 * A styled replacement for window.confirm():
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "Delete package?", confirmLabel: "Delete" }))) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  return { confirm, confirmDialog: <ConfirmDialog options={options} onSettle={settle} /> };
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions | null; onSettle: (ok: boolean) => void }) {
  const dialog = useDialog(options !== null, () => onSettle(false));
  if (!options) return null;
  const destructive = options.destructive ?? true;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSettle(false);
      }}
    >
      <div
        {...dialog}
        aria-labelledby="confirm-dialog-title"
        aria-describedby={options.message ? "confirm-dialog-message" : undefined}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#121215] p-5 space-y-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          {destructive && <AlertTriangle className="size-5 text-red-400 shrink-0 mt-0.5" />}
          <div className="space-y-1.5">
            <h2 id="confirm-dialog-title" className="text-sm font-bold text-white">
              {options.title}
            </h2>
            {options.message && (
              <p id="confirm-dialog-message" className="text-xs text-zinc-400 leading-relaxed">
                {options.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="px-3.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold ${
              destructive ? "bg-red-600 hover:bg-red-500 text-white" : "bg-amber-500 hover:bg-amber-400 text-black"
            }`}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
