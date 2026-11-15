import { db } from "@/lib/db";
import { loadItemPhotos } from "@/lib/prints/gallery";
import { orientPhotoSize } from "@/lib/prints/orientation";

/**
 * A print order as the studio's framed preview shows it (Verification's "View order"): each print
 * with its gallery preview, frame look and the photo's pixel size when stored, plus fulfilment and
 * totals. Plain data, safe to pass to a client component. Not a "use server" module.
 */
export type PrintOrderPreviewItem = {
  id: string;
  kind: string;
  photoTitle: string;
  /** The gallery preview (never the master); null when the photo is gone. */
  previewUrl: string | null;
  /** The master's pixel size from its stored resolution, turned to the item's orientation; null when unknown (read from the preview instead). */
  photoWidth: number | null;
  photoHeight: number | null;
  orientation: string;
  sizeCode: string;
  sizeName: string;
  widthInches: number;
  heightInches: number;
  frameName: string;
  frameColor: string;
  frameMaterial: string;
  moldingWidth: number;
  matBoardType: string;
  upgradeAmount: number;
  lineAmount: number;
};

export type PrintOrderPreview = {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: string;
  /** Ship-to lines (name, phone, street, postcode + city, state, country); empty for pickup. */
  address: string[];
  shippingZoneName: string | null;
  shippingFee: number;
  itemsTotal: number;
  totalAmount: number;
  items: PrintOrderPreviewItem[];
};

// A frame deleted since the order was placed still previews, in the default black.
const FALLBACK_FRAME = { frameColor: "#18181b", material: "Wood", moldingWidth: 1 };

/** The ship-to address of an order as display lines; empty for pickup. */
export function orderAddressLines(o: {
  fulfilment: string;
  recipientName: string | null;
  recipientPhone: string | null;
  line1: string | null;
  line2: string | null;
  postcode: string | null;
  city: string | null;
  state: string | null;
  country: string;
}): string[] {
  if (o.fulfilment !== "SHIP") return [];
  return [o.recipientName, o.recipientPhone, o.line1, o.line2, [o.postcode, o.city].filter(Boolean).join(" "), o.state, o.country].filter(
    (l): l is string => !!l
  );
}

/** The print orders paid by these invoices, by invoice id. Tenant-scoped: other studios' orders are never returned. */
export async function loadPrintOrderPreviews(tenantId: string, invoiceIds: string[]): Promise<Map<string, PrintOrderPreview>> {
  if (invoiceIds.length === 0) return new Map();
  const orders = await db.printOrder.findMany({
    where: { tenantId, invoiceId: { in: invoiceIds } },
    include: { items: true },
  });
  if (orders.length === 0) return new Map();

  const items = orders.flatMap((o) => o.items);
  const [photos, frames] = await Promise.all([
    loadItemPhotos(items.map((i) => i.deliverableItemId)),
    db.frameDesign.findMany({
      where: { tenantId, id: { in: [...new Set(items.map((i) => i.frameDesignId))] } },
      select: { id: true, frameColor: true, material: true, moldingWidth: true },
    }),
  ]);
  const frameById = new Map(frames.map((f) => [f.id, f]));

  return new Map(
    orders.map((o) => [
      o.invoiceId!,
      {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        fulfilment: o.fulfilment,
        address: orderAddressLines(o),
        shippingZoneName: o.shippingZoneName,
        shippingFee: o.shippingFee,
        itemsTotal: o.itemsTotal,
        totalAmount: o.totalAmount,
        items: o.items.map((i) => {
          const photo = i.deliverableItemId ? photos.get(i.deliverableItemId) : undefined;
          const frame = frameById.get(i.frameDesignId) ?? FALLBACK_FRAME;
          const size = photo?.photo ? orientPhotoSize(photo.photo, i.orientation) : null;
          return {
            id: i.id,
            kind: i.kind,
            photoTitle: i.photoTitle,
            previewUrl: photo?.previewUrl ?? null,
            photoWidth: size?.width ?? null,
            photoHeight: size?.height ?? null,
            orientation: i.orientation,
            sizeCode: i.sizeCode,
            sizeName: i.sizeName,
            widthInches: i.widthInches,
            heightInches: i.heightInches,
            frameName: i.frameName,
            frameColor: frame.frameColor,
            frameMaterial: frame.material,
            moldingWidth: frame.moldingWidth,
            matBoardType: i.matBoardType,
            upgradeAmount: i.upgradeAmount,
            lineAmount: i.lineAmount,
          };
        }),
      },
    ])
  );
}
