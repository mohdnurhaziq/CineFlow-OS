"use client";

import { useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeftRight, Check, LogOut } from "lucide-react";
import { signOutEverywhere } from "@/lib/actions/one-login";
import { signedOutHref } from "@/lib/auth/signed-out";
import { studioPath } from "@/lib/domain-name";
import type { SwitcherEntry } from "@/lib/auth/switcher";

/** One studio in the list: its name, the person's role there, and a mark on the one they are in. */
export function SwitcherRow({ entry }: { entry: SwitcherEntry }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">{entry.tenantName}</span>
        <span className="block truncate text-[11px] font-mono uppercase tracking-wide text-zinc-400">{entry.roleLabel}</span>
      </span>
      {entry.current && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-mono text-amber-300">
          <Check className="size-3" aria-hidden="true" />
          Current
        </span>
      )}
    </span>
  );
}

const item = "flex cursor-pointer items-center rounded-lg px-3 py-2.5 outline-none data-[highlighted]:bg-zinc-800/80";

/**
 * The account menu's studios and sign-out part: "Switch studio" when the person belongs to more than
 * one (a link per studio, the current one marked), and "Sign out everywhere" for everyone signed in.
 */
export function SessionMenu({ tenantSlug, entries }: { tenantSlug: string; entries: SwitcherEntry[] }) {
  const [pending, startTransition] = useTransition();

  const signOutAll = () =>
    startTransition(async () => {
      await signOutEverywhere();
      window.location.href = signedOutHref(studioPath(tenantSlug, "/login"));
    });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Studios and sign out"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-400 outline-none transition-colors hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-500 sm:min-h-8 sm:min-w-8"
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[240px] max-w-[300px] rounded-xl border border-zinc-800 bg-[#121215]/98 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-xl focus:outline-none"
        >
          {entries.length > 1 && (
            <>
              <DropdownMenu.Label className="px-3 pb-1 pt-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">Switch studio</DropdownMenu.Label>
              {entries.map((entry) => (
                <DropdownMenu.Item key={entry.tenantSlug} asChild>
                  <a href={entry.href} aria-current={entry.current ? "true" : undefined} className={item}>
                    <SwitcherRow entry={entry} />
                  </a>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-zinc-800" />
            </>
          )}
          <DropdownMenu.Item disabled={pending} onSelect={signOutAll} className={`${item} gap-2 text-sm text-zinc-200`}>
            <LogOut className="size-3.5 text-zinc-400" aria-hidden="true" />
            Sign out everywhere
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
