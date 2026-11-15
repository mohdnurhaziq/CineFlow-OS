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
