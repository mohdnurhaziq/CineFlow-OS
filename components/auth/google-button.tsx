import { cn } from "@/lib/utils";

/** The Google "G" mark, in Google's own colours. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  );
}

/**
 * "Continue with Google": a plain link (a full page navigation to the platform's Google start), so it
 * works without JavaScript. At least 44px tall for phones.
 */
export function GoogleButton({ href, label = "Continue with Google", className, onClick }: { href: string; label?: string; className?: string; onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400",
        className
      )}
    >
      <GoogleMark />
      {label}
    </a>
  );
}

/** The "or" line between a password form and the Google button. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-widest text-zinc-500" role="separator">
      <span className="h-px flex-1 bg-zinc-800" />
      or
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}
