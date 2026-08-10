"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A touch/pen/mouse signature canvas. Emits a PNG data URL when a stroke ends,
// or null when cleared. `touch-action: none` stops the iPad from scrolling the
// page while the parent is signing.
export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Size the backing store to the element (crisp on retina) and paint white so
  // the exported PNG has a solid background rather than transparency.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2933";
  }, []);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    fit();
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className="h-52 w-full touch-none rounded-xl border-2 border-dashed border-line bg-white"
        style={{ touchAction: "none" }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-ink/50">{hasInk ? "Signed ✓" : "Sign above with your finger"}</span>
        <button type="button" onClick={clear} className="text-sm font-medium text-ink/60 hover:text-coral">
          Clear
        </button>
      </div>
    </div>
  );
}
