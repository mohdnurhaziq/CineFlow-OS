import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, ExternalLink, Frame, MapPin, Store } from "lucide-react";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { formatStudioDate } from "@/lib/slot-time";
import { loadItemPhotos } from "@/lib/prints/gallery";
import { orderAddressLines } from "@/lib/prints/order-preview";
import { MAT_BOARD_LABELS, PRINT_ORDER_STATUS_STYLES, printOrderStatusLabel } from "@/lib/prints/status";
import { PageHeader, PageShell } from "@/components/ui/page";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/admin/print-orders/copy-button";
import { PrintOrderActions } from "@/components/admin/print-orders/print-order-actions";
import { PrintFitNote } from "@/components/admin/print-orders/print-fit";
import { levelAtLeast } from "@/lib/auth/access";
import { adminPageAccess } from "@/lib/auth/admin-page";
import { NoAccess } from "@/components/admin/no-access";

interface PrintOrderPageProps {
  params: Promise<{ tenantSlug: string; orderId: string }>;
}

export async function generateMetadata({ params }: PrintOrderPageProps): Promise<Metadata> {
  const { tenantSlug, orderId } = await params;
  const order = await db.printOrder.findFirst({
    where: { id: orderId, tenant: { slug: tenantSlug } },
    select: { orderNumber: true, tenant: { select: { name: true } } },
  });
  return { title: order ? `${order.orderNumber} | ${order.tenant.name} Studio Admin` : "Print order" };
}

const INVOICE_STATE: Record<string, string> = { PAID: "paid", VOID: "cancelled", PENDING_VERIFICATION: "payment being checked" };

const card = "rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 space-y-3";

// Print orders VIEW; moving or cancelling the order needs MANAGE.
export default async function AdminPrintOrderPage({ params }: PrintOrderPageProps) {
  const { tenantSlug, orderId } = await params;
  const viewer = await adminPageAccess(tenantSlug);
  if (!viewer || !levelAtLeast(viewer.access.areas.printOrders, "VIEW")) return <NoAccess tenantSlug={tenantSlug} />;
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, currency: true } });
  if (!tenant) notFound();

  const order = await db.printOrder.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    include: {
      items: true,
      client: { select: { name: true, email: true, phone: true } },
      project: { select: { id: true, title: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });
  if (!order) notFound();

  const photoById = await loadItemPhotos(order.items.map((i) => i.deliverableItemId));
  const money = (n: number) => formatCurrency(n, tenant.currency);
  const ship = order.fulfilment === "SHIP";
  const address = orderAddressLines(order);
  // The full-resolution master, through the gallery download route (same access checks as the gallery).
  const downloadHref = (deliverableItemId: string) =>
    `/api/download?projectId=${order.projectId}&type=photo_master&assetId=${deliverableItemId}`;

  return (
    <PageShell width="detail">
      <PageHeader
        icon={Frame}
        back={{ href: `/${tenant.slug}/admin/print-orders`, label: "Print orders" }}
        title={<span className="font-mono">{order.orderNumber}</span>}
        badge={
          <span
            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${PRINT_ORDER_STATUS_STYLES[order.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
          >
            {printOrderStatusLabel(order.status)}
          </span>
        }
        description={
          <>
            Placed {formatStudioDate(order.createdAt.toISOString())} for {order.client.name}, from{" "}
            <Link href={`/${tenant.slug}/admin/projects/${order.project.id}`} className="text-amber-400 hover:underline">
              {order.project.title}
            </Link>
            .
          </>
        }
      />

      <div className="grid lg:grid-cols-[1fr_20rem] gap-6 items-start">
        <section className={card} aria-label="Prints">
          <h2 className="text-sm font-semibold text-white">
            Prints ({order.items.length})
          </h2>
          <ul className="divide-y divide-zinc-800/70">
            {order.items.map((item) => {
              const photo = item.deliverableItemId ? photoById.get(item.deliverableItemId) : undefined;
              const preview = photo?.previewUrl;
              return (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900 border border-zinc-800">
                    {preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="" className="size-full object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm text-white truncate">{item.photoTitle}</p>
                    <p className="text-xs text-zinc-400">
                      Size ordered: {item.sizeName} ({item.widthInches} × {item.heightInches} in) · {item.orientation === "PORTRAIT" ? "Portrait" : "Landscape"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {item.frameName} · {MAT_BOARD_LABELS[item.matBoardType] ?? item.matBoardType}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500">
                      {item.kind === "INCLUDED" ? `Included${item.upgradeAmount > 0 ? ` + ${money(item.upgradeAmount)} upgrade` : ""}` : money(item.lineAmount)}
                    </p>
                    <PrintFitNote
                      item={{
                        previewUrl: preview ?? null,
                        photoWidth: photo?.photo?.width ?? null,
                        photoHeight: photo?.photo?.height ?? null,
                        orientation: item.orientation,
                        widthInches: item.widthInches,
                        heightInches: item.heightInches,
                      }}
                    />
                  </div>
                  {item.deliverableItemId ? (
                    <a
                      href={downloadHref(item.deliverableItemId)}
                      className={`${buttonVariants({ variant: "secondary", size: "sm" })} self-center`}
                      download
                    >
                      <Download /> <span className="hidden sm:inline">Full-res</span>
                    </a>
                  ) : (
                    <span className="self-center text-[11px] text-zinc-500 text-right max-w-24">Original file not available</span>
                  )}
                </li>
              );
            })}
          </ul>
          <dl className="pt-3 border-t border-zinc-800 space-y-1 text-xs">
            <div className="flex justify-between text-zinc-400">
              <dt>Prints</dt>
              <dd className="font-mono tabular-nums">{money(order.itemsTotal)}</dd>
            </div>
            {ship && (
              <div className="flex justify-between text-zinc-400">
                <dt>Shipping{order.shippingZoneName ? ` (${order.shippingZoneName})` : ""}</dt>
                <dd className="font-mono tabular-nums">{money(order.shippingFee)}</dd>
              </div>
            )}
            <div className="flex justify-between text-white font-semibold">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{money(order.totalAmount)}</dd>
            </div>
          </dl>
          {order.notes && (
            <div className="pt-3 border-t border-zinc-800">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Notes</p>
              <p className="text-xs text-zinc-300 whitespace-pre-line mt-1">{order.notes}</p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          {/* Moving or cancelling an order is Print orders MANAGE. */}
          {levelAtLeast(viewer.access.areas.printOrders, "MANAGE") && (
            <PrintOrderActions
              tenantId={tenant.id}
              tenantSlug={tenant.slug}
              orderId={order.id}
              status={order.status}
              fulfilment={order.fulfilment}
              paid={order.invoice?.status === "PAID"}
              hasInvoice={!!order.invoice}
              canRecordPayments={viewer.access.ticks.recordPayments}
            />
          )}

          <section className={card} aria-label="Fulfilment">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              {ship ? <MapPin className="size-4 text-amber-400" /> : <Store className="size-4 text-amber-400" />}
              {ship ? "Deliver to" : "Pickup at the studio"}
            </h2>
            {ship ? (
              <>
                <address className="not-italic text-xs text-zinc-300 leading-relaxed">
                  {address.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </address>
                <CopyButton text={address.join("\n")} label="Copy address" />
              </>
            ) : (
              <p className="text-xs text-zinc-400">The client collects the prints. They&apos;re emailed when you mark the order ready.</p>
            )}
            {order.courier && order.trackingNumber && (
              <p className="text-xs text-zinc-300 pt-2 border-t border-zinc-800">
                {order.courier} · <span className="font-mono">{order.trackingNumber}</span>
              </p>
            )}
          </section>

          <section className={card} aria-label="Client and invoice">
            <h2 className="text-sm font-semibold text-white">Client</h2>
            <div className="text-xs text-zinc-300 space-y-0.5">
              <p>{order.client.name}</p>
              <p className="text-zinc-400">{order.client.email}</p>
              {order.client.phone && <p className="text-zinc-400">{order.client.phone}</p>}
            </div>
            {order.invoice ? (
              <Link
                href={`/${tenant.slug}/admin/invoices/${order.invoice.id}`}
                className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline"
              >
                Invoice {order.invoice.invoiceNumber} ({INVOICE_STATE[order.invoice.status] ?? "unpaid"})
                <ExternalLink className="size-3" />
              </Link>
            ) : (
              <p className="text-xs text-zinc-500">No invoice: only included prints, nothing to pay.</p>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
