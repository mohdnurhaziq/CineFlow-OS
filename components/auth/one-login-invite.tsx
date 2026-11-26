"use client";

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { sendOneLoginLink } from "@/lib/actions/password-reset";

const DISMISSED_KEY = "cineflow:one-login-invite-dismissed";

/**
 * A card for a stand-alone account: "confirm your email". Emails a link that proves the email and
 * sets up one sign-in for every studio. Dismissible (remembered in this browser).
 */
export function OneLoginInvite() {
  const [hidden, setHidden] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Not remembered, still closes for now.
    }
    setHidden(true);
  };

  const send = async () => {
    setState("sending");
    setError(null);
    try {
      const res = await sendOneLoginLink();
      if (res.success) setState("sent");
      else {
        setError(res.message);
        setState("idle");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setState("idle");
    }
  };

  return (
    <section aria-label="Confirm your email" className="relative rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 pr-12 sm:p-5 sm:pr-14">
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute right-1 top-1 grid size-11 place-items-center rounded-lg text-zinc-400 hover:text-white">
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Confirm your email</h2>
          <p className="mt-1 text-xs text-zinc-400">We&apos;ll email you a link. It also gives you one sign-in for every CineFlow studio you work with or book.</p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-rose-300">
              {error}
            </p>
          )}
        </div>
        {state === "sent" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-emerald-300">
            <Mail className="size-4" aria-hidden="true" /> Check your email.
          </p>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={state === "sending"}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
        )}
      </div>
    </section>
  );
}
