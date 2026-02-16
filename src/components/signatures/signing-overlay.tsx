"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface Signature {
  id: string;
  name: string;
}

interface SigningOverlayProps {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSigned: () => void;
}

interface Placement {
  x: number; // fraction 0-1
  y: number; // fraction 0-1
  width: number; // fraction 0-1
  height: number; // fraction 0-1
}

export default function SigningOverlay({
  documentId,
  open,
  onOpenChange,
  onSigned,
}: SigningOverlayProps) {
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSig, setSelectedSig] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [signing, setSigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const justInteracted = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Load page count and signatures
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPlacement(null);
    setSelectedSig(null);
    setCurrentPage(1);

    Promise.all([
      fetch(`/api/documents/${documentId}/pages`).then((r) => r.json()),
      fetch("/api/signatures").then((r) => r.json()),
    ])
      .then(([pageData, sigs]) => {
        setPageCount(pageData.pageCount || 1);
        setSignatures(sigs);
        if (sigs.length > 0) setSelectedSig(sigs[0].id);
      })
      .catch(() => toast.error("Laden fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, [open, documentId]);

  // Reset image loaded state on page change
  useEffect(() => {
    setImageLoaded(false);
  }, [currentPage]);

  const getFractions = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return { fx: 0, fy: 0 };
      const rect = container.getBoundingClientRect();
      return {
        fx: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        fy: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    []
  );

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectedSig || isDragging.current || isResizing.current || justInteracted.current) return;

    const { fx, fy } = getFractions(e.clientX, e.clientY);
    // Default signature size: 15% width, maintain aspect ratio ~3:1
    const sigW = 0.15;
    const sigH = 0.05;
    setPlacement({
      x: Math.max(0, Math.min(1 - sigW, fx - sigW / 2)),
      y: Math.max(0, Math.min(1 - sigH, fy - sigH / 2)),
      width: sigW,
      height: sigH,
    });
  }

  function handleDragStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!placement) return;
    isDragging.current = true;

    const { fx, fy } = getFractions(e.clientX, e.clientY);
    dragOffset.current = { x: fx - placement.x, y: fy - placement.y };

    const onMove = (me: PointerEvent) => {
      if (!isDragging.current) return;
      const { fx: mx, fy: my } = getFractions(me.clientX, me.clientY);
      setPlacement((p) => {
        if (!p) return p;
        return {
          ...p,
          x: Math.max(0, Math.min(1 - p.width, mx - dragOffset.current.x)),
          y: Math.max(0, Math.min(1 - p.height, my - dragOffset.current.y)),
        };
      });
    };

    const onUp = () => {
      isDragging.current = false;
      justInteracted.current = true;
      setTimeout(() => { justInteracted.current = false; }, 50);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleResizeStart(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!placement) return;
    isResizing.current = true;

    const startWidth = placement.width;
    const startHeight = placement.height;
    const aspect = startWidth / startHeight;
    const { fx: startFx } = getFractions(e.clientX, e.clientY);

    const onMove = (me: PointerEvent) => {
      if (!isResizing.current) return;
      const { fx: mx } = getFractions(me.clientX, me.clientY);
      const delta = mx - startFx;
      const newW = Math.max(0.05, Math.min(0.5, startWidth + delta));
      const newH = newW / aspect;
      setPlacement((p) => {
        if (!p) return p;
        return {
          ...p,
          width: Math.min(newW, 1 - p.x),
          height: Math.min(newH, 1 - p.y),
        };
      });
    };

    const onUp = () => {
      isResizing.current = false;
      justInteracted.current = true;
      setTimeout(() => { justInteracted.current = false; }, 50);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function handleSign() {
    if (!placement || !selectedSig) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureId: selectedSig,
          page: currentPage,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        }),
      });
      if (res.ok) {
        toast.success("Dokument unterschrieben");
        onOpenChange(false);
        onSigned();
      } else {
        toast.error("Unterschreiben fehlgeschlagen");
      }
    } catch {
      toast.error("Unterschreiben fehlgeschlagen");
    } finally {
      setSigning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Dokument unterschreiben</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : signatures.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Keine Unterschriften vorhanden. Erstelle zuerst eine in den Einstellungen.</p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Page navigation */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => p - 1);
                    setPlacement(null);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-2">
                  Seite {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= pageCount}
                  onClick={() => {
                    setCurrentPage((p) => p + 1);
                    setPlacement(null);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Signature selector */}
              <select
                className="text-sm border rounded px-2 py-1.5 bg-background"
                value={selectedSig || ""}
                onChange={(e) => setSelectedSig(e.target.value)}
              >
                {signatures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div className="flex-1" />

              <Button
                onClick={handleSign}
                disabled={!placement || signing}
                size="sm"
              >
                {signing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unterschreiben
              </Button>
            </div>

            {/* Page preview with signature placement */}
            <div className="flex-1 overflow-auto flex justify-center bg-muted/30 rounded-lg p-4">
              <div
                ref={containerRef}
                className="relative inline-block cursor-crosshair"
                onClick={handleContainerClick}
                style={{ maxHeight: "100%", lineHeight: 0 }}
              >
                {!imageLoaded && (
                  <div className="flex items-center justify-center w-full min-h-[400px]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
                <img
                  src={`/api/documents/${documentId}/pages?page=${currentPage}`}
                  alt={`Seite ${currentPage}`}
                  className="max-h-full w-auto border shadow-sm"
                  style={{ display: imageLoaded ? "block" : "none" }}
                  onLoad={() => setImageLoaded(true)}
                  draggable={false}
                />

                {/* Placed signature */}
                {placement && selectedSig && imageLoaded && (
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/10 cursor-move"
                    style={{
                      left: `${placement.x * 100}%`,
                      top: `${placement.y * 100}%`,
                      width: `${placement.width * 100}%`,
                      height: `${placement.height * 100}%`,
                    }}
                    onPointerDown={handleDragStart}
                  >
                    <img
                      src={`/api/signatures/${selectedSig}/image`}
                      alt="Unterschrift"
                      className="w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                    {/* Resize handle */}
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize"
                      style={{ transform: "translate(50%, 50%)" }}
                      onPointerDown={handleResizeStart}
                    />
                  </div>
                )}

                {/* Hint */}
                {!placement && selectedSig && imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="bg-background/80 text-sm px-3 py-2 rounded-lg shadow">
                      Klicke auf die Stelle, an der die Unterschrift platziert werden soll
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
