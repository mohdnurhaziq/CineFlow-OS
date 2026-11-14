import type { Prisma, PrismaClient } from "@prisma/client";
import { db as defaultDb } from "@/lib/db";
import { isSlotInPast } from "@/lib/slot-time";
import { PROJECT_STAGES } from "@/lib/projects/constants";

/**
 * A job moves forward on its own, never back:
 *   Booked (PRE_PRODUCTION) -> Shot (PRODUCTION) once the session time has passed or the session
 *   is marked done -> Editing (POST_PRODUCTION) on the first upload -> Delivered when the client is
 *   told their photos are ready. Staff can still set any stage by hand.
 * Not a "use server" module.
 */

type Stage = (typeof PROJECT_STAGES)[number];
type Client = PrismaClient | Prisma.TransactionClient;

const rank = (s: string) => PROJECT_STAGES.indexOf(s as Stage);

/** Moves a project to `target` if it is earlier than that; never moves it back. */
export async function advanceProjectStage(client: Client, projectId: string, target: Stage): Promise<void> {
  const earlier = PROJECT_STAGES.filter((s) => rank(s) < rank(target));
  await client.project.updateMany({ where: { id: projectId, status: { in: earlier } }, data: { status: target } });
}

/** Marks as Shot every Booked project of the studio whose booking's session time has passed. */
export async function catchUpShotStages(tenantId: string, client: Client = defaultDb): Promise<void> {
  const waiting = await client.project.findMany({
    where: { tenantId, status: "PRE_PRODUCTION", booking: { slotId: { not: null }, status: { in: ["CONFIRMED", "COMPLETED", "DELIVERED"] } } },
    select: { id: true, booking: { select: { slot: { select: { date: true, startTime: true } } } } },
  });
  const shot = waiting.filter((p) => p.booking?.slot && isSlotInPast(p.booking.slot)).map((p) => p.id);
  if (shot.length) {
    await client.project.updateMany({ where: { id: { in: shot }, status: "PRE_PRODUCTION" }, data: { status: "PRODUCTION" } });
  }
}
