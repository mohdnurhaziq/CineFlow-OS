import { Lock, Clock } from "lucide-react";
import type { PlanStatus } from "@/lib/billing/state";
import { addDays } from "@/lib/billing/state";
import { studioDateKey } from "@/lib/slot-time";

const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * What a studio's admin says about its plan: nothing while paid up; a heads-up in a trial's last
 * week and when overdue; the plain stop notice when paused. Server-rendered. (Not for super-admins.)
 */
export function PlanBanner({ status, contactEmail, today }: { status: PlanStatus; contactEmail: string | null; today?: string }) {
  const contact = contactEmail ? (
    <>
      {" "}
      Email <a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.
    </>
  ) : null;

  let tone: "info" | "warn" | "stop" | null = null;
  let text: React.ReactNode = null;
  if (status.state === "PAUSED") {
    tone = "stop";
    text = <>Your plan has ended. Contact us to renew.{contact} You can still check clients&apos; payments; everything else is read-only.</>;
  } else if (status.state === "OVERDUE" && status.endsOn && status.graceEndsOn) {
    tone = "warn";
    text = <>Your plan ended on {dayLabel(status.endsOn)}. Pay by {dayLabel(status.graceEndsOn)} to keep your studio open.{contact}</>;
  } else if (status.state === "TRIAL" && status.endsOn) {
    const now = today ?? studioDateKey();
    if (status.endsOn <= addDays(now, 7)) {
      tone = "info";
      text = <>Your trial ends on {dayLabel(status.endsOn)}.{contact}</>;
    }
  }
  if (!tone) return null;

  const Icon = tone === "stop" ? Lock : Clock;
  const style =
    tone === "stop"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <div role="status" className={`border-b px-4 py-2.5 text-xs flex items-start gap-2 justify-center ${style}`}>
      <Icon className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="max-w-3xl">{text}</p>
    </div>
  );
}
