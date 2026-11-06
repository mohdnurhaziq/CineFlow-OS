"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Eye, Shield } from "lucide-react";
import { RoomScene, type WallColorKey } from "./room-scene";
import {
  ConfiguratorPanel,
  type PrintSizeOption,
  type FrameDesignOption,
  type PhotoOption,
} from "./configurator-panel";
import { OrderModal, type PrintOrderer } from "./order-modal";

interface VisualizerShellProps {
  tenantSlug: string;
  tenantId: string;
  tenantName: string;
  currency: string;
  projectId?: string | null;
  /** Signed-in person who would place an order; null when signed out. */
  orderer: PrintOrderer | null;
  initialPrintSizes: PrintSizeOption[];
  initialFrameDesigns: FrameDesignOption[];
  initialPhotos: PhotoOption[];
}

export function VisualizerShell({
  tenantSlug,
  tenantId,
  tenantName,
  currency,
  projectId,
  orderer,
  initialPrintSizes,
  initialFrameDesigns,
  initialPhotos,
}: VisualizerShellProps) {
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

  // State
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoOption>(defaultPhoto);
  const [selectedPrintSize, setSelectedPrintSize] = useState<PrintSizeOption>(defaultPrintSize);
  const [selectedFrameDesign, setSelectedFrameDesign] = useState<FrameDesignOption>(defaultFrameDesign);
  const [matBoard, setMatBoard] = useState<"NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH">("WHITE_2INCH");
  const [orientation, setOrientation] = useState<"PORTRAIT" | "LANDSCAPE">("LANDSCAPE");
  const [wallColor, setWallColor] = useState<WallColorKey>("WARM_GRAY");
  const [zoomMode, setZoomMode] = useState<"ROOM" | "DETAIL">("ROOM");
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // Compute live price
  const matPrice = matBoard === "NONE" ? 0 : 25.0;
  const totalPrice = selectedPrintSize.basePrice + selectedFrameDesign.priceOffset + matPrice;

  // Print dimensions based on orientation
  const printWidthInches =
    orientation === "PORTRAIT" ? selectedPrintSize.widthInches : selectedPrintSize.heightInches;
  const printHeightInches =
    orientation === "PORTRAIT" ? selectedPrintSize.heightInches : selectedPrintSize.widthInches;

  const handleCustomPhotoUpload = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const customPhoto: PhotoOption = {
      id: `custom_${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      url: objectUrl,
    };
    setSelectedPhoto(customPhoto);
  };

  const handleOrientationToggle = () => {
    setOrientation((prev) => (prev === "PORTRAIT" ? "LANDSCAPE" : "PORTRAIT"));
  };

  const handleZoomToggle = () => {
    setZoomMode((prev) => (prev === "ROOM" ? "DETAIL" : "ROOM"));
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Studio Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${tenantSlug}`}
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="size-3" />
              <span>Back to Showcase</span>
            </Link>
            <span className="text-zinc-600 text-xs">•</span>
            <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
              Wall Art Sizing Studio
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Living Room Scale & Custom Frame Visualizer</span>
            <Sparkles className="size-5 text-amber-400" />
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-scale proportional sizing anchored to an 84-inch sofa with custom moldings and museum glass
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-mono text-zinc-400">Current Studio:</div>
            <div className="text-sm font-bold text-white font-mono">{tenantName}</div>
          </div>
        </div>
      </div>

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
            onZoomToggle={handleZoomToggle}
            onOrientationToggle={handleOrientationToggle}
          />
        </div>

        {/* Right Pane: Configurator Controls Panel (5 cols on desktop) */}
        <div className="lg:col-span-5">
          <ConfiguratorPanel
            printSizes={initialPrintSizes}
            frameDesigns={initialFrameDesigns}
            curatedPhotos={initialPhotos}
            selectedPhoto={selectedPhoto}
            selectedPrintSize={selectedPrintSize}
            selectedFrameDesign={selectedFrameDesign}
            matBoard={matBoard}
            orientation={orientation}
            currency={currency}
            totalPrice={totalPrice}
            onPhotoSelect={(p) => setSelectedPhoto(p)}
            onPrintSizeSelect={(s) => setSelectedPrintSize(s)}
            onFrameDesignSelect={(f) => setSelectedFrameDesign(f)}
            onMatBoardSelect={(m) => setMatBoard(m)}
            onCustomPhotoUpload={handleCustomPhotoUpload}
            onOrderClick={() => setIsOrderModalOpen(true)}
          />
        </div>
      </div>

      {/* 1-Click Order Confirmation Modal */}
      <OrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        projectId={projectId}
        orderer={orderer}
        currency={currency}
        selectedPhoto={selectedPhoto}
        selectedPrintSize={selectedPrintSize}
        selectedFrameDesign={selectedFrameDesign}
        matBoard={matBoard}
        orientation={orientation}
        totalPrice={totalPrice}
      />
    </div>
  );
}
