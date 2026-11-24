"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCanWorkOn, requireAccess, requireOwnOrManage, requireTick } from "@/lib/auth/access-guard";
import { actionErrorMessage } from "@/lib/action-error";
import { deleteDeliverableFiles } from "@/lib/deliverables/storage";
import { filesReleased } from "@/lib/deliverables/access";
import { sendNotification } from "@/lib/notifications";
import { clientInvitePath, issueClientInvite } from "@/lib/auth/invite";
import { PROJECT_STAGES } from "@/lib/projects/constants";
import { studioPath, studioUrl } from "@/lib/domain-name";
import { requireFeature } from "@/lib/billing/guard";

/**
 * Studio-side management of proposals and the projects they turn into: create a proposal
 * for a client; then, once accepted, run the project (status, call sheets, deliverables,
 * gear). Creating a proposal sets prices, so it needs the "set prices" permission; the rest
 * needs Galleries or Production access.
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
    /** false: save as a draft the client can't see, to send later from the Proposals list. */
    sendNow: z.boolean().default(true),
  })
  .refine((v) => !!v.clientId || !!v.newClient, { message: "Choose or add a client." });

/** Emails the client a link to review and sign. One without a password sets one first. */
async function emailProposalToClient(
  tenant: { name: string; slug: string },
  client: { id: string; name: string; email: string; phone: string | null; passwordHash: string | null },
  proposal: { id: string; title: string }
) {
  const shareRel = `/proposals/${proposal.id}`;
  const link = client.passwordHash
    ? shareRel
    : clientInvitePath(client.email, await issueClientInvite(client.id), studioPath(tenant.slug, shareRel));
  sendNotification({
    event: "STUDIO_UPDATE",
    studioName: tenant.name,
    studioSlug: tenant.slug,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone || undefined,
    headline: `Your proposal: ${proposal.title}`,
    message: `${tenant.name} has sent you a proposal. Review the details, choose any extras, and sign it online to book.`,
    linkUrl: studioUrl(tenant.slug, link),
    linkLabel: client.passwordHash ? "Sign in to review and sign" : "Set your password, then review and sign",
  }).catch((e) => console.error("Notification dispatch failed:", e));
}

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
): Promise<Result<{ proposalId: string; proposalNumber: string; shareUrl: string; status: "DRAFT" | "SENT" }>> {
  try {
    const data = CreateProposalSchema.parse(input);
    const session = await requireTick(data.tenantId, "setPrices");
    await requireFeature(data.tenantId, "proposals", session);
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
            status: data.sendNow ? "SENT" : "DRAFT",
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
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err; // number taken by a concurrent proposal: try the next one
      }
    }
    if (!proposal) return fail("NUMBER_CONFLICT", "Could not number the proposal. Try again.");

    const shareUrl = studioPath(tenant.slug, `/proposals/${proposal.id}`);
    revalidate([`/${tenant.slug}/admin/proposals`, `/${tenant.slug}/admin`]);
    if (data.sendNow && data.notifyClient && client.email) await emailProposalToClient(tenant, client, proposal);
    return {
      success: true,
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      shareUrl,
      status: data.sendNow ? "SENT" : "DRAFT",
    };
  } catch (err) {
    return fail("CREATE_PROPOSAL_FAILED", actionErrorMessage(err, "Could not create the proposal."));
  }
}

const ProposalRefSchema = z.object({ tenantId: z.string().min(1), proposalId: z.string().min(1) });
const SendProposalSchema = ProposalRefSchema.extend({ notifyClient: z.boolean().default(true) });

/** Sends a draft: the client can now see and sign it, and is emailed a link. Same permission as creating one. */
export async function sendProposal(input: z.input<typeof SendProposalSchema>): Promise<Result<{ shareUrl: string }>> {
  try {
    const data = SendProposalSchema.parse(input);
    await requireFeature(data.tenantId, "proposals", await requireTick(data.tenantId, "setPrices"));
    const proposal = await db.proposal.findFirst({
      where: { id: data.proposalId, tenantId: data.tenantId },
      include: { tenant: { select: { name: true, slug: true } }, client: true },
    });
    if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
    // Only a draft, and only once if two people press Send together.
    const sent = await db.proposal.updateMany({ where: { id: proposal.id, status: "DRAFT" }, data: { status: "SENT" } });
    if (sent.count === 0) return fail("NOT_A_DRAFT", "This proposal has already been sent.");

    if (data.notifyClient && proposal.client.email) await emailProposalToClient(proposal.tenant, proposal.client, proposal);
    revalidate([`/${proposal.tenant.slug}/admin/proposals`, `/${proposal.tenant.slug}/admin`]);
    return { success: true, shareUrl: studioPath(proposal.tenant.slug, `/proposals/${proposal.id}`) };
  } catch (err) {
    return fail("SEND_PROPOSAL_FAILED", actionErrorMessage(err, "Could not send the proposal."));
  }
}

/** Deletes a draft. A sent proposal stays: the client has seen it. */
export async function deleteDraftProposal(input: z.input<typeof ProposalRefSchema>): Promise<Result> {
  try {
    const data = ProposalRefSchema.parse(input);
    await requireTick(data.tenantId, "setPrices");
    const proposal = await db.proposal.findFirst({
      where: { id: data.proposalId, tenantId: data.tenantId },
      select: { id: true, tenant: { select: { slug: true } } },
    });
    if (!proposal) return fail("NOT_FOUND", "Proposal not found.");
    const removed = await db.proposal.deleteMany({ where: { id: proposal.id, status: "DRAFT" } });
    if (removed.count === 0) return fail("NOT_A_DRAFT", "Only a draft can be deleted. This one has been sent.");
    revalidate([`/${proposal.tenant.slug}/admin/proposals`, `/${proposal.tenant.slug}/admin`]);
    return { success: true };
  } catch (err) {
    return fail("DELETE_PROPOSAL_FAILED", actionErrorMessage(err, "Could not delete the draft."));
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
    // Galleries MANAGE, or OWN on a project they lead or are assigned to; VIEW is read-only.
    const user = await requireOwnOrManage(data.tenantId, "galleries");
    const project = await projectOf(data.tenantId, data.projectId);
    if (!project) return fail("NOT_FOUND", "Project not found.");
    await assertCanWorkOn(user, data.tenantId, "galleries", project.id);
    await db.project.update({ where: { id: project.id }, data: { status: data.status } });
    revalidate([`/${project.tenant.slug}/admin/projects`, `/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/admin`]);
    return { success: true };
  } catch (err) {
    return fail("STATUS_FAILED", actionErrorMessage(err, "Could not update the project."));
  }
}

const KindSchema = z.object({
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  kind: z.enum(["SESSION", "PRODUCTION"]),
});

/**
 * Switches a project between Session (files + payments) and Production (adds call sheets,
 * shot list and gear). Nothing is deleted: a Production's plans are only hidden on a Session.
 */
export async function updateProjectKind(input: z.input<typeof KindSchema>): Promise<Result> {
  try {
    const data = KindSchema.parse(input);
    await requireAccess(data.tenantId, "galleries", "MANAGE");
    const project = await projectOf(data.tenantId, data.projectId);
    if (!project) return fail("NOT_FOUND", "Project not found.");
    await db.project.update({ where: { id: project.id }, data: { kind: data.kind } });
    revalidate([`/${project.tenant.slug}/admin/projects`, `/${project.tenant.slug}/admin/projects/${project.id}`]);
    return { success: true };
  } catch (err) {
    return fail("KIND_FAILED", actionErrorMessage(err, "Could not change the kind of project."));
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
    await requireFeature(data.tenantId, "callSheets", await requireAccess(data.tenantId, "production", "MANAGE"));
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
    await requireAccess(data.tenantId, "production", "MANAGE");
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

/** Print orders that no longer need their photos. */
const FINISHED_PRINT_ORDER_STATUSES = ["CANCELLED", "COLLECTED", "DELIVERED"] as const;

const DeleteItemSchema = z.object({ tenantId: z.string().min(1), itemId: z.string().min(1) });

/** Removes a delivered file (and its stored master and preview); refused while it is in an open print order. */
export async function deleteDeliverableItem(input: z.input<typeof DeleteItemSchema>): Promise<Result> {
  try {
    const data = DeleteItemSchema.parse(input);
    const user = await requireOwnOrManage(data.tenantId, "galleries");
    const item = await db.deliverableItem.findFirst({
      where: { id: data.itemId, deliverable: { project: { tenantId: data.tenantId } } },
      include: { deliverable: { include: { project: { include: { tenant: { select: { slug: true } } } } } } },
    });
    if (!item) return fail("NOT_FOUND", "File not found.");
    await assertCanWorkOn(user, data.tenantId, "galleries", item.deliverable.projectId);
    // The studio prints from this photo's master until the order is done or cancelled.
    const inOpenOrder = await db.printOrderItem.count({
      where: { deliverableItemId: item.id, order: { status: { notIn: [...FINISHED_PRINT_ORDER_STATUSES] } } },
    });
    if (inOpenOrder > 0) return fail("IN_PRINT_ORDER", "This photo is in a print order. Cancel or finish that order first.");
    await db.deliverableItem.delete({ where: { id: item.id } });
    await deleteDeliverableFiles(item);
    const project = item.deliverable.project;
    revalidate([`/${project.tenant.slug}/admin/projects/${project.id}`, `/${project.tenant.slug}/vault/${project.id}`]);
    return { success: true };
  } catch (err) {
    return fail("DELETE_FAILED", actionErrorMessage(err, "Could not delete the file."));
  }
}

const NotifyPhotosReadySchema = z.object({ tenantId: z.string().min(1), projectId: z.string().min(1) });

/**
 * Tells the client their edited photos/videos are in the vault (email, plus a WhatsApp link
 * for staff to send). Staff press this once the upload is complete, so a shoot uploaded in
 * several batches sends one message. It says the files can be downloaded when they are released
 * (balance paid, or the studio's "full resolution right away" setting), otherwise that watermarked
 * previews are ready; an unpaid balance invoice is linked either way.
 * Moves the project to "Delivered" when the files are released, otherwise to "Client review".
 */
export async function notifyClientPhotosReady(
  input: z.input<typeof NotifyPhotosReadySchema>
): Promise<Result<{ photoCount: number; videoCount: number; emailDelivery: string; whatsappUrl?: string }>> {
  try {
    const data = NotifyPhotosReadySchema.parse(input);
    const user = await requireOwnOrManage(data.tenantId, "galleries", { whilePaused: true });
    const project = await db.project.findFirst({
      where: { id: data.projectId, tenantId: data.tenantId },
      include: {
        tenant: { select: { name: true, slug: true, currency: true, releaseFilesBeforePayment: true } },
        client: { select: { name: true, email: true, phone: true } },
        deliverables: { select: { items: { select: { itemType: true } } } },
      },
    });
    if (!project) return fail("NOT_FOUND", "Project not found.");
    await assertCanWorkOn(user, data.tenantId, "galleries", project.id);

    const items = project.deliverables.flatMap((d) => d.items);
    const photoCount = items.filter((i) => i.itemType === "PHOTO").length;
    const videoCount = items.length - photoCount;
    if (items.length === 0) return fail("NO_FILES", "Upload the photos first: the client's gallery is empty.");

    const slug = project.tenant.slug;
    const unlocked = filesReleased(project, project.tenant);
    const balanceInvoice = project.isFinalBalancePaid
      ? null
      : await db.milestoneInvoice.findFirst({
          where: {
            tenantId: data.tenantId,
            milestoneType: { in: ["FINAL_BALANCE_50", "BOOKING_BALANCE"] },
            status: { not: "PAID" },
            OR: [{ projectId: project.id }, ...(project.bookingId ? [{ bookingId: project.bookingId }] : [])],
          },
          orderBy: { createdAt: "desc" },
        });

    const result = await sendNotification({
      event: "PHOTOS_READY",
      studioName: project.tenant.name,
      studioSlug: slug,
      clientName: project.client.name,
      clientEmail: project.client.email,
      clientPhone: project.client.phone || undefined,
      projectTitle: project.title,
      vaultUrl: studioUrl(slug, `/vault/${project.id}`),
      photoCount,
      videoCount,
      unlocked,
      balanceDue: balanceInvoice
        ? { amount: balanceInvoice.amount, currency: project.tenant.currency, payUrl: studioUrl(slug, `/checkout?invoiceId=${balanceInvoice.id}`) }
        : undefined,
    });

    // Move the project forward, never back: "Client review" while locked, "Delivered" once released.
    const target = unlocked ? "DELIVERED" : "IN_REVIEW";
    const stage = (s: string) => PROJECT_STAGES.indexOf(s as (typeof PROJECT_STAGES)[number]);
    if (stage(project.status) < stage(target)) {
      await db.project.update({ where: { id: project.id }, data: { status: target } });
    }

    // The photos are handed over: a booking that was on (confirmed, or shoot done) is now delivered.
    // Cancelled and no-show bookings keep their status.
    const booking = project.bookingId
      ? await db.clientBooking.findUnique({ where: { id: project.bookingId }, select: { id: true, status: true, deliveredAt: true } })
      : null;
    if (booking && (booking.status === "CONFIRMED" || booking.status === "COMPLETED")) {
      await db.clientBooking.update({
        where: { id: booking.id },
        data: { status: "DELIVERED", deliveredAt: booking.deliveredAt ?? new Date() },
      });
    }

    revalidate([`/${slug}/admin/projects`, `/${slug}/admin/projects/${project.id}`, `/${slug}/account`, `/${slug}/admin/bookings`]);
    return { success: true, photoCount, videoCount, emailDelivery: result.emailDelivery, whatsappUrl: result.whatsappUrl };
  } catch (err) {
    return fail("NOTIFY_FAILED", actionErrorMessage(err, "Could not notify the client."));
  }
}

const CancelReservationSchema = z.object({ tenantId: z.string().min(1), reservationId: z.string().min(1) });

/** Releases gear reserved for a project, before it has been checked out. */
export async function cancelEquipmentReservation(input: z.input<typeof CancelReservationSchema>): Promise<Result> {
  try {
    const data = CancelReservationSchema.parse(input);
    await requireAccess(data.tenantId, "production", "MANAGE");
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
