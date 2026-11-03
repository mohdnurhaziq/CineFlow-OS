"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { formatMinutesToTime, parseTimeToMinutes } from "@/lib/utils/time";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const BASE_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

interface Parts {
  hour: number; // 1-12
  minute: number; // 0-59
  meridiem: "AM" | "PM";
}

function toParts(value: string): Parts | null {
  try {
    const total = parseTimeToMinutes(value);
    const h24 = Math.floor(total / 60);
    return {
      hour: h24 % 12 === 0 ? 12 : h24 % 12,
      minute: total % 60,
      meridiem: h24 >= 12 ? "PM" : "AM",
    };
  } catch {
    return null;
  }
}

function fromParts({ hour, minute, meridiem }: Parts): string {
  let h24 = hour % 12;
  if (meridiem === "PM") h24 += 12;
  return formatMinutesToTime(h24 * 60 + minute);
}

interface TimePickerProps {
  /** Time string such as "09:00 AM" (empty or invalid shows the placeholder) */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimePicker({ value, onChange, placeholder = "Select time", className = "" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parts = toParts(value);
  const current: Parts = parts ?? { hour: 9, minute: 0, meridiem: "AM" };

  const minutes =
    parts && !BASE_MINUTES.includes(parts.minute)
      ? [...BASE_MINUTES, parts.minute].sort((a, b) => a - b)
      : BASE_MINUTES;

  const update = (patch: Partial<Parts>) => onChange(fromParts({ ...current, ...patch }));

  const optionClass = (active: boolean) =>
    `w-full py-1.5 rounded-lg text-xs font-mono transition-colors ${
      active ? "bg-amber-500 text-black font-bold" : "text-zinc-300 hover:bg-zinc-800"
    }`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-left focus:outline-none focus:border-amber-500 hover:border-zinc-600 transition-colors ${
            parts ? "text-white" : "text-zinc-500"
          } ${className}`}
        >
          <Clock className="size-4 shrink-0 text-amber-400" />
          <span className="truncate">{parts ? fromParts(parts) : placeholder}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[100] w-60 rounded-xl border border-zinc-700 bg-[#121215] p-3 shadow-2xl shadow-black/60"
        >
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500 text-center mb-1">Hour</div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                {HOURS.map((h) => (
                  <button
                    type="button"
                    key={h}
                    onClick={() => update({ hour: h })}
                    className={optionClass(parts?.hour === h)}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500 text-center mb-1">Min</div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                {minutes.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => update({ minute: m })}
                    className={optionClass(parts?.minute === m)}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500 text-center mb-1">AM/PM</div>
              <div className="space-y-0.5">
                {(["AM", "PM"] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => update({ meridiem: m })}
                    className={optionClass(parts?.meridiem === m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-mono text-amber-400 hover:text-amber-300"
            >
              Done
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
