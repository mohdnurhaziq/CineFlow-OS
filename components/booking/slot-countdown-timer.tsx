"use client";

import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface SlotCountdownTimerProps {
  heldUntil: string | Date;
  onExpired: () => void;
  brandColor?: string | null;
}

export function SlotCountdownTimer({
  heldUntil,
  onExpired,
  brandColor,
}: SlotCountdownTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const target = new Date(heldUntil).getTime();
    const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    const updateCountdown = () => {
      const target = new Date(heldUntil).getTime();
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        onExpired();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [heldUntil, onExpired]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const isUrgent = secondsRemaining < 120 && secondsRemaining > 0;
  const isCritical = secondsRemaining < 30 && secondsRemaining > 0;

  // Percentage of 10 minutes (600s)
  const percentage = Math.min(100, Math.max(0, (secondsRemaining / 600) * 100));

  return (
    <div
      className={`px-3 py-2 rounded-lg border flex flex-col justify-center transition-all ${
        isCritical
          ? "bg-red-500/10 border-red-500/80 animate-pulse text-red-300"
          : isUrgent
          ? "bg-amber-500/10 border-amber-500/80 animate-pulse text-amber-300"
          : "bg-[#18181b] border-zinc-700 text-amber-400"
      }`}
    >
      <div className="flex items-center gap-2">
        {isUrgent ? (
          <AlertTriangle className="size-4 shrink-0 text-amber-400 animate-bounce" />
        ) : (
          <Clock className="size-4 shrink-0 text-zinc-400" />
        )}

        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 hidden sm:inline">
            {isUrgent ? "Hold Expiring:" : "Slot Lock:"}
          </span>
          <span className="font-mono text-base sm:text-lg font-black tracking-wider tabular-nums">
            {formattedTime}
          </span>
        </div>
      </div>

      {/* Mini Progress Rail */}
      <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-1.5">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            isCritical ? "bg-red-500" : isUrgent ? "bg-amber-500" : "bg-amber-400"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
