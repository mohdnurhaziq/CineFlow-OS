"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { RotateCcw, Trash2, CheckCircle2, ShieldCheck } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface ReleaseSignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export function ReleaseSignaturePad({
  onSignatureChange,
  disabled = false,
}: ReleaseSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const strokesRef = useRef<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  // Redraw all strokes onto canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    ctx.strokeStyle = "#f59e0b"; // Cine Amber signature ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        const p = stroke[0]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i++) {
        const p1 = stroke[i - 1]!;
        const p2 = stroke[i]!;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      }
      ctx.stroke();
    }
  }, []);

  // Sync canvas dimensions with device pixel ratio
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    redraw();
  }, [redraw]);

  useEffect(() => {
    initCanvas();
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, [initCanvas]);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const pt = getCoordinates(e);
    currentStrokeRef.current = [pt];

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pt = getCoordinates(e);
    currentStrokeRef.current.push(pt);

    const stroke = currentStrokeRef.current;
    if (stroke.length > 2) {
      const p1 = stroke[stroke.length - 2]!;
      const p2 = stroke[stroke.length - 1]!;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      ctx.stroke();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture release is not supported
    }

    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current]);
      currentStrokeRef.current = [];
      setHasSignature(true);

      const canvas = canvasRef.current;
      if (canvas) {
        onSignatureChange(canvas.toDataURL("image/png"));
      }
    }
  };

  const handleUndo = () => {
    if (disabled || strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    redraw();

    if (strokesRef.current.length === 0) {
      setHasSignature(false);
      onSignatureChange(null);
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        onSignatureChange(canvas.toDataURL("image/png"));
      }
    }
  };

  const handleClear = () => {
    if (disabled) return;
    strokesRef.current = [];
    currentStrokeRef.current = [];
    setHasSignature(false);
    redraw();
    onSignatureChange(null);
  };

  return (
    <div className="space-y-3">
      {/* Signature Canvas Box */}
      <div className="relative rounded-2xl border-2 border-dashed border-zinc-700 bg-[#0d0d10] overflow-hidden group focus-within:border-amber-500 transition-colors">
        {/* Subtle Signature Guideline */}
        <div className="absolute inset-x-6 bottom-8 border-b border-zinc-800/80 pointer-events-none flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          <span>Sign with Stylus, Touch, or Mouse</span>
          <span>X — Legally Binding Release Signatory</span>
        </div>

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: "none" }}
          className="w-full h-44 sm:h-48 cursor-crosshair relative z-10"
        />

        {/* Floating Indicator */}
        {hasSignature && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
            <CheckCircle2 className="size-3" />
            <span>Digital Signature Verified</span>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
          <ShieldCheck className="size-3 text-emerald-400" />
          <span>ESIGN & UETA Electronic Legal Signature Compliance</span>
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!hasSignature || disabled}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>Undo</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!hasSignature || disabled}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-950/20 text-xs flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="size-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
}
