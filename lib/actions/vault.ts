"use server";

import { db } from "@/lib/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRecordAccess } from "@/lib/auth/project-access";
import { errorMessageOf } from "@/lib/action-error";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

/** Only the project's client or the studio's staff may mark up its deliverables. */
async function requireItemAccess(itemId: string) {
  const item = await db.deliverableItem.findUnique({
    where: { id: itemId },
    select: { deliverable: { select: { project: { select: { tenantId: true, clientId: true } } } } },
  });
  if (!item) throw new Error("Deliverable item not found");
  const { tenantId, clientId } = item.deliverable.project;
  await requireRecordAccess(tenantId, clientId);
}

const ToggleFavoriteSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  isFav: z.boolean(),
});

const SubmitRetouchNoteSchema = z.object({
  itemId: z.string().min(1, "Item ID is required"),
  note: z.string().max(1000, "Notes cannot exceed 1000 characters"),
});

export async function toggleClientFavorite(input: z.infer<typeof ToggleFavoriteSchema>) {
  try {
    const { itemId, isFav } = ToggleFavoriteSchema.parse(input);
    await requireItemAccess(itemId);

    const item = await db.deliverableItem.update({
      where: { id: itemId },
      data: { isClientFav: isFav },
      include: {
        deliverable: {
          select: {
            projectId: true,
            project: { select: { tenant: { select: { slug: true } } } },
          },
        },
      },
    });

    const tenantSlug = item.deliverable.project.tenant.slug;
    const projectId = item.deliverable.projectId;
    safeRevalidate(`/${tenantSlug}/vault/${projectId}`);

    return { success: true, isClientFav: item.isClientFav };
  } catch (error) {
    console.error("toggleClientFavorite error:", error);
    return { success: false, error: errorMessageOf(error) || "Failed to update favorite status" };
  }
}

export async function submitRetouchNote(input: z.infer<typeof SubmitRetouchNoteSchema>) {
  try {
    const { itemId, note } = SubmitRetouchNoteSchema.parse(input);
    await requireItemAccess(itemId);

    const item = await db.deliverableItem.update({
      where: { id: itemId },
      data: { clientNotes: note.trim() || null },
      include: {
        deliverable: {
          select: {
            projectId: true,
            project: { select: { tenant: { select: { slug: true } } } },
          },
        },
      },
    });

    const tenantSlug = item.deliverable.project.tenant.slug;
    const projectId = item.deliverable.projectId;
    safeRevalidate(`/${tenantSlug}/vault/${projectId}`);

    return { success: true, clientNotes: item.clientNotes };
  } catch (error) {
    console.error("submitRetouchNote error:", error);
    return { success: false, error: errorMessageOf(error) || "Failed to save retouch note" };
  }
}
