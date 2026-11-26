import { priceCartLine, type MatBoardType, type PricedCartLine } from "@/lib/prints/pricing";
import type { CartItemInput } from "@/lib/validations/print-orders";
import type { FrameDesignOption, PrintSizeOption } from "./configurator-panel";
import { formatMoney } from "@/lib/money";

/** An included print of the project's booking, as Wall Art offers it. */
export type IncludedLineOption = {
  id: string;
  sizeName: string;
  frameName: string;
  quantity: number;
  remaining: number;
  /** The line's own size and frame, even if the studio has since hidden them. */
  size: PrintSizeOption;
  frame: FrameDesignOption;
};

export type ShippingAddress = {
  recipientName: string;
  recipientPhone: string;
  line1: string;
  line2: string;
  postcode: string;
  city: string;
  state: string;
};

/** Everything Wall Art needs to order prints from one gallery. Null on the public preview. */
export type OrderingContext = {
  projectId: string;
  /** Back to the gallery after ordering. */
  galleryHref: string;
  lines: IncludedLineOption[];
  /** The project's balance is paid. */
  unlocked: boolean;
  hasPhotos: boolean;
  /** Shipping zones; shipping is offered only to the states they cover. */
  zones: { name: string; fee: number; states: string[] }[];
  savedAddress: ShippingAddress | null;
  /** The included line to start with (`&claim=`), when it still has prints left. */
  claimLineId: string | null;
  /** Staff ordering for a client from the admin console: open the placed order there, not the client checkout. */
  staffOrdersHref?: string;
};

export type CartLine = {
  key: string;
  kind: "INCLUDED" | "PAID";
  bookingIncludedPrintId?: string;
  deliverableItemId: string;
  photoTitle: string;
  /** The gallery preview, for the cart list (the order itself prints from the master). */
  photoUrl: string;
  /** Detected from the photo's shape. */
  orientation: "PORTRAIT" | "LANDSCAPE";
  /** The photo's pixel size when added (older saved carts lack it): the print's real shape. */
  photoWidth?: number;
  photoHeight?: number;
  printSizeId: string;
  frameDesignId: string;
  matBoardType: MatBoardType;
};

export const cartStorageKey = (projectId: string) => `cf-print-cart:${projectId}`;

/** Reads a saved cart; anything unreadable (private mode, bad JSON) is an empty cart. */
export function loadCart(projectId: string): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(cartStorageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => l && typeof l.key === "string") : [];
  } catch {
    return [];
  }
}

export function saveCart(projectId: string, cart: CartLine[]): void {
  try {
    if (cart.length === 0) window.sessionStorage.removeItem(cartStorageKey(projectId));
    else window.sessionStorage.setItem(cartStorageKey(projectId), JSON.stringify(cart));
  } catch {
    // Storage unavailable: the cart just isn't remembered across reloads.
  }
}

export type Catalog = {
  sizes: Map<string, PrintSizeOption>;
  frames: Map<string, FrameDesignOption>;
  lines: Map<string, IncludedLineOption>;
  matBoardPrice: number;
};

/** A cart line's price from the catalog, the same rule the server applies. Null when its size or frame is gone. */
export function priceLine(line: Pick<CartLine, "kind" | "bookingIncludedPrintId" | "printSizeId" | "frameDesignId" | "matBoardType">, catalog: Catalog): PricedCartLine | null {
  const size = catalog.sizes.get(line.printSizeId);
  const frame = catalog.frames.get(line.frameDesignId);
  if (!size || !frame) return null;
  const included = line.kind === "INCLUDED" && line.bookingIncludedPrintId ? catalog.lines.get(line.bookingIncludedPrintId) : undefined;
  if (line.kind === "INCLUDED" && !included) return null;
  return priceCartLine({
    kind: line.kind,
    sizePrice: size.basePrice,
    framePrice: frame.priceOffset,
    mat: line.matBoardType,
    matBoardPrice: catalog.matBoardPrice,
    included: included ? { sizePrice: included.size.basePrice, framePrice: included.frame.priceOffset } : undefined,
  });
}

/** "Included", "Upgrade +RM 20.00" or "RM 120.00": what a cart line costs, in words. */
export function priceLabel(line: Pick<CartLine, "kind">, priced: PricedCartLine | null, currency: string): string {
  if (!priced) return "Unavailable";
  if (line.kind === "INCLUDED") return priced.upgradeAmount > 0 ? `Upgrade +${formatMoney(currency, priced.upgradeAmount)}` : "Included";
  return formatMoney(currency, priced.lineAmount);
}

/** The cart as the server action takes it. */
export function toCartItems(cart: CartLine[]): CartItemInput[] {
  return cart.map((l) => ({
    kind: l.kind,
    ...(l.kind === "INCLUDED" ? { bookingIncludedPrintId: l.bookingIncludedPrintId } : {}),
    deliverableItemId: l.deliverableItemId,
    orientation: l.orientation,
    printSizeId: l.printSizeId,
    frameDesignId: l.frameDesignId,
    matBoardType: l.matBoardType,
  }));
}
