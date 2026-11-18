"use client";

import { buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import { Film, Download, Lock, MessageSquare } from "lucide-react";
import { RetouchNotesModal } from "./retouch-notes-modal";

export interface VideoItem {
  id: string;
  itemType: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  thumbnailUrl?: string | null;
  resolution?: string | null;
  duration?: string | null;
  fileSize?: string | null;
  clientNotes?: string | null;
}

interface VideoPlayerCardProps {
  items: VideoItem[];
  projectId: string;
  filesReleased: boolean;
  /** Revision notes: the client, or the team who may work on this gallery. */
  canMarkUp: boolean;
}

export function VideoPlayerCard({ items, projectId, filesReleased, canMarkUp }: VideoPlayerCardProps) {
  const [retouchTarget, setRetouchTarget] = useState<VideoItem | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-zinc-800">
        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block">
          VIDEOS
        </span>
        <h3 className="text-xl font-bold text-white tracking-tight">
          Your videos
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {items.map((video) => (
          <div
            key={video.id}
            className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-xl"
          >
            {/* HTML5 Video Player Container */}
            <div className="aspect-video bg-black relative">
              <video
                controls
                playsInline
                poster={video.thumbnailUrl || undefined}
                src={video.previewUrl}
                className="w-full h-full object-contain"
              />

              {/* Status Badge in corner */}
              <div className="absolute top-3 left-3 z-10 pointer-events-none">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-lg ${
                    filesReleased
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                  }`}
                >
                  {filesReleased ? "Full quality" : "Preview"}
                </span>
              </div>
            </div>

            {/* Video Metadata & Actions Bar */}
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141418]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Film className="size-4 text-amber-400" />
                  <h4 className="text-base font-bold text-white">{video.title}</h4>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-zinc-400">
                  {video.duration && <span>Duration: {video.duration}</span>}
                  {video.resolution && (
                    <>
                      <span>•</span>
                      <span>Full file: {video.resolution}</span>
                    </>
                  )}
                  {video.fileSize && (
                    <>
                      <span>•</span>
                      <span>File Size: {video.fileSize}</span>
                    </>
                  )}
                </div>

                {video.clientNotes && (
                  <div className="mt-2 text-[11px] text-amber-300 font-sans bg-amber-500/10 p-2 rounded border border-amber-500/20">
                    <span className="font-mono text-[9px] uppercase font-bold text-amber-400 block">
                      Your note:
                    </span>
                    {video.clientNotes}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5 shrink-0">
                {/* Retouch button */}
                {canMarkUp && (
                  <button
                    type="button"
                    onClick={() => setRetouchTarget(video)}
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    <MessageSquare className="size-4 text-amber-400" />
                    <span>Add a note</span>
                  </button>
                )}

                {/* Master Download Button */}
                {filesReleased ? (
                  <a
                    href={`/api/download?projectId=${projectId}&assetId=${video.id}&type=video_master`}
                    download
                    className={buttonVariants({ size: "lg" })}
                  >
                    <Download className="size-4" />
                    <span>Download full-quality video</span>
                  </a>
                ) : (
                  <button
                    disabled
                    className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs font-mono flex items-center gap-2 cursor-not-allowed opacity-60"
                    title="Pay the balance to download"
                  >
                    <Lock className="size-4" />
                    <span>Download locked{video.fileSize ? ` (${video.fileSize})` : ""}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Retouch Modal */}
      {canMarkUp && retouchTarget && (
        <RetouchNotesModal
          isOpen={true}
          onClose={() => setRetouchTarget(null)}
          itemId={retouchTarget.id}
          itemTitle={retouchTarget.title}
          initialNote={retouchTarget.clientNotes}
          thumbnailUrl={retouchTarget.thumbnailUrl}
        />
      )}
    </div>
  );
}
