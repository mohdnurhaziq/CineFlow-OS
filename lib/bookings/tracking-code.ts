import { randomInt } from "node:crypto";

/**
 * Letters and digits for the random part of a booking's tracking code: no O, 0, I, 1 or L, so a
 * client can read a code aloud or type it from a printout without mixing characters up.
 */
export const TRACKING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const RANDOM_LENGTH = 8;

/**
 * A new booking tracking code: `BK-<STUDIO>-<time>-<random>`, or `BK-<time>-<random>` without a studio.
 * The time part sorts codes by when they were made; the random part (about 8.5 trillion combinations,
 * from a secure source) is what makes a code impossible to guess. Anyone opening a booking still needs
 * the booking's email as well.
 */
export function newTrackingCode(studioSlug?: string): string {
  let random = "";
  for (let i = 0; i < RANDOM_LENGTH; i++) random += TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
  const time = Date.now().toString(36).toUpperCase();
  const studio = studioSlug ? `${studioSlug.toUpperCase().slice(0, 4)}-` : "";
  return `BK-${studio}${time}-${random}`;
}
