import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Film, ArrowLeft } from "lucide-react";
import { AdminNavBar } from "@/components/admin/admin-nav-bar";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { tenantSlug } = await params;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      brandColor: true,
      discipline: true,
    },
  });

  if (!tenant) notFound();

  // Get live pending verification count for badge
  const pendingCount = await db.milestoneInvoice.count({
    where: {
      tenantId: tenant.id,
      status: "PENDING_VERIFICATION",
    },
  });

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] flex flex-col selection:bg-amber-500/20 selection:text-amber-400">
      {/* Studio Admin Top Navigation Bar */}
      <header className="border-b border-zinc-800 bg-[#121215]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Brand Bar */}
          <div className="h-16 flex items-center justify-between border-b border-zinc-800/60">
            {/* Brand & Studio Scope */}
            <div className="flex items-center gap-4">
              <Link
                href={`/${tenant.slug}`}
                className="flex items-center gap-2 group text-zinc-400 hover:text-white transition-colors"
              >
                <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Film className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm tracking-tight text-white group-hover:text-amber-400 transition-colors">
                    {tenant.name}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                    Studio Admin Operating Center
                  </span>
                </div>
              </Link>

              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                {tenant.discipline}
              </span>
            </div>

            {/* Public Showcase Quick Link */}
            <Link
              href={`/${tenant.slug}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              <ArrowLeft className="size-3.5 text-amber-400" />
              <span>Public Showcase</span>
            </Link>
          </div>

          {/* Administrative Domain Navigation Tabs */}
          <div className="py-1">
            <AdminNavBar
              tenantSlug={tenant.slug}
              pendingVerificationCount={pendingCount}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
