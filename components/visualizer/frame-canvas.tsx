"use client";

import { useMemo } from "react";
import { Sparkles, Maximize2 } from "lucide-react";

interface FrameCanvasProps {
  pixelsPerInch: number;
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
  sofaWidthPx: number;
}

export function FrameCanvas({
  pixelsPerInch,
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
  sofaWidthPx,
}: FrameCanvasProps) {
  // Mat dimensions in inches
  const matInches = matBoardType === "NONE" ? 0 : 2.0;

  // Total Exterior Dimensions (inches)
  const totalWidthInches = printWidthInches + matInches * 2 + moldingWidthInches * 2;
  const totalHeightInches = printHeightInches + matInches * 2 + moldingWidthInches * 2;

  // Dimensions in Pixels
  const totalWidthPx = Math.round(totalWidthInches * pixelsPerInch);
  const totalHeightPx = Math.round(totalHeightInches * pixelsPerInch);
  const moldingWidthPx = Math.max(4, Math.round(moldingWidthInches * pixelsPerInch));
  const matWidthPx = Math.round(matInches * pixelsPerInch);

  // Percentage of 84" sofa width
  const percentOfSofa = Math.round((totalWidthInches / 84) * 100);

  // Determine Frame Molding Background Gradient & Styling
  const frameStyle = useMemo(() => {
    const lowerName = (frameName + " " + frameMaterial + " " + frameColor).toLowerCase();

    if (lowerName.includes("walnut") || lowerName.includes("wood") && !lowerName.includes("gold") && !lowerName.includes("black")) {
      return {
        background: "linear-gradient(135deg, #5c3924 0%, #4a2e1b 45%, #341f11 100%)",
        boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.18), inset -1px -1px 2px rgba(0,0,0,0.6)",
      };
    }
    if (lowerName.includes("teak")) {
      return {
        background: "linear-gradient(135deg, #92400e 0%, #78350f 50%, #5a2608 100%)",
        boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.22), inset -1px -1px 2px rgba(0,0,0,0.6)",
      };
    }
    if (lowerName.includes("gold") || lowerName.includes("champagne") || lowerName.includes("ornate")) {
      return {
        background: "linear-gradient(135deg, #dfc384 0%, #c5a059 40%, #a6843c 70%, #d4b870 100%)",
        boxShadow: "inset 1px 1px 3px rgba(255,255,255,0.5), inset -1px -1px 3px rgba(0,0,0,0.5)",
      };
    }
    if (lowerName.includes("white")) {
      return {
        background: "linear-gradient(135deg, #ffffff 0%, #f4f4f5 50%, #e4e4e7 100%)",
        boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.9), inset -1px -1px 2px rgba(0,0,0,0.25)",
      };
    }
    // Default: Matte Black / Dark Charcoal
    return {
      background: "linear-gradient(135deg, #27272a 0%, #18181b 50%, #09090b 100%)",
      boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.1), inset -1px -1px 2px rgba(0,0,0,0.7)",
    };
  }, [frameName, frameMaterial, frameColor]);

  // Determine Mat Board Styling
  const matStyle = useMemo(() => {
    if (matBoardType === "NONE") return null;
    const isOffWhite = matBoardType === "OFFWHITE_2INCH";
    return {
      backgroundColor: isOffWhite ? "#f6f4eb" : "#ffffff",
      boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.28)", // 45° beveled core shadow
    };
  }, [matBoardType]);

  return (
    <div className="relative flex flex-col items-center group">
      {/* Outer Frame Molding Container */}
      <div
        className="relative transition-all duration-300 ease-out select-none"
        style={{
          width: `${totalWidthPx}px`,
          height: `${totalHeightPx}px`,
          padding: `${moldingWidthPx}px`,
          ...frameStyle,
          // Multi-layer Wall Drop Shadow: ambient contact + directional gallery spotlight downlight
          boxShadow: `${frameStyle.boxShadow}, 0 2px 4px rgba(0,0,0,0.35), 0 20px 45px -10px rgba(0,0,0,0.55)`,
        }}
      >
        {/* Mat Board or Direct Artwork Wrap */}
        <div
          className="w-full h-full relative overflow-hidden transition-all duration-200"
          style={
            matStyle
              ? {
                  ...matStyle,
                  padding: `${matWidthPx}px`,
                }
              : {}
          }
        >
          {/* Inner Photo Artwork Container */}
          <div className="w-full h-full relative overflow-hidden bg-zinc-900 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={photoTitle || "Custom Wall Art Print"}
              className="w-full h-full object-cover select-none"
              draggable={false}
            />

            {/* Anti-Reflective Museum Glass Sheen */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(125deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 32%, transparent 60%)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Floating Dimension Pill Badge */}
      <div className="mt-3 opacity-90 group-hover:opacity-100 transition-opacity">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/85 backdrop-blur-md border border-zinc-700 text-white text-[10px] sm:text-[11px] font-mono shadow-xl">
          <span className="font-bold text-amber-400">
            {printWidthInches}" × {printHeightInches}" Print
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-300">
            {totalWidthInches.toFixed(1)}" × {totalHeightInches.toFixed(1)}" Frame
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-emerald-400 font-semibold">
            {percentOfSofa}% Sofa Width
          </span>
        </div>
      </div>
    </div>
  );
}
