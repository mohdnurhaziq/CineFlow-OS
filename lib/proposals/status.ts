/**
 * A proposal's life: DRAFT (the studio's only, the client can't see it) → SENT → ACCEPTED (signed)
 * or DECLINED (the client said no). VIEWED is an older name for SENT, still treated the same.
 */

/** Statuses the client can still sign or decline. */
export const OPEN_PROPOSAL_STATUSES = ["SENT", "VIEWED"];

export function isOpenProposal(status: string): boolean {
  return OPEN_PROPOSAL_STATUSES.includes(status);
}

/** Prisma filter for the proposals a client may see: everything but drafts. */
export const clientVisibleProposalWhere = { status: { not: "DRAFT" } };
