"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { AuthorizationError } from "@/lib/auth/guard";
import { requireAccess } from "@/lib/auth/access-guard";
import { levelAtLeast } from "@/lib/auth/access";
import { loadClientProfile } from "@/lib/client-directory";
import { actionErrorMessage } from "@/lib/action-error";

/**
 * Studio-side edits to a client: contact details and the studio's private notes.
 * The team needs Clients access to make them.
 */

/** Refreshes cached pages; a no-op outside a Next request (scripts, tests). Never fails a save. */
function safeRevalidate(...paths: string[]) {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // Non-request context
    }
  }
}

type ActionResult = { success: true } | { success: false; error: string };

const ClientDetailsSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  phone: z
    .string()
    .trim()
    .max(40, "Phone number is too long")
    .refine((v) => v === "" || v.replace(/[^0-9]/g, "").length >= 6, "Enter a valid phone number, or leave it empty"),
  /** Also write the new details onto this client's bookings (they keep their own copy). */
  syncBookings: z.boolean().default(true),
});

export async function updateClientDetails(input: z.input<typeof ClientDetailsSchema>): Promise<ActionResult> {
  try {
    const data = ClientDetailsSchema.parse(input);
    await requireAccess(data.tenantId, "clients", "MANAGE");

    const client = await db.user.findFirst({
      where: { id: data.clientId, tenantId: data.tenantId, role: "CLIENT" },
      select: { id: true, email: true },
    });
    if (!client) return { success: false, error: "Client not found." };

    const oldEmail = client.email.trim().toLowerCase();
    if (data.email !== oldEmail) {
      // One account per email per studio. Legacy rows may be mixed case, so compare both forms.
      const taken = await db.user.findFirst({
        where: { tenantId: data.tenantId, id: { not: client.id }, email: { in: [data.email, input.email.trim()] } },
        select: { id: true },
      });
      if (taken) return { success: false, error: "Another account at this studio already uses that email." };
    }

    const phone = data.phone === "" ? null : data.phone;

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: client.id },
        data: { name: data.name, email: data.email, phone },
      });

      if (data.syncBookings) {
        // This client's bookings: linked ones, plus older guest bookings made with their old email
        // (which get linked to the account now, so they keep showing up after an email change).
        const unlinked = await tx.clientBooking.findMany({
          where: { tenantId: data.tenantId, userId: null },
          select: { id: true, clientEmail: true },
        });
        const unlinkedIds = unlinked.filter((b) => b.clientEmail.trim().toLowerCase() === oldEmail).map((b) => b.id);

        await tx.clientBooking.updateMany({
          where: { tenantId: data.tenantId, OR: [{ userId: client.id }, { id: { in: unlinkedIds } }] },
          data: {
            userId: client.id,
            clientName: data.name,
            clientEmail: data.email,
            // A booking always has a phone; keep the one it has if the account's was cleared.
            ...(phone ? { clientPhone: phone } : {}),
          },
        });
      }
    });

    safeRevalidate(
      `/${data.tenantSlug}/admin/clients`,
      `/${data.tenantSlug}/admin/clients/${client.id}`,
      ...(data.syncBookings ? [`/${data.tenantSlug}/admin/bookings`, `/${data.tenantSlug}/account`] : [])
    );
    return { success: true };
  } catch (error) {
    if (error instanceof AuthorizationError) return { success: false, error: "You are not allowed to edit this studio's clients." };
    return { success: false, error: actionErrorMessage(error, "Could not save the client's details.") };
  }
}

const ClientNotesSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  clientId: z.string().min(1),
  notes: z.string().max(5000, "Notes can be at most 5,000 characters"),
});

export async function updateClientNotes(input: z.input<typeof ClientNotesSchema>): Promise<ActionResult> {
  try {
    const data = ClientNotesSchema.parse(input);
    await requireAccess(data.tenantId, "clients", "MANAGE");

    const { count } = await db.user.updateMany({
      where: { id: data.clientId, tenantId: data.tenantId, role: "CLIENT" },
      data: { staffNotes: data.notes.trim() === "" ? null : data.notes.trim() },
    });
    if (count === 0) return { success: false, error: "Client not found." };

    safeRevalidate(`/${data.tenantSlug}/admin/clients/${data.clientId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof AuthorizationError) return { success: false, error: "You are not allowed to edit this studio's clients." };
    return { success: false, error: actionErrorMessage(error, "Could not save the notes.") };
  }
}

export type QuickClientProfile = {
  client: {
    id: string;
    name: string;
    email: string;
    accountPhone: string | null;
    phone: string | null;
    accountStatus: string;
    staffNotes: string;
    createdAt: string;
  };
  bookings: Array<{
    id: string;
    trackingCode: string;
    status: string;
    packageName: string | null;
    serviceTier: string;
    targetDate: string | null;
    sessionPrice: number | null;
    depositAmount: number | null;
    depositPaid: boolean;
    clientEmail: string;
    clientPhone: string;
    createdAt: string;
  }>;
  projects: Array<{
    id: string;
    projectNumber: string;
    title: string;
    status: string;
    budget: number | null;
    shootDates: string | null;
    updatedAt: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    milestoneType: string;
    description: string | null;
    amount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
  }>;
  proposals: Array<{
    id: string;
    proposalNumber: string;
    title: string;
    status: string;
    totalPrice: number;
    createdAt: string;
  }>;
  money: {
    paid: number;
    outstanding: number;
  } | null;
};

export async function getClientQuickProfile(
  tenantId: string,
  clientId: string
): Promise<{ success: true; profile: QuickClientProfile } | { success: false; error: string }> {
  try {
    const user = await requireAccess(tenantId, "clients", "VIEW");
    const showMoney = levelAtLeast(user.access.areas.invoices, "VIEW");
    const showProposals = levelAtLeast(user.access.areas.proposals, "VIEW");
    const profile = await loadClientProfile(tenantId, clientId, { money: showMoney, proposals: showProposals });
    if (!profile) return { success: false, error: "Client not found." };

    return {
      success: true,
      profile: {
        client: {
          ...profile.client,
          createdAt: profile.client.createdAt.toISOString(),
        },
        bookings: profile.bookings.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
        })),
        projects: profile.projects.map((p) => ({
          ...p,
          updatedAt: p.updatedAt.toISOString(),
        })),
        invoices: profile.invoices.map((i) => ({
          ...i,
          dueDate: i.dueDate.toISOString(),
          paidAt: i.paidAt ? i.paidAt.toISOString() : null,
        })),
        proposals: profile.proposals.map((pr) => ({
          ...pr,
          createdAt: pr.createdAt.toISOString(),
        })),
        money: profile.money,
      },
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return { success: false, error: "You are not allowed to view this studio's clients." };
    return { success: false, error: actionErrorMessage(error, "Could not load client details.") };
  }
}
