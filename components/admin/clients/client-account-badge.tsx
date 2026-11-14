import { cn } from "@/lib/utils";
import { CLIENT_ACCOUNT_STATUS_LABELS, type ClientAccountStatus } from "@/lib/client-directory-labels";

const STYLES: Record<ClientAccountStatus, string> = {
  REGISTERED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  INVITED: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  GUEST: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const TITLES: Record<ClientAccountStatus, string> = {
  REGISTERED: "Has set a password and can sign in",
  INVITED: "Sent a set-password link, not used yet",
  GUEST: "Booked without making an account",
};

export function ClientAccountBadge({ status }: { status: ClientAccountStatus }) {
  return (
    <span
      title={TITLES[status]}
      className={cn("shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide", STYLES[status])}
    >
      {CLIENT_ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}
