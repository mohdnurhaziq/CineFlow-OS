"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Maximize,
  Frame,
  Layers,
  Upload,
  Check,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import type { WallColorKey } from "./room-scene";

export interface PrintSizeOption {
  id: string;
  code: string;
  name: string;
  widthInches: number;
  heightInches: number;
  basePrice: number;
}

export interface FrameDesignOption {
  id: string;
  name: string;
  material: string;
  moldingWidth: number;
  frameColor: string;
  priceOffset: number;
  isAvailable: boolean;
}

export interface PhotoOption {
  id: string;
  title: string;
  url: string;
  aspectRatio?: number;
}

interface ConfiguratorPanelProps {
  printSizes: PrintSizeOption[];
  frameDesigns: FrameDesignOption[];
  curatedPhotos: PhotoOption[];
  selectedPhoto: PhotoOption;
  selectedPrintSize: PrintSizeOption;
  selectedFrameDesign: FrameDesignOption;
  matBoard: "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH";
  orientation: "PORTRAIT" | "LANDSCAPE";
  currency: string;
  totalPrice: number;
  onPhotoSelect: (photo: PhotoOption) => void;
  onPrintSizeSelect: (size: PrintSizeOption) => void;
  onFrameDesignSelect: (frame: FrameDesignOption) => void;
  onMatBoardSelect: (mat: "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH") => void;
  onCustomPhotoUpload: (file: File) => void;
  onOrderClick: () => void;
}

export function ConfiguratorPanel({
  printSizes,
  frameDesigns,
  curatedPhotos,
  selectedPhoto,
  selectedPrintSize,
  selectedFrameDesign,
  matBoard,
  orientation,
  currency,
  totalPrice,
  onPhotoSelect,
  onPrintSizeSelect,
  onFrameDesignSelect,
  onMatBoardSelect,
  onCustomPhotoUpload,
  onOrderClick,
}: ConfiguratorPanelProps) {
  const [activeTab, setActiveTab] = useState<"PHOTO" | "SIZE" | "FRAME" | "MAT">("SIZE");

  const matInches = matBoard === "NONE" ? 0 : 2.0;
  const printW = orientation === "PORTRAIT" ? selectedPrintSize.widthInches : selectedPrintSize.heightInches;
  const printH = orientation === "PORTRAIT" ? selectedPrintSize.heightInches : selectedPrintSize.widthInches;
  const totalW = printW + matInches * 2 + selectedFrameDesign.moldingWidth * 2;
  const totalH = printH + matInches * 2 + selectedFrameDesign.moldingWidth * 2;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onCustomPhotoUpload(e.target.files[0]);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-[#0d0d10] shadow-2xl flex flex-col justify-between overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/60 p-1 text-xs font-mono font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("PHOTO")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "PHOTO"
              ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <ImageIcon className="size-3.5" />
          <span>Artwork</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SIZE")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "SIZE"
              ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Maximize className="size-3.5" />
          <span>Size</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("FRAME")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "FRAME"
              ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Frame className="size-3.5" />
          <span>Molding</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("MAT")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "MAT"
              ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Layers className="size-3.5" />
          <span>Mat Board</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-5 flex-1 overflow-y-auto max-h-[460px] space-y-4">
        {/* TAB 1: ARTWORK / PHOTO */}
        {activeTab === "PHOTO" && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold mb-2">
                Studio Masterpiece Presets
              </h4>
              <div className="grid grid-cols-2 gap-2.5">
                {curatedPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onPhotoSelect(photo)}
                    className={`relative rounded-xl border overflow-hidden p-1 text-left transition-all cursor-pointer group ${
                      selectedPhoto.id === photo.id
                        ? "border-amber-400 ring-2 ring-amber-500/20 bg-zinc-900"
                        : "border-zinc-800 hover:border-zinc-700 bg-zinc-950"
                    }`}
                  >
                    <div className="aspect-[4/3] rounded-lg overflow-hidden bg-zinc-900 mb-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="px-1 pb-1">
                      <div className="text-[11px] font-medium text-white truncate">
                        {photo.title}
                      </div>
                    </div>
                    {selectedPhoto.id === photo.id && (
                      <div className="absolute top-2 right-2 p-1 rounded-full bg-amber-500 text-black shadow-md">
                        <Check className="size-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Photo Upload */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold block mb-2">
                Upload Custom High-Res Photo
              </label>
              <label className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 hover:border-amber-500/50 hover:bg-zinc-900/40 transition-colors cursor-pointer">
                <Upload className="size-5 text-amber-400 mb-1" />
                <span className="text-xs font-medium text-white">
                  Drop custom photo or browse
                </span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                  JPEG, PNG, WebP up to 50MB
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* TAB 2: PRINT SIZE */}
        {activeTab === "SIZE" && (
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Select Archival Print Size
            </div>

            <div className="space-y-2.5">
              {printSizes.map((size) => {
                const isSelected = selectedPrintSize.id === size.id;
                const is16R = size.code.includes("16R");

                return (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => onPrintSizeSelect(size)}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                        : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white font-mono">
                          {size.name}
                        </span>
                        {is16R && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 font-bold">
                            <Sparkles className="size-2.5" />
                            <span>GALLERY BESTSELLER</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono mt-0.5">
                        {size.widthInches}" × {size.heightInches}" Archival Cotton Rag
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-emerald-400 font-mono text-sm">
                        {currency} {size.basePrice}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Base Print</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: FRAME MOLDING */}
        {activeTab === "FRAME" && (
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Select Custom Frame Molding
            </div>

            <div className="space-y-2.5">
              {frameDesigns.map((frame) => {
                const isSelected = selectedFrameDesign.id === frame.id;

                return (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => onFrameDesignSelect(frame)}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                        : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="size-9 rounded-xl border border-white/20 shadow-inner shrink-0"
                        style={{ backgroundColor: frame.frameColor }}
                      />
                      <div>
                        <div className="font-bold text-sm text-white">{frame.name}</div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">
                          {frame.material} • {frame.moldingWidth}" Profile
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-amber-400 font-mono text-sm">
                        {frame.priceOffset > 0 ? `+${currency} ${frame.priceOffset}` : "Included"}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Frame Markup</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: MAT BOARD */}
        {activeTab === "MAT" && (
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Museum Mat Board Border
            </div>

            <div className="space-y-2.5">
              {/* Option 1: None */}
              <button
                type="button"
                onClick={() => onMatBoardSelect("NONE")}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  matBoard === "NONE"
                    ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <div>
                  <div className="font-bold text-sm text-white">Full-Bleed (No Mat)</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Print extends directly to inner frame molding edge
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-bold text-zinc-400">
                  +$0.00
                </div>
              </button>

              {/* Option 2: 2" Archival White */}
              <button
                type="button"
                onClick={() => onMatBoardSelect("WHITE_2INCH")}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  matBoard === "WHITE_2INCH"
                    ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-white border border-zinc-300 shadow-sm shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-white">2" Pure Archival White</div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      45° beveled acid-free core (+4" total frame size)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-bold text-amber-400">
                  +{currency} 25
                </div>
              </button>

              {/* Option 3: 2" Warm Off-White */}
              <button
                type="button"
                onClick={() => onMatBoardSelect("OFFWHITE_2INCH")}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  matBoard === "OFFWHITE_2INCH"
                    ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-[#f6f4eb] border border-zinc-300 shadow-sm shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-white">2" Warm Gallery Off-White</div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Warm museum matting (+4" total frame size)
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-bold text-amber-400">
                  +{currency} 25
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="p-5 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Total Framed Work Order
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
              {currency} {totalPrice.toFixed(2)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono text-zinc-400">
              Exterior Frame Footprint
            </div>
            <div className="text-xs font-mono font-bold text-amber-400">
              {totalW.toFixed(1)}" × {totalH.toFixed(1)}"
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOrderClick}
          className="w-full min-h-[48px] px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm tracking-wide uppercase transition-all shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <ShoppingBag className="size-4" />
          <span>Order Framed Print · {currency} {totalPrice.toFixed(2)}</span>
        </button>
      </div>
    </div>
  );
}
