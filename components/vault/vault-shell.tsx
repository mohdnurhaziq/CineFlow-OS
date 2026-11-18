"use client";

import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import {
  Film,
  Download,
  Lock,
  CheckCircle2,
  User,
  ArrowLeft,
  Heart,
} from "lucide-react";
import { PaywallBanner } from "./paywall-banner";
import { PhotoGrid, type PhotoItem } from "./photo-grid";
import { VideoPlayerCard, type VideoItem } from "./video-player-card";
import { disciplineLabel } from "@/lib/labels";

interface VaultShellProps {
  /** Where "back" goes: the client's galleries, or the project page for the studio's team. */
  back: { href: string; label: string };
  tenant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    brandColor?: string | null;
  };
  project: {
    id: string;
    projectNumber: string;
    title: string;
    category: string;
    discipline: string;
    isFinalBalancePaid: boolean;
    /** Full-resolution files available: balance paid, or the studio releases them before payment. */
    filesReleased: boolean;
    budget: number;
    client: {
      name: string;
      email: string;
    };
    studioLead: {
      name: string;
      email: string;
    };
  };
  finalInvoice?: {
    id: string;
    invoiceNumber: string;
    amount: number;
    status: string;
  } | null;
  photoItems: PhotoItem[];
  videoItems: VideoItem[];
  /**
   * Show the balance and paid status: the client, or the team with Invoices VIEW. Without it the
   * page gets no budget or balance invoice and shows only whether the files are released.
   */
  money: boolean;
  /** May favourite photos and leave retouch notes: the client, or the team who may work on this gallery. */
  canMarkUp: boolean;
  /** Extra gallery sections (framed prints), shown after the download bar. */
  children?: React.ReactNode;
}

export function VaultShell({
  back,
  tenant,
  project,
  finalInvoice,
  photoItems,
  videoItems,
  money,
  canMarkUp,
  children,
}: VaultShellProps) {
  const balanceAmount = finalInvoice?.amount ?? project.budget * 0.5;
  const isPaid = project.isFinalBalancePaid;
  const released = project.filesReleased;

  const totalPhotos = photoItems.length;
  const favoriteCount = photoItems.filter((i) => i.isClientFav).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Hero Header */}
      <div className="space-y-4 pb-6 border-b border-zinc-800">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>{back.label}</span>
          </Link>

          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            YOUR GALLERY
          </span>
        </div>

        {/* Title & Status Strip */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-amber-400 font-bold">
                #{project.projectNumber}
              </span>
              <span className="text-zinc-600">•</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                {disciplineLabel(project.discipline)}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                {project.category}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {project.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-sans pt-1">
              <div className="flex items-center gap-1.5">
                <User className="size-3.5 text-zinc-500" />
                <span>Client: <strong className="text-white">{project.client.name}</strong></span>
              </div>
              <span>•</span>
              <div>
                <span>Studio contact: <strong className="text-white">{project.studioLead.name}</strong></span>
              </div>
            </div>
          </div>

          {/* Dual-Tier Payment Status Badge (without money: only whether the files are released) */}
          <div className="shrink-0">
            {!money ? (
              <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700 flex items-center gap-2.5">
                {released ? <CheckCircle2 className="size-5 text-emerald-400" /> : <Lock className="size-5 text-zinc-400" />}
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold block">
                    {released ? "FILES RELEASED" : "PREVIEWS ONLY"}
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {released ? "Full-resolution files unlocked" : "Watermarked until released"}
                  </span>
                </div>
              </div>
            ) : isPaid ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-emerald-400" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                    PAID IN FULL
                  </span>
                  <span className="text-xs font-semibold text-white">
                    Master Deliverables Unlocked
                  </span>
                </div>
              </div>
            ) : released ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-emerald-400" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                    BALANCE DUE
                  </span>
                  <span className="text-xs font-semibold text-white">
                    Full-resolution photos ready
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5">
                <Lock className="size-5 text-amber-400" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                    DOWNLOADS LOCKED
                  </span>
                  <span className="text-xs font-semibold text-white">
                    Balance still to pay
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Paywall Banner (Rendered when isFinalBalancePaid is false) */}
      {money && !isPaid && (
        <PaywallBanner
          tenantSlug={tenant.slug}
          projectId={project.id}
          invoiceId={finalInvoice?.id}
          balanceAmount={balanceAmount}
          currency={tenant.currency}
          filesReleased={released}
        />
      )}

      {/* 3. Top Master Download Actions Bar */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Download Photo ZIP */}
          {photoItems.length > 0 && (
            released ? (
              <a
                href={`/api/download?projectId=${project.id}&type=photo_zip`}
                download
                className={buttonVariants({ size: "lg" })}
              >
                <Download className="size-4" />
                <span>Download All Photos (ZIP)</span>
              </a>
            ) : (
              <button
                disabled
                className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-xs flex items-center gap-2 cursor-not-allowed opacity-60"
                title="Pay the balance to download all photos"
              >
                <Lock className="size-4 text-zinc-500" />
                <span>Download all photos (locked)</span>
              </button>
            )
          )}

          {/* Download 4K Master Video */}
          {videoItems.length > 0 && (
            released ? (
              <a
                href={`/api/download?projectId=${project.id}&type=video_master`}
                download
                className={buttonVariants({ variant: "secondary" })}
              >
                <Film className="size-4 text-amber-400" />
                <span>Download full-quality video</span>
              </a>
            ) : (
              <button
                disabled
                className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-xs flex items-center gap-2 cursor-not-allowed opacity-60"
                title="Pay the balance to download the full-quality video"
              >
                <Lock className="size-4 text-zinc-500" />
                <span>Download video (locked)</span>
              </button>
            )
          )}
        </div>

        {/* Favorites count indicator */}
        {photoItems.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Heart className="size-3.5 fill-red-500 text-red-500" />
            <span>
              Favorites: <strong className="text-white">{favoriteCount}</strong> / {totalPhotos}
            </span>
          </div>
        )}
      </div>

      {children}

      {/* 4. Cinematic Video Player Section */}
      {videoItems.length > 0 && (
        <VideoPlayerCard
          items={videoItems}
          projectId={project.id}
          filesReleased={released}
          canMarkUp={canMarkUp}
        />
      )}

      {/* 5. Photo Proofing Grid */}
      {photoItems.length > 0 && (
        <PhotoGrid
          items={photoItems}
          projectId={project.id}
          filesReleased={released}
          canMarkUp={canMarkUp}
        />
      )}
    </div>
  );
}
