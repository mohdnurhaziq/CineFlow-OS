"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Copies `text` (e.g. the delivery address for the courier's form) to the clipboard. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} className={buttonVariants({ variant: "secondary", size: "sm" })} aria-live="polite">
      {copied ? <Check className="text-emerald-400" /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  );
}
