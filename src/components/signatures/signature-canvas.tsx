"use client";

import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (imageData: string) => void;
  saveLabel?: string;
  saving?: boolean;
}

export default function SignatureCanvas({
  onSave,
  saveLabel = "Speichern",
  saving = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const hasStrokes = useRef(false);
  // Store all strokes so we can redraw after resize
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const currentStroke = useRef<Array<{ x: number; y: number }>>([]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Redraw background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Set stroke style
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Redraw all previous strokes
    for (const stroke of strokes.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
      for (let i = 1; i < stroke.length; i++) {
        const prev = stroke[i - 1];
        const curr = stroke[i];
        // Smooth midpoint
        const mx = ((prev.x + curr.x) / 2) * rect.width;
        const my = ((prev.y + curr.y) / 2) * rect.height;
        ctx.quadraticCurveTo(
          prev.x * rect.width,
          prev.y * rect.height,
          mx,
          my
        );
      }
      // Draw to last point
      const last = stroke[stroke.length - 1];
      ctx.lineTo(last.x * rect.width, last.y * rect.height);
      ctx.stroke();
    }
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasStrokes.current = false;
    strokes.current = [];
    currentStroke.current = [];
  }, []);

  useEffect(() => {
    setupCanvas();

    // Re-setup on resize/orientation change
    const observer = new ResizeObserver(() => {
      setupCanvas();
    });
    const canvas = canvasRef.current;
    if (canvas) observer.observe(canvas);

    return () => observer.disconnect();
  }, [setupCanvas]);

  // Get position as fraction 0-1 (resolution-independent)
  function getFraction(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { fx: 0, fy: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      fx: (e.clientX - rect.left) / rect.width,
      fy: (e.clientY - rect.top) / rect.height,
    };
  }

  // Get pixel position for drawing
  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    lastPoint.current = getPos(e);
    hasStrokes.current = true;

    const frac = getFraction(e);
    currentStroke.current = [{ x: frac.fx, y: frac.fy }];

    // Start a new path for this entire stroke
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const current = getPos(e);
    const last = lastPoint.current;

    if (last) {
      const midX = (last.x + current.x) / 2;
      const midY = (last.y + current.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();
      // Continue the same path (re-begin from mid to keep it connected)
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    }

    lastPoint.current = current;
    const frac = getFraction(e);
    currentStroke.current.push({ x: frac.fx, y: frac.fy });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.releasePointerCapture(e.pointerId);

    if (isDrawing.current && currentStroke.current.length > 0) {
      strokes.current.push([...currentStroke.current]);
      currentStroke.current = [];
    }

    isDrawing.current = false;
    lastPoint.current = null;
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes.current) return;
    const imageData = canvas.toDataURL("image/png");
    onSave(imageData);
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="w-full h-48 border rounded-lg cursor-crosshair bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearCanvas}
        >
          <Eraser className="mr-2 h-4 w-4" />
          Leeren
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
