"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { sendNotification } from "@/lib/notifications";
import {
  SignProposalSchema,
  type SignProposalInput,
  ToggleAddOnSchema,
  type ToggleAddOnInput,
} from "@/lib/validations/proposals";

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
        tenant: true,
        client: true,
        studio: true,
        addOns: {
          orderBy: { price: "desc" },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
        },
        project: true,
      },
    });

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
          ? `/${tenantSlug}/checkout?invoiceId=${existingInvoice.id}`
          : `/${tenantSlug}/vault/${proposal.project.id}`,
      };
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

      // Update Proposal
      const updatedProposal = await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          status: "ACCEPTED",
          clientSignature: signatureDataUrl,
          signedAt: new Date(),
          totalPrice,
          depositAmount,
          finalBalanceAmount,
        },
      });

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
        const year = new Date().getFullYear();
        let invoiceNumber = "";
        let invAttempts = 0;
        const maxInvAttempts = 10;

        while (!invoiceNumber && invAttempts < maxInvAttempts) {
          invAttempts++;
          const rand = Math.floor(100000 + Math.random() * 900000);
          const candidate = `INV-${year}-${rand}`;

          const existing = await tx.milestoneInvoice.findUnique({
            where: { invoiceNumber: candidate },
            select: { id: true },
          });

          if (!existing) {
            invoiceNumber = candidate;
          }
        }

        // Defensive fallback in the virtually impossible case that 10 attempts collided
        if (!invoiceNumber) {
          invoiceNumber = `INV-${year}-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
        }

        invoice = await tx.milestoneInvoice.create({
          data: {
            tenantId: proposal.tenantId,
            invoiceNumber,
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

      return { proposal: updatedProposal, project, invoice };
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
      proposalId: result.proposal.id,
      projectId: result.project.id,
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
      amount: depositAmount,
      checkoutUrl: `/${tenantSlug}/checkout?invoiceId=${result.invoice.id}`,
    };
  } catch (error: any) {
    console.error("Error accepting proposal:", error);
    return {
      success: false,
      error: "ACCEPT_FAILED",
      message: error.message || "Failed to accept proposal.",
    };
  }
}

// Alias for signAndAcceptProposal
export const signAndAcceptProposal = acceptProposal;

export async function toggleProposalAddOn(input: ToggleAddOnInput) {
  try {
    const { proposalId, addOnId, isSelected } = ToggleAddOnSchema.parse(input);

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
  } catch (error: any) {
    console.error("Error toggling add-on:", error);
    return { success: false, error: error.message || "Failed to toggle add-on." };
  }
}
