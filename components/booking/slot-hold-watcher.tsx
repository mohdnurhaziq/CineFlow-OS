"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { SLOT_HOLD_NUDGE_SECONDS } from "@/lib/bookings/hold";

interface SlotHoldWatcherProps {
  heldUntil: string | Date;
  onExpired: () => void;
}

/**
 * Watches the selected slot's reservation without showing a clock. The time limit is how the
 * calendar avoids clashing bookings; it is not something clients need to think about. They only
 * see a short nudge near the end, and `onExpired` tells the page when the time has run out.
 */
export function SlotHoldWatcher({ heldUntil, onExpired }: SlotHoldWatcherProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() =>
    Math.max(0, Math.floor((new Date(heldUntil).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(heldUntil).getTime() - Date.now()) / 1000));
      setSecondsRemaining(diff);
      if (diff <= 0) onExpired();
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [heldUntil, onExpired]);

  if (secondsRemaining <= 0 || secondsRemaining >= SLOT_HOLD_NUDGE_SECONDS) return null;

  return (
    <div
      role="status"
      className="px-3 py-2 rounded-lg border bg-amber-500/10 border-amber-500/60 text-amber-300 flex items-center gap-2 text-xs"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span>Please continue soon to keep this time.</span>
    </div>
  );
}
