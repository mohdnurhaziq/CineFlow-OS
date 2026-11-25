import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentLogin } from "@/lib/auth/session";
import { loadSwitcher } from "@/lib/auth/switcher";
import { StudiosSignOut } from "@/components/auth/studios-signout";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your studios | CineFlow OS",
  robots: { index: false, follow: false },
};

/** Every studio the signed-in person can open with their one login. */
export default async function YourStudiosPage() {
  const me = await getCurrentLogin();
  if (!me) redirect("/login");
  const studios = await loadSwitcher(null);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-400">Signed in as {me.email}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Your studios</h1>

      {studios.length === 0 ? (
        <div className="mt-8 space-y-3 rounded-2xl border border-zinc-800 bg-[#121215] p-6">
          <p className="text-zinc-200">You&apos;re not with any studio yet.</p>
          <p className="text-sm text-zinc-400">Start your own, or open a studio&apos;s website to book it.</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/create-studio" className="inline-flex min-h-11 items-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-black hover:bg-amber-400">
              Start your studio
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:bg-zinc-800">
              CineFlow OS home
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {studios.map((s) => (
            <li key={s.tenantSlug}>
              <a href={s.href} className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-[#121215] p-4 transition-colors hover:border-zinc-600">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{s.tenantName}</span>
                  <span className="block font-mono text-[11px] uppercase tracking-wide text-zinc-400">{s.roleLabel}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-amber-400">Open</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-zinc-800 pt-6">
        <StudiosSignOut />
      </div>
    </div>
  );
}
