"use client";

import { useState, useTransition } from "react";
import { X, MessageSquare, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { submitRetouchNote } from "@/lib/actions/vault";

interface RetouchNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
  itemTitle: string;
  initialNote?: string | null;
  thumbnailUrl?: string | null;
  onNoteSaved?: (newNote: string | null) => void;
}

export function RetouchNotesModal({
  isOpen,
  onClose,
  itemId,
  itemTitle,
  initialNote = "",
  thumbnailUrl,
  onNoteSaved,
}: RetouchNotesModalProps) {
  const [note, setNote] = useState(initialNote || "");
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const res = await submitRetouchNote({
        itemId,
        note,
      });

      if (res.success) {
        toast.success("Retouch feedback saved!");
        if (onNoteSaved) onNoteSaved(res.clientNotes || null);
        onClose();
      } else {
        toast.error(res.error || "Failed to save retouch note.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 max-w-lg w-full rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden shadow-2xl space-y-5">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-[#15151a]">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Retouch Feedback // {itemTitle}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {thumbnailUrl && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="size-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbnailUrl} alt={itemTitle} className="size-full object-cover" />
              </div>
              <div className="overflow-hidden">
                <span className="text-xs font-semibold text-white truncate block">{itemTitle}</span>
                <span className="text-[10px] font-mono text-zinc-400">
                  Targeted production asset feedback
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex justify-between">
              <span>Specific Revision Instructions</span>
              <span className="text-[10px] font-mono text-zinc-500 font-normal">
                {note.length} / 1000 chars
              </span>
            </label>
            <textarea
              rows={4}
              maxLength={1000}
              placeholder="e.g. Please soften skin blemishes, warm the skin tones by +5%, and remove glare on left spectacles..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-700 bg-[#18181b] text-white text-xs focus:outline-none focus:border-amber-500 resize-none font-sans leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save Retouch Feedback
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
