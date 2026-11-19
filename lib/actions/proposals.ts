"use server";

import { db } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/bookings/billing";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/auth/session";
import { requireRecordAccess } from "@/lib/auth/project-access";
import {
  SignProposalSchema,
  type SignProposalInput,
  ToggleAddOnSchema,
  type ToggleAddOnInput,
  DeclineProposalSchema,
  type DeclineProposalInput,
} from "@/lib/validations/proposals";
import { errorMessageOf } from "@/lib/action-error";
import { isOpenProposal, OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";
import { studioPath } from "@/lib/domain-name";

/** Why a proposal that isn't open can't be signed or declined, in the client's words. */
function closedProposalMessage(status: string): string {
  if (status === "ACCEPTED") return "This proposal is already signed.";
  if (status === "DECLINED") return "You declined this proposal. Contact the studio if you'd like to go ahead.";
  return "This proposal isn't open for signing.";
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

export async function getProposalBySlugAndId(tenantSlug: string, proposalIdOrNumber: string) {
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) return null;

    const proposal = await db.proposal.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ id: proposalIdOrNumber }, { proposalNumber: proposalIdOrNumber }],
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true, currency: true, brandColor: true } },
        client: { select: { id: true, name: true, email: true, phone: true } },
        studio: { select: { id: true, name: true, email: true } },
        addOns: {
          orderBy: { price: "desc" },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
        },
        project: true,
      },
    });
    if (!proposal) return null;

    // Only the proposal's client or the studio's staff, signed in. A draft is the studio's only.
    const session = await requireRecordAccess(tenant.id, proposal.clientId, { area: "proposals" });
    if (proposal.status === "DRAFT" && session.role === "CLIENT") return null;
    return proposal;
  } catch (error) {
    console.error("Error fetching proposal:", error);
    return null;
  }
}

export async function acceptProposal(input: SignProposalInput) {
  try {
    const validated = SignProposalSchema.parse(input);
    const { proposalId, tenantSlug, signatureDataUrl, selectedAddOnIds } = validated;

    // 1. Fetch proposal with add-ons and project
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: {
        tenant: true,
        client: true,
        addOns: true,
        project: true,
        invoices: true,
      },
    });

    if (!proposal || proposal.tenant.slug !== tenantSlug) {
      return { success: false, error: "PROPOSAL_NOT_FOUND", message: "Proposal not found." };
    }

    // Only the client the proposal is addressed to may sign it, while signed in to their account,
    // so the signature is tied to a known person. Staff cannot sign on a client's behalf.
    const session = await getCurrentUser();
    if (!session) {
      return { success: false, error: "UNAUTHENTICATED", message: "UNAUTHENTICATED: Please sign in to sign this proposal." };
    }
    if (session.role !== "CLIENT" || session.id !== proposal.clientId) {
      return { success: false, error: "FORBIDDEN", message: "FORBIDDEN: Only the client this proposal is addressed to can sign it." };
    }

    // If already accepted, return existing project & invoice
    if (proposal.status === "ACCEPTED" && proposal.project) {
      const existingInvoice = proposal.invoices.find((i) => i.milestoneType === "RETAINER_50");
      return {
        success: true,
        proposalId: proposal.id,
        projectId: proposal.project.id,
        invoiceId: existingInvoice?.id || "",
        invoiceNumber: existingInvoice?.invoiceNumber || "",
        amount: proposal.depositAmount,
        checkoutUrl: existingInvoice
          ? studioPath(tenantSlug, `/checkout?invoiceId=${existingInvoice.id}`)
          : studioPath(tenantSlug, `/vault/${proposal.project.id}`),
      };
    }

    if (proposal.status === "DRAFT") {
      return { success: false, error: "PROPOSAL_NOT_FOUND", message: "Proposal not found." };
    }
    if (!isOpenProposal(proposal.status)) {
      return { success: false, error: "PROPOSAL_CLOSED", message: closedProposalMessage(proposal.status) };
    }

    // 2. Compute dynamic financial figures based on selected add-on IDs
    const selectedSet = new Set(selectedAddOnIds);
    let addOnsTotal = 0;
    for (const addon of proposal.addOns) {
      if (selectedSet.has(addon.id)) {
        addOnsTotal += addon.price * (addon.quantity || 1);
      }
    }

    const totalPrice = Math.round((proposal.basePrice + addOnsTotal) * 100) / 100;
    const depositPercentage = proposal.depositPercentage || 50.0;
    const depositAmount = Math.round(((totalPrice * depositPercentage) / 100) * 100) / 100;
    const finalBalanceAmount = Math.round((totalPrice - depositAmount) * 100) / 100;

    // 3. Atomic Database Transaction
    const result = await db.$transaction(async (tx) => {
      // Update each AddOn isSelected
      for (const addon of proposal.addOns) {
        await tx.proposalAddOn.update({
          where: { id: addon.id },
          data: { isSelected: selectedSet.has(addon.id) },
        });
      }

      // Update Proposal, only while it is still open (a decline at the same moment wins)
      const claimed = await tx.proposal.updateMany({
        where: { id: proposal.id, status: { in: OPEN_PROPOSAL_STATUSES } },
        data: {
          status: "ACCEPTED",
          clientSignature: signatureDataUrl,
          signedAt: new Date(),
          totalPrice,
          depositAmount,
          finalBalanceAmount,
        },
      });
      if (claimed.count === 0) throw new Error("This proposal can no longer be signed.");

      // Create or link Project
      let project = await tx.project.findFirst({
        where: { proposalId: proposal.id },
      });

      if (!project) {
        const year = new Date().getFullYear();
        let projectNumber = "";
        let attempts = 0;
        const maxAttempts = 10;

        while (!projectNumber && attempts < maxAttempts) {
          attempts++;
          const rand = Math.floor(10000 + Math.random() * 90000);
          const candidate = `PJ-${year}-${rand}`;

          const existing = await tx.project.findUnique({
            where: { projectNumber: candidate },
            select: { id: true },
          });

          if (!existing) {
            projectNumber = candidate;
          }
        }

        // Defensive fallback in the virtually impossible case that 10 attempts collided
        if (!projectNumber) {
          projectNumber = `PJ-${year}-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;
        }

        project = await tx.project.create({
          data: {
            tenantId: proposal.tenantId,
            projectNumber,
            title: proposal.title,
            category: proposal.category,
            clientId: proposal.clientId,
            studioLeadId: proposal.studioId,
            discipline: proposal.discipline,
            proposalId: proposal.id,
            status: "PRE_PRODUCTION",
            budget: totalPrice,
            isFinalBalancePaid: false,
          },
        });
      } else {
        project = await tx.project.update({
          where: { id: project.id },
          data: { budget: totalPrice },
        });
      }

      // Create or update MilestoneInvoice for 50% Retainer
      let invoice = await tx.milestoneInvoice.findFirst({
        where: {
          proposalId: proposal.id,
          milestoneType: "RETAINER_50",
        },
      });

      if (!invoice) {
        invoice = await tx.milestoneInvoice.create({
          data: {
            tenantId: proposal.tenantId,
            invoiceNumber: await nextInvoiceNumber(tx, proposal.tenantId),
            proposalId: proposal.id,
            projectId: project.id,
            clientId: proposal.clientId,
            milestoneType: "RETAINER_50",
            amount: depositAmount,
            status: "PENDING",
            dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          },
        });
      } else if (invoice.status === "PENDING") {
        invoice = await tx.milestoneInvoice.update({
          where: { id: invoice.id },
          data: {
            amount: depositAmount,
            projectId: project.id,
          },
        });
      }

      return { project, invoice };
    });

    safeRevalidate(`/${tenantSlug}/proposals/${proposal.id}`);
    safeRevalidate(`/${tenantSlug}/proposals/${proposal.proposalNumber}`);

    // Dispatch automated signed proposal notification
    if (proposal.client?.email) {
      sendNotification({
        event: "PROPOSAL_SIGNED",
        studioName: proposal.tenant.name,
        studioSlug: tenantSlug,
        clientName: proposal.client.name,
        clientEmail: proposal.client.email,
        clientPhone: proposal.client.phone || undefined,
        proposalNumber: proposal.proposalNumber,
        projectTitle: result.project.title,
        totalPrice,
        depositRequired: depositAmount,
        currency: proposal.tenant.currency || "USD",
      }).catch((e) => console.error("Notification dispatch failed:", e));
    }

    return {
      success: true,
      proposalId: proposal.id,
      projectId: result.project.id,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      amount: depositAmount,
      checkoutUrl: studioPath(tenantSlug, `/checkout?invoiceId=${result.invoice.id}`),
    };
  } catch (error) {
    console.error("Error accepting proposal:", error);
    return {
      success: false,
      error: "ACCEPT_FAILED",
      message: errorMessageOf(error) || "Failed to accept proposal.",
    };
  }
}

// Alias for signAndAcceptProposal
export const signAndAcceptProposal = acceptProposal;

export async function toggleProposalAddOn(input: ToggleAddOnInput) {
  try {
    const { proposalId, addOnId, isSelected } = ToggleAddOnSchema.parse(input);

    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { tenantId: true, clientId: true, status: true },
    });
    if (!proposal) return { success: false, error: "Proposal not found." };
    // The proposal's client, or the team with Proposals MANAGE (VIEW is read-only).
    const session = await requireRecordAccess(proposal.tenantId, proposal.clientId, { area: "proposals", level: "MANAGE" });
    if (proposal.status === "DRAFT" && session.role === "CLIENT") return { success: false, error: "Proposal not found." };
    if (proposal.status === "ACCEPTED") {
      return { success: false, error: "This proposal is already signed; its add-ons can no longer change." };
    }
    if (proposal.status === "DECLINED") {
      return { success: false, error: "This proposal was declined; its add-ons can no longer change." };
    }

    const addOn = await db.proposalAddOn.update({
      where: { id: addOnId, proposalId },
      data: { isSelected },
      include: {
        proposal: {
          include: { tenant: true },
        },
      },
    });

    safeRevalidate(`/${addOn.proposal.tenant.slug}/proposals/${proposalId}`);
    return { success: true, isSelected: addOn.isSelected };
  } catch (error) {
    console.error("Error toggling add-on:", error);
    return { success: false, error: errorMessageOf(error) || "Failed to toggle add-on." };
  }
}

/**
 * The client says no to a proposal they were sent, optionally with a reason the studio sees.
 * Only that client, signed in, and only while it is open. Declining twice is not an error.
 */
export async function declineProposal(input: DeclineProposalInput) {
  try {
    const { proposalId, tenantSlug, reason } = DeclineProposalSchema.parse(input);
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, clientId: true, status: true, tenant: { select: { slug: true } } },
    });
    if (!proposal || proposal.tenant.slug !== tenantSlug) {
      return { success: false, error: "PROPOSAL_NOT_FOUND", message: "Proposal not found." };
    }

    const session = await getCurrentUser();
    if (!session) {
      return { success: false, error: "UNAUTHENTICATED", message: "Please sign in to answer this proposal." };
    }
    if (session.role !== "CLIENT" || session.id !== proposal.clientId) {
      return { success: false, error: "FORBIDDEN", message: "Only the client this proposal is addressed to can decline it." };
    }
    if (proposal.status === "DRAFT") {
      return { success: false, error: "PROPOSAL_NOT_FOUND", message: "Proposal not found." };
    }
    if (proposal.status === "DECLINED") return { success: true };

    // Only while still open: a signature at the same moment wins.
    const declined = await db.proposal.updateMany({
      where: { id: proposal.id, status: { in: OPEN_PROPOSAL_STATUSES } },
      data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason || null },
    });
    if (declined.count === 0) {
      const now = await db.proposal.findUnique({ where: { id: proposal.id }, select: { status: true } });
      if (now?.status === "DECLINED") return { success: true };
      return { success: false, error: "PROPOSAL_CLOSED", message: closedProposalMessage(now?.status ?? "") };
    }

    safeRevalidate(`/${tenantSlug}/proposals/${proposal.id}`);
    safeRevalidate(`/${tenantSlug}/admin/proposals`);
    safeRevalidate(`/${tenantSlug}/account`);
    return { success: true };
  } catch (error) {
    console.error("Error declining proposal:", error);
    return { success: false, error: "DECLINE_FAILED", message: errorMessageOf(error) || "Could not decline the proposal." };
  }
}
