import type { Ref } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The X that closes a dialog or panel: one look, a name screen readers can say, and a 44px target.
 * `className` is for where it sits (absolute, top-3, right-3…); `label` names it more exactly.
 */
export function DialogCloseButton({
  onClick,
  label = "Close",
  disabled,
  className,
  ref,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** For dialogs that move focus here when they open. */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50",
        className
      )}
    >
      <X className="size-5" aria-hidden="true" />
    </button>
  );
}
