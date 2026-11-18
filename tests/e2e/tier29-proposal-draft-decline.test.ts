/**
 * Tier 29: Proposal drafts and declines
 * The studio can save a proposal as a draft (the client can't see or sign it), send it later, or
 * delete it. The client can decline a proposal they were sent, with an optional reason; a declined
 * proposal can't be signed, and a signed one can't be declined.
 */

import { TestHarness } from "./test-harness";
import { db } from "@/lib/db";
import { withSession } from "./mocks/session";
import { asUser, acceptProposalAsClient } from "./proposal-helpers";
import { createProposal, deleteDraftProposal, sendProposal } from "@/lib/actions/admin-projects";
import { declineProposal, getProposalBySlugAndId, toggleProposalAddOn } from "@/lib/actions/proposals";
import { getNotificationHistory } from "@/lib/notifications";
import { loadClientHeaderBadges } from "@/lib/client-header-badges";
import { DEFAULT_CONTRACT_TERMS } from "@/lib/projects/constants";
import { expectSuccess } from "./result-helpers";

const SIGNATURE = `data:image/png;base64,${"A".repeat(80)}`;

/** Waits briefly for a fire-and-forget email to reach the notification log. */
async function proposalEmailTo(email: string, title: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    if (getNotificationHistory(50).some((n) => n.event === "STUDIO_UPDATE" && n.recipientEmail === email && n.emailSubject.includes(title))) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

export async function runTier29ProposalDraftDeclineTests(harness: TestHarness) {
  harness.setSuite("Tier 29", "Proposal drafts and declines");

  const lumina = await db.tenant.findUnique({ where: { slug: "lumina-cine" } });
  if (!lumina) throw new Error("Seed tenant lumina-cine is required");
  const ownerRow = await db.user.findFirst({ where: { tenantId: lumina.id, role: "STUDIO_OWNER" } });
  if (!ownerRow) throw new Error("Seed Lumina owner is required");
  const as = (u: { id: string; email: string; name: string; role: string; tenantId: string | null }) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    tenantSlug: "lumina-cine",
  });
  const owner = as(ownerRow);
  const run = Date.now().toString(36);
  const crew = as(await db.user.create({ data: { tenantId: lumina.id, email: `t29-crew-${run}@example.test`, name: "T29 Crew", role: "CREW" } }));
  const client = await db.user.create({
    data: { tenantId: lumina.id, email: `t29-client-${run}@example.test`, name: "T29 Client", role: "CLIENT", passwordHash: "x" },
  });

  harness.registerTeardown(async () => {
    await db.milestoneInvoice.deleteMany({ where: { clientId: client.id } });
    await db.project.deleteMany({ where: { clientId: client.id } });
    await db.proposal.deleteMany({ where: { clientId: client.id } });
    await db.user.deleteMany({ where: { email: { startsWith: "t29-" } } });
  });

  const template = await db.proposalAddOnTemplate.findFirst({ where: { tenantId: lumina.id, isActive: true } });
  const input = (title: string, sendNow: boolean) => ({
    tenantId: lumina.id,
    tenantSlug: "lumina-cine",
    clientId: client.id,
    title,
    category: "commercial",
    discipline: "PHOTOGRAPHY" as const,
    basePrice: 1000,
    depositPercentage: 30,
    contractTerms: DEFAULT_CONTRACT_TERMS,
    addOnTemplateIds: template ? [template.id] : [],
    notifyClient: true,
    sendNow,
  });
  const ref = (proposalId: string) => ({ tenantId: lumina.id, proposalId });
  const sign = (proposalId: string) =>
    acceptProposalAsClient({ proposalId, tenantSlug: "lumina-cine", signatureDataUrl: SIGNATURE, signerName: "T29 Client", selectedAddOnIds: [], consentAccepted: true });

  let draftId = "";
  await harness.test("T29-PROP-01: a proposal saved as a draft isn't sent or emailed", async () => {
    const res = await withSession(owner, () => createProposal(input(`T29 draft ${run}`, false)));
    expectSuccess(res, "draft");
    draftId = res.proposalId;
    harness.assertEqual(res.status, "DRAFT", "Reported as a draft");
    const p = await db.proposal.findUnique({ where: { id: draftId } });
    harness.assertEqual(p?.status, "DRAFT", "Saved as a draft");
    harness.assert(!(await proposalEmailTo(client.email, `T29 draft ${run}`)), "The client isn't emailed");
  });

  await harness.test("T29-PROP-02: the client can't see, sign, decline or change a draft; the studio can preview it", async () => {
    harness.assertEqual(await asUser(client.id, () => getProposalBySlugAndId("lumina-cine", draftId)), null, "Hidden from the client");
    const staffView = await withSession(owner, () => getProposalBySlugAndId("lumina-cine", draftId));
    harness.assertEqual(staffView?.id, draftId, "The studio can open it");
    const signed = await sign(draftId);
    harness.assertEqual(signed.success, false, "Can't be signed");
    harness.assertEqual("error" in signed ? signed.error : "", "PROPOSAL_NOT_FOUND", "…it's not there for the client");
    const declined = await asUser(client.id, () => declineProposal({ proposalId: draftId, tenantSlug: "lumina-cine" }));
    harness.assertEqual(declined.success, false, "Can't be declined");
    const addOn = await db.proposalAddOn.findFirst({ where: { proposalId: draftId } });
    if (addOn) {
      const toggled = await asUser(client.id, () => toggleProposalAddOn({ proposalId: draftId, addOnId: addOn.id, isSelected: true }));
      harness.assertEqual(toggled.success, false, "Its extras can't be changed by the client");
    }
    const badges = await loadClientHeaderBadges(lumina.id, client.id);
    harness.assertEqual(badges.proposals, 0, "Not counted on the client's Proposals tab");
  });

  await harness.test("T29-PROP-03: sending a draft makes it visible and emails the client, once", async () => {
    const byCrew = await withSession(crew, () => sendProposal(ref(draftId)));
    harness.assertEqual(byCrew.success, false, "Crew can't send it");
    const res = await withSession(owner, () => sendProposal(ref(draftId)));
    expectSuccess(res, "send");
    harness.assertEqual(res.shareUrl, `/lumina-cine/proposals/${draftId}`, "Link to the signing page");
    harness.assertEqual((await db.proposal.findUnique({ where: { id: draftId } }))?.status, "SENT", "Now sent");
    harness.assert(await proposalEmailTo(client.email, `T29 draft ${run}`), "The client is emailed");
    const again = await withSession(owner, () => sendProposal(ref(draftId)));
    harness.assertEqual(again.success, false, "Sending twice is refused");
    harness.assertEqual("error" in again ? again.error : "", "NOT_A_DRAFT", "…as already sent");
    const del = await withSession(owner, () => deleteDraftProposal(ref(draftId)));
    harness.assertEqual(del.success, false, "A sent proposal can't be deleted");
    harness.assertEqual((await asUser(client.id, () => getProposalBySlugAndId("lumina-cine", draftId)))?.id, draftId, "The client can open it now");
    harness.assertEqual((await loadClientHeaderBadges(lumina.id, client.id)).proposals, 1, "Counted on the client's tab");
  });

  await harness.test("T29-PROP-04: a draft can be deleted, by the studio only", async () => {
    const res = await withSession(owner, () => createProposal(input(`T29 throwaway ${run}`, false)));
    expectSuccess(res, "draft");
    const byCrew = await withSession(crew, () => deleteDraftProposal(ref(res.proposalId)));
    harness.assertEqual(byCrew.success, false, "Crew can't delete it");
    const del = await withSession(owner, () => deleteDraftProposal(ref(res.proposalId)));
    harness.assert(del.success, "Deleted", JSON.stringify(del));
    harness.assertEqual(await db.proposal.findUnique({ where: { id: res.proposalId } }), null, "Gone");
    harness.assertEqual(await db.proposalAddOn.count({ where: { proposalId: res.proposalId } }), 0, "Its extras too");
  });

  await harness.test("T29-PROP-05: the client declines with a reason; it can't be signed afterwards", async () => {
    const byStaff = await withSession(owner, () => declineProposal({ proposalId: draftId, tenantSlug: "lumina-cine", reason: "x" }));
    harness.assertEqual(byStaff.success, false, "The studio can't decline for the client");
    const res = await asUser(client.id, () =>
      declineProposal({ proposalId: draftId, tenantSlug: "lumina-cine", reason: "  We changed our plans.  " })
    );
    harness.assert(res.success, "Declined", JSON.stringify(res));
    const p = await db.proposal.findUnique({ where: { id: draftId } });
    harness.assertEqual(p?.status, "DECLINED", "Marked declined");
    harness.assert(p?.declinedAt instanceof Date, "With the date");
    harness.assertEqual(p?.declineReason, "We changed our plans.", "And the reason, trimmed");
    const twice = await asUser(client.id, () => declineProposal({ proposalId: draftId, tenantSlug: "lumina-cine" }));
    harness.assert(twice.success, "Declining again is not an error");
    harness.assertEqual((await db.proposal.findUnique({ where: { id: draftId } }))?.declineReason, "We changed our plans.", "…and keeps the reason");

    const signed = await sign(draftId);
    harness.assertEqual(signed.success, false, "Can't be signed after declining");
    harness.assertEqual("error" in signed ? signed.error : "", "PROPOSAL_CLOSED", "…as closed");
    harness.assertEqual(await db.project.count({ where: { proposalId: draftId } }), 0, "No project created");
    harness.assertEqual(await db.milestoneInvoice.count({ where: { proposalId: draftId } }), 0, "No deposit invoice");
    const addOn = await db.proposalAddOn.findFirst({ where: { proposalId: draftId } });
    if (addOn) {
      const toggled = await withSession(owner, () => toggleProposalAddOn({ proposalId: draftId, addOnId: addOn.id, isSelected: true }));
      harness.assertEqual(toggled.success, false, "Its extras can't change");
    }
  });

  await harness.test("T29-PROP-06: a signed proposal can't be declined; an empty reason is stored as none", async () => {
    const res = await withSession(owner, () => createProposal(input(`T29 signed ${run}`, true)));
    expectSuccess(res, "sent");
    const signed = await sign(res.proposalId);
    harness.assert(signed.success, "Signed", JSON.stringify(signed));
    const declined = await asUser(client.id, () => declineProposal({ proposalId: res.proposalId, tenantSlug: "lumina-cine" }));
    harness.assertEqual(declined.success, false, "Can't decline after signing");
    harness.assertEqual((await db.proposal.findUnique({ where: { id: res.proposalId } }))?.status, "ACCEPTED", "Still signed");

    const other = await withSession(owner, () => createProposal(input(`T29 no reason ${run}`, true)));
    expectSuccess(other, "sent");
    const noReason = await asUser(client.id, () => declineProposal({ proposalId: other.proposalId, tenantSlug: "lumina-cine", reason: "   " }));
    harness.assert(noReason.success, "Declined without a reason");
    harness.assertEqual((await db.proposal.findUnique({ where: { id: other.proposalId } }))?.declineReason, null, "No reason stored");
  });
}
