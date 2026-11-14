import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clapperboard, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PROJECT_STAGE_LABELS } from "@/lib/projects/constants";
import { formatSlotDate } from "@/lib/slot-time";
import { PROJECT_LIST_TABS, projectListWhere, type ProjectListTab } from "@/lib/projects/list";

interface ProjectsPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TAB_LABELS: Record<ProjectListTab, string> = { productions: "Productions", sessions: "Sessions", all: "All" };

export async function generateMetadata({ params }: ProjectsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Projects | ${tenant.name} Studio Admin` : "Projects" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminProjectsPage({ params, searchParams }: ProjectsPageProps) {
  const { tenantSlug } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: ProjectListTab = PROJECT_LIST_TABS.includes(tabParam as ProjectListTab) ? (tabParam as ProjectListTab) : "productions";
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true } });
  if (!tenant) notFound();

  const counts = Object.fromEntries(
    await Promise.all(PROJECT_LIST_TABS.map(async (t) => [t, await db.project.count({ where: projectListWhere(tenant.id, t) })] as const))
  ) as Record<ProjectListTab, number>;

  const projects = await db.project.findMany({
    where: projectListWhere(tenant.id, tab),
    include: {
      client: { select: { name: true } },
      callSheets: { select: { shootDate: true }, orderBy: { shootDate: "asc" } },
      deliverables: { select: { _count: { select: { items: true } } } },
      booking: { select: { id: true, trackingCode: true, category: true, serviceTier: true } },
      proposal: { select: { id: true, proposalNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Clapperboard className="size-6 text-amber-400" />
          Projects
        </h1>
        <p className="text-xs text-zinc-400">
          Every confirmed booking and signed proposal has a project: upload the client&apos;s photos here. Productions also get shoot-day planning.
        </p>
      </div>

      <nav aria-label="Project kinds" className="flex flex-wrap gap-1.5">
        {PROJECT_LIST_TABS.map((t) => (
          <Link
            key={t}
            href={t === "productions" ? `/${tenant.slug}/admin/projects` : `/${tenant.slug}/admin/projects?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              t === tab ? "bg-amber-500 text-black border-amber-500" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            {TAB_LABELS[t]} <span className="opacity-70">({counts[t]})</span>
          </Link>
        ))}
      </nav>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-10 text-center space-y-2">
          <Inbox className="size-8 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-300">No {tab === "all" ? "projects" : TAB_LABELS[tab].toLowerCase()} yet.</p>
          <p className="text-xs text-zinc-500">
            Every confirmed booking gets a project automatically: sessions (convocation, portrait, Raya) under Sessions, productions
            (weddings, commercial, events) here. Signed{" "}
            <Link href={`/${tenant.slug}/admin/proposals`} className="text-amber-400 hover:underline">
              proposals
            </Link>{" "}
            become productions.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] font-mono uppercase text-zinc-400 bg-zinc-900/60 border-b border-zinc-800">
              <tr>
                <th scope="col" className="text-left px-4 py-3">Project</th>
                <th scope="col" className="text-left px-4 py-3">Client</th>
                <th scope="col" className="text-left px-4 py-3">Stage</th>
                <th scope="col" className="text-left px-4 py-3">Next shoot day</th>
                <th scope="col" className="text-left px-4 py-3">Files</th>
                <th scope="col" className="text-right px-4 py-3">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {projects.map((p) => {
                const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
                const next = p.callSheets.find((c) => c.shootDate.getTime() >= today);
                const files = p.deliverables.reduce((n, d) => n + d._count.items, 0);
                return (
                  <tr key={p.id} className="hover:bg-zinc-900/30">
                    <td className="px-4 py-3">
                      <Link href={`/${tenant.slug}/admin/projects/${p.id}`} className="font-semibold text-white hover:text-amber-400">
                        {p.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-zinc-500">{p.projectNumber}</span>
                        {p.booking && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Booking {p.booking.trackingCode}
                          </span>
                        )}
                        {p.proposal && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Proposal {p.proposal.proposalNumber}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{p.client.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{PROJECT_STAGE_LABELS[p.status as keyof typeof PROJECT_STAGE_LABELS] ?? p.status}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {next
                        ? formatSlotDate(next.shootDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                        : p.kind === "SESSION" && p.shootDates
                          ? formatSlotDate(`${p.shootDates.slice(0, 10)}T00:00:00.000Z`, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                          : "Not scheduled"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{files === 0 ? "None yet" : `${files} delivered`}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-200">
                      {formatMoney(tenant.currency, p.budget)}
                      <div className="text-[10px] text-zinc-500">{p.isFinalBalancePaid ? "Fully paid" : "Balance open"}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
