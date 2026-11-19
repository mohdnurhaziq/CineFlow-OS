"use client";

import Link from "next/link";
import { ExternalLink, MapPin, Store, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { FrameCanvas } from "@/components/visualizer/frame-canvas";
import { useDialog } from "@/lib/use-dialog";
import { formatCurrency } from "@/lib/utils";
import { formatPrintInches } from "@/lib/prints/orientation";
import type { MatBoardType } from "@/lib/prints/pricing";
import { MAT_BOARD_LABELS, PRINT_ORDER_STATUS_STYLES, printOrderStatusLabel } from "@/lib/prints/status";
import type { PrintOrderPreview, PrintOrderPreviewItem } from "@/lib/prints/order-preview";
import { PrintFitNote, usePrintFit } from "./print-fit";
import { studioPath } from "@/lib/domain-name";

interface PrintOrderPreviewDialogProps {
  order: PrintOrderPreview;
  tenantSlug: string;
  currency: string;
  onClose: () => void;
}

/** Longest side of a framed preview, in pixels. */
const PREVIEW_PX = 150;

function FramedItem({ item, money }: { item: PrintOrderPreviewItem; money: (n: number) => string }) {
  const fit = usePrintFit(item);
  // Until the photo's shape is known, the catalog size the client saw, turned their way.
  const short = Math.min(item.widthInches, item.heightInches);
  const long = Math.max(item.widthInches, item.heightInches);
  const dims = fit ?? (item.orientation === "PORTRAIT" ? { widthInches: short, heightInches: long } : { widthInches: long, heightInches: short });
  const mat = item.matBoardType === "NONE" ? 0 : 2;
  const outer = Math.max(dims.widthInches, dims.heightInches) + 2 * (mat + item.moldingWidth);
  const price =
    item.kind === "INCLUDED" ? (item.upgradeAmount > 0 ? `Upgrade +${money(item.upgradeAmount)}` : "Included") : "Paid";

  return (
    <li className="flex flex-col sm:flex-row gap-4 py-4 first:pt-0 last:pb-0">
      <div className="shrink-0 grid place-items-center rounded-xl bg-zinc-800/60 p-3" style={{ width: PREVIEW_PX + 24, height: PREVIEW_PX + 24 }}>
        {item.previewUrl ? (
          <FrameCanvas
            pixelsPerInch={PREVIEW_PX / outer}
            photoUrl={item.previewUrl}
            photoTitle={item.photoTitle}
            printWidthInches={dims.widthInches}
            printHeightInches={dims.heightInches}
            moldingWidthInches={item.moldingWidth}
            frameName={item.frameName}
            frameColor={item.frameColor}
            frameMaterial={item.frameMaterial}
            matBoardType={item.matBoardType as MatBoardType}
            showDimensions={false}
          />
        ) : (
          <span className="text-[11px] text-zinc-500 text-center">Photo no longer in the gallery</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-xs">
        <p className="text-sm text-white truncate">{item.photoTitle}</p>
        <p className="text-zinc-300">
          {item.sizeCode} · {fit ? formatPrintInches(fit) : item.sizeName}
        </p>
        <p className="text-zinc-400">
          {item.frameName} · {MAT_BOARD_LABELS[item.matBoardType] ?? item.matBoardType}
        </p>
        <p className="font-mono text-zinc-400">
          {price} · <span className="text-white tabular-nums">{money(item.lineAmount)}</span>
        </p>
        <PrintFitNote item={item} className="pt-1 text-[11px] text-amber-300/90" />
      </div>
    </li>
  );
}

/** A print order's framed prints as the client chose them (fit, never cropped), with fulfilment and totals. */
export function PrintOrderPreviewDialog({ order, tenantSlug, currency, onClose }: PrintOrderPreviewDialogProps) {
  const dialog = useDialog(true, onClose);
  const money = (n: number) => formatCurrency(n, currency);
  const ship = order.fulfilment === "SHIP";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div
        {...dialog}
        aria-labelledby="print-order-preview-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-[#121215] p-5 sm:p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="print-order-preview-title" className="text-sm font-semibold text-white">
              Framed prints · <span className="font-mono">{order.orderNumber}</span>
            </h2>
            <span
              className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${PRINT_ORDER_STATUS_STYLES[order.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
            >
              {printOrderStatusLabel(order.status)}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <X />
          </button>
        </div>

        <ul className="divide-y divide-zinc-800/70" aria-label="Prints">
          {order.items.map((item) => (
            <FramedItem key={item.id} item={item} money={money} />
          ))}
        </ul>

        <div className="grid sm:grid-cols-2 gap-4 border-t border-zinc-800 pt-4 text-xs">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 font-semibold text-white">
              {ship ? <MapPin className="size-3.5 text-amber-400" /> : <Store className="size-3.5 text-amber-400" />}
              {ship ? "Ship" : "Pickup at the studio"}
            </p>
            {ship && (
              <address className="not-italic text-zinc-300 leading-relaxed">
                {order.address.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </address>
            )}
          </div>
          <dl className="space-y-1">
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
        </div>

        <div className="flex justify-end">
          <Link href={studioPath(tenantSlug, `/admin/print-orders/${order.id}`)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Open full order <ExternalLink />
          </Link>
        </div>
      </div>
    </div>
  );
}
