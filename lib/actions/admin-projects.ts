"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireOwner, requireStaff } from "@/lib/auth/guard";
import { actionErrorMessage } from "@/lib/action-error";
import { deleteDeliverableFiles } from "@/lib/deliverables/storage";
import { sendNotification } from "@/lib/notifications";
import { clientInvitePath, issueClientInvite } from "@/lib/auth/invite";
import { PROJECT_STAGES } from "@/lib/projects/constants";

/**
 * Studio-side management of proposals and the projects they turn into: create a proposal
 * for a client; then, once accepted, run the project (status, call sheets, deliverables,
 * gear). Creating a proposal sets prices, so it is owner-only; the rest is any staff.
 */

type Result<T = object> = ({ success: true } & T) | { success: false; error: string; message: string };
const fail = (error: string, message: string) => ({ success: false as const, error, message });

function revalidate(paths: string[]) {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // non-request context
    }
  }
}

async function projectOf(tenantId: string, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, tenantId }, include: { tenant: { select: { slug: true } } } });
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

const CreateProposalSchema = z
  .object({
    tenantId: z.string().min(1),
    tenantSlug: z.string().min(1),
    clientId: z.string().optional(),
    newClient: z
      .object({
        name: z.string().trim().min(2, "Client name must be at least 2 characters"),
        email: z.string().trim().email("Enter a valid client email"),
        phone: z.string().trim().optional(),
      })
      .optional(),
    title: z.string().trim().min(3, "Give the proposal a title.").max(160),
    category: z.string().min(1, "Choose a category."),
    discipline: z.enum(["PHOTOGRAPHY", "VIDEOGRAPHY", "HYBRID"]),
    basePrice: z.coerce.number().positive("Enter the base price."),
    depositPercentage: z.coerce.number().min(10, "Deposit is at least 10%.").max(100),
    contractTerms: z.string().trim().min(20, "Add the terms the client agrees to.").max(5000),
    addOnTemplateIds: z.array(z.string()).default([]),
    notifyClient: z.boolean().default(true),
  })
  .refine((v) => !!v.clientId || !!v.newClient, { message: "Choose or add a client." });

async function nextProposalNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const rows = await db.proposal.findMany({ where: { proposalNumber: { startsWith: prefix } }, select: { proposalNumber: true } });
  const max = rows.reduce((m, r) => {
    const n = Number(r.proposalNumber.slice(prefix.length));
    return Number.isFinite(n) && n < 100000 ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function createProposal(
  input: z.input<typeof CreateProposalSchema>
): Promise<Result<{ proposalId: string; proposalNumber: string; shareUrl: string }>> {
  try {
    const data = CreateProposalSchema.parse(input);
    const session = await requireOwner(data.tenantId);
    const tenant = await db.tenant.findUnique({ where: { id: data.tenantId }, select: { name: true, slug: true } });
    if (!tenant) return fail("TENANT_NOT_FOUND", "Studio not found.");

    let client = data.clientId
      ? await db.user.findFirst({ where: { id: data.clientId, tenantId: data.tenantId, role: "CLIENT" } })
      : await db.user.findFirst({ where: { tenantId: data.tenantId, email: data.newClient!.email.toLowerCase() } });
    if (client && client.role !== "CLIENT") return fail("NOT_A_CLIENT", "That email belongs to a studio team member.");
    if (!client && data.clientId) return fail("CLIENT_NOT_FOUND", "Client not found.");
    if (!client) {
      client = await db.user.create({
        data: {
          tenantId: data.tenantId,
          name: data.newClient!.name,
          email: data.newClient!.email.toLowerCase(),
          phone: data.newClient!.phone || null,
          role: "CLIENT",
          isQuickCreated: true,
        },
      });
    }

    const templates = data.addOnTemplateIds.length
      ? await db.proposalAddOnTemplate.findMany({ where: { id: { in: data.addOnTemplateIds }, tenantId: data.tenantId, isActive: true } })
      : [];
    const preselected = templates.filter((t) => t.isDefault).reduce((sum, t) => sum + t.price, 0);
    const totalPrice = Math.round((data.basePrice + preselected) * 100) / 100;
    const depositAmount = Math.round(totalPrice * data.depositPercentage) / 100;

    let proposal = null;
    for (let attempt = 0; attempt < 5 && !proposal; attempt++) {
      try {
        proposal = await db.proposal.create({
          data: {
            tenantId: data.tenantId,
            proposalNumber: await nextProposalNumber(),
            clientId: client.id,
            studioId: session.id,
            title: data.title,
            category: data.category,
            discipline: data.discipline,
            basePrice: data.basePrice,
            totalPrice,
            depositPercentage: data.depositPercentage,
            depositAmount,
            finalBalanceAmount: Math.round((totalPrice - depositAmount) * 100) / 100,
            status: "SENT",
            contractTerms: data.contractTerms,
            addOns: {
              create: templates.map((t) => ({
                name: t.name,
                description: t.description,
                price: t.price,
                unit: t.unit,
                quantity: 1,
                isSelected: t.isDefault,
              })),
            },
          },
        });
      } catch (err: any) {
        if (err?.code !== "P2002") throw err; // number taken by a concurrent proposal: try the next one
      }
    }
    if (!proposal) return fail("NUMBER_CONFLICT", "Could not number the proposal. Try again.");

    const shareUrl = `/${tenant.slug}/proposals/${proposal.id}`;
    revalidate([`/${tenant.slug}/admin/proposals`, `/${tenant.slug}/admin`]);
    if (data.notifyClient && client.email) {
      // Signing needs a signed-in client. One without a password gets a link that sets one first.
      const link = client.passwordHash
        ? shareUrl
        : clientInvitePath(tenant.slug, client.email, await issueClientInvite(client.id), shareUrl);
      sendNotification({
        event: "STUDIO_UPDATE",
        studioName: tenant.name,
        studioSlug: tenant.slug,
        clientName: client.name,
        clientEmail: client.email,
        clientPhone: client.phone || undefined,
        headline: `Your proposal: ${data.title}`,
        message: `${tenant.name} has sent you a proposal. Review the details, choose any extras, and sign it online to book.`,
        linkUrl: `${env.NEXT_PUBLIC_APP_URL}${link}`,
        linkLabel: client.passwordHash ? "Sign in to review and sign" : "Set your password, then review and sign",
      }).catch((e) => console.error("Notification dispatch failed:", e));
    }
    return { success: true, proposalId: proposal.id, proposalNumber: proposal.proposalNumber, shareUrl };
  } catch (err) {
    return fail("CREATE_PROPOSAL_FAILED", actionErrorMessage(err, "Could not create the proposal."));
  }
}

// ---------------------------------------------------------------------------
// Project status
// ---------------------------------------------------------------------------


const StatusSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(PROJECT_STAGES),
});

export async function updateProjectStatus(input: z.input<typeof StatusSchema>): Promise<Result> {
  try {
    const data = StatusSchema.parse(input);
    await requireStaff(data.tenantId);
    const project = await projectOf(data.tenantId, data.projectId);
    if (!project) return fail("NOT_FOUND", "Project not found.");
    await db.project.update({ where: { id: project.id }, data: { status: data.status } });
    revalidate([`/${project.tenant.slug}/admin/projects`, `/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/admin`]);
    return { success: true };
  } catch (err) {
    return fail("STATUS_FAILED", actionErrorMessage(err, "Could not update the project."));
  }
}

// ---------------------------------------------------------------------------
// Call sheets
// ---------------------------------------------------------------------------

const CrewMember = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().default(""),
  callTime: z.string().trim().default(""),
  phone: z.string().trim().default(""),
});

const CallSheetSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(3, "Give the shoot day a title.").max(160),
  shootDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the shoot date."),
  generalCallTime: z.string().trim().min(3, "Enter the call time, e.g. 07:00 AM."),
  locationName: z.string().trim().min(2, "Enter the location."),
  locationAddress: z.string().trim().min(5, "Enter the address."),
  locationPinUrl: z.string().trim().url("The map link must be a full web address.").optional().or(z.literal("")),
  parkingNotes: z.string().trim().max(500).optional(),
  hospitalName: z.string().trim().max(160).optional(),
  hospitalAddress: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
  crew: z.array(CrewMember).max(50).default([]),
});

export async function createCallSheet(input: z.input<typeof CallSheetSchema>): Promise<Result<{ callSheetId: string }>> {
  try {
    const data = CallSheetSchema.parse(input);
    await requireStaff(data.tenantId);
    const project = await projectOf(data.tenantId, data.projectId);
    if (!project) return fail("NOT_FOUND", "Project not found.");
    const sheet = await db.callSheet.create({
      data: {
        projectId: project.id,
        title: data.title,
        shootDate: new Date(`${data.shootDate}T00:00:00.000Z`),
        generalCallTime: data.generalCallTime,
        locationName: data.locationName,
        locationAddress: data.locationAddress,
        locationPinUrl: data.locationPinUrl || null,
        parkingNotes: data.parkingNotes || null,
        hospitalName: data.hospitalName || null,
        hospitalAddress: data.hospitalAddress || null,
        notes: data.notes || null,
        crewJson: data.crew.length ? JSON.stringify(data.crew) : null,
      },
    });
    revalidate([`/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/admin`]);
    return { success: true, callSheetId: sheet.id };
  } catch (err) {
    return fail("CALL_SHEET_FAILED", actionErrorMessage(err, "Could not create the call sheet."));
  }
}

const DeleteCallSheetSchema = z.object({ tenantId: z.string().min(1), callSheetId: z.string().min(1) });

export async function deleteCallSheet(input: z.input<typeof DeleteCallSheetSchema>): Promise<Result> {
  try {
    const data = DeleteCallSheetSchema.parse(input);
    await requireStaff(data.tenantId);
    const sheet = await db.callSheet.findFirst({
      where: { id: data.callSheetId, project: { tenantId: data.tenantId } },
      include: { project: { include: { tenant: { select: { slug: true } } } } },
    });
    if (!sheet) return fail("NOT_FOUND", "Call sheet not found.");
    await db.callSheet.delete({ where: { id: sheet.id } });
    revalidate([`/${sheet.project.tenant.slug}/admin/projects/${sheet.projectId}`]);
    return { success: true };
  } catch (err) {
    return fail("DELETE_FAILED", actionErrorMessage(err, "Could not delete the call sheet."));
  }
}

// ---------------------------------------------------------------------------
// Deliverables and gear
// ---------------------------------------------------------------------------

const DeleteItemSchema = z.object({ tenantId: z.string().min(1), itemId: z.string().min(1) });

/** Removes a delivered file (and its stored master and preview). */
export async function deleteDeliverableItem(input: z.input<typeof DeleteItemSchema>): Promise<Result> {
  try {
    const data = DeleteItemSchema.parse(input);
    await requireStaff(data.tenantId);
    const item = await db.deliverableItem.findFirst({
      where: { id: data.itemId, deliverable: { project: { tenantId: data.tenantId } } },
      include: { deliverable: { include: { project: { include: { tenant: { select: { slug: true } } } } } } },
    });
    if (!item) return fail("NOT_FOUND", "File not found.");
    await db.deliverableItem.delete({ where: { id: item.id } });
    await deleteDeliverableFiles(item);
    const project = item.deliverable.project;
    revalidate([`/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/vault/${project.id}`]);
    return { success: true };
  } catch (err) {
    return fail("DELETE_FAILED", actionErrorMessage(err, "Could not delete the file."));
  }
}

const CancelReservationSchema = z.object({ tenantId: z.string().min(1), reservationId: z.string().min(1) });

/** Releases gear reserved for a project, before it has been checked out. */
export async function cancelEquipmentReservation(input: z.input<typeof CancelReservationSchema>): Promise<Result> {
  try {
    const data = CancelReservationSchema.parse(input);
    await requireStaff(data.tenantId);
    const reservation = await db.equipmentReservation.findFirst({
      where: { id: data.reservationId, project: { tenantId: data.tenantId } },
      include: { project: { include: { tenant: { select: { slug: true } } } } },
    });
    if (!reservation) return fail("NOT_FOUND", "Reservation not found.");
    if (reservation.status !== "RESERVED") return fail("IN_USE", "This gear is already checked out. Check it in instead.");
    await db.equipmentReservation.delete({ where: { id: reservation.id } });
    // The item goes back to the shelf unless another reservation still holds it.
    const stillHeld = await db.equipmentReservation.count({ where: { itemId: reservation.itemId, status: { in: ["RESERVED", "CHECKED_OUT"] } } });
    if (stillHeld === 0) {
      await db.inventoryItem.updateMany({ where: { id: reservation.itemId, status: "RESERVED" }, data: { status: "AVAILABLE" } });
    }
    const slug = reservation.project.tenant.slug;
    revalidate([`/${slug}/admin/projects/${reservation.projectId}`, `/${slug}/admin/inventory`]);
    return { success: true };
  } catch (err) {
    return fail("CANCEL_FAILED", actionErrorMessage(err, "Could not release the gear."));
  }
}
