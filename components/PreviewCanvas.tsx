"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { HandoutSettings } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { buildLayoutPlan, mmToPx } from "@/lib/layoutEngine";
import { buildOutputPlan, SlideSettingsOverrideMap } from "@/lib/outputPlan";
import { getNotesLayout } from "@/lib/notesLayout";
import { WhiteoutMap } from "@/lib/detectRepeatedRegions";

interface PreviewCanvasProps {
  pdf: PDFDocumentProxy | null;
  settings: HandoutSettings;
  pageCount: number;
  selectedPages: number[];
  currentOutputPage: number;
  onPageChange: (page: number) => void;
  zoom: number;
  pageOverrides: SlideSettingsOverrideMap;
  whiteoutRegions: WhiteoutMap;
  chapterStartPageIndices?: number[];
  forceOddChapterStart?: boolean;
}

const INITIAL_VISIBLE_PAGES = 3;
const MAX_SOURCE_PAGE_CACHE = 36;

export function PreviewCanvas({
  pdf,
  settings,
  pageCount,
  selectedPages,
  currentOutputPage: _currentOutputPage,
  onPageChange: _onPageChange,
  zoom,
  pageOverrides,
  whiteoutRegions,
  chapterStartPageIndices = [],
  forceOddChapterStart = false,
}: PreviewCanvasProps) {
  const canvasRefs = useRef<HTMLCanvasElement[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderVersionRef = useRef(0);
  const [isRendering, setIsRendering] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: INITIAL_VISIBLE_PAGES - 1,
  });

  const effectivePages = useMemo(
    () => (selectedPages.length > 0 ? selectedPages : Array.from({ length: pageCount }, (_, i) => i)),
    [selectedPages, pageCount]
  );

  const outputPlan = useMemo(
    () =>
      buildOutputPlan(effectivePages, settings, pageOverrides, {
        chapterStartPageIndices,
        forceOddChapterStart,
      }),
    [effectivePages, settings, pageOverrides, chapterStartPageIndices, forceOddChapterStart]
  );

  const outputPageCount = Math.max(1, outputPlan.length);

  const layoutCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof buildLayoutPlan>>();
    outputPlan.forEach((plan) => {
      const key = JSON.stringify(plan.settings);
      if (!cache.has(key)) {
        cache.set(key, buildLayoutPlan(plan.settings));
      }
    });
    const globalKey = JSON.stringify(settings);
    if (!cache.has(globalKey)) {
      cache.set(globalKey, buildLayoutPlan(settings));
    }
    return cache;
  }, [outputPlan, settings]);

  useEffect(() => {
    renderVersionRef.current += 1;
    renderedPagesRef.current.clear();
    setVisibleRange({
      start: 0,
      end: Math.max(0, Math.min(outputPageCount - 1, INITIAL_VISIBLE_PAGES - 1)),
    });
  }, [pdf, outputPlan, outputPageCount, settings, zoom, pageOverrides, whiteoutRegions]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const baseLayout = layoutCache.get(JSON.stringify(settings));
    if (!baseLayout || !scroller) {
      setVisibleRange({
        start: 0,
        end: Math.max(0, Math.min(outputPageCount - 1, INITIAL_VISIBLE_PAGES - 1)),
      });
      return;
    }

    const pageStep = Math.max(1, Math.round(baseLayout.pageHeightPx * zoom) + 36);

    const updateRange = () => {
      const top = scroller.scrollTop;
      const viewport = scroller.clientHeight || pageStep * 2;
      const start = Math.max(0, Math.floor(top / pageStep) - 1);
      const end = Math.min(outputPageCount - 1, Math.ceil((top + viewport) / pageStep) + 1);
      setVisibleRange((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    };

    updateRange();
    scroller.addEventListener("scroll", updateRange, { passive: true });
    window.addEventListener("resize", updateRange);

    return () => {
      scroller.removeEventListener("scroll", updateRange);
      window.removeEventListener("resize", updateRange);
    };
  }, [layoutCache, outputPageCount, settings, zoom]);

  useEffect(() => {
    let cancelled = false;
    const version = renderVersionRef.current;

    async function renderVisiblePages() {
      if (!pdf) return;
      const baseLayout = layoutCache.get(JSON.stringify(settings));
      if (!baseLayout) return;

      const pagesToRender: number[] = [];
      for (let i = visibleRange.start; i <= visibleRange.end; i++) {
        if (i >= 0 && i < outputPageCount && !renderedPagesRef.current.has(i)) {
          pagesToRender.push(i);
        }
      }

      if (pagesToRender.length === 0) {
        setIsRendering(false);
        return;
      }

      setIsRendering(true);

      const dpr = window.devicePixelRatio || 1;
      const scaledWidth = Math.round(baseLayout.pageWidthPx * zoom);
      const scaledHeight = Math.round(baseLayout.pageHeightPx * zoom);

      for (const outIndex of pagesToRender) {
        if (cancelled || renderVersionRef.current !== version) return;

        const plan = outputPlan[outIndex];
        const layout = plan ? layoutCache.get(JSON.stringify(plan.settings)) : baseLayout;
        if (!layout || !plan) continue;

        const canvas = canvasRefs.current[outIndex];
        if (!canvas) continue;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;
        canvas.width = Math.round(scaledWidth * dpr);
        canvas.height = Math.round(scaledHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, scaledWidth, scaledHeight);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, scaledWidth, scaledHeight);

        const slots = layout.slotsPx;
        const slotsMm = layout.slots;

        if (plan.isSpacer) {
          ctx.fillStyle = "rgba(80,92,118,0.1)";
          ctx.fillRect(0, 0, scaledWidth, scaledHeight);
          ctx.fillStyle = "rgba(90,105,130,0.9)";
          ctx.font = `${14 * zoom}px 'SF Pro Text', -apple-system, 'Segoe UI', system-ui`;
          const label = "Blank spacer page";
          const textWidth = ctx.measureText(label).width;
          ctx.fillText(label, (scaledWidth - textWidth) / 2, scaledHeight / 2);
          renderedPagesRef.current.add(outIndex);
          continue;
        }

        for (let i = 0; i < plan.pageIndices.length; i++) {
          const pageNumber = plan.pageIndices[i] + 1;
          const sourceCanvas = await renderPageToCanvas(pageNumber, pdf, cacheRef.current);
          if (cancelled || renderVersionRef.current !== version) return;

          const slot = slots[i];
          const slotMm = slotsMm[i];
          const notes = getNotesLayout(slotMm.widthMm, slotMm.heightMm, plan.settings);
          const notesOffsetPx =
            notes.position === "bottom" ? mmToPx(notes.notesAreaMm + notes.gapMm) : 0;
          const sideOffsetPx =
            notes.position === "left" || notes.position === "right"
              ? mmToPx(notes.notesAreaWidthMm + notes.gapMm)
              : 0;
          const contentHeightPx = Math.max(8, slot.height - notesOffsetPx);
          const contentWidthPx = Math.max(8, slot.width - sideOffsetPx);

          const fit = Math.min(contentWidthPx / sourceCanvas.width, contentHeightPx / sourceCanvas.height);
          const renderScale = fit * (plan.settings.scale / 100) * zoom;
          const renderWidth = sourceCanvas.width * renderScale;
          const renderHeight = sourceCanvas.height * renderScale;

          const x =
            notes.position === "left"
              ? slot.x * zoom + sideOffsetPx * zoom + (contentWidthPx * zoom - renderWidth) / 2
              : slot.x * zoom + (contentWidthPx * zoom - renderWidth) / 2;
          const y = slot.y * zoom + (contentHeightPx * zoom - renderHeight) / 2;

          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(sourceCanvas, x, y, renderWidth, renderHeight);

          const pageRegions = plan.settings.whiteoutEnabled ? whiteoutRegions[plan.pageIndices[i]] : undefined;
          if (pageRegions && pageRegions.length > 0) {
            ctx.save();
            for (const region of pageRegions) {
              const rx = x + region.xPct * renderWidth;
              const ry = y + region.yPct * renderHeight;
              const rw = region.widthPct * renderWidth;
              const rh = region.heightPct * renderHeight;
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(rx, ry, rw, rh);
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 1;
              ctx.strokeRect(rx, ry, rw, rh);
            }
            ctx.restore();
          }

          if (plan.settings.showFrame) {
            ctx.strokeStyle = "rgba(60, 70, 90, 0.7)";
            ctx.lineWidth = Math.max(1, 1.2 * zoom);
            ctx.strokeRect(slot.x * zoom, slot.y * zoom, slot.width * zoom, slot.height * zoom);
          }
          ctx.restore();

          if (notes.enabled) {
            const gapPx = mmToPx(notes.gapMm) * zoom;
            const lineSpacingPx = mmToPx(notes.lineSpacingMm) * zoom;
            const paddingPx = 6 * zoom;
            const startY =
              notes.position === "bottom"
                ? slot.y * zoom + contentHeightPx * zoom + gapPx + lineSpacingPx
                : slot.y * zoom + gapPx + lineSpacingPx;
            const areaStartX =
              notes.position === "right"
                ? slot.x * zoom + contentWidthPx * zoom + gapPx + paddingPx
                : slot.x * zoom + paddingPx;
            const areaEndX =
              notes.position === "left"
                ? slot.x * zoom + contentWidthPx * zoom - paddingPx
                : slot.x * zoom + slot.width * zoom - paddingPx;
            ctx.save();
            ctx.strokeStyle = "rgba(170,180,190,0.75)";
            ctx.lineWidth = Math.max(1, 0.9 * zoom);
            for (let line = 0; line < notes.lineCount; line++) {
              const yLine = startY + line * lineSpacingPx;
              ctx.beginPath();
              ctx.moveTo(areaStartX, yLine);
              ctx.lineTo(areaEndX, yLine);
              ctx.stroke();
            }
            ctx.restore();
          }
        }

        if (plan.settings.showPageNumbers) {
          ctx.fillStyle = "rgba(110,120,140,0.9)";
          ctx.font = `${12 * zoom}px 'SF Pro Text', -apple-system, 'Segoe UI', system-ui`;
          const label = `${outIndex + 1} / ${outputPageCount}`;
          const textWidth = ctx.measureText(label).width;
          ctx.fillText(label, (scaledWidth - textWidth) / 2, scaledHeight - 12 * zoom);
        }

        if (plan.settings.showSlideNumbers) {
          ctx.fillStyle = "rgba(70,80,95,0.9)";
          ctx.font = `${11 * zoom}px 'SF Pro Text', -apple-system, 'Segoe UI', system-ui`;
          plan.pageIndices.forEach((pageIndex, i) => {
            const slot = slots[i];
            const slotMm = slotsMm[i];
            const notes = getNotesLayout(slotMm.widthMm, slotMm.heightMm, plan.settings);
            const notesOffsetPx =
              notes.position === "bottom" ? mmToPx(notes.notesAreaMm + notes.gapMm) : 0;
            const contentHeightPx = Math.max(8, slot.height - notesOffsetPx);
            const label = `${pageIndex + 1}`;
            const x = slot.x * zoom + 6 * zoom;
            const y = slot.y * zoom + contentHeightPx * zoom - 8 * zoom;
            ctx.fillText(label, x, y);
          });
        }

        renderedPagesRef.current.add(outIndex);
      }

      if (!cancelled && renderVersionRef.current === version) {
        setIsRendering(false);
      }
    }

    void renderVisiblePages();

    return () => {
      cancelled = true;
    };
  }, [
    pdf,
    settings,
    zoom,
    outputPageCount,
    outputPlan,
    layoutCache,
    pageOverrides,
    whiteoutRegions,
    visibleRange,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-end pr-2 text-sm text-muted-foreground">
        <span>
          Slides: {effectivePages.length} • Pages: {outputPageCount}
        </span>
      </div>
      <div
        className="relative flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-border bg-muted/25"
        style={{ isolation: "isolate", position: "relative", zIndex: 1 }}
      >
        <div ref={scrollerRef} className="h-full overflow-y-auto overflow-x-hidden p-5">
          <div className="flex flex-col items-center gap-8 pb-5">
            {Array.from({ length: outputPageCount }, (_, i) => (
              <div key={i} className="flex w-full justify-center">
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current[i] = el;
                  }}
                  className="rounded-md border border-border bg-white transition"
                  style={{ maxWidth: "100%", display: "block" }}
                />
              </div>
            ))}
          </div>
        </div>
        {isRendering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

async function renderPageToCanvas(
  pageNumber: number,
  pdf: PDFDocumentProxy,
  cache: Map<number, HTMLCanvasElement>
) {
  const cached = cache.get(pageNumber);
  if (cached) {
    cache.delete(pageNumber);
    cache.set(pageNumber, cached);
    return cached;
  }

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  if (!context) return canvas;

  await page.render({ canvasContext: context, viewport }).promise;
  cache.set(pageNumber, canvas);

  if (cache.size > MAX_SOURCE_PAGE_CACHE) {
    const oldestKey = cache.keys().next().value as number | undefined;
    if (typeof oldestKey === "number") {
      cache.delete(oldestKey);
    }
  }

  return canvas;
}
