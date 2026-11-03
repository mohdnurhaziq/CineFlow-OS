"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

const ISO_FORMAT = "yyyy-MM-dd";
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseValue(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, ISO_FORMAT, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or empty string */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest selectable date (yyyy-MM-dd) */
  min?: string;
  /** Latest selectable date (yyyy-MM-dd) */
  max?: string;
  /** Show a clear (x) button when a value is set */
  clearable?: boolean;
  className?: string;
  title?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  min,
  max,
  clearable = false,
  className = "",
  title,
}: DatePickerProps) {
  const selected = parseValue(value);
  const minDate = min ? parseValue(min) : null;
  const maxDate = max ? parseValue(max) : null;

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(selected ?? new Date()));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  const isDisabled = (day: Date) =>
    (minDate !== null && format(day, ISO_FORMAT) < format(minDate, ISO_FORMAT)) ||
    (maxDate !== null && format(day, ISO_FORMAT) > format(maxDate, ISO_FORMAT));

  const handleOpenChange = (next: boolean) => {
    if (next) setViewMonth(startOfMonth(parseValue(value) ?? new Date()));
    setOpen(next);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button
            type="button"
            title={title}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm font-mono text-left focus:outline-none focus:border-amber-500 hover:border-zinc-600 transition-colors ${
              selected ? "text-white" : "text-zinc-500"
            } ${clearable && selected ? "pr-8" : ""} ${className}`}
          >
            <CalendarIcon className="size-4 shrink-0 text-amber-400" />
            <span className="truncate">{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
          </button>
        </Popover.Trigger>
        {clearable && selected && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-red-400"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[100] w-72 rounded-xl border border-zinc-700 bg-[#121215] p-3 shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-bold text-white">{format(viewMonth, "MMMM yyyy")}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-mono uppercase text-zinc-500 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const isSelected = selected !== null && isSameDay(day, selected);
              const disabled = isDisabled(day);
              const inMonth = isSameMonth(day, viewMonth);
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  disabled={disabled}
                  onClick={() => {
                    onChange(format(day, ISO_FORMAT));
                    setOpen(false);
                  }}
                  className={`h-8 rounded-lg text-xs font-mono transition-colors ${
                    isSelected
                      ? "bg-amber-500 text-black font-bold"
                      : disabled
                      ? "text-zinc-700 cursor-not-allowed"
                      : isToday(day)
                      ? "border border-amber-500/60 text-amber-300 hover:bg-zinc-800"
                      : inMonth
                      ? "text-zinc-200 hover:bg-zinc-800"
                      : "text-zinc-600 hover:bg-zinc-800"
                  }`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                if (isDisabled(today)) return;
                onChange(format(today, ISO_FORMAT));
                setOpen(false);
              }}
              className="text-xs font-mono text-amber-400 hover:text-amber-300"
            >
              Today
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-xs font-mono text-zinc-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
