"use client";

import Link from "next/link";
import {
  Film,
  Download,
  Lock,
  CheckCircle2,
  Calendar,
  User,
  Shield,
  ArrowLeft,
  Sparkles,
  Heart,
} from "lucide-react";
import { PaywallBanner } from "./paywall-banner";
import { PhotoGrid, type PhotoItem } from "./photo-grid";
import { VideoPlayerCard, type VideoItem } from "./video-player-card";

interface VaultShellProps {
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
}

export function VaultShell({
  tenant,
  project,
  finalInvoice,
  photoItems,
  videoItems,
}: VaultShellProps) {
  const currencySymbol = tenant.currency === "MYR" ? "RM " : "$";
  const balanceAmount = finalInvoice?.amount ?? project.budget * 0.5;
  const isPaid = project.isFinalBalancePaid;

  const totalPhotos = photoItems.length;
  const favoriteCount = photoItems.filter((i) => i.isClientFav).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Hero Header */}
      <div className="space-y-4 pb-6 border-b border-zinc-800">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href={`/${tenant.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to {tenant.name} Showcase</span>
          </Link>

          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            CINEMATIC DELIVERABLES VAULT
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
                {project.discipline}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                {project.category}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {project.title}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-sans pt-1">
              <div className="flex items-center gap-1.5">
                <User className="size-3.5 text-zinc-500" />
                <span>Client: <strong className="text-white">{project.client.name}</strong></span>
              </div>
              <span>•</span>
              <div>
                <span>Studio Lead: <strong className="text-white">{project.studioLead.name}</strong></span>
              </div>
            </div>
          </div>

          {/* Dual-Tier Payment Status Badge */}
          <div className="shrink-0">
            {isPaid ? (
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
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5">
                <Lock className="size-5 text-amber-400" />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                    PAYWALL ACTIVE
                  </span>
                  <span className="text-xs font-semibold text-white">
                    50% Balance Milestone Due
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Paywall Banner (Rendered when isFinalBalancePaid is false) */}
      {!isPaid && (
        <PaywallBanner
          tenantSlug={tenant.slug}
          projectId={project.id}
          invoiceId={finalInvoice?.id}
          balanceAmount={balanceAmount}
          currency={tenant.currency}
        />
      )}

      {/* 3. Top Master Download Actions Bar */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-[#121215] flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Download Photo ZIP */}
          {photoItems.length > 0 && (
            isPaid ? (
              <a
                href={`/api/download?projectId=${project.id}&type=photo_zip`}
                download
                className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Download className="size-4" />
                <span>Download All Photos (ZIP)</span>
              </a>
            ) : (
              <button
                disabled
                className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-xs flex items-center gap-2 cursor-not-allowed opacity-60"
                title="Settle 50% balance to unlock high-res photo ZIP"
              >
                <Lock className="size-4 text-zinc-500" />
                <span>Download All Photos (ZIP Locked)</span>
              </button>
            )
          )}

          {/* Download 4K Master Video */}
          {videoItems.length > 0 && (
            isPaid ? (
              <a
                href={`/api/download?projectId=${project.id}&type=video_master`}
                download
                className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-mono text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Film className="size-4 text-amber-400" />
                <span>Download 4K ProRes Master</span>
              </a>
            ) : (
              <button
                disabled
                className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono text-xs flex items-center gap-2 cursor-not-allowed opacity-60"
                title="Settle 50% balance to unlock 4K ProRes video master"
              >
                <Lock className="size-4 text-zinc-500" />
                <span>Download 4K Master (Locked)</span>
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

      {/* 4. Cinematic Video Player Section */}
      {videoItems.length > 0 && (
        <VideoPlayerCard
          items={videoItems}
          projectId={project.id}
          isFinalBalancePaid={isPaid}
        />
      )}

      {/* 5. Photo Proofing Grid */}
      {photoItems.length > 0 && (
        <PhotoGrid
          items={photoItems}
          projectId={project.id}
          isFinalBalancePaid={isPaid}
        />
      )}
    </div>
  );
}
