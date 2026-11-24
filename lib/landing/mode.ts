/** What the landing page's main button does, from how sign-up currently works (studioSignupStatus). */
export type LandingMode = "TRIAL" | "INVITE_WITH_CODE" | "INVITE_ONLY";

export function landingMode(status: { open: boolean; needsCode: boolean }): LandingMode {
  if (status.open && !status.needsCode) return "TRIAL";
  if (status.needsCode) return "INVITE_WITH_CODE";
  return "INVITE_ONLY";
}
