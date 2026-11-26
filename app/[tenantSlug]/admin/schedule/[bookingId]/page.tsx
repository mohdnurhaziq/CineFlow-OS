import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { levelAtLeast } from "@/lib/auth/access";
import { NoAccess } from "@/components/admin/no-access";
import { PageShell } from "@/components/ui/page";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { studioPath } from "@/lib/domain-name";
import { ShootDetailsDialog } from "@/components/admin/schedule/shoot-details-dialog";
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  Mail,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Package as PackageIcon,
  Layers,
  Images,
  ExternalLink,
  Copy,
  Check,
  Printer,
  ChevronRight,
  User,
  Share2,
  Receipt,
  Eye,
  CalendarClock,
  ArrowLeft,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/slot-time";
import { cn } from "@/lib/utils";

interface ShootPageProps {
  params: Promise<{ tenantSlug: string; bookingId: string }>;
}

export async function generateMetadata({ params }: ShootPageProps): Promise<Metadata> {
  const { tenantSlug, bookingId } = await params;
  const booking = await db.clientBooking.findFirst({
    where: { id: bookingId, tenant: { slug: tenantSlug } },
    select: { trackingCode: true, clientName: true, tenant: { select: { name: true } } },
  });
  return {
    title: booking
      ? `Shoot #${booking.trackingCode} · ${booking.clientName} | ${booking.tenant.name} Schedule`
      : "Shoot Details",
  };
}

export default async function AdminShootDetailPage({ params }: ShootPageProps) {
  const { tenantSlug, bookingId } = await params;

  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer) return <NoAccess tenantSlug={tenantSlug} />;

  const tenant = await db.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      brandColor: true,
      currency: true,
      discipline: true,
      bio: true,
      tagline: true,
    },
  });
  if (!tenant) notFound();

  // Load the booking and verify the viewer is assigned to it or is an admin/owner
  const booking = await db.clientBooking.findFirst({
    where: { id: bookingId, tenantId: tenant.id },
    select: {
      id: true,
      trackingCode: true,
      clientName: true,
      clientEmail: true,
      clientPhone: true,
      category: true,
      discipline: true,
      serviceTier: true,
      packageName: true,
      creativeBrief: true,
      status: true,
      targetDate: true,
      depositPaid: true,
      depositAmount: true,
      sessionPrice: true,
      paymentMethod: true,
      slot: { select: { date: true, startTime: true, endTime: true } },
      package: {
        select: {
          id: true,
          name: true,
          description: true,
          deliverables: true,
          turnaround: true,
          price: true,
          depositPrice: true,
        },
      },
      includedPrints: {
        select: {
          id: true,
          sizeName: true,
          frameName: true,
          quantity: true,
          note: true,
        },
      },
      project: {
        select: {
          id: true,
          projectNumber: true,
          title: true,
          status: true,
          callSheets: {
            orderBy: { shootDate: "asc" },
            take: 1,
            select: {
              id: true,
              title: true,
              shootDate: true,
              generalCallTime: true,
              locationName: true,
              locationAddress: true,
              locationPinUrl: true,
              parkingNotes: true,
              notes: true,
            },
          },
        },
      },
      assignments: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              role: true,
              teamRole: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!booking) notFound();

  // Access check: must be assigned or studio owner or have Bookings VIEW access
  const isAssigned = booking.assignments.some((a) => a.userId === viewer.user.id);
  const canAccess =
    isAssigned ||
    viewer.user.role === "STUDIO_OWNER" ||
    levelAtLeast(viewer.access.areas.bookings, "VIEW");

  if (!canAccess) return <NoAccess tenantSlug={tenantSlug} />;

  const accentColor = tenant.brandColor || "#f59e0b";
  const money = (val: number) => formatMoney(tenant.currency, val);

  const locationName = booking.project?.callSheets?.[0]?.locationName || tenant.name;
  const locationAddress = booking.project?.callSheets?.[0]?.locationAddress || tenant.bio || "In-Studio Session";
  const locationMapUrl =
    booking.project?.callSheets?.[0]?.locationPinUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${locationName} ${locationAddress}`)}`;

  const digits = booking.clientPhone.replace(/\D/g, "");

  const sessionPrice = booking.sessionPrice ?? booking.package?.price ?? 0;
  const depositAmount = booking.depositAmount;

  return (
    <PageShell width="detail" className="space-y-6">
      <AdminBreadcrumb
        items={[
          { label: "Production" },
          { label: "My schedule", href: studioPath(tenant.slug, "/admin/schedule") },
          { label: `Shoot #${booking.trackingCode}` },
        ]}
      />

      {/* Main Container */}
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href={studioPath(tenant.slug, "/admin/schedule")}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to My Schedule</span>
        </Link>

        {/* Hero Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#121215] border border-zinc-800 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `${accentColor}20`,
                    color: accentColor,
                    border: `1px solid ${accentColor}40`,
                  }}
                >
                  {booking.category.replace(/_/g, " ")}
                </span>

                <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
                  #{booking.trackingCode}
                </span>

                {booking.packageName && (
                  <span className="text-xs font-mono text-zinc-400 border border-zinc-800/60 px-2 py-0.5 rounded bg-zinc-900/40">
                    {booking.packageName}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {booking.packageName ? `${booking.packageName} Shoot Details` : `${booking.category} Shoot`}
              </h1>

              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                <span>Client: <strong className="text-white">{booking.clientName}</strong></span>
                <span>·</span>
                <span>Discipline: <strong className="text-white">{booking.discipline}</strong></span>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2 flex-shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-mono font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="size-3.5" />
                <span>{booking.status}</span>
              </span>

              <span
                className={cn(
                  "text-[11px] font-mono px-2 py-0.5 rounded border uppercase",
                  booking.depositPaid
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                )}
              >
                Deposit: {booking.depositPaid ? `Paid (${money(depositAmount)})` : "Unpaid"}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Session Schedule & Location */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
                <CalendarClock className="size-4 text-amber-400" />
                <h2>Appointment & Location</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">Session Date & Time</span>
                  <p className="text-base font-bold text-white font-mono">
                    {booking.slot ? `${booking.slot.startTime} – ${booking.slot.endTime}` : "Time to be confirmed"}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {booking.slot ? formatDay(booking.slot.date) : "Date TBD"}
                  </p>
                  {booking.project?.callSheets?.[0]?.generalCallTime && (
                    <p className="text-xs font-mono text-amber-400 font-bold pt-1">
                      ⏰ Crew Call Time: {booking.project.callSheets[0].generalCallTime}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-zinc-400 block">Venue / Location</span>
                    <a href={locationMapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-amber-400 hover:underline inline-flex items-center gap-1">
                      <span>Maps</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                  <p className="text-sm font-bold text-white line-clamp-1">{locationName}</p>
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{locationAddress}</p>
                  {booking.project?.callSheets?.[0]?.parkingNotes && (
                    <p className="text-[11px] font-mono text-zinc-400 pt-0.5">
                      🚗 {booking.project.callSheets[0].parkingNotes}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Package Scope & Deliverables */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
                <PackageIcon className="size-4 text-amber-400" />
                <h2>Package Scope & Deliverables Promised</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">Deliverables Expected</span>
                  <p className="font-semibold text-zinc-200">
                    {booking.package?.deliverables || "Standard digital softcopy"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1">
                  <span className="text-[11px] font-mono uppercase text-zinc-400 block">Turnaround Time</span>
                  <p className="font-semibold text-zinc-200">
                    {booking.package?.turnaround || "5–7 business days"}
                  </p>
                </div>
              </div>

              {booking.package?.description && (
                <div className="text-xs text-zinc-300 bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/60 leading-relaxed">
                  <strong className="text-white block mb-0.5">Scope:</strong>
                  {booking.package.description}
                </div>
              )}
            </div>

            {/* Client Notes & Creative Brief */}
            {booking.creativeBrief && (
              <div className="p-5 sm:p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <span className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wider block">
                  Client Requests & Creative Brief
                </span>
                <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap italic">
                  &ldquo;{booking.creativeBrief}&rdquo;
                </p>
              </div>
            )}

            {/* Included Prints (if any) */}
            {booking.includedPrints.length > 0 && (
              <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-2">
                  <Layers className="size-4 text-amber-400" />
                  <h2>Included Prints Promised ({booking.includedPrints.length})</h2>
                </div>
                <div className="space-y-2">
                  {booking.includedPrints.map((p) => (
                    <div key={p.id} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-white">{p.quantity}x {p.sizeName}</span>
                        <span className="text-zinc-400 ml-2">Frame: {p.frameName}</span>
                      </div>
                      {p.note && <span className="text-[11px] font-mono text-zinc-400">{p.note}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (1 Col) */}
          <div className="space-y-6">
            {/* Client Contact Box */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-3">
                <User className="size-4 text-amber-400" />
                <h2>Client Contact</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-base font-bold text-white">{booking.clientName}</p>
                  <p className="text-xs font-mono text-zinc-400">{booking.clientPhone}</p>
                  <p className="text-xs text-zinc-400">{booking.clientEmail}</p>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {digits && (
                    <>
                      <a
                        href={`tel:${booking.clientPhone.replace(/[^\d+]/g, "")}`}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-center text-xs font-mono flex items-center gap-1.5")}
                      >
                        <Phone className="size-3.5 text-emerald-400" />
                        <span>Call Client</span>
                      </a>

                      <a
                        href={`https://wa.me/${digits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-center text-xs font-mono flex items-center gap-1.5")}
                      >
                        <MessageCircle className="size-3.5 text-emerald-400" />
                        <span>Chat via WhatsApp</span>
                      </a>
                    </>
                  )}

                  {booking.clientEmail && (
                    <a
                      href={`mailto:${booking.clientEmail}`}
                      className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-center text-xs font-mono flex items-center gap-1.5")}
                    >
                      <Mail className="size-3.5 text-blue-400" />
                      <span>Send Email</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Assigned Photographers & Crew */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-2">
                <Camera className="size-4 text-amber-400" />
                <h2>Assigned Crew</h2>
              </div>

              <div className="space-y-2">
                {booking.assignments.map((a) => (
                  <div key={a.userId} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs font-mono">
                    <span className="font-semibold text-white">{a.user.name}</span>
                    <span className="text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                      {a.user.teamRole?.name || (a.user.role === "STUDIO_OWNER" ? "Studio Owner" : "Photographer")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Production Project & Actions */}
            {booking.project && (
              <div className="p-5 sm:p-6 rounded-2xl bg-[#121215] border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-zinc-800/80 pb-2">
                  <Images className="size-4 text-amber-400" />
                  <h2>Production & Gallery</h2>
                </div>

                <div className="text-xs space-y-1">
                  <span className="text-zinc-400 font-mono block">Project #{booking.project.projectNumber}</span>
                  <p className="font-semibold text-white">{booking.project.title}</p>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 inline-block uppercase">
                    Status: {booking.project.status}
                  </span>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href={studioPath(tenant.slug, `/admin/projects/${booking.project.id}`)}
                    className={cn(buttonVariants({ size: "sm" }), "w-full justify-center text-xs font-mono font-bold")}
                    style={{ backgroundColor: accentColor, color: "#000" }}
                  >
                    <Images className="size-3.5" />
                    <span>Upload & Manage Deliverables</span>
                  </Link>

                  <Link
                    href={studioPath(tenant.slug, `/vault/${booking.project.id}`)}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-center text-xs font-mono")}
                  >
                    <Eye className="size-3.5" />
                    <span>Preview Client Vault</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
