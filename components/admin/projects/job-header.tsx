"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { PROJECT_STAGES, PROJECT_STAGE_LABELS } from "@/lib/projects/constants";
import { formatSlotDate } from "@/lib/slot-time";

type Stage = (typeof PROJECT_STAGES)[number];

/** A session's four steps and the stored stages each one covers. */
const SESSION_STEPS: Array<{ label: string; stages: Stage[]; set: Stage }> = [
  { label: "Booked", stages: ["PRE_PRODUCTION"], set: "PRE_PRODUCTION" },
  { label: "Shot", stages: ["PRODUCTION"], set: "PRODUCTION" },
  { label: "Editing", stages: ["POST_PRODUCTION"], set: "POST_PRODUCTION" },
  { label: "Delivered", stages: ["IN_REVIEW", "DELIVERED"], set: "DELIVERED" },
];

export interface JobBooking {
  id: string;
  trackingCode: string;
  packageName: string | null;
  /** Session day (ISO) and times, when the booking has a slot. */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface JobPayment {
  /** "Paid in full", "RM 150.00 due", "RM 150.00 awaiting verification", "No invoices yet" */
  label: string;
  tone: "paid" | "due" | "neutral";
}

export function JobHeader({
  tenantSlug,
  title,
  projectNumber,
  status,
  isSession,
  client,
  booking,
  plannedShoot,
  payment,
  pending,
  onStageChange,
}: {
  tenantSlug: string;
  title: string;
  projectNumber: string;
  status: string;
  isSession: boolean;
  client: { name: string; email: string; phone: string | null };
  booking: JobBooking | null;
  /** A production without a booking: its next planned shoot day, from the call sheets. */
  plannedShoot?: { date: string; time: string } | null;
  payment: JobPayment;
  pending: boolean;
  onStageChange: (stage: Stage) => void;
}) {
  const stepIndex = SESSION_STEPS.findIndex((s) => s.stages.includes(status as Stage));
  const shootDate = booking?.date ?? plannedShoot?.date ?? null;
  const shootDay = shootDate ? formatSlotDate(shootDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : null;
  const shootTime = booking?.startTime ? (booking.endTime ? `${booking.startTime} – ${booking.endTime}` : booking.startTime) : plannedShoot ? `Call ${plannedShoot.time}` : null;
  const toneCls = payment.tone === "paid" ? "text-emerald-400" : payment.tone === "due" ? "text-amber-300" : "text-zinc-400";

  return (
    <header className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {client.name} · <a href={`mailto:${client.email}`} className="hover:text-white">{client.email}</a>
          {client.phone ? (
            <>
              {" · "}
              <a href={`tel:${client.phone.replace(/\s+/g, "")}`} className="hover:text-white">
                {client.phone}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-zinc-800 bg-zinc-800">
        <div className="bg-[#0d0d10] px-4 py-3">
          <dt className="text-xs text-zinc-400">Shoot</dt>
          <dd className="text-sm font-semibold text-white mt-1">
            {shootDay ?? "Not scheduled"}
            {shootTime && <span className="block font-normal text-zinc-300">{shootTime}</span>}
          </dd>
        </div>
        <div className="bg-[#0d0d10] px-4 py-3">
          <dt className="text-xs text-zinc-400">Package</dt>
          <dd className="text-sm font-semibold text-white mt-1">{booking?.packageName ?? "—"}</dd>
        </div>
        <div className="bg-[#0d0d10] px-4 py-3">
          <dt className="text-xs text-zinc-400">Payment</dt>
          <dd className={`text-sm font-semibold mt-1 ${toneCls}`}>{payment.label}</dd>
        </div>
        <div className="bg-[#0d0d10] px-4 py-3">
          <dt className="text-xs text-zinc-400">{booking ? "Booking" : "Project"}</dt>
          <dd className="text-sm font-semibold mt-1">
            {booking ? (
              <Link href={`/${tenantSlug}/admin/bookings/${booking.id}`} className="text-amber-400 hover:underline">
                {booking.trackingCode}
              </Link>
            ) : (
              <span className="text-white">{projectNumber}</span>
            )}
          </dd>
        </div>
      </dl>

      {isSession ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ol className="flex items-center gap-2 flex-1 min-w-[16rem]" aria-label="Progress">
            {SESSION_STEPS.map((step, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              return (
                <li key={step.label} className="flex items-center gap-2 flex-1 last:flex-none" aria-current={current ? "step" : undefined}>
                  <span
                    className={`size-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                      done ? "bg-amber-500 text-black" : current ? "bg-amber-500/15 text-amber-300 ring-2 ring-amber-500" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={`text-sm ${current ? "font-semibold text-white" : done ? "text-zinc-300" : "text-zinc-400"}`}>{step.label}</span>
                  {i < SESSION_STEPS.length - 1 && <span className={`h-px flex-1 ${done ? "bg-amber-500/60" : "bg-zinc-800"}`} aria-hidden />}
                </li>
              );
            })}
          </ol>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Change</span>
            <select
              value={SESSION_STEPS[stepIndex]?.set ?? "PRE_PRODUCTION"}
              disabled={pending}
              onChange={(e) => onStageChange(e.target.value as Stage)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              {SESSION_STEPS.map((s) => (
                <option key={s.label} value={s.set}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {status === "IN_REVIEW" && <p className="w-full text-sm text-zinc-400">Previews sent. Full-resolution files unlock when the balance is paid.</p>}
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Stage</span>
          <select
            value={status}
            disabled={pending}
            onChange={(e) => onStageChange(e.target.value as Stage)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      )}
    </header>
  );
}
