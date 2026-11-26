/**
 * What the sign-up wizard remembers in this browser tab, so Back, refresh and a trip to Google keep
 * the answers; and the rules for where a person may be in it. Client-safe. The password is never kept.
 */
import { OnboardStudioSchema, type OnboardStudioInput } from "@/lib/validations/onboarding";

export interface WizardDraft {
  step: number;
  form: Partial<OnboardStudioInput>;
  /** The owner typed an address of their own, so it stops following the name. */
  addressEdited: boolean;
  /** The owner step was done with Google (the proof itself is in an httpOnly cookie). */
  google: boolean;
}

export function draftToStore({ step, form, addressEdited, google }: WizardDraft): string {
  const kept = { ...form };
  delete kept.password;
  return JSON.stringify({ step, addressEdited, google, form: kept });
}

export function parseDraft(raw: string | null): WizardDraft | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<WizardDraft> | null;
    if (!value || typeof value !== "object" || typeof value.step !== "number" || !value.form || typeof value.form !== "object") return null;
    return { step: value.step, form: value.form, addressEdited: value.addressEdited === true, google: value.google === true };
  } catch {
    return null;
  }
}

/** The step to show for `step`: within 1 to 4, and not the review while the owner step is unfinished. */
export function reachableStep(step: number, ownerReady: boolean): number {
  const wanted = Number.isFinite(step) ? Math.min(Math.max(Math.round(step), 1), 4) : 1;
  return wanted === 4 && !ownerReady ? 3 : wanted;
}

/** The step that holds the field the server refused. Anything else stays on the review (step 4). */
export function stepForField(field: string | undefined): number {
  if (field === "name" || field === "slug" || field === "signupCode" || field === "discipline") return 1;
  if (field === "tagline" || field === "bio" || field === "brandColor" || field === "logoUrl") return 2;
  if (field === "ownerName" || field === "ownerEmail" || field === "ownerPhone" || field === "password") return 3;
  return 4;
}

/** Whether this is a whole email address, by the same rule the server uses. */
export function isFullEmail(email: string): boolean {
  return OnboardStudioSchema.shape.ownerEmail.safeParse(email).success;
}
