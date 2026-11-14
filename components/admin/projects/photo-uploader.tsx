"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageUp, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/tiff"];
const MAX_PHOTO = 50 * 1024 * 1024;
const PARALLEL = 3;

type Row = { id: string; file: File; state: "queued" | "uploading" | "done" | "failed"; progress: number; error?: string };

/** Sends one photo to /api/deliverables, reporting upload progress (fetch can't). */
function sendPhoto(projectId: string, album: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("gallery", album);
    form.set("kind", "PHOTO");
    form.append("files", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/deliverables");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { created?: number; skipped?: string[]; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.created) resolve();
      else reject(new Error(body.skipped?.[0]?.replace(/^.*\((.*)\)$/, "$1") || body.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  });
}

/**
 * Drop photos (or browse) and each one uploads straight away, three at a time, with its own
 * progress and a retry if it fails. Video, which needs a master and a review copy, is a secondary
 * option below.
 */
export function PhotoUploader({ projectId, albums }: { projectId: string; albums: string[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [album, setAlbum] = useState(albums[0] ?? "Final selects");
  const [editingAlbum, setEditingAlbum] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = async (batch: Row[]) => {
    let next = 0;
    let ok = 0;
    const worker = async () => {
      while (next < batch.length) {
        const row = batch[next++]!;
        update(row.id, { state: "uploading", progress: 0, error: undefined });
        try {
          await sendPhoto(projectId, album, row.file, (progress) => update(row.id, { progress }));
          update(row.id, { state: "done", progress: 100 });
          ok += 1;
        } catch (err) {
          update(row.id, { state: "failed", error: err instanceof Error ? err.message : "Upload failed" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, batch.length) }, worker));
    if (ok) router.refresh();
  };

  const add = (files: FileList | File[]) => {
    const fresh: Row[] = [];
    for (const file of Array.from(files)) {
      if (!PHOTO_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPG, PNG, WebP or TIFF photos.`);
        continue;
      }
      if (file.size > MAX_PHOTO) {
        toast.error(`${file.name} is over 50 MB.`);
        continue;
      }
      fresh.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, state: "queued", progress: 0 });
    }
    if (!fresh.length) return;
    setRows((rs) => [...rs.filter((r) => r.state !== "done"), ...fresh]);
    void run(fresh);
  };

  const active = rows.filter((r) => r.state === "queued" || r.state === "uploading").length;
  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed");

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) add(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 bg-zinc-900/40"
        }`}
      >
        <ImageUp className="size-8 mx-auto text-zinc-400" aria-hidden />
        <p className="mt-3 text-base font-semibold text-white">
          Drop photos here, or{" "}
          <button type="button" onClick={() => inputRef.current?.click()} className="text-amber-400 hover:underline">
            browse
          </button>
        </p>
        <p className="mt-1 text-sm text-zinc-400">JPG, PNG, WebP or TIFF, up to 50 MB each. They upload as soon as you add them.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          aria-label="Choose photos to upload"
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-400">
        {editingAlbum ? (
          <label className="flex items-center gap-2">
            <span>Album</span>
            <input
              autoFocus
              value={album}
              list="project-albums"
              onChange={(e) => setAlbum(e.target.value)}
              onBlur={() => setEditingAlbum(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingAlbum(false)}
              className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500"
            />
            <datalist id="project-albums">
              {albums.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
        ) : (
          <span>
            Album: <span className="text-zinc-200">{album}</span> ·{" "}
            <button type="button" onClick={() => setEditingAlbum(true)} className="text-amber-400 hover:underline">
              Change
            </button>
          </span>
        )}
        <button type="button" onClick={() => setShowVideo((v) => !v)} className="text-amber-400 hover:underline" aria-expanded={showVideo}>
          {showVideo ? "Hide video upload" : "Add a video"}
        </button>
        {rows.length > 0 && (
          <span className="ml-auto" aria-live="polite">
            {active ? `Uploading ${active}… ` : ""}
            {done ? `${done} uploaded` : ""}
            {failed.length ? ` · ${failed.length} failed` : ""}
          </span>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 max-h-64 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate text-zinc-200">{r.file.name}</span>
              {r.state === "uploading" || r.state === "queued" ? (
                <span className="flex items-center gap-2 w-40 shrink-0">
                  <span className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                    <span className="block h-full bg-amber-500 transition-[width]" style={{ width: `${r.progress}%` }} />
                  </span>
                  <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Uploading" />
                </span>
              ) : r.state === "done" ? (
                <Check className="size-4 text-emerald-400 shrink-0" aria-label="Uploaded" />
              ) : (
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-red-300 text-xs">{r.error}</span>
                  <button type="button" onClick={() => void run([r])} className="inline-flex items-center gap-1 text-amber-400 hover:underline">
                    <RotateCcw className="size-3.5" /> Retry
                  </button>
                  <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Dismiss ${r.file.name}`} className="text-zinc-400 hover:text-white">
                    <X className="size-4" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {showVideo && <VideoUpload projectId={projectId} album={album} onDone={() => router.refresh()} />}
    </div>
  );
}

function VideoUpload({ projectId, album, onDone }: { projectId: string; album: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const field = "block w-full text-sm text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-white";

  return (
    <form
      className="rounded-xl border border-zinc-800 p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        form.set("projectId", projectId);
        form.set("gallery", album);
        form.set("kind", "VIDEO");
        setBusy(true);
        try {
          const res = await fetch("/api/deliverables", { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(body.error ?? "Upload failed.");
            return;
          }
          toast.success("Video added.");
          (e.target as HTMLFormElement).reset();
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-zinc-400">A video needs two files: a review copy clients stream, and the master they download once it&apos;s released. MP4 or MOV, up to 200 MB each.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5 block text-sm">
          <span className="text-zinc-200">Title</span>
          <input name="title" placeholder="Highlight film" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500" />
        </label>
        <label className="space-y-1.5 block text-sm">
          <span className="text-zinc-200">Review copy</span>
          <input name="review" type="file" required accept="video/mp4,video/quicktime" className={field} />
        </label>
        <label className="space-y-1.5 block text-sm">
          <span className="text-zinc-200">Master</span>
          <input name="master" type="file" required accept="video/mp4,video/quicktime" className={field} />
        </label>
      </div>
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50">
        {busy && <Loader2 className="size-4 animate-spin" />} Upload video
      </button>
    </form>
  );
}
