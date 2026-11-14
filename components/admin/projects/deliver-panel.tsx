"use client";

import { BellRing, Heart, MessageSquare } from "lucide-react";

interface DeliverItem {
  id: string;
  title: string;
  itemType: string;
  isClientFav?: boolean;
  clientNotes?: string | null;
}

/**
 * The last step on the page: what the client will get, what they've said so far, and the button
 * that tells them their photos are ready.
 */
export function DeliverPanel({
  clientName,
  items,
  filesReleased,
  isFinalBalancePaid,
  status,
  pending,
  onNotify,
}: {
  clientName: string;
  items: DeliverItem[];
  filesReleased: boolean;
  isFinalBalancePaid: boolean;
  status: string;
  pending: boolean;
  onNotify: () => void;
}) {
  const firstName = clientName.split(/\s+/)[0] || clientName;
  const photos = items.filter((i) => i.itemType === "PHOTO").length;
  const videos = items.length - photos;
  const favourites = items.filter((i) => i.isClientFav).length;
  const notes = items.filter((i) => i.clientNotes);
  const sent = status === "IN_REVIEW" || status === "DELIVERED";
  const what = [photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "", videos ? `${videos} video${videos === 1 ? "" : "s"}` : ""]
    .filter(Boolean)
    .join(" and ");
  const gets = filesReleased
    ? isFinalBalancePaid
      ? "full-resolution downloads"
      : "full-resolution downloads now, with the balance still due"
    : "watermarked previews until the balance is paid";

  return (
    <div className="rounded-xl bg-zinc-900/60 p-5 space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">Upload the photos above. Then tell {firstName} they&apos;re ready from here.</p>
      ) : (
        <>
          <div>
            <h3 className="text-base font-semibold text-white">Ready to send?</h3>
            <p className="text-sm text-zinc-300 mt-1">
              {what} uploaded. {firstName} will get {gets}.
            </p>
          </div>

          {(favourites > 0 || notes.length > 0) && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                {favourites > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Heart className="size-4 fill-red-500 text-red-500" aria-hidden /> {favourites} favourite{favourites === 1 ? "" : "s"}
                  </span>
                )}
                {notes.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare className="size-4 text-amber-300" aria-hidden /> {notes.length} retouch note{notes.length === 1 ? "" : "s"}
                  </span>
                )}
              </p>
              {notes.length > 0 && (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="text-sm rounded-lg bg-[#0d0d10] px-3.5 py-2.5">
                      <span className="text-zinc-400">{n.title}: </span>
                      <span className="text-zinc-100">{n.clientNotes}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNotify}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
            >
              <BellRing className="size-4" /> {sent ? `Notify ${firstName} again` : `Notify ${firstName}: photos ready`}
            </button>
            <span className="text-sm text-zinc-400">{sent ? "Already sent. Send again after adding more photos." : "Send once every photo is uploaded."}</span>
          </div>
        </>
      )}
    </div>
  );
}
