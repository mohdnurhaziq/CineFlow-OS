/** What to tell the person about the email after an assign or remove. Leading space included, or "" for nothing. */
export function emailNote(delivery: "SENT" | "SKIPPED" | "FAILED" | "NONE"): string {
  switch (delivery) {
    case "SENT":
      return " We emailed them.";
    case "SKIPPED":
      return " Email isn't set up, so nothing was emailed.";
    case "FAILED":
      return " Some emails couldn't be sent.";
    default:
      return "";
  }
}
