"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CalendarDays, ExternalLink, Film, ImagePlus, Layers, Loader2, Receipt, Trash2, Upload, Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  createCallSheet,
  deleteCallSheet,
  deleteDeliverableItem,
  cancelEquipmentReservation,
  notifyClientPhotosReady,
  updateProjectKind,
  updateProjectStatus,
} from "@/lib/actions/admin-projects";
import { createEquipmentReservation } from "@/lib/actions/gear";
import { PROJECT_STAGES, PROJECT_STAGE_LABELS } from "@/lib/projects/constants";
import { formatMoney } from "@/lib/money";
import { invoiceStatusLabel, milestoneLabel, reservationStatusLabel } from "@/lib/labels";
import { formatSlotDate } from "@/lib/slot-time";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ShotListHud, type ShotItemData } from "@/components/logistics/shot-list-hud";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

interface ProjectWorkspaceProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  gear: Array<{ id: string; name: string; sku: string }>;
  project: {
    id: string;
    title: string;
    projectNumber: string;
    status: string;
    /** SESSION: files + payments only. PRODUCTION: also shoot days, shot list and gear. */
    kind: string;
    budget: number;
    isFinalBalancePaid: boolean;
    /** Full-resolution files open to the client: paid, or the studio releases them before payment. */
    filesReleased: boolean;
    client: { name: string; email: string; phone: string | null };
    callSheets: Array<{ id: string; title: string; shootDate: string; generalCallTime: string; locationName: string }>;
    reservations: Array<{ id: string; itemName: string; sku: string; startDate: string; endDate: string; status: string }>;
    galleries: Array<{
      id: string;
      title: string;
      items: Array<{
        id: string;
        title: string;
        itemType: string;
        previewUrl: string;
        fileSize: string | null;
        isClientFav?: boolean;
        clientNotes?: string | null;
      }>;
    }>;
    invoices: Array<{ id: string; invoiceNumber: string; milestoneType: string; amount: number; status: string }>;
    shotItems: ShotItemData[];
  };
}

const field =
  "w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500";
const small = "text-xs text-zinc-400";
const primary = "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 disabled:opacity-50";
const day = (iso: string) => formatSlotDate(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function Section({
  icon: Icon,
  title,
  children,
  aside,
  id,
}: {
  icon: typeof Film;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Icon className="size-4 text-amber-400" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One project's working page: stage, shoot days, gear, files for the client, and payments. */
export function ProjectWorkspace({ tenantId, tenantSlug, currency, gear, project }: ProjectWorkspaceProps) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ success: boolean; message?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.success) {
        toast.error(res.message ?? "Something went wrong.");
        return;
      }
      toast.success(done);
      after?.();
      router.refresh();
    });

  // ---- Call sheet form
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheet] = useState({ title: "", shootDate: "", generalCallTime: "07:00 AM", locationName: "", locationAddress: "", locationPinUrl: "", notes: "" });
  const [crewText, setCrewText] = useState("");
  const crew = crewText
    .split("\n")
    .map((line) => line.split(",").map((p) => p.trim()))
    .filter((parts) => parts[0])
    .map(([name, role = "", callTime = "", phone = ""]) => ({ name: name!, role, callTime, phone }));

  // ---- Gear form
  const [gearForm, setGearForm] = useState({ itemId: "", startDate: "", endDate: "" });

  // ---- Upload form
  const [kind, setKind] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [gallery, setGallery] = useState(project.galleries[0]?.title ?? "Final selects");
  const [uploading, setUploading] = useState(false);

  const upload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("projectId", project.id);
    form.set("gallery", gallery);
    form.set("kind", kind);
    setUploading(true);
    try {
      const res = await fetch("/api/deliverables", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Upload failed.");
        return;
      }
      toast.success(`${body.created} file${body.created === 1 ? "" : "s"} added.`);
      if (body.skipped?.length) toast.warning(`Skipped: ${body.skipped.join(", ")}`);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  const fileCount = project.galleries.reduce((n, g) => n + g.items.length, 0);
  const isSession = project.kind === "SESSION";

  // ---- Tell the client the gallery is ready (once every batch is uploaded)
  const notifyPhotosReady = async () => {
    const ok = await confirm({
      title: `Tell ${project.client.name} their photos are ready?`,
      message: project.filesReleased
        ? `They'll get an email with a link to download all ${fileCount} file${fileCount === 1 ? "" : "s"}${project.isFinalBalancePaid ? "" : ", and a reminder that the balance is due"}.`
        : `They'll get an email with a link to view the ${fileCount} watermarked preview${fileCount === 1 ? "" : "s"} and pay the balance to unlock full resolution.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    start(async () => {
      const res = await notifyClientPhotosReady({ tenantId, projectId: project.id });
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      const whatsapp = res.whatsappUrl
        ? { action: { label: "Send on WhatsApp", onClick: () => window.open(res.whatsappUrl, "_blank", "noopener") } }
        : {};
      if (res.emailDelivery === "SENT") toast.success(`Emailed ${project.client.email}.`, whatsapp);
      else if (res.emailDelivery === "SKIPPED") toast.warning("Email isn't set up for this studio, so nothing was emailed.", whatsapp);
      else toast.error("The email couldn't be sent. Try again, or message the client on WhatsApp.", whatsapp);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <AdminBreadcrumb
          items={[
            { label: "Production" },
            { label: "Projects", href: `/${tenantSlug}/admin/projects` },
            { label: project.title },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{project.title}</h1>
            <p className="text-xs text-zinc-400 mt-1">
              {project.projectNumber} · {project.client.name} · {project.client.email}
              {project.client.phone ? ` · ${project.client.phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1">
              <span className={small}>Kind</span>
              <select
                value={isSession ? "SESSION" : "PRODUCTION"}
                disabled={pending}
                onChange={(e) =>
                  run(
                    () => updateProjectKind({ tenantId, projectId: project.id, kind: e.target.value as "SESSION" | "PRODUCTION" }),
                    e.target.value === "SESSION" ? "Now a session: planning tools hidden." : "Now a production: planning tools shown."
                  )
                }
                className={field}
              >
                <option value="SESSION">Session</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </label>
          <label className="space-y-1">
            <span className={small}>Stage</span>
            <select
              value={project.status}
              disabled={pending}
              onChange={(e) =>
                run(() => updateProjectStatus({ tenantId, projectId: project.id, status: e.target.value as (typeof PROJECT_STAGES)[number] }), "Stage updated.")
              }
              className={field}
            >
              {PROJECT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>
      </div>

      {/* Planning tools: productions only. A session hides them; nothing is deleted. */}
      {!isSession && (
        <>
      {/* Shoot days */}
      <Section
        icon={CalendarDays}
        title="Shoot days"
        aside={
          !sheetOpen && (
            <button type="button" className={primary} onClick={() => setSheetOpen(true)}>
              Add shoot day
            </button>
          )
        }
      >
        {project.callSheets.length === 0 && !sheetOpen && <p className={small}>No shoot days yet. Add one to share a call sheet with the crew.</p>}
        <ul className="divide-y divide-zinc-800">
          {project.callSheets.map((c) => (
            <li key={c.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="text-white font-medium">{c.title}</div>
                <div className="text-xs text-zinc-400">
                  {day(c.shootDate)} · call {c.generalCallTime} · {c.locationName}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/${tenantSlug}/set-hud/${c.id}`} className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline">
                  Call sheet <ExternalLink className="size-3" />
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete "${c.title}"?`, message: "The call sheet link stops working.", confirmLabel: "Delete" }))) return;
                    run(() => deleteCallSheet({ tenantId, callSheetId: c.id }), "Shoot day deleted.");
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {sheetOpen && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => createCallSheet({ tenantId, projectId: project.id, ...sheet, crew }),
                "Shoot day added.",
                () => {
                  setSheetOpen(false);
                  setSheet({ title: "", shootDate: "", generalCallTime: "07:00 AM", locationName: "", locationAddress: "", locationPinUrl: "", notes: "" });
                  setCrewText("");
                }
              );
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="sm:col-span-3 space-y-1 block">
                <span className={small}>Title</span>
                <input required value={sheet.title} onChange={(e) => setSheet({ ...sheet, title: e.target.value })} placeholder="Day 1: Studio portraits" className={field} />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Date</span>
                <input required type="date" value={sheet.shootDate} onChange={(e) => setSheet({ ...sheet, shootDate: e.target.value })} className={field} />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Crew call time</span>
                <input required value={sheet.generalCallTime} onChange={(e) => setSheet({ ...sheet, generalCallTime: e.target.value })} className={field} />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Location name</span>
                <input required value={sheet.locationName} onChange={(e) => setSheet({ ...sheet, locationName: e.target.value })} className={field} />
              </label>
              <label className="sm:col-span-2 space-y-1 block">
                <span className={small}>Address</span>
                <input required value={sheet.locationAddress} onChange={(e) => setSheet({ ...sheet, locationAddress: e.target.value })} className={field} />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Map link (optional)</span>
                <input type="url" value={sheet.locationPinUrl} onChange={(e) => setSheet({ ...sheet, locationPinUrl: e.target.value })} placeholder="https://maps.google.com/…" className={field} />
              </label>
              <label className="sm:col-span-3 space-y-1 block">
                <span className={small}>Crew, one per line: name, role, call time, phone</span>
                <textarea rows={3} value={crewText} onChange={(e) => setCrewText(e.target.value)} placeholder={"Aina, Photographer, 07:00 AM, +60 12-345 6789"} className={`${field} font-mono text-xs`} />
              </label>
              <label className="sm:col-span-3 space-y-1 block">
                <span className={small}>Notes (optional)</span>
                <textarea rows={2} value={sheet.notes} onChange={(e) => setSheet({ ...sheet, notes: e.target.value })} className={field} />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" className="px-3.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800" onClick={() => setSheetOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={pending} className={primary}>
                {pending && <Loader2 className="size-3.5 animate-spin" />} Save shoot day
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* Visual Shot List HUD & Planning */}
      <ShotListHud
        initialShots={project.shotItems}
        projectId={project.id}
        tenantSlug={tenantSlug}
        allowManage={true}
      />

      {/* Gear */}
      <Section
        icon={Layers}
        title="Gear"
        aside={
          <Link href={`/${tenantSlug}/admin/inventory`} className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline">
            Fleet &amp; Inspections <ExternalLink className="size-3" />
          </Link>
        }
      >
        {project.reservations.length === 0 && <p className={small}>No gear reserved for this project.</p>}
        <ul className="divide-y divide-zinc-800">
          {project.reservations.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="text-white">
                  {r.itemName} <span className="text-[11px] font-mono text-zinc-500">{r.sku}</span>
                </div>
                <div className="text-xs text-zinc-400">
                  {day(r.startDate)} – {day(r.endDate)} · {reservationStatusLabel(r.status)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/${tenantSlug}/admin/inventory`}
                  className="text-xs text-amber-400 hover:underline font-mono text-[11px]"
                >
                  {r.status === "RESERVED" ? "Check-out →" : r.status === "CHECKED_OUT" ? "Check-in return →" : "View audit →"}
                </Link>
                {r.status === "RESERVED" && (
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-red-400"
                    onClick={() => run(() => cancelEquipmentReservation({ tenantId, reservationId: r.id }), "Gear released.")}
                  >
                    Release
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createEquipmentReservation({
                  tenantId,
                  tenantSlug,
                  projectId: project.id,
                  itemId: gearForm.itemId,
                  startDate: new Date(`${gearForm.startDate}T00:00:00.000Z`).toISOString(),
                  endDate: new Date(`${gearForm.endDate}T23:59:00.000Z`).toISOString(),
                }) as Promise<{ success: boolean; message?: string }>,
              "Gear reserved.",
              () => setGearForm({ itemId: "", startDate: "", endDate: "" })
            );
          }}
        >
          <label className="sm:col-span-2 space-y-1 block">
            <span className={small}>Reserve</span>
            <select required value={gearForm.itemId} onChange={(e) => setGearForm({ ...gearForm, itemId: e.target.value })} className={field}>
              <option value="">Choose an item…</option>
              {gear.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.sku})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 block">
            <span className={small}>From</span>
            <input required type="date" value={gearForm.startDate} onChange={(e) => setGearForm({ ...gearForm, startDate: e.target.value })} className={field} />
          </label>
          <label className="space-y-1 block">
            <span className={small}>To</span>
            <input required type="date" min={gearForm.startDate || undefined} value={gearForm.endDate} onChange={(e) => setGearForm({ ...gearForm, endDate: e.target.value })} className={field} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" disabled={pending} className={primary}>
              Reserve gear
            </button>
          </div>
        </form>
      </Section>
        </>
      )}

      {/* Files for the client */}
      <Section
        id="files"
        icon={ImagePlus}
        title={`Files for the client (${fileCount})`}
        aside={
          <div className="flex items-center gap-3">
            <Link href={`/${tenantSlug}/vault/${project.id}`} className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline">
              Client view <ExternalLink className="size-3" />
            </Link>
            <button
              type="button"
              onClick={notifyPhotosReady}
              disabled={pending || fileCount === 0}
              title={fileCount === 0 ? "Upload the photos first" : "Send once every batch is uploaded"}
              className={primary}
            >
              <BellRing className="size-3.5" /> Notify client: photos ready
            </button>
          </div>
        }
      >
        <p className={small}>
          {project.isFinalBalancePaid
            ? "Balance paid: the client can download the full-resolution files."
            : project.filesReleased
              ? "Your studio releases photos before payment: the client can download the full-resolution files now, and the balance stays due."
              : "The client sees watermarked previews until the balance is paid. You can change this in Settings → Photo delivery."}
        </p>
        {project.galleries.map((g) => (
          <div key={g.id} className="space-y-2">
            <div className="text-xs font-semibold text-zinc-300">{g.title}</div>
            {g.items.length === 0 ? (
              <p className={small}>Empty.</p>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {g.items.map((i) => (
                  <li key={i.id} className="relative rounded-lg border border-zinc-800 overflow-hidden bg-black">
                    {/* Floating Client Badges */}
                    {i.isClientFav && (
                      <span className="absolute top-1.5 left-1.5 z-10 p-1 rounded-md bg-black/70 border border-red-500/30 text-red-400" title="Client Favorite Select">
                        <Heart className="size-3 fill-red-500 text-red-500" />
                      </span>
                    )}
                    {i.clientNotes && (
                      <span className="absolute top-1.5 right-8 z-10 p-1 rounded-md bg-black/70 border border-amber-500/30 text-amber-300" title={`Client Retouch Note: ${i.clientNotes}`}>
                        <MessageSquare className="size-3" />
                      </span>
                    )}

                    {i.itemType === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.previewUrl} alt={i.title} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="aspect-[4/3] flex items-center justify-center text-zinc-500">
                        <Film className="size-6" />
                      </div>
                    )}
                    <div className="p-1.5 flex items-center justify-between gap-1">
                      <span className="text-[11px] text-zinc-300 truncate">{i.title}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${i.title}`}
                        className="p-1 rounded text-zinc-400 hover:text-red-400"
                        onClick={async () => {
                          if (!(await confirm({ title: `Remove "${i.title}"?`, message: "The client will no longer see it.", confirmLabel: "Remove" }))) return;
                          run(() => deleteDeliverableItem({ tenantId, itemId: i.id }), "File removed.");
                        }}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    {i.clientNotes && (
                      <div className="px-1.5 pb-1.5 text-[10px] text-amber-300 font-mono truncate" title={i.clientNotes}>
                        Note: {i.clientNotes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <form onSubmit={upload} className="space-y-3 rounded-xl border border-zinc-800 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="space-y-1 block">
              <span className={small}>Gallery</span>
              <input value={gallery} onChange={(e) => setGallery(e.target.value)} list="project-galleries" className={field} />
              <datalist id="project-galleries">
                {project.galleries.map((g) => (
                  <option key={g.id} value={g.title} />
                ))}
              </datalist>
            </label>
            <div className="flex gap-2 text-xs" role="group" aria-label="File type">
              {(["PHOTO", "VIDEO"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`px-3 py-2 rounded-lg border ${kind === k ? "border-amber-500 text-amber-300 bg-amber-500/10" : "border-zinc-700 text-zinc-300"}`}
                >
                  {k === "PHOTO" ? "Photos" : "Video"}
                </button>
              ))}
            </div>
          </div>
          {kind === "PHOTO" ? (
            <label className="space-y-1 block">
              <span className={small}>Photos (JPG, PNG, WebP or TIFF, up to 50 MB each)</span>
              <input name="files" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/tiff" className="block text-xs text-zinc-300" />
            </label>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1 block">
                <span className={small}>Title</span>
                <input name="title" placeholder="Highlight film" className={field} />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Review copy (clients stream this)</span>
                <input name="review" type="file" required accept="video/mp4,video/quicktime" className="block text-xs text-zinc-300" />
              </label>
              <label className="space-y-1 block">
                <span className={small}>Master (released when paid)</span>
                <input name="master" type="file" required accept="video/mp4,video/quicktime" className="block text-xs text-zinc-300" />
              </label>
            </div>
          )}
          <button type="submit" disabled={uploading} className={primary}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </Section>

      {/* Payments */}
      <Section icon={Receipt} title="Payments">
        <p className={small}>Budget {formatMoney(currency, project.budget)}</p>
        {project.invoices.length === 0 ? (
          <p className={small}>No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {project.invoices.map((inv) => (
              <li key={inv.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <Link href={`/${tenantSlug}/admin/invoices/${inv.id}`} className="font-mono text-amber-400 hover:underline">
                  {inv.invoiceNumber}
                </Link>
                <span className="text-xs text-zinc-400">{milestoneLabel(inv.milestoneType)}</span>
                <span className="font-mono text-zinc-200">{formatMoney(currency, inv.amount)}</span>
                <span className="text-xs text-zinc-300">{invoiceStatusLabel(inv.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {confirmDialog}
    </div>
  );
}
