import { chipClass, chipCountClass, chipListClass } from "@/components/ui/tabs";
import { PageHeader, PageShell } from "@/components/ui/page";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Inbox, Images } from "lucide-react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PROJECT_STAGE_LABELS } from "@/lib/projects/constants";
import { formatSlotDate } from "@/lib/slot-time";
import { PROJECT_LIST_TABS, countAdminProjects, loadAdminProjects, type ProjectListTab } from "@/lib/projects/list";
import { catchUpShotStages } from "@/lib/projects/stage";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { studioPath } from "@/lib/domain-name";

interface ProjectsPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TAB_LABELS: Record<ProjectListTab, string> = { productions: "Productions", sessions: "Sessions", all: "All" };

export async function generateMetadata({ params }: ProjectsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Galleries | ${tenant.name} Studio Admin` : "Galleries" };
}

// Galleries access; at "Only their own", the list holds only the projects they lead or are assigned to.
export default async function AdminProjectsPage({ params, searchParams }: ProjectsPageProps) {
  const { tenantSlug } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: ProjectListTab = PROJECT_LIST_TABS.includes(tabParam as ProjectListTab) ? (tabParam as ProjectListTab) : "productions";
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.galleries, "OWN")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true } });
  if (!tenant) notFound();

  // A session whose time has passed counts as shot.
  await catchUpShotStages(tenant.id);

  const listViewer = { id: viewer.user.id, access: viewer.access };
  // Budgets and paid status only with Invoices access; without it they aren't loaded.
  const money = levelAtLeast(viewer.access.areas.invoices, "VIEW");
  const [counts, projects] = await Promise.all([
    countAdminProjects(tenant.id, listViewer),
    loadAdminProjects(tenant.id, listViewer, { tab, money }),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={Images}
        title="Galleries"
        description="Every confirmed booking and signed proposal has a gallery: upload the client&apos;s photos here. Productions also get shoot-day planning."
      />

      <nav aria-label="Project kinds" className={chipListClass}>
        {PROJECT_LIST_TABS.map((t) => (
          <Link
            key={t}
            href={t === "productions" ? studioPath(tenant.slug, "/admin/projects") : studioPath(tenant.slug, `/admin/projects?tab=${t}`)}
            aria-current={t === tab ? "page" : undefined}
            className={chipClass(t === tab)}
          >
            {TAB_LABELS[t]} <span className={chipCountClass(t === tab)}>{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-10 text-center space-y-2">
          <Inbox className="size-8 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-300">No {tab === "all" ? "galleries" : TAB_LABELS[tab].toLowerCase()} yet.</p>
          <p className="text-xs text-zinc-500">
            Every confirmed booking gets a gallery automatically: sessions (convocation, portrait, Raya) under Sessions, productions
            (weddings, commercial, events) here. Signed{" "}
            <Link href={studioPath(tenant.slug, "/admin/proposals")} className="text-amber-400 hover:underline">
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
                {money && <th scope="col" className="text-right px-4 py-3">Budget</th>}
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
                      <Link href={studioPath(tenant.slug, `/admin/projects/${p.id}`)} className="font-semibold text-white hover:text-amber-400">
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
                    {p.money && (
                      <td className="px-4 py-3 text-right font-mono text-zinc-200">
                        {formatMoney(tenant.currency, p.money.budget)}
                        <div className="text-[10px] text-zinc-500">{p.money.isFinalBalancePaid ? "Fully paid" : "Balance open"}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
