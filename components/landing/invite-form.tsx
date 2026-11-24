"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { submitInviteRequest, type InviteFormState } from "@/lib/actions/invite-requests";

const field =
  "w-full min-h-12 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40";
const label = "mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-zinc-400";

function Submit() {
  const { pending } = useFormStatus();
  // aria-disabled, not disabled: a disabled button drops keyboard focus to the page, so after the
  // answer comes back a keyboard user would be left at the top. Pressing it while sending does nothing.
  return (
    <button
      type="submit"
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-amber-500 px-8 text-sm font-semibold text-black transition-all hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 aria-disabled:cursor-wait aria-disabled:opacity-60"
    >
      {pending ? "Sending…" : "Request an invite"}
    </button>
  );
}

const KINDS = [
  ["PHOTO", "Photo"],
  ["VIDEO", "Video"],
  ["BOTH", "Both"],
] as const;

/** The invite request form. A real form, so it works before the page's JavaScript has loaded. */
export function InviteForm() {
  const [state, action] = useActionState<InviteFormState, FormData>(submitInviteRequest, { status: "idle" });
  // After a refusal React clears the fields, so they start from what the visitor had typed.
  const typed = state.status === "error" ? state.values : undefined;
  const thanks = useRef<HTMLDivElement>(null);

  // The form is replaced by the thank-you, so keyboard focus would be lost with it: move it to the message.
  useEffect(() => {
    if (state.status === "done") thanks.current?.focus();
  }, [state.status]);

  if (state.status === "done") {
    return (
      <div ref={thanks} tabIndex={-1} role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 outline-none">
        <p className="font-[family-name:var(--font-display)] text-3xl text-white">Thank you.</p>
        <p className="mt-3 text-zinc-300">We&apos;ve got your request and we&apos;ll be in touch by email.</p>
      </div>
    );
  }

  return (
    <form action={action} className="relative grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor="inv-name" className={label}>
          Your name
        </label>
        <input id="inv-name" name="name" required maxLength={100} autoComplete="name" defaultValue={typed?.name} className={field} />
      </div>
      <div>
        <label htmlFor="inv-studio" className={label}>
          Studio name
        </label>
        <input id="inv-studio" name="studioName" required maxLength={100} autoComplete="organization" defaultValue={typed?.studioName} className={field} />
      </div>
      <div>
        <label htmlFor="inv-email" className={label}>
          Email
        </label>
        <input id="inv-email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={typed?.email} className={field} />
      </div>
      <div>
        <label htmlFor="inv-phone" className={label}>
          Phone (optional)
        </label>
        <input id="inv-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" defaultValue={typed?.phone} className={field} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={label}>What do you shoot?</legend>
        <div className="flex flex-wrap gap-3">
          {KINDS.map(([value, text], i) => (
            <label
              key={value}
              className="inline-flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border border-zinc-700 px-5 text-sm text-zinc-200 has-[:checked]:border-amber-400 has-[:checked]:text-amber-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-400/40"
            >
              <input type="radio" name="kind" value={value} defaultChecked={typed?.kind ? typed.kind === value : i === 2} className="accent-amber-500" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label htmlFor="inv-message" className={label}>
          Anything we should know? (optional)
        </label>
        <textarea id="inv-message" name="message" rows={4} maxLength={1000} defaultValue={typed?.message} className={field} />
      </div>
      {/* A trap for bots: people never see or fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center">
        <Submit />
        {state.status === "error" && (
          <p role="alert" className="text-sm text-red-300">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
