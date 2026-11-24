import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { studioUrl } from "@/lib/domain-name";
import { studioNow } from "@/lib/slot-time";
import { PLANS } from "@/lib/billing/plans";
import { addDays, planStatus } from "@/lib/billing/state";

/**
 * Plan reminder emails, sent from the health check (which the deploy and uptime tools call all day), so
 * no scheduler is needed. Each studio gets at most one email per step, remembered in `lastPlanReminder`:
 *   due:<endsOn>      7 days before the plan ends
 *   overdue:<endsOn>  the day after it ends (grace period)
 *   paused:<endsOn>   grace over: the studio is paused (and marked as paused for lateness)
 * The owner and every super-admin get it. A studio paused by hand is left alone. Never throws.
 * Plain server module, not "use server".
 */

const REMIND_BEFORE_DAYS = 7;
const THROTTLE_MS = 60 * 60 * 1000;
let lastRun = 0;

const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Runs the reminders. Called with no argument it runs at most once an hour; with a date (tests) it always runs. */
export async function runPlanReminders(now?: Date): Promise<{ sent: number }> {
  if (!now) {
    if (Date.now() - lastRun < THROTTLE_MS) return { sent: 0 };
    lastRun = Date.now();
  }
  const at = now ?? new Date();
  let sent = 0;
  try {
    const today = studioNow(at).dateKey;
    const tenants = await db.tenant.findMany({
      where: { subscriptionStatus: { not: "CANCELLED" } },
      select: {
        id: true, name: true, slug: true, subscriptionTier: true, subscriptionStatus: true,
        trialEndsAt: true, paidUntil: true, pausedAt: true, pauseReason: true, lastPlanReminder: true,
      },
    });
    const supers = await db.user.findMany({ where: { role: "SUPER_ADMIN", deactivatedAt: null }, select: { name: true, email: true } });

    for (const t of tenants) {
      if (t.pausedAt && t.pauseReason === "MANUAL") continue;
      const st = planStatus(t, at);
      if (!st.endsOn) continue;
      const trial = !t.paidUntil;
      let kind: "due" | "overdue" | "paused" | null = null;
      if ((st.state === "TRIAL" || st.state === "ACTIVE") && today >= addDays(st.endsOn, -REMIND_BEFORE_DAYS)) kind = "due";
      else if (st.state === "OVERDUE") kind = "overdue";
      else if (st.state === "PAUSED") kind = "paused";
      if (!kind) continue;
      const key = `${kind}:${st.endsOn}`;
      if (t.lastPlanReminder === key) continue;

      if (kind === "paused" && !t.pausedAt) {
        await db.tenant.update({ where: { id: t.id }, data: { pausedAt: at, pauseReason: "OVERDUE" } });
      }

      const planName = PLANS[st.plan].name;
      const what = trial ? "free trial" : `${planName} plan`;
      const text = {
        due: {
          headline: `${t.name}: your ${what} ends on ${longDay(st.endsOn)}`,
          message: `Your ${what} ends on ${longDay(st.endsOn)}. Contact us to ${trial ? "choose a plan" : "renew"} so ${t.name} keeps running without a break.`,
        },
        overdue: {
          headline: `${t.name}: your ${what} has ended`,
          message: `Your ${what} ended on ${longDay(st.endsOn)}. ${t.name} keeps working until ${longDay(st.graceEndsOn!)}, then goes read-only. Contact us to ${trial ? "choose a plan" : "renew"}.`,
        },
        paused: {
          headline: `${t.name} is paused`,
          message: `Your ${what} ended on ${longDay(st.endsOn)} and the grace period is over, so ${t.name} is read-only and closed to new online bookings. Clients keep their galleries. Contact us to ${trial ? "choose a plan" : "renew"} and it opens again straight away.`,
        },
      }[kind];

      const owners = await db.user.findMany({ where: { tenantId: t.id, role: "STUDIO_OWNER", deactivatedAt: null }, select: { name: true, email: true } });
      const seen = new Set<string>();
      const people = [...owners, ...supers].filter((p) => p.email && !seen.has(p.email) && seen.add(p.email));
      let delivered = people.length === 0;
      for (const p of people) {
        const res = await sendNotification(
          {
            event: "STUDIO_UPDATE",
            studioName: t.name,
            studioSlug: t.slug,
            clientName: p.name,
            clientEmail: p.email,
            headline: text.headline,
            message: text.message,
            linkUrl: studioUrl(t.slug, "/admin"),
            linkLabel: "Open the studio",
          },
          "EMAIL"
        ).catch(() => null);
        if (res && res.emailDelivery !== "FAILED") {
          delivered = true;
          sent += 1;
        }
      }
      // Only remember it once someone was actually told; otherwise the next check tries again.
      if (delivered) await db.tenant.update({ where: { id: t.id }, data: { lastPlanReminder: key } });
    }
  } catch (err) {
    console.error("Plan reminders failed:", err);
  }
  return { sent };
}
