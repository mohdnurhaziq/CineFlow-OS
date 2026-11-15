"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { canAccessClientRecord } from "@/lib/auth/project-access";
import { AuthorizationError, OWNER_ROLES, requireStaff, STAFF_ROLES } from "@/lib/auth/guard";
import { nextInvoiceNumber, nextPrintOrderNumber, UNPAID_INVOICE_STATUSES } from "@/lib/bookings/billing";
import { remainingForLines } from "@/lib/prints/entitlements";
import { orderTotals, priceCartLine, type PricedCartLine } from "@/lib/prints/pricing";
import { zoneForState } from "@/lib/prints/zones";
import { actionErrorMessage } from "@/lib/action-error";
import { formatStudioDate } from "@/lib/slot-time";
import { SENT_ORDER_STATUSES } from "@/lib/prints/orders";
import { nextPrintOrderStatuses } from "@/lib/prints/status";
import { sendPrintOrderReadyEmail, sendPrintOrderShippedEmail } from "@/lib/email/print-order-emails";
import {
  CancelOrderSchema,
  PlaceOrderSchema,
  UpdateOrderStatusSchema,
  type UpdateOrderStatusInput,
  type CancelOrderInput,
  type PlaceOrderInput,
  type PlaceOrderValues,
} from "@/lib/validations/print-orders";

type Tx = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const INVOICE_DUE_DAYS = 7;

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Non-request context fallback
  }
}

/** A reason to refuse the order that the client should see. Thrown inside the transaction to roll it back. */
class OrderRefusal extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function refuse(code: string, message: string): never {
  throw new OrderRefusal(code, message);
}

type Fail = { success: false; error: string; message: string };

function failFrom(err: unknown, fallback: string): Fail {
  if (err instanceof OrderRefusal) return { success: false, error: err.code, message: err.message };
  if (err instanceof AuthorizationError) {
    return {
      success: false,
      error: err.message.startsWith("UNAUTHENTICATED") ? "UNAUTHENTICATED" : "FORBIDDEN",
      message: err.message.replace(/^[A-Z_]+: /, ""),
    };
  }
  if (err instanceof ZodError) return { success: false, error: "INVALID", message: actionErrorMessage(err, fallback) };
  console.error("print order error:", err);
  return { success: false, error: "ORDER_FAILED", message: fallback };
}

/** Adds a line to a free-text record without losing what was there. */
function appendNote(existing: string | null, note: string): string {
  return existing?.trim() ? `${existing.trim()}\n${note}` : note;
}

type OrderProject = { id: string; clientId: string; bookingId: string | null };

/**
 * The project, if the caller is its client or the studio's staff and its balance is paid.
 * Staff get no override on the unlock rule.
 */
async function loadOrderProject(tx: Tx, session: SessionUser | null, v: PlaceOrderValues): Promise<OrderProject> {
  if (!session) refuse("UNAUTHENTICATED", "Please sign in to order prints.");
  const project = await tx.project.findFirst({
    where: { id: v.projectId, tenantId: v.tenantId },
    select: { id: true, clientId: true, bookingId: true, isFinalBalancePaid: true },
  });
  if (!project || !canAccessClientRecord(session, v.tenantId, project.clientId)) {
    refuse("FORBIDDEN", "That project isn't available to this account.");
  }
  if (!project.isFinalBalancePaid) refuse("LOCKED", "Framed prints unlock when your balance is paid.");
  return project;
}

type PricedItem = PricedCartLine & {
  kind: "INCLUDED" | "PAID";
  bookingIncludedPrintId: string | null;
  deliverableItemId: string;
  photoUrl: string;
  photoTitle: string;
  orientation: string;
  printSizeId: string;
  sizeCode: string;
  sizeName: string;
  widthInches: number;
  heightInches: number;
  frameDesignId: string;
  frameName: string;
  matBoardType: string;
};

type PricedOrder = {
  items: PricedItem[];
  shipping: { name: string; fee: number } | null;
  itemsTotal: number;
  total: number;
  /** Quantity of each included line in the cart, to re-check after the items are written. */
  lineQuantities: Map<string, number>;
};

/** Checks every cart line against the database and prices it from the catalog. Never trusts client amounts. */
async function priceOrder(tx: Tx, v: PlaceOrderValues, project: OrderProject): Promise<PricedOrder> {
  const { tenantId } = v;
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { matBoardPrice: true } });
  if (!tenant) refuse("TENANT_NOT_FOUND", "Studio not found.");

  // Photos: delivered PHOTO items of this project only.
  const photoIds = [...new Set(v.items.map((i) => i.deliverableItemId))];
  const photos = await tx.deliverableItem.findMany({
    where: { id: { in: photoIds }, itemType: "PHOTO", deliverable: { projectId: project.id } },
  });
  const photoById = new Map(photos.map((p) => [p.id, p]));

  // Included lines: must belong to this project's booking, with enough left for the cart.
  const cartLineCounts = new Map<string, number>();
  for (const i of v.items) {
    if (i.kind === "INCLUDED" && i.bookingIncludedPrintId) {
      cartLineCounts.set(i.bookingIncludedPrintId, (cartLineCounts.get(i.bookingIncludedPrintId) ?? 0) + 1);
    }
  }
  const lineIds = [...cartLineCounts.keys()];
  const lines =
    lineIds.length > 0 && project.bookingId
      ? await tx.bookingIncludedPrint.findMany({ where: { id: { in: lineIds }, tenantId, bookingId: project.bookingId } })
      : [];
  const lineById = new Map(lines.map((l) => [l.id, l]));
  if (lineIds.some((id) => !lineById.has(id))) refuse("NOT_INCLUDED", "That included print isn't part of this booking.");
  const remaining = await remainingForLines(tx, lineIds);
  for (const [id, count] of cartLineCounts) {
    if ((remaining.get(id) ?? 0) < count) refuse("NONE_LEFT", "You've already claimed all of these prints.");
  }

  const sizeIds = new Set([...v.items.map((i) => i.printSizeId), ...lines.map((l) => l.printSizeId)]);
  const frameIds = new Set([...v.items.map((i) => i.frameDesignId), ...lines.map((l) => l.frameDesignId)]);
  const [sizes, frames] = await Promise.all([
    tx.printSize.findMany({ where: { id: { in: [...sizeIds] }, tenantId } }),
    tx.frameDesign.findMany({ where: { id: { in: [...frameIds] }, tenantId } }),
  ]);
  const sizeById = new Map(sizes.map((s) => [s.id, s]));
  const frameById = new Map(frames.map((f) => [f.id, f]));

  const items: PricedItem[] = v.items.map((i) => {
    const photo = photoById.get(i.deliverableItemId);
    if (!photo) refuse("PHOTO_NOT_FOUND", "Choose one of this gallery's photos.");
    const line = i.kind === "INCLUDED" ? lineById.get(i.bookingIncludedPrintId!) : undefined;
    const size = sizeById.get(i.printSizeId);
    const frame = frameById.get(i.frameDesignId);
    // An included print may keep its own size and frame even after the studio hides them.
    if (!size || (!size.isAvailable && size.id !== line?.printSizeId)) refuse("SIZE_UNAVAILABLE", "That print size isn't available.");
    if (!frame || (!frame.isAvailable && frame.id !== line?.frameDesignId)) refuse("FRAME_UNAVAILABLE", "That frame isn't available.");

    let included: { sizePrice: number; framePrice: number } | undefined;
    if (line) {
      const lineSize = sizeById.get(line.printSizeId);
      const lineFrame = frameById.get(line.frameDesignId);
      if (!lineSize || !lineFrame) refuse("NOT_INCLUDED", "That included print's size or frame no longer exists.");
      included = { sizePrice: lineSize.basePrice, framePrice: lineFrame.priceOffset };
    }
    const priced = priceCartLine({
      kind: i.kind,
      sizePrice: size.basePrice,
      framePrice: frame.priceOffset,
      mat: i.matBoardType,
      matBoardPrice: tenant.matBoardPrice,
      included,
    });
    return {
      ...priced,
      kind: i.kind,
      bookingIncludedPrintId: line?.id ?? null,
      deliverableItemId: photo.id,
      // The clean master: the balance is paid and the studio prints from it.
      photoUrl: photo.downloadUrl,
      photoTitle: photo.title,
      orientation: i.orientation,
      printSizeId: size.id,
      sizeCode: size.code,
      sizeName: size.name,
      widthInches: size.widthInches,
      heightInches: size.heightInches,
      frameDesignId: frame.id,
      frameName: frame.name,
      matBoardType: i.matBoardType,
    };
  });

  let shipping: { name: string; fee: number } | null = null;
  if (v.fulfilment === "SHIP") {
    if (!v.address) refuse("ADDRESS_REQUIRED", "Enter a delivery address, or choose pickup.");
    const zones = await tx.shippingZone.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" } });
    shipping = zoneForState(zones, v.address.state);
    if (!shipping) refuse("NO_SHIPPING", `We don't ship to ${v.address.state} yet. Choose pickup.`);
  }

  const { itemsTotal, total } = orderTotals(items.map((i) => i.lineAmount), shipping?.fee ?? 0);
  const lineQuantities = new Map(lines.map((l) => [l.id, l.quantity]));
  return { items, shipping, itemsTotal, total, lineQuantities };
}

/** Prices a cart without placing it, for the checkout summary. Same checks as placing. */
export async function quotePrintOrder(
  input: PlaceOrderInput
): Promise<{ success: true; items: { lineAmount: number; upgradeAmount: number }[]; shippingFee: number; total: number } | Fail> {
  try {
    const v = PlaceOrderSchema.parse(input);
    const session = await getCurrentUser();
    const project = await loadOrderProject(db, session, v);
    const priced = await priceOrder(db, v, project);
    return {
      success: true,
      items: priced.items.map((i) => ({ lineAmount: i.lineAmount, upgradeAmount: i.upgradeAmount })),
      shippingFee: priced.shipping?.fee ?? 0,
      total: priced.total,
    };
  } catch (err) {
    return failFrom(err, "Couldn't price this order.");
  }
}

/**
 * Places a framed print order: one fulfilment, one shipping fee, at most one invoice.
 * A free order (only included prints, no upgrades, pickup) goes straight to NEW with no invoice.
 */
export async function placePrintOrder(
  input: PlaceOrderInput
): Promise<{ success: true; orderId: string; orderNumber: string; checkoutUrl: string | null } | Fail> {
  try {
    const v = PlaceOrderSchema.parse(input);
    const session = await getCurrentUser();

    const placed = await db.$transaction(async (tx) => {
      // Take SQLite's write lock before reading anything, so two orders for the last included
      // print run one after the other and the second sees the first one's claim.
      await tx.$executeRaw`UPDATE "Tenant" SET "id" = "id" WHERE "id" = ${v.tenantId}`;

      const project = await loadOrderProject(tx, session, v);
      const priced = await priceOrder(tx, v, project);
      const orderNumber = await nextPrintOrderNumber(tx, v.tenantId);

      const invoice =
        priced.total > 0
          ? await tx.milestoneInvoice.create({
              data: {
                tenantId: v.tenantId,
                invoiceNumber: await nextInvoiceNumber(tx, v.tenantId),
                clientId: project.clientId,
                projectId: project.id,
                milestoneType: "PRINT_FRAME_ORDER",
                description: `Framed prints ${orderNumber}`,
                amount: priced.total,
                status: "PENDING",
                dueDate: new Date(Date.now() + INVOICE_DUE_DAYS * DAY_MS),
              },
            })
          : null;

      const a = v.fulfilment === "SHIP" ? v.address : undefined;
      const order = await tx.printOrder.create({
        data: {
          tenantId: v.tenantId,
          clientId: project.clientId,
          projectId: project.id,
          orderNumber,
          fulfilment: v.fulfilment,
          recipientName: a?.recipientName ?? null,
          recipientPhone: a?.recipientPhone ?? null,
          line1: a?.line1 ?? null,
          line2: a?.line2 || null,
          postcode: a?.postcode ?? null,
          city: a?.city ?? null,
          state: a?.state ?? null,
          shippingZoneName: priced.shipping?.name ?? null,
          shippingFee: priced.shipping?.fee ?? 0,
          itemsTotal: priced.itemsTotal,
          totalAmount: priced.total,
          status: invoice ? "AWAITING_PAYMENT" : "NEW",
          invoiceId: invoice?.id ?? null,
          placedById: session!.id,
          notes: v.notes || null,
          items: { create: priced.items },
        },
      });

      // Belt and braces: if another order slipped in, the claims now exceed the line; roll back.
      for (const [lineId, quantity] of priced.lineQuantities) {
        const used = await tx.printOrderItem.count({
          where: { bookingIncludedPrintId: lineId, order: { status: { not: "CANCELLED" } } },
        });
        if (used > quantity) refuse("NONE_LEFT", "You've already claimed all of these prints.");
      }

      if (v.saveAddress && a) {
        await tx.user.update({
          where: { id: project.clientId },
          data: {
            shipRecipient: a.recipientName,
            shipPhone: a.recipientPhone,
            shipLine1: a.line1,
            shipLine2: a.line2 || null,
            shipPostcode: a.postcode,
            shipCity: a.city,
            shipState: a.state,
          },
        });
      }

      return { order, invoice };
    });

    safeRevalidate(`/${v.tenantSlug}/visualizer`);
    safeRevalidate(`/${v.tenantSlug}/vault/${v.projectId}`);
    safeRevalidate(`/${v.tenantSlug}/admin/invoices`);
    safeRevalidate(`/${v.tenantSlug}/admin/print-orders`);

    return {
      success: true,
      orderId: placed.order.id,
      orderNumber: placed.order.orderNumber,
      checkoutUrl: placed.invoice ? `/${v.tenantSlug}/checkout?invoiceId=${placed.invoice.id}` : null,
    };
  } catch (err) {
    return failFrom(err, "Couldn't place this order.");
  }
}

/**
 * Cancels a print order, which returns its included prints. The client may cancel their own order
 * while it awaits payment (but not while a payment slip is being checked: the money may already be
 * with the studio); the studio's staff may cancel until the prints are shipped or collected.
 * An unpaid linked invoice is voided with it. A paid invoice stays paid (any refund is settled
 * outside the app) and the refund owed is noted on the order and the invoice. Money rule: only the
 * studio owner cancels an order that has an invoice; other staff can cancel free orders only.
 */
export async function cancelPrintOrder(input: CancelOrderInput): Promise<{ success: true } | Fail> {
  try {
    const v = CancelOrderSchema.parse(input);
    const session = await getCurrentUser();
    if (!session) refuse("UNAUTHENTICATED", "Please sign in to cancel an order.");

    const order = await db.printOrder.findFirst({ where: { id: v.orderId, tenantId: v.tenantId } });
    // Someone else's order is reported as missing, so its existence isn't revealed.
    if (!order || !canAccessClientRecord(session, v.tenantId, order.clientId)) {
      refuse("NOT_FOUND", "Order not found.");
    }
    if (order.status === "CANCELLED") refuse("ALREADY_CANCELLED", "This order is already cancelled.");
    const isStaff = STAFF_ROLES.has(session.role);
    if (isStaff) {
      if (SENT_ORDER_STATUSES.includes(order.status)) {
        refuse("NOT_CANCELLABLE", "These prints have already gone out, so the order can't be cancelled.");
      }
      // Voiding an invoice or owing a refund is the owner's call, as with voidInvoice.
      if (order.invoiceId && !OWNER_ROLES.has(session.role)) {
        refuse("OWNER_ONLY", "Only the studio owner can cancel an order that has a payment.");
      }
    } else if (order.status !== "AWAITING_PAYMENT") {
      refuse("NOT_CANCELLABLE", "This order is paid. Contact the studio to change it.");
    }

    await db.$transaction(async (tx) => {
      // Only from the status just checked: a payment or another cancel in between wins.
      const won = await tx.printOrder.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: "CANCELLED" },
      });
      if (won.count === 0) refuse("ORDER_CHANGED", "This order changed just now. Refresh and try again.");
      if (order.invoiceId) {
        // The client can only drop an invoice nobody has paid or sent a slip for; staff can void
        // any unpaid one. Checked in the write itself so a slip or payment in between wins.
        const voidable = isStaff ? UNPAID_INVOICE_STATUSES : UNPAID_INVOICE_STATUSES.filter((s) => s !== "PENDING_VERIFICATION");
        const voided = await tx.milestoneInvoice.updateMany({
          where: { id: order.invoiceId, status: { in: voidable } },
          data: { status: "VOID", verifiedBy: `Cancelled with print order ${order.orderNumber} by ${session.name}` },
        });
        if (voided.count === 0 && !isStaff) {
          const invoice = await tx.milestoneInvoice.findUnique({ where: { id: order.invoiceId }, select: { status: true } });
          if (invoice?.status === "PENDING_VERIFICATION") {
            refuse("PAYMENT_UNDER_REVIEW", "Your payment is being checked. Contact the studio to cancel.");
          }
          refuse("ORDER_CHANGED", "This order changed just now. Refresh and try again.");
        }
        if (voided.count === 0) {
          // Staff cancelled a paid order: leave a lasting note of the refund owed on the order (admin-only).
          // Not on the invoice: its verifiedBy prints on the client's receipt as "Received by".
          const invoice = await tx.milestoneInvoice.findUnique({ where: { id: order.invoiceId }, select: { status: true } });
          if (invoice?.status === "PAID") {
            const note = `Refund owed: order ${order.orderNumber} cancelled by ${session.name} on ${formatStudioDate(new Date())}`;
            await tx.printOrder.update({ where: { id: order.id }, data: { notes: appendNote(order.notes, note) } });
          }
        }
      }
    });

    safeRevalidate(`/${v.tenantSlug}/visualizer`);
    safeRevalidate(`/${v.tenantSlug}/vault/${order.projectId}`);
    safeRevalidate(`/${v.tenantSlug}/account`);
    safeRevalidate(`/${v.tenantSlug}/admin/invoices`);
    safeRevalidate(`/${v.tenantSlug}/admin/print-orders`);
    return { success: true };
  } catch (err) {
    return failFrom(err, "Couldn't cancel this order.");
  }
}

/**
 * Moves a print order along: NEW -> IN_PRODUCTION -> READY_FOR_PICKUP -> COLLECTED for pickup,
 * NEW -> IN_PRODUCTION -> SHIPPED (with courier and tracking number) -> DELIVERED for delivery.
 * Studio staff only. The client is emailed when the prints are ready or have shipped, after the
 * change is saved; a mail problem never undoes it.
 */
export async function updatePrintOrderStatus(input: UpdateOrderStatusInput): Promise<{ success: true } | Fail> {
  try {
    const v = UpdateOrderStatusSchema.parse(input);
    await requireStaff(v.tenantId);

    const order = await db.printOrder.findFirst({ where: { id: v.orderId, tenantId: v.tenantId } });
    if (!order) refuse("NOT_FOUND", "Order not found.");
    if (!nextPrintOrderStatuses(order.fulfilment, order.status).includes(v.status)) {
      refuse("BAD_TRANSITION", `A ${order.fulfilment === "SHIP" ? "delivery" : "pickup"} order that is ${order.status.toLowerCase().replace(/_/g, " ")} can't be marked ${v.status.toLowerCase().replace(/_/g, " ")}.`);
    }
    const courier = v.courier?.trim() ?? "";
    const trackingNumber = v.trackingNumber?.trim() ?? "";
    if (v.status === "SHIPPED" && (!courier || !trackingNumber)) {
      refuse("TRACKING_REQUIRED", "Enter the courier and tracking number to mark this order shipped.");
    }

    // Only from the status just checked: a cancel or another move in between wins.
    const won = await db.printOrder.updateMany({
      where: { id: order.id, tenantId: v.tenantId, status: order.status },
      data: { status: v.status, ...(v.status === "SHIPPED" ? { courier, trackingNumber } : {}) },
    });
    if (won.count === 0) refuse("ORDER_CHANGED", "This order changed just now. Refresh and try again.");

    if (v.status === "READY_FOR_PICKUP") await sendPrintOrderReadyEmail(order.id);
    if (v.status === "SHIPPED") await sendPrintOrderShippedEmail(order.id);

    safeRevalidate(`/${v.tenantSlug}/admin/print-orders`);
    safeRevalidate(`/${v.tenantSlug}/admin/print-orders/${order.id}`);
    safeRevalidate(`/${v.tenantSlug}/vault/${order.projectId}`);
    safeRevalidate(`/${v.tenantSlug}/account`);
    return { success: true };
  } catch (err) {
    return failFrom(err, "Couldn't update this order.");
  }
}
