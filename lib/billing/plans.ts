/**
 * Studio plans: what each includes and costs. One place; the landing page, the sign-up form, the
 * upgrade panels and the guards all read it. Safe on server and client.
 */

export type PlanCode = "STARTER" | "PRO" | "STUDIO_UNLIMITED";

export type PlanFeature = "team" | "proposals" | "callSheets" | "customDomain" | "wallArt" | "gear";

export interface PlanInfo {
  name: string;
  priceMyr: number;
  /** Staff besides the owner (open invitations count). Infinity = unlimited. */
  teamLimit: number;
  features: PlanFeature[];
}

export const PLAN_CODES: PlanCode[] = ["STARTER", "PRO", "STUDIO_UNLIMITED"];

export const PLANS: Record<PlanCode, PlanInfo> = {
  STARTER: { name: "Solo", priceMyr: 99, teamLimit: 0, features: [] },
  PRO: { name: "Studio", priceMyr: 249, teamLimit: 5, features: ["team", "proposals", "callSheets", "customDomain"] },
  STUDIO_UNLIMITED: {
    name: "Production",
    priceMyr: 599,
    teamLimit: Infinity,
    features: ["team", "proposals", "callSheets", "customDomain", "wallArt", "gear"],
  },
};

export const FEATURE_LABEL: Record<PlanFeature, string> = {
  team: "Team & shoot assignments",
  proposals: "Proposals",
  callSheets: "Call sheets & releases",
  customDomain: "Custom domain",
  wallArt: "Wall-art visualizer & print orders",
  gear: "Gear inventory",
};

export const ALL_FEATURES = Object.keys(FEATURE_LABEL) as PlanFeature[];

/** The cheapest plan that includes `feature`. */
export function cheapestPlanWith(feature: PlanFeature): PlanCode {
  return PLAN_CODES.find((c) => PLANS[c].features.includes(feature)) ?? "STUDIO_UNLIMITED";
}

/** A stored tier as a plan code (unknown values count as the middle plan, as before plans were real). */
export function asPlanCode(tier: string): PlanCode {
  return (PLAN_CODES as string[]).includes(tier) ? (tier as PlanCode) : "PRO";
}
