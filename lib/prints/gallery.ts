import { db } from "@/lib/db";
import { loadProjectEntitlements } from "@/lib/prints/entitlements";
import { parseResolution, type PhotoSize } from "@/lib/prints/orientation";

/**
 * What a gallery's "Framed prints" section shows: the included prints with what is left of each,
 * whether ordering is unlocked, and the project's past print orders.
 *
 * UNSCOPED: the caller must first check the project belongs to the tenant and that the viewer is
 * its client or the studio's staff. Not a "use server" module.
 */

export type FramedPrintLine = {
  id: string;
  sizeName: string;
  frameName: string;
  quantity: number;
  remaining: number;
};

export type FramedPrintOrder = {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: string;
  totalAmount: number;
  courier: string | null;
  trackingNumber: string | null;
  invoiceId: string | null;
  createdAt: string;
  itemCount: number;
  /** The items' gallery previews (never the print masters). */
  thumbnails: string[];
};

export type FramedPrintsData = {
  lines: FramedPrintLine[];
  unlocked: boolean;
  hasPhotos: boolean;
  orders: FramedPrintOrder[];
};

/**
 * The gallery preview (thumbnail, else preview) of each order item's photo, by deliverable item id.
 * Never the print master. UNSCOPED: pass only ids from orders the caller may see.
 */
export async function loadItemPreviews(deliverableItemIds: (string | null)[]): Promise<Map<string, string>> {
  const photos = await loadItemPhotos(deliverableItemIds);
  return new Map([...photos].map(([id, p]) => [id, p.previewUrl]));
}

/**
 * Each order item photo's gallery preview (as loadItemPreviews) and its master's pixel size from
 * the stored resolution (null when unknown), by deliverable item id. UNSCOPED, as loadItemPreviews.
 */
export async function loadItemPhotos(
  deliverableItemIds: (string | null)[]
): Promise<Map<string, { previewUrl: string; photo: PhotoSize | null }>> {
  const ids = [...new Set(deliverableItemIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const items = await db.deliverableItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, previewUrl: true, thumbnailUrl: true, resolution: true },
  });
  return new Map(items.map((p) => [p.id, { previewUrl: p.thumbnailUrl || p.previewUrl, photo: parseResolution(p.resolution) }]));
}

export async function loadFramedPrints(projectId: string): Promise<FramedPrintsData> {
  const [entitlements, orders] = await Promise.all([
    loadProjectEntitlements(projectId),
    db.printOrder.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { deliverableItemId: true } } },
    }),
  ]);

  const previewById = await loadItemPreviews(orders.flatMap((o) => o.items.map((i) => i.deliverableItemId)));

  return {
    lines: entitlements.lines.map((l) => ({
      id: l.id,
      sizeName: l.sizeName,
      frameName: l.frameName,
      quantity: l.quantity,
      remaining: l.remaining,
    })),
    unlocked: entitlements.unlocked,
    hasPhotos: entitlements.hasPhotos,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      fulfilment: o.fulfilment,
      totalAmount: o.totalAmount,
      courier: o.courier,
      trackingNumber: o.trackingNumber,
      invoiceId: o.invoiceId,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.length,
      thumbnails: o.items
        .map((i) => (i.deliverableItemId ? previewById.get(i.deliverableItemId) : undefined))
        .filter((u): u is string => !!u)
        .slice(0, 4),
    })),
  };
}
