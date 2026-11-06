/**
 * Proposals can only be signed by the client they are addressed to, signed in.
 * Feature tiers that exercise signing use this to act as that client.
 */
import { db } from "@/lib/db";
import { acceptProposal } from "@/lib/actions/proposals";
import { processInvoicePayment } from "@/lib/actions/checkout";
import type { SignProposalInput } from "@/lib/validations/proposals";
import { withSession } from "./mocks/session";

export async function acceptProposalAsClient(input: SignProposalInput) {
  const proposal = await db.proposal.findUnique({ where: { id: input.proposalId }, select: { clientId: true } });
  const client = proposal
    ? await db.user.findUnique({ where: { id: proposal.clientId }, include: { tenant: { select: { slug: true } } } })
    : null;
  // Unknown proposal: call as-is so "not found" paths are still exercised.
  if (!client) return acceptProposal(input);
  return withSession(
    {
      id: client.id,
      email: client.email,
      name: client.name,
      role: client.role,
      tenantId: client.tenantId,
      tenantSlug: client.tenant?.slug ?? null,
    },
    () => acceptProposal(input)
  );
}

/** Runs `fn` signed in as the given user (looked up fresh from the database). */
export async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const u = await db.user.findUnique({ where: { id: userId }, include: { tenant: { select: { slug: true } } } });
  if (!u) throw new Error(`asUser: no user ${userId}`);
  return withSession(
    { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, tenantSlug: u.tenant?.slug ?? null },
    fn
  );
}

/** Paying an invoice needs its client signed in: pays as that client. */
export async function payAsInvoiceClient(input: Parameters<typeof processInvoicePayment>[0]) {
  const inv = await db.milestoneInvoice.findUnique({ where: { id: input.invoiceId }, select: { clientId: true } });
  if (!inv) return processInvoicePayment(input);
  return asUser(inv.clientId, () => processInvoicePayment(input));
}
