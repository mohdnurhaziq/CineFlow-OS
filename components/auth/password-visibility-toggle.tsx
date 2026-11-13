"use client";

import { Eye, EyeOff } from "lucide-react";

/**
 * Eye button that shows or hides a password field. Place it inside a `relative` wrapper
 * next to the input, give the input right padding (pr-10), and set the input's type to
 * `visible ? "text" : "password"`.
 */
export function PasswordVisibilityToggle({
  visible,
  onToggle,
  what = "password",
}: {
  visible: boolean;
  onToggle: () => void;
  /** What the field holds, for the button's label ("Show password", "Show secret key"). */
  what?: string;
}) {
  const label = visible ? `Hide ${what}` : `Show ${what}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={visible}
      title={label}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 grid size-8 place-items-center rounded-md text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
    >
      {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </button>
  );
}
