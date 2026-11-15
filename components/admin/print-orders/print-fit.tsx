"use client";

import { formatPrintInches, orientPhotoSize, printDimensionsFor, type PrintDimensions } from "@/lib/prints/orientation";
import { usePhotoSize } from "@/components/visualizer/use-photo-size";

export type PrintFitInput = {
  previewUrl: string | null;
  /** The master's stored pixel size, when known; otherwise read from the preview as it loads. */
  photoWidth: number | null;
  photoHeight: number | null;
  /** The order item's orientation; a stored size that disagrees (EXIF-rotated photos) is turned to match. */
  orientation?: string | null;
  /** The catalog size snapshotted on the order item. */
  widthInches: number;
  heightInches: number;
};

/** The size to print an order item at, following its photo's shape; null until the photo's shape is known. */
export function usePrintFit(item: PrintFitInput): PrintDimensions | null {
  const known =
    item.photoWidth && item.photoHeight ? orientPhotoSize({ width: item.photoWidth, height: item.photoHeight }, item.orientation) : null;
  const { size } = usePhotoSize(item.previewUrl, known);
  return size ? printDimensionsFor(item, size) : null;
}

/** The studio's printing instruction for one order item. */
export function PrintFitNote({ item, className }: { item: PrintFitInput; className?: string }) {
  const dims = usePrintFit(item);
  return (
    <p className={className ?? "text-[11px] text-amber-300/90"}>
      {dims ? `Print at ${formatPrintInches(dims)} to match the photo — don't crop` : "Print to fit the photo's shape — don't crop"}
    </p>
  );
}
