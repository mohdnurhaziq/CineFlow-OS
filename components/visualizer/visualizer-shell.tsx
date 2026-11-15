"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Lock, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { framedPrice, type MatBoardType } from "@/lib/prints/pricing";
import { printDimensionsFor } from "@/lib/prints/orientation";
import { RoomScene, type WallColorKey } from "./room-scene";
import {
  ConfiguratorPanel,
  type PrintSizeOption,
  type FrameDesignOption,
  type PhotoOption,
} from "./configurator-panel";
import { CartDrawer } from "./cart-drawer";
import { usePhotoSize } from "./use-photo-size";
import { loadCart, money, priceLabel, priceLine, saveCart, type CartLine, type Catalog, type OrderingContext } from "./cart";

interface VisualizerShellProps {
  tenantSlug: string;
  tenantId: string;
  tenantName: string;
  currency: string;
  /** The studio's mat board price (Tenant.matBoardPrice). */
  matBoardPrice: number;
  /** Prints can be ordered here: opened from a gallery whose balance is paid and which has photos. */
  canOrder: boolean;
  /** The gallery being ordered from; null on the public preview and the admin preview. */
  ordering: OrderingContext | null;
  initialPrintSizes: PrintSizeOption[];
  initialFrameDesigns: FrameDesignOption[];
  initialPhotos: PhotoOption[];
}

export function VisualizerShell({
  tenantSlug,
  tenantId,
  tenantName,
  currency,
  matBoardPrice,
  canOrder,
  ordering,
  initialPrintSizes,
  initialFrameDesigns,
  initialPhotos,
}: VisualizerShellProps) {
  const router = useRouter();

  // Safe defaults if catalog is empty
  const defaultPrintSize: PrintSizeOption = initialPrintSizes[0] || {
    id: "default_16r",
    code: "16R",
    name: "16R (16 x 24 in)",
    widthInches: 16,
    heightInches: 24,
    basePrice: 140,
  };

  const defaultFrameDesign: FrameDesignOption = initialFrameDesigns[0] || {
    id: "default_black",
    name: "Matte Black Minimalist",
    material: "Wood",
    moldingWidth: 1.25,
    frameColor: "#18181b",
    priceOffset: 0,
    isAvailable: true,
  };

  // Studios with no showcase photos yet get a neutral stand-in, never another studio's work.
  const defaultPhoto: PhotoOption = initialPhotos[0] || {
    id: "placeholder_photo",
    title: "Your photo here",
    url:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f3f46"/><stop offset="1" stop-color="#18181b"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><text x="600" y="410" fill="#a1a1aa" font-family="sans-serif" font-size="44" text-anchor="middle">Your photo here</text></svg>'
      ),
  };

  const lines = useMemo(() => ordering?.lines ?? [], [ordering]);
  const claimLine = ordering?.claimLineId ? lines.find((l) => l.id === ordering.claimLineId) ?? null : null;

  // State
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoOption>(defaultPhoto);
  const [selectedPrintSize, setSelectedPrintSize] = useState<PrintSizeOption>(claimLine?.size ?? defaultPrintSize);
  const [selectedFrameDesign, setSelectedFrameDesign] = useState<FrameDesignOption>(claimLine?.frame ?? defaultFrameDesign);
  const [matBoard, setMatBoard] = useState<MatBoardType>("NONE");
  const [wallColor, setWallColor] = useState<WallColorKey>("WARM_GRAY");
  const [zoomMode, setZoomMode] = useState<"ROOM" | "DETAIL">("ROOM");
  /** The included print being claimed, if any: its size and frame are the starting point. */
  const [activeLineId, setActiveLineId] = useState<string | null>(claimLine?.id ?? null);

  // The cart, remembered for this gallery in this browser tab.
  const projectId = ordering?.projectId ?? null;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    setCart(loadCart(projectId));
    setCartLoaded(true);
  }, [projectId]);
  useEffect(() => {
    if (projectId && cartLoaded) saveCart(projectId, cart);
  }, [projectId, cart, cartLoaded]);

  const catalog: Catalog = useMemo(() => {
    const sizes = new Map(initialPrintSizes.map((s) => [s.id, s]));
    const frames = new Map(initialFrameDesigns.map((f) => [f.id, f]));
    for (const l of lines) {
      if (!sizes.has(l.size.id)) sizes.set(l.size.id, l.size);
      if (!frames.has(l.frame.id)) frames.set(l.frame.id, l.frame);
    }
    return { sizes, frames, lines: new Map(lines.map((l) => [l.id, l])), matBoardPrice };
  }, [initialPrintSizes, initialFrameDesigns, lines, matBoardPrice]);

  const remainingFor = (lineId: string) => {
    const line = catalog.lines.get(lineId);
    if (!line) return 0;
    return line.remaining - cart.filter((c) => c.kind === "INCLUDED" && c.bookingIncludedPrintId === lineId).length;
  };
  const activeLine = activeLineId ? catalog.lines.get(activeLineId) ?? null : null;

  // A hidden size or frame is offered only while claiming the included print that uses it.
  const printSizes = activeLine && !initialPrintSizes.some((s) => s.id === activeLine.size.id) ? [...initialPrintSizes, activeLine.size] : initialPrintSizes;
  const frameDesigns =
    activeLine && !initialFrameDesigns.some((f) => f.id === activeLine.frame.id) ? [...initialFrameDesigns, activeLine.frame] : initialFrameDesigns;

  // Live price of what is on the wall.
  const totalPrice = framedPrice({
    sizePrice: selectedPrintSize.basePrice,
    framePrice: selectedFrameDesign.priceOffset,
    mat: matBoard,
    matBoardPrice,
  });
  const current = {
    printSizeId: selectedPrintSize.id,
    frameDesignId: selectedFrameDesign.id,
    matBoardType: matBoard,
  };
  const includedPriced = activeLine ? priceLine({ ...current, kind: "INCLUDED", bookingIncludedPrintId: activeLine.id }, catalog) : null;

  // The print follows the photo's shape: the size's short side as listed, the long side to match
  // the photo, so the photo fills it with no crop. Until the photo has loaded, the last photo's shape.
  const photo = usePhotoSize(selectedPhoto.url);
  const printDims = photo.size
    ? printDimensionsFor(selectedPrintSize, photo.size)
    : {
        widthInches: Math.max(selectedPrintSize.widthInches, selectedPrintSize.heightInches),
        heightInches: Math.min(selectedPrintSize.widthInches, selectedPrintSize.heightInches),
        orientation: "LANDSCAPE" as const,
      };
  const { widthInches: printWidthInches, heightInches: printHeightInches, orientation } = printDims;

  const handleCustomPhotoUpload = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const customPhoto: PhotoOption = {
      id: `custom_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      url: objectUrl,
    };
    setSelectedPhoto(customPhoto);
  };

  const chooseLine = (lineId: string | null) => {
    setActiveLineId(lineId);
    const line = lineId ? catalog.lines.get(lineId) : null;
    if (line) {
      setSelectedPrintSize(line.size);
      setSelectedFrameDesign(line.frame);
      setMatBoard("NONE");
    } else {
      // Leaving a hidden size or frame behind: back to one that can be ordered.
      if (!initialPrintSizes.some((s) => s.id === selectedPrintSize.id)) setSelectedPrintSize(defaultPrintSize);
      if (!initialFrameDesigns.some((f) => f.id === selectedFrameDesign.id)) setSelectedFrameDesign(defaultFrameDesign);
    }
  };

  const isGalleryPhoto = initialPhotos.some((p) => p.id === selectedPhoto.id);
  const addToCart = (kind: "INCLUDED" | "PAID") => {
    if (!isGalleryPhoto || !photo.ready || !photo.size) return;
    if (kind === "INCLUDED" && (!activeLine || remainingFor(activeLine.id) <= 0)) return;
    const line: CartLine = {
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      ...(kind === "INCLUDED" && activeLine ? { bookingIncludedPrintId: activeLine.id } : {}),
      deliverableItemId: selectedPhoto.id,
      photoTitle: selectedPhoto.title,
      photoUrl: selectedPhoto.url,
      orientation,
      photoWidth: photo.size.width,
      photoHeight: photo.size.height,
      ...current,
    };
    setCart((c) => [...c, line]);
    if (kind === "INCLUDED" && activeLine && remainingFor(activeLine.id) - 1 <= 0) setActiveLineId(null);
    setCartOpen(true);
  };

  const includedCount = lines.reduce((n, l) => n + l.quantity, 0);
  const lockedMessage = ordering
    ? !ordering.unlocked
      ? includedCount > 0
        ? `${includedCount} framed print${includedCount === 1 ? "" : "s"} included, unlocks when your balance is paid`
        : "Framed prints unlock when your balance is paid"
      : !ordering.hasPhotos
        ? "Ask the studio to add your photos here to choose one"
        : null
    : null;

  const footerActions = canOrder ? (
    <div className="space-y-2">
      {!isGalleryPhoto && <p className="text-xs text-amber-400">Choose one of your gallery photos to order a print.</p>}
      {activeLine && (
        <button
          type="button"
          onClick={() => addToCart("INCLUDED")}
          disabled={!isGalleryPhoto || !photo.ready || remainingFor(activeLine.id) <= 0}
          className={cn(buttonVariants({ size: "lg" }), "w-full min-h-12")}
        >
          <Gift className="size-4" />
          <span>Add included print</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => addToCart("PAID")}
        disabled={!isGalleryPhoto || !photo.ready}
        className={cn(buttonVariants({ variant: activeLine ? "secondary" : "primary", size: "lg" }), "w-full min-h-12")}
      >
        <Plus className="size-4" />
        <span>Add as paid print · {currency} {money(totalPrice)}</span>
      </button>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Studio Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
              Wall Art Sizing Studio
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Living Room Scale & Custom Frame Visualizer</span>
            <Sparkles className="size-5 text-amber-400" />
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-scale proportional sizing anchored to an 84-inch sofa with custom moldings and museum glass
          </p>
        </div>

        <div className="flex items-center gap-3">
          {ordering ? (
            <>
              <Link href={ordering.galleryHref} className={buttonVariants({ variant: "secondary" })}>
                Back to gallery
              </Link>
              {canOrder && (
                <button type="button" onClick={() => setCartOpen(true)} className={buttonVariants()}>
                  <ShoppingBag className="size-4" />
                  Cart ({cart.length})
                </button>
              )}
            </>
          ) : (
            <div className="text-right">
              <div className="text-xs font-mono text-zinc-400">Current Studio:</div>
              <div className="text-sm font-bold text-white font-mono">{tenantName}</div>
            </div>
          )}
        </div>
      </div>

      {lockedMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <Lock className="size-4 shrink-0" />
          <span>{lockedMessage}</span>
        </div>
      )}

      {/* Included prints to claim */}
      {canOrder && lines.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">Included with your package</div>
          <div className="flex flex-wrap gap-2">
            {lines.map((l) => {
              const left = remainingFor(l.id);
              const active = activeLineId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={left <= 0 && !active}
                  aria-pressed={active}
                  onClick={() => chooseLine(active ? null : l.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                    active ? "border-amber-400 bg-amber-500/15 text-amber-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                  )}
                >
                  {l.sizeName} · {l.frameName} — {Math.max(0, left)} of {l.quantity} left
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500">
            Choose one to start from its size and frame. A bigger size or pricier frame costs only the difference.
          </p>
        </div>
      )}

      {/* Main Dual-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: 3D Living Room Mockup Canvas (7 cols on desktop) */}
        <div className="lg:col-span-7">
          <RoomScene
            photoUrl={selectedPhoto.url}
            photoTitle={selectedPhoto.title}
            printWidthInches={printWidthInches}
            printHeightInches={printHeightInches}
            moldingWidthInches={selectedFrameDesign.moldingWidth}
            frameName={selectedFrameDesign.name}
            frameColor={selectedFrameDesign.frameColor}
            frameMaterial={selectedFrameDesign.material}
            matBoardType={matBoard}
            orientation={orientation}
            wallColor={wallColor}
            zoomMode={zoomMode}
            onWallColorChange={(color) => setWallColor(color)}
            onZoomToggle={() => setZoomMode((prev) => (prev === "ROOM" ? "DETAIL" : "ROOM"))}
          />
        </div>

        {/* Right Pane: Configurator Controls Panel (5 cols on desktop) */}
        <div className="lg:col-span-5">
          <ConfiguratorPanel
            printSizes={printSizes}
            frameDesigns={frameDesigns}
            curatedPhotos={initialPhotos}
            selectedPhoto={selectedPhoto}
            selectedPrintSize={selectedPrintSize}
            selectedFrameDesign={selectedFrameDesign}
            matBoard={matBoard}
            printWidthInches={printWidthInches}
            printHeightInches={printHeightInches}
            currency={currency}
            matBoardPrice={matBoardPrice}
            totalPrice={totalPrice}
            priceNote={activeLine ? priceLabel({ kind: "INCLUDED" }, includedPriced, currency) : undefined}
            footerActions={footerActions}
            allowCustomUpload={!ordering}
            photosHeading={ordering ? "Your Gallery Photos" : undefined}
            onPhotoSelect={(p) => setSelectedPhoto(p)}
            onPrintSizeSelect={(s) => setSelectedPrintSize(s)}
            onFrameDesignSelect={(f) => setSelectedFrameDesign(f)}
            onMatBoardSelect={(m) => setMatBoard(m)}
            onCustomPhotoUpload={handleCustomPhotoUpload}
          />
        </div>
      </div>

      {ordering && canOrder && (
        <CartDrawer
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          currency={currency}
          ordering={ordering}
          cart={cart}
          catalog={catalog}
          onRemove={(key) => setCart((c) => c.filter((l) => l.key !== key))}
          onOrdered={() => {
            setCart([]);
            if (projectId) saveCart(projectId, []);
            setActiveLineId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
