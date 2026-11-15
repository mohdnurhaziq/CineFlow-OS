import { db } from "@/lib/db";
import { sendNotification, type NotificationResult } from "@/lib/notifications";

/**
 * Emails the client when their framed prints are ready for pickup or have shipped.
 * Sent after the status change commits. Never throws: a mail problem must not undo the change
 * (failures are logged). Plain server module, not "use server".
 */

async function loadOrder(orderId: string) {
  return db.printOrder.findUnique({
    where: { id: orderId },
    include: {
      client: { select: { name: true, email: true } },
      tenant: { select: { name: true, slug: true } },
      _count: { select: { items: true } },
    },
  });
}

function galleryUrl(slug: string, projectId: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${appUrl}/${slug}/vault/${projectId}`;
}

function printCount(n: number): string {
  return `${n} framed print${n === 1 ? "" : "s"}`;
}

export async function sendPrintOrderReadyEmail(orderId: string): Promise<NotificationResult | null> {
  try {
    const order = await loadOrder(orderId);
    if (!order?.client.email) return null;
    const result = await sendNotification(
      {
        event: "STUDIO_UPDATE",
        studioName: order.tenant.name,
        studioSlug: order.tenant.slug,
        clientName: order.client.name,
        clientEmail: order.client.email,
        headline: "Your framed prints are ready for pickup",
        message: `Your ${printCount(order._count.items)} (order ${order.orderNumber}) are ready. Collect them from the studio at a time that suits you.`,
        linkUrl: galleryUrl(order.tenant.slug, order.projectId),
        linkLabel: "View my order",
      },
      "EMAIL"
    );
    if (result.emailDelivery === "FAILED") console.error(`Print order ready email failed for ${order.orderNumber}:`, result.emailError);
    return result;
  } catch (err) {
    console.error("Print order ready email failed:", err);
    return null;
  }
}

export async function sendPrintOrderShippedEmail(orderId: string): Promise<NotificationResult | null> {
  try {
    const order = await loadOrder(orderId);
    if (!order?.client.email) return null;
    const result = await sendNotification(
      {
        event: "STUDIO_UPDATE",
        studioName: order.tenant.name,
        studioSlug: order.tenant.slug,
        clientName: order.client.name,
        clientEmail: order.client.email,
        headline: "Your framed prints have shipped",
        message: `Your ${printCount(order._count.items)} (order ${order.orderNumber}) are on the way with ${order.courier ?? "the courier"}. Tracking number: ${order.trackingNumber ?? "-"}.`,
        linkUrl: galleryUrl(order.tenant.slug, order.projectId),
        linkLabel: "View my order",
      },
      "EMAIL"
    );
    if (result.emailDelivery === "FAILED") console.error(`Print order shipped email failed for ${order.orderNumber}:`, result.emailError);
    return result;
  } catch (err) {
    console.error("Print order shipped email failed:", err);
    return null;
  }
}
