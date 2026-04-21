"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const MAX_THUMBNAIL_CACHE = 120;

interface SlideStripProps {
  pdf: PDFDocumentProxy;
  selectedPages: number[];
  onToggle: (pageIndex: number) => void;
  onSelectRange?: (fromPageIndex: number, toPageIndex: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onSelectOdd: () => void;
  onSelectEven: () => void;
  disabled?: boolean;
  maxWidth?: number; // cap outer container width
  pageOverrides?: Record<number, unknown>;
}

export function SlideStrip({
  pdf,
  selectedPages,
  onToggle,
  onSelectRange,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  onSelectOdd,
  onSelectEven,
  disabled,
  maxWidth,
  pageOverrides,
}: SlideStripProps) {
  const [pageCount, setPageCount] = useState(0);
  const [thumbScale, setThumbScale] = useState(100);
  const canvasRefs = useRef<HTMLCanvasElement[]>([]);
  const renderCache = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const lastInteractedRef = useRef<number | null>(null);

  useEffect(() => {
    setPageCount(pdf.numPages);
    renderCache.current.clear();
    canvasRefs.current = [];
    // Kick off eager rendering of all thumbs immediately
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 220;
        const scale = targetWidth / viewport.width;
        const thumbViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = thumbViewport.width;
        canvas.height = thumbViewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
        renderCache.current.set(i, canvas);
        if (renderCache.current.size > MAX_THUMBNAIL_CACHE) {
          const oldestKey = renderCache.current.keys().next().value as number | undefined;
          if (typeof oldestKey === "number") renderCache.current.delete(oldestKey);
        }
        if (cancelled) break;
        const target = canvasRefs.current[i];
        if (target) drawToTarget(canvas, target);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  function drawToTarget(src: HTMLCanvasElement, target: HTMLCanvasElement) {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    target.width = src.width;
    target.height = src.height;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(src, 0, 0);
  }

  const cardWidth = Math.round(180 * (thumbScale / 100));

  function handleToggle(i: number, shiftKey = false) {
    if (disabled) return;
    if (shiftKey && onSelectRange && lastInteractedRef.current !== null) {
      onSelectRange(lastInteractedRef.current, i);
    } else {
      onToggle(i);
    }
    lastInteractedRef.current = i;
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Slides ({selectedPages.length}/{pageCount})
        </span>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={disabled}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={onDeselectAll} disabled={disabled}>
            Deselect all
          </Button>
          <Button variant="ghost" size="sm" onClick={onInvertSelection} disabled={disabled}>
            Invert
          </Button>
          <Button variant="ghost" size="sm" onClick={onSelectOdd} disabled={disabled}>
            Odd
          </Button>
          <Button variant="ghost" size="sm" onClick={onSelectEven} disabled={disabled}>
            Even
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Tip: click a slide to include/exclude it</span>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
            <Label className="text-xs">Thumbnail scale</Label>
            <div className="w-[140px]">
              <Slider
                value={[thumbScale]}
                min={70}
                max={140}
                step={5}
                disabled={disabled}
                onValueChange={([value]) => setThumbScale(value)}
              />
            </div>
            <span className="tabular-nums">{thumbScale}%</span>
          </div>
        </div>
      </div>

      <div
        className="w-full rounded-xl border border-border bg-muted/30 p-4"
        style={maxWidth ? { maxWidth, margin: "10px auto" } : undefined}
      >
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(150, cardWidth)}px, 1fr))`,
          }}
        >
          {Array.from({ length: pageCount }, (_, i) => {
            const isIncluded = selectedPages.includes(i);
            const hasOverride = Boolean(pageOverrides?.[i]);
            return (
              <div
                key={i}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-background px-3 py-3 transition",
                  isIncluded ? "border-primary/60 ring-2 ring-primary/30" : "border-border",
                  !isIncluded && "opacity-60",
                  disabled && "cursor-not-allowed opacity-70"
                )}
                onClick={(event) => handleToggle(i, event.shiftKey)}
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Slide {i + 1}</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      readOnly
                      disabled={disabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggle(i, event.shiftKey);
                      }}
                      className="h-3 w-3 rounded border-border/70 text-primary"
                    />
                    <span>Include</span>
                  </label>
                </div>

                <div className="relative">
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current[i] = el;
                    }}
                    className={cn("rounded bg-white", !isIncluded && "opacity-60")}
                    style={{ width: "100%", height: "auto" }}
                  />
                  {hasOverride && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Override
                    </span>
                  )}
                </div>

                {!isIncluded && <span className="text-[10px] text-destructive">Excluded</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
