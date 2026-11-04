import Link from "next/link";
import {
  CalendarClock,
  CalendarPlus,
  Camera,
  Check,
  FileText,
  FolderLock,
  Lock,
  LockOpen,
  Receipt,
  Wallet,
} from "lucide-react";
import type { ClientBooking, BookingSlot, MilestoneInvoice, Proposal } from "@prisma/client";
import { LogoutButton } from "./logout-button";

type BookingRow = ClientBooking & { slot: BookingSlot | null };

interface ProjectRow {
  id: string;
  title: string;
  projectNumber: string;
  status: string;
  isFinalBalancePaid: boolean;
  deliverables: { status: string; items: { itemType: string; isClientFav: boolean }[] }[];
  callSheets: { title: string; shootDate: Date; generalCallTime: string; locationName: string }[];
}

interface ClientDashboardProps {
  tenant: { name: string; slug: string; currency: string };
  client: { name: string; email: string; phone: string | null };
  bookings: BookingRow[];
  invoices: MilestoneInvoice[];
  proposals: Proposal[];
  projects: ProjectRow[];
}

const STAGES = [
  { id: "PRE_PRODUCTION", label: "Planning" },
  { id: "PRODUCTION", label: "Shooting" },
  { id: "POST_PRODUCTION", label: "Editing" },
  { id: "IN_REVIEW", label: "In review" },
  { id: "DELIVERED", label: "Delivered" },
];

const BOOKING_STATUS_TEXT: Record<string, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Awaiting payment verification",
  CANCELLED: "Cancelled",
};

const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  PAID: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  ACCEPTED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  PENDING_VERIFICATION: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  SENT: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  CANCELLED: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  DECLINED: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Badge({ status, label }: { status: string; label?: string }) {
  const style = BADGE[status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase tracking-wide ${style}`}>
      {label ?? humanize(status)}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
      <h2 className="text-sm font-bold text-white flex items-center gap-2">
        <Icon className="size-4 text-amber-400" /> {title}
      </h2>
      {children}
    </section>
  );
}

export function ClientDashboard({ tenant, client, bookings, invoices, proposals, projects }: ClientDashboardProps) {
  const money = (amount: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: tenant.currency }).format(amount);
    } catch {
      return `${tenant.currency} ${amount.toFixed(2)}`;
    }
  };
  const date = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const outstanding = invoices
    .filter((i) => i.status === "PENDING" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + i.amount, 0);
  const upcoming = bookings.filter((b) => b.status !== "CANCELLED" && b.slot && b.slot.date >= new Date(Date.now() - 86400000));
  const readyMedia = projects.reduce(
    (sum, p) => sum + p.deliverables.reduce((s, d) => s + d.items.length, 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-amber-500/20 selection:text-amber-400">
      <header className="border-b border-zinc-800 bg-[#121215]/95">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/${tenant.slug}`} className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
              {tenant.name}
            </Link>
            <h1 className="text-lg font-black tracking-tight text-white">Hi, {client.name.split(" ")[0]}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/${tenant.slug}/book`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors"
            >
              <CalendarPlus className="size-3.5" /> Book a session
            </Link>
            <LogoutButton redirectTo={`/${tenant.slug}`} />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: CalendarClock, label: "Upcoming sessions", value: String(upcoming.length) },
            { icon: Wallet, label: "Outstanding balance", value: money(outstanding) },
            { icon: Camera, label: "Photos & videos", value: String(readyMedia) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="p-4 rounded-2xl bg-[#121215] border border-zinc-800">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-zinc-500">
                <Icon className="size-3.5 text-amber-400" /> {label}
              </div>
              <div className="mt-1 text-xl font-black text-white tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {/* Projects: photo / service status */}
        <Section icon={Camera} title="Your projects">
          {projects.length === 0 ? (
            <p className="text-xs text-zinc-500">
              Once your session is confirmed and the studio starts your project, its progress and your
              photos will appear here.
            </p>
          ) : (
            <ul className="space-y-4">
              {projects.map((p) => {
                const stageIndex = Math.max(0, STAGES.findIndex((s) => s.id === p.status));
                const items = p.deliverables.flatMap((d) => d.items);
                const photos = items.filter((i) => i.itemType === "PHOTO").length;
                const videos = items.filter((i) => i.itemType === "VIDEO").length;
                const favs = items.filter((i) => i.isClientFav).length;
                const next = p.callSheets[0];
                return (
                  <li key={p.id} className="p-4 rounded-xl bg-[#16161b] border border-zinc-800 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{p.title}</div>
                        <div className="text-[11px] font-mono text-zinc-500">{p.projectNumber}</div>
                      </div>
                      <Badge status={p.status} />
                    </div>

                    <ol className="grid grid-cols-5 gap-1" aria-label="Project progress">
                      {STAGES.map((s, i) => (
                        <li key={s.id} className="space-y-1">
                          <div className={`h-1.5 rounded-full ${i <= stageIndex ? "bg-amber-500" : "bg-zinc-800"}`} />
                          <div
                            className={`text-[10px] font-mono flex items-center gap-1 ${
                              i <= stageIndex ? "text-zinc-200" : "text-zinc-600"
                            }`}
                          >
                            {i < stageIndex && <Check className="size-2.5 text-amber-400" />}
                            {s.label}
                          </div>
                        </li>
                      ))}
                    </ol>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 text-zinc-400">
                        <div>
                          {items.length > 0
                            ? `${photos} photo${photos === 1 ? "" : "s"} · ${videos} video${videos === 1 ? "" : "s"} ready to review${
                                favs ? ` · ${favs} favourite${favs === 1 ? "" : "s"}` : ""
                              }`
                            : "No photos or videos uploaded yet"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.isFinalBalancePaid ? (
                            <>
                              <LockOpen className="size-3.5 text-emerald-400" />
                              <span className="text-emerald-300">High-res masters unlocked</span>
                            </>
                          ) : (
                            <>
                              <Lock className="size-3.5 text-amber-400" />
                              <span>Masters unlock once the final balance is paid</span>
                            </>
                          )}
                        </div>
                        {next && (
                          <div className="flex items-center gap-1.5 text-zinc-300">
                            <CalendarClock className="size-3.5 text-amber-400" />
                            Next shoot: {date(next.shootDate)} · {next.generalCallTime} · {next.locationName}
                          </div>
                        )}
                      </div>
                      <Link
                        href={`/${tenant.slug}/vault/${p.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-200 font-semibold transition-colors"
                      >
                        <FolderLock className="size-3.5 text-amber-400" /> Open vault
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Bookings */}
        <Section icon={CalendarClock} title="Bookings">
          {bookings.length === 0 ? (
            <p className="text-xs text-zinc-500">
              You haven&apos;t booked a session yet.{" "}
              <Link href={`/${tenant.slug}/book`} className="text-amber-400 hover:text-amber-300">
                Pick a date
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {bookings.map((b) => (
                <li key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-mono text-zinc-200">{b.trackingCode}</div>
                    <div className="text-zinc-500">
                      {humanize(b.category)}
                      {b.slot ? ` · ${date(b.slot.date)} · ${b.slot.startTime} – ${b.slot.endTime}` : ""}
                    </div>
                    <div className="text-zinc-500">
                      Deposit {money(b.depositAmount)} · {b.depositPaid ? "paid" : "not yet paid / verified"}
                    </div>
                  </div>
                  <Badge status={b.status} label={BOOKING_STATUS_TEXT[b.status]} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Invoices */}
        {invoices.length > 0 && (
          <Section icon={Receipt} title="Invoices">
            <ul className="divide-y divide-zinc-800/80">
              {invoices.map((inv) => (
                <li key={inv.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-mono text-zinc-200">{inv.invoiceNumber}</div>
                    <div className="text-zinc-500">
                      {humanize(inv.milestoneType)} · due {date(inv.dueDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-zinc-200">{money(inv.amount)}</span>
                    <Badge status={inv.status} />
                    {(inv.status === "PENDING" || inv.status === "OVERDUE") && (
                      <Link
                        href={`/${tenant.slug}/checkout?invoiceId=${inv.id}`}
                        className="px-2.5 py-1 rounded-md bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                      >
                        Pay
                      </Link>
                    )}
                    {/* QR deposit with no slip yet: upload it before the 24-hour hold runs out. */}
                    {inv.status === "PENDING_VERIFICATION" && inv.paymentMethod === "QR_CODE" && !inv.paymentProofUrl && (
                      <Link
                        href={`/${tenant.slug}/checkout?invoiceId=${inv.id}`}
                        className="px-2.5 py-1 rounded-md bg-amber-500 text-black font-semibold hover:bg-amber-400 transition-colors"
                      >
                        Upload slip
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Proposals */}
        {proposals.length > 0 && (
          <Section icon={FileText} title="Proposals">
            <ul className="divide-y divide-zinc-800/80">
              {proposals.map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-zinc-200">{p.title}</div>
                    <div className="font-mono text-zinc-500">
                      {p.proposalNumber} · {money(p.totalPrice)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={p.status} />
                    <Link
                      href={`/${tenant.slug}/proposals/${p.id}`}
                      className="text-amber-400 hover:text-amber-300 font-semibold"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="text-center text-[11px] font-mono text-zinc-600">
          Signed in as {client.email}
        </p>
      </main>
    </div>
  );
}
