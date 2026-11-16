import Link from "next/link";
import { Film, Globe } from "lucide-react";
import { db } from "@/lib/db";
import { AdminNavBar } from "@/components/admin/admin-nav-bar";
import { AdminUserNav } from "@/components/admin/admin-user-nav";
import { disciplineLabel } from "@/lib/labels";
import { ToastAnchor } from "@/components/ui/toast-anchor";
import type { SessionUser } from "@/lib/auth/session";

interface AdminHeaderProps {
  tenant: { id: string; name: string; slug: string; discipline: string };
  /** The signed-in team member. */
  user: SessionUser;
}

/**
 * The admin console's top bar: studio name (to the dashboard), the team member's menu and the
 * admin menu with its live counts. Used by the admin layout, and by the pages outside it that the
 * team opens from the console (a client's gallery, a proposal, a call sheet, release forms), so
 * the team always sees the same bar.
 */
export async function AdminHeader({ tenant, user }: AdminHeaderProps) {
  // Live counts for the menu badges: payments to verify, print orders to start.
  const [pendingCount, newPrintOrderCount] = await Promise.all([
    db.milestoneInvoice.count({ where: { tenantId: tenant.id, status: "PENDING_VERIFICATION" } }),
    db.printOrder.count({ where: { tenantId: tenant.id, status: "NEW" } }),
  ]);

  return (
    <header className="border-b border-zinc-800 bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40 print:hidden">
      <ToastAnchor />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Brand Bar */}
        <div className="h-16 flex items-center justify-between border-b border-zinc-800/60">
          {/* Brand & Studio Scope */}
          <div className="flex items-center gap-4">
            <Link
              href={`/${tenant.slug}/admin`}
              title="Admin dashboard"
              className="flex items-center gap-2 group text-zinc-400 hover:text-white transition-colors"
            >
              <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                <Film className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight text-white group-hover:text-amber-400 transition-colors">
                  {tenant.name}
                </span>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Studio admin</span>
              </div>
            </Link>

            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
              {disciplineLabel(tenant.discipline)}
            </span>
          </div>

          {/* Right Header Actions: User Profile & Studio Website */}
          <div className="flex items-center gap-3">
            <Link
              href={`/${tenant.slug}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              <Globe className="size-3.5 text-amber-400" />
              <span className="hidden sm:inline">View studio website</span>
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <AdminUserNav tenantSlug={tenant.slug} user={user} />
          </div>
        </div>

        {/* Administrative Domain Navigation Tabs */}
        <div className="py-1">
          <AdminNavBar tenantSlug={tenant.slug} pendingVerificationCount={pendingCount} newPrintOrderCount={newPrintOrderCount} />
        </div>
      </div>
    </header>
  );
}
