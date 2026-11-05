import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Clapperboard, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PROJECT_STAGE_LABELS } from "@/lib/projects/constants";
import { formatSlotDate } from "@/lib/slot-time";

interface ProjectsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export async function generateMetadata({ params }: ProjectsPageProps): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { name: true } });
  return { title: tenant ? `Projects | ${tenant.name} Studio Admin` : "Projects" };
}

// Access is enforced by the admin layout (studio staff or super-admin only).
export default async function AdminProjectsPage({ params }: ProjectsPageProps) {
  const { tenantSlug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true } });
  if (!tenant) notFound();

  const projects = await db.project.findMany({
    where: { tenantId: tenant.id },
    include: {
      client: { select: { name: true } },
      callSheets: { select: { shootDate: true }, orderBy: { shootDate: "asc" } },
      deliverables: { select: { _count: { select: { items: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          <Clapperboard className="size-6 text-amber-400" />
          Projects
        </h1>
        <p className="text-xs text-zinc-400">
          Each signed proposal becomes a project: plan the shoot days, reserve gear, and deliver the files to the client.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-10 text-center space-y-2">
          <Inbox className="size-8 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-300">No projects yet.</p>
          <p className="text-xs text-zinc-500">
            Send a proposal from{" "}
            <Link href={`/${tenant.slug}/admin/proposals`} className="text-amber-400 hover:underline">
              Proposals
            </Link>
            . When the client signs it, the project appears here.
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
                      <div className="text-[11px] font-mono text-zinc-500">{p.projectNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{p.client.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{PROJECT_STAGE_LABELS[p.status as keyof typeof PROJECT_STAGE_LABELS] ?? p.status}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {next ? formatSlotDate(next.shootDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Not scheduled"}
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
