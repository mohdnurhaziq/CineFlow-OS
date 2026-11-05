/** Project constants shared by the admin UI and server actions. Client-safe. */

export const PROJECT_STAGES = ["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION", "IN_REVIEW", "DELIVERED"] as const;

export const PROJECT_STAGE_LABELS: Record<(typeof PROJECT_STAGES)[number], string> = {
  PRE_PRODUCTION: "Planning",
  PRODUCTION: "Shooting",
  POST_PRODUCTION: "Editing",
  IN_REVIEW: "Client review",
  DELIVERED: "Delivered",
};

/** Starting terms for a new proposal; the owner edits them per client. */
export const DEFAULT_CONTRACT_TERMS =
  "1. Booking: the project is confirmed once this proposal is signed and the deposit is paid.\n" +
  "2. Balance: the remaining balance is due before the final files are released.\n" +
  "3. Changes: changes to dates or scope after signing may change the price.\n" +
  "4. Cancellation: the deposit is non-refundable if the client cancels within 14 days of the shoot.\n" +
  "5. Usage: the studio may show selected work in its portfolio unless agreed otherwise in writing.";
