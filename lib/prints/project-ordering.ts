import { db } from "@/lib/db";
import { loadProjectEntitlements } from "@/lib/prints/entitlements";
import { parseZoneStates } from "@/lib/prints/zones";
import { galleryPhotoUrl } from "@/lib/prints/gallery";
import { filesReleased } from "@/lib/deliverables/access";
import type { OrderingContext } from "@/components/visualizer/cart";
import type { FrameDesignOption, PhotoOption, PrintSizeOption } from "@/components/visualizer/configurator-panel";

/**
 * What Wall Art needs to order framed prints from one gallery: the project's delivered photos
 * (as their previews), its included prints, shipping zones and the client's saved address.
 * Used by the client's Wall Art page and the studio's "Order framed prints for client" page.
 *
 * UNSCOPED: the caller must first check the project belongs to the tenant and that the viewer is
 * its client or the studio's staff. Not a "use server" module.
 */

export const toSizeOption = (s: {
  id: string;
  code: string;
  name: string;
  widthInches: number;
  heightInches: number;
  basePrice: number;
}): PrintSizeOption => ({
  id: s.id,
  code: s.code,
  name: s.name,
  widthInches: s.widthInches,
  heightInches: s.heightInches,
  basePrice: s.basePrice,
});

export const toFrameOption = (f: {
  id: string;
  name: string;
  material: string;
  moldingWidth: number;
  frameColor: string;
  priceOffset: number;
  isAvailable: boolean;
}): FrameDesignOption => ({
  id: f.id,
  name: f.name,
  material: f.material,
  moldingWidth: f.moldingWidth,
  frameColor: f.frameColor,
  priceOffset: f.priceOffset,
  isAvailable: f.isAvailable,
});

export async function loadProjectOrdering(input: {
  tenantId: string;
  project: { id: string; clientId: string };
  /** Where "Back to the gallery" goes. */
  galleryHref: string;
  /** An included print line to start from, if it still has prints left. */
  claim?: string;
  /** Set on the studio's page: after placing, open the order in the admin console instead of the client checkout. */
  staffOrdersHref?: string;
}): Promise<{ photos: PhotoOption[]; ordering: OrderingContext }> {
  const { tenantId, project, claim } = input;

  // That gallery's delivered photos only: clean copies once the files are released, else the proofs.
  const [items, entitlements, zones, client, tenant] = await Promise.all([
    db.deliverableItem.findMany({
      where: { deliverable: { projectId: project.id }, itemType: "PHOTO" },
      orderBy: { id: "asc" },
      select: { id: true, title: true, previewUrl: true, viewUrl: true },
    }),
    loadProjectEntitlements(project.id),
    db.shippingZone.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" } }),
    db.user.findFirst({
      where: { id: project.clientId, tenantId },
      select: { shipRecipient: true, shipPhone: true, shipLine1: true, shipLine2: true, shipPostcode: true, shipCity: true, shipState: true },
    }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { releaseFilesBeforePayment: true } }),
  ]);
  const released = filesReleased({ isFinalBalancePaid: entitlements.unlocked }, { releaseFilesBeforePayment: !!tenant?.releaseFilesBeforePayment });
  const photos: PhotoOption[] = items.map((i) => ({ id: i.id, title: i.title, url: galleryPhotoUrl(i, project.id, released) }));

  // Included lines keep their own size and frame, even ones the studio has hidden since.
  const [lineSizes, lineFrames] = await Promise.all([
    db.printSize.findMany({ where: { tenantId, id: { in: entitlements.lines.map((l) => l.printSizeId) } } }),
    db.frameDesign.findMany({ where: { tenantId, id: { in: entitlements.lines.map((l) => l.frameDesignId) } } }),
  ]);
  const sizeById = new Map(lineSizes.map((s) => [s.id, s]));
  const frameById = new Map(lineFrames.map((f) => [f.id, f]));
  const lines: OrderingContext["lines"] = entitlements.lines.flatMap((l) => {
    const size = sizeById.get(l.printSizeId);
    const frame = frameById.get(l.frameDesignId);
    if (!size || !frame) return [];
    return [
      {
        id: l.id,
        sizeName: l.sizeName,
        frameName: l.frameName,
        quantity: l.quantity,
        remaining: l.remaining,
        size: toSizeOption(size),
        frame: toFrameOption(frame),
      },
    ];
  });

  const claimLine = claim ? lines.find((l) => l.id === claim && l.remaining > 0) : undefined;
  const saved =
    client?.shipLine1 && client.shipState
      ? {
          recipientName: client.shipRecipient ?? "",
          recipientPhone: client.shipPhone ?? "",
          line1: client.shipLine1,
          line2: client.shipLine2 ?? "",
          postcode: client.shipPostcode ?? "",
          city: client.shipCity ?? "",
          state: client.shipState,
        }
      : null;

  return {
    photos,
    ordering: {
      projectId: project.id,
      galleryHref: input.galleryHref,
      lines,
      unlocked: entitlements.unlocked,
      hasPhotos: entitlements.hasPhotos,
      zones: zones.map((z) => ({ name: z.name, fee: z.fee, states: parseZoneStates(z.statesJson) })),
      savedAddress: saved,
      claimLineId: claimLine?.id ?? null,
      ...(input.staffOrdersHref ? { staffOrdersHref: input.staffOrdersHref } : {}),
    },
  };
}
