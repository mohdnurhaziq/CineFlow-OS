/**
 * The short reservation a client gets on a slot the moment they select it on the booking page.
 * It exists so two clients can't book the same slot; clients never see it as a clock. The admin
 * manual (Manual → Slot holds) reads these values, so it always matches what the code does.
 *
 * Plain module (not "use server"), so it can export constants.
 */

/** How long a selected slot stays reserved for the client who selected it. */
export const SLOT_HOLD_MINUTES = 10;

/** Seconds before the end at which the client is nudged to finish. Shown as words, never as a timer. */
export const SLOT_HOLD_NUDGE_SECONDS = 120;

/**
 * A client is in the middle of booking this slot: it is held and the hold hasn't run out. A hold
 * that has run out blocks nobody, even before anything tidies it up.
 */
export function holdIsRunning(slot: { status: string; heldUntil?: Date | string | null }, now: Date = new Date()): boolean {
  if (slot.status !== "HELD") return false;
  return !slot.heldUntil || new Date(slot.heldUntil).getTime() > now.getTime();
}

/** What the team is told when they try to change a slot a client is booking. */
export const SLOT_HELD_MESSAGE =
  "A client is booking this time right now. Wait for them to finish, or use Force release hold if you are sure they won't.";
