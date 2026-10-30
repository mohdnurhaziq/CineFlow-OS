"use client";

import { useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Palette, Sun } from "lucide-react";
import { SofaMockup } from "./sofa-mockup";
import { FrameCanvas } from "./frame-canvas";

export type WallColorKey = "WARM_GRAY" | "CHARCOAL" | "CREAM" | "DEEP_NAVY";

interface WallColorOption {
  key: WallColorKey;
  name: string;
  hex: string;
}

export const WALL_COLORS: WallColorOption[] = [
  { key: "WARM_GRAY", name: "Warm Gallery Gray", hex: "#8d8a87" },
  { key: "CHARCOAL", name: "Modern Charcoal", hex: "#1e2024" },
  { key: "CREAM", name: "Scandinavian Cream", hex: "#f3f0e8" },
  { key: "DEEP_NAVY", name: "Heirloom Deep Navy", hex: "#111d33" },
];

interface RoomSceneProps {
  photoUrl: string;
  photoTitle?: string | null;
  printWidthInches: number;
  printHeightInches: number;
  moldingWidthInches: number;
  frameName: string;
  frameColor: string;
  frameMaterial: string;
  matBoardType: "NONE" | "WHITE_2INCH" | "OFFWHITE_2INCH";
  orientation: "PORTRAIT" | "LANDSCAPE";
  wallColor: WallColorKey;
  zoomMode: "ROOM" | "DETAIL";
  onWallColorChange: (color: WallColorKey) => void;
  onZoomToggle: () => void;
  onOrientationToggle: () => void;
}

export function RoomScene({
  photoUrl,
  photoTitle,
  printWidthInches,
  printHeightInches,
  moldingWidthInches,
  frameName,
  frameColor,
  frameMaterial,
  matBoardType,
  orientation,
  wallColor,
  zoomMode,
  onWallColorChange,
  onZoomToggle,
  onOrientationToggle,
}: RoomSceneProps) {
  const selectedWall = useMemo(() => {
    return WALL_COLORS.find((w) => w.key === wallColor) || WALL_COLORS[0]!;
  }, [wallColor]);

  // Calibration: Desktop base sofa width = 504px => 1 inch = 6.0px
  const baseSofaWidth = 504;
  const zoomFactor = zoomMode === "DETAIL" ? 1.75 : 1.0;
  const effectiveSofaWidth = Math.round(baseSofaWidth * zoomFactor);
  const pixelsPerInch = (effectiveSofaWidth / 84);

  return (
    <div className="relative rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl flex flex-col bg-[#0b0b0e]">
      {/* Top Controls Bar */}
      <div className="z-30 p-3 sm:p-4 bg-black/60 backdrop-blur-md border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
        {/* Wall Color Selectors */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1 mr-1">
            <Palette className="size-3.5 text-amber-400" />
            <span className="hidden sm:inline">Wall:</span>
          </span>
          {WALL_COLORS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => onWallColorChange(w.key)}
              title={w.name}
              className={`size-6 sm:size-7 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                wallColor === w.key
                  ? "border-amber-400 scale-110 shadow-md shadow-amber-500/20"
                  : "border-zinc-700/80 hover:border-zinc-500"
              }`}
              style={{ backgroundColor: w.hex }}
            >
              {wallColor === w.key && (
                <span className="size-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>

        {/* View Controls: Orientation & Zoom */}
        <div className="flex items-center gap-2">
          {/* Orientation Toggle */}
          <button
            type="button"
            onClick={onOrientationToggle}
            className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="size-3 text-amber-400" />
            <span>{orientation === "PORTRAIT" ? "Portrait" : "Landscape"}</span>
          </button>

          {/* Zoom Toggle */}
          <button
            type="button"
            onClick={onZoomToggle}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              zoomMode === "DETAIL"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold"
                : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white"
            }`}
          >
            {zoomMode === "DETAIL" ? (
              <>
                <ZoomOut className="size-3" />
                <span>1x Room</span>
              </>
            ) : (
              <>
                <ZoomIn className="size-3" />
                <span>2x Detail</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3D Living Room Canvas Surface */}
      <div
        className="relative flex-1 min-h-[480px] sm:min-h-[580px] flex flex-col justify-between items-center transition-colors duration-500 ease-out overflow-hidden"
        style={{ backgroundColor: selectedWall.hex }}
      >
        {/* Overhead Gallery Spotlight Radial Gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 75%)",
          }}
        />

        {/* Frame Artwork Hanging Area */}
        <div className="relative z-10 w-full flex-1 flex items-center justify-center pt-8 pb-4 px-4">
          <FrameCanvas
            pixelsPerInch={pixelsPerInch}
            photoUrl={photoUrl}
            photoTitle={photoTitle}
            printWidthInches={printWidthInches}
            printHeightInches={printHeightInches}
            moldingWidthInches={moldingWidthInches}
            frameName={frameName}
            frameColor={frameColor}
            frameMaterial={frameMaterial}
            matBoardType={matBoardType}
            orientation={orientation}
            sofaWidthPx={effectiveSofaWidth}
          />
        </div>

        {/* Lower Living Room Ground: Baseboard, Sofa, and Hardwood Floor */}
        <div className="relative z-20 w-full flex flex-col items-center">
          {/* Centered 84" Sofa Scale Anchor */}
          <div className="transition-all duration-300 ease-out mb-2">
            <SofaMockup widthPx={effectiveSofaWidth} />
          </div>

          {/* Architectural Baseboard Trim */}
          <div className="w-full h-3 bg-[#e8e6df] border-t border-b border-black/20 shadow-sm" />

          {/* Hardwood Flooring with Warm Wood Texture Simulation */}
          <div
            className="w-full h-16 sm:h-20"
            style={{
              background:
                "linear-gradient(180deg, #3d271d 0%, #291811 50%, #170d09 100%)",
              boxShadow: "inset 0 6px 14px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
