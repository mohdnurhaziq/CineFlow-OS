import { PageShell } from "@/components/ui/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clapperboard, Receipt, FileText, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { formatStudioDate, loadClientProfile } from "@/lib/client-directory";
import { formatSlotDate } from "@/lib/slot-time";
import { formatMoney } from "@/lib/money";
import { humanize, invoiceStatusLabel, milestoneLabel, studioAdminName } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { ClientContactCard } from "@/components/admin/clients/client-contact-card";
import { ClientNotesCard } from "@/components/admin/clients/client-notes-card";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";
import { studioPath } from "@/lib/domain-name";

interface ClientPageProps {
  params: Promise<{ tenantSlug: string; clientId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { tenantSlug, clientId } = await params;
  const client = await db.user.findFirst({
    where: { id: clientId, role: "CLIENT", tenant: { slug: tenantSlug } },
    select: { name: true, tenant: { select: { name: true } } },
  });
  return { title: client ? `${client.name} | ${studioAdminName(client.tenant?.name)}` : "Client" };
}

/** A timestamp in the studio's time zone; a booking's "YYYY-MM-DD" target date as that calendar day. */
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return formatSlotDate(d, { day: "numeric", month: "short", year: "numeric" });
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? d : formatStudioDate(parsed);
  }
  return formatStudioDate(d);
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Shoot done",
  DELIVERED: "Delivered",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

function statusTone(status: string): string {
  if (["PAID", "DELIVERED", "COMPLETED", "ACCEPTED"].includes(status)) return "text-emerald-400 border-emerald-500/25 bg-emerald-500/10";
  if (["OVERDUE", "REJECTED", "NO_SHOW", "DECLINED"].includes(status)) return "text-rose-400 border-rose-500/25 bg-rose-500/10";
  if (["CANCELLED", "VOID", "DRAFT"].includes(status)) return "text-zinc-400 border-zinc-700 bg-zinc-800";
  return "text-amber-400 border-amber-500/25 bg-amber-500/10";
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={cn("shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide", statusTone(status))}>
      {label}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden">
      <h2 className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-300">
        <Icon className="size-3.5 text-amber-400" aria-hidden="true" />
        {title}
        <span className="text-zinc-500">{count}</span>
      </h2>
      {count === 0 ? <p className="px-4 py-5 text-xs text-zinc-500">{empty}</p> : <ul className="divide-y divide-zinc-800/80">{children}</ul>}
    </section>
  );
}

function Row({ href, title, meta, right }: { href?: string; title: React.ReactNode; meta: React.ReactNode; right: React.ReactNode }) {
  const body = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0 text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-zinc-400 truncate">{meta}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs font-mono text-zinc-300 tabular-nums">
        {right}
        {href && <ChevronRight className="size-4 text-zinc-600 group-hover:text-amber-400 transition-colors" aria-hidden="true" />}
      </div>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="group flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-800/40 transition-colors">
          {body}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-4 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

// Clients VIEW. The client is looked up within this studio, so another studio's client id gives a 404.
export default async function AdminClientPage({ params }: ClientPageProps) {
  const { tenantSlug, clientId } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.clients, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, currency: true },
  });
  if (!tenant) notFound();

  // Each part follows its own area: money with Invoices VIEW, proposals with Proposals VIEW.
  const show = {
    money: levelAtLeast(viewer.access.areas.invoices, "VIEW"),
    proposals: levelAtLeast(viewer.access.areas.proposals, "VIEW"),
  };
  const canManage = levelAtLeast(viewer.access.areas.clients, "MANAGE");
  const profile = await loadClientProfile(tenant.id, clientId, show);
  if (!profile) notFound();

  const { client, bookings, projects, invoices, proposals, money } = profile;
  const base = studioPath(tenant.slug, "/admin");

  const stats: { label: string; value: string; highlight?: boolean }[] = [
    { label: "Bookings", value: String(bookings.length) },
    { label: "Galleries", value: String(projects.length) },
    ...(money
      ? [
          { label: "Paid", value: formatMoney(tenant.currency, money.paid) },
          {
            label: "Balance due",
            value: money.outstanding > 0 ? formatMoney(tenant.currency, money.outstanding) : "—",
            highlight: money.outstanding > 0,
          },
        ]
      : []),
  ];

  return (
    <PageShell width="detail" className="space-y-5">
      <AdminBreadcrumb items={[{ label: "Clients", href: `${base}/clients` }, { label: client.name }]} />

      <ClientContactCard
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        client={{
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          accountPhone: client.accountPhone,
          accountStatus: client.accountStatus,
        }}
        clientSinceLabel={formatDate(client.createdAt)}
        bookingCount={bookings.length}
        canManage={canManage}
      />

      {/* Stats */}
      <dl className={cn("grid grid-cols-2 gap-3", money ? "sm:grid-cols-4" : "sm:grid-cols-2")}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-[#121215] px-4 py-3">
            <dt className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{s.label}</dt>
            <dd className={cn("mt-1 text-lg font-bold tabular-nums", s.highlight ? "text-amber-400" : "text-white")}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <ClientNotesCard tenantId={tenant.id} tenantSlug={tenant.slug} clientId={client.id} notes={client.staffNotes} canManage={canManage} />

      <Section title="Bookings" icon={CalendarCheck} count={bookings.length} empty="No bookings yet.">
        {bookings.map((b) => (
          <Row
            key={b.id}
            href={`${base}/bookings/${b.id}`}
            title={
              <>
                <span className="font-mono">{b.trackingCode}</span>
                <StatusPill status={b.status} label={BOOKING_STATUS_LABELS[b.status] ?? humanize(b.status)} />
              </>
            }
            meta={`${b.packageName || humanize(b.serviceTier)} · ${b.targetDate ? formatDate(b.targetDate) : "No date set"}`}
            right={money && b.sessionPrice != null ? formatMoney(tenant.currency, b.sessionPrice) : null}
          />
        ))}
      </Section>

      <Section title="Galleries" icon={Clapperboard} count={projects.length} empty="No galleries yet.">
        {projects.map((p) => (
          <Row
            key={p.id}
            href={`${base}/projects/${p.id}`}
            title={
              <>
                <span className="truncate">{p.title}</span>
                <StatusPill status={p.status} label={humanize(p.status)} />
              </>
            }
            meta={`${p.projectNumber}${p.shootDates ? ` · ${formatDate(p.shootDates)}` : ""}`}
            right={p.budget != null ? formatMoney(tenant.currency, p.budget) : null}
          />
        ))}
      </Section>

      {money && (
      <Section title="Invoices" icon={Receipt} count={invoices.length} empty="No invoices yet.">
        {invoices.map((inv) => (
          <Row
            key={inv.id}
            href={`${base}/invoices/${inv.id}`}
            title={
              <>
                <span className="font-mono">{inv.invoiceNumber}</span>
                <StatusPill status={inv.status} label={invoiceStatusLabel(inv.status)} />
              </>
            }
            meta={`${inv.milestoneType === "CUSTOM" && inv.description ? inv.description : milestoneLabel(inv.milestoneType)} · ${
              inv.paidAt ? `Paid ${formatDate(inv.paidAt)}` : `Due ${formatDate(inv.dueDate)}`
            }`}
            right={formatMoney(tenant.currency, inv.amount)}
          />
        ))}
      </Section>
      )}

      {show.proposals && (
      <Section title="Proposals" icon={FileText} count={proposals.length} empty="No proposals yet.">
        {proposals.map((pr) => (
          <Row
            key={pr.id}
            href={`${base}/proposals`}
            title={
              <>
                <span className="truncate">{pr.title}</span>
                <StatusPill status={pr.status} label={humanize(pr.status)} />
              </>
            }
            meta={`${pr.proposalNumber} · ${formatDate(pr.createdAt)}`}
            right={formatMoney(tenant.currency, pr.totalPrice)}
          />
        ))}
      </Section>
      )}
    </PageShell>
  );
}
