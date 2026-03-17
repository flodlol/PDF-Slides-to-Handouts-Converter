"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HandoutSettings } from "@/lib/types";
import { SlideSettingsOverrideMap } from "@/lib/outputPlan";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ControlsPanel } from "@/components/ControlsPanel";

interface SlideOverridePanelProps {
  open: boolean;
  pdf: PDFDocumentProxy;
  settings: HandoutSettings;
  pageOverrides: SlideSettingsOverrideMap;
  onOverridesChange: (next: SlideSettingsOverrideMap) => void;
  onClose: () => void;
}

export function SlideOverridePanel({
  open,
  pdf,
  settings,
  pageOverrides,
  onOverridesChange,
  onClose,
}: SlideOverridePanelProps) {
  const [pageCount, setPageCount] = useState(0);
  const [thumbScale, setThumbScale] = useState(100);
  const [overrideSelection, setOverrideSelection] = useState<number[]>([]);
  const canvasRefs = useRef<HTMLCanvasElement[]>([]);
  const renderCache = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!open) return;
    setOverrideSelection([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPageCount(pdf.numPages);
    renderCache.current.clear();
    canvasRefs.current = [];
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
        if (cancelled) break;
        const target = canvasRefs.current[i];
        if (target) drawToTarget(canvas, target);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pdf]);

  const selectionSummary = useMemo(() => {
    if (overrideSelection.length === 0) return "No slides selected";
    if (overrideSelection.length === 1) return `Selected slide ${overrideSelection[0] + 1}`;
    return `Selected ${overrideSelection.length} slides`;
  }, [overrideSelection]);

  const selectionSettings = useMemo(() => {
    if (overrideSelection.length === 0) return settings;
    const first = pageOverrides[overrideSelection[0]] ?? settings;
    const allSame = overrideSelection.every((idx) => isSameSettings(pageOverrides[idx] ?? settings, first));
    return allSame ? first : settings;
  }, [overrideSelection, pageOverrides, settings]);

  function drawToTarget(src: HTMLCanvasElement, target: HTMLCanvasElement) {
    const ctx = target.getContext("2d");
    if (!ctx) return;
    target.width = src.width;
    target.height = src.height;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(src, 0, 0);
  }

  function toggleSelection(pageIndex: number) {
    setOverrideSelection((prev) =>
      prev.includes(pageIndex)
        ? prev.filter((page) => page !== pageIndex)
        : [...prev, pageIndex].sort((a, b) => a - b)
    );
  }

  function applyOverridePatch(patch: Partial<HandoutSettings>) {
    if (overrideSelection.length === 0) return;
    onOverridesChange(
      overrideSelection.reduce((acc, pageIndex) => {
        const base = acc[pageIndex] ?? settings;
        acc[pageIndex] = { ...base, ...patch };
        return acc;
      }, { ...pageOverrides } as SlideSettingsOverrideMap)
    );
  }

  function clearOverrides() {
    if (overrideSelection.length === 0) return;
    const next = { ...pageOverrides } as SlideSettingsOverrideMap;
    overrideSelection.forEach((pageIndex) => {
      delete next[pageIndex];
    });
    onOverridesChange(next);
  }

  const cardWidth = Math.round(180 * (thumbScale / 100));

  if (!open) return null;

  return (
    <div className="rounded-xl border border-border bg-secondary/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Advanced slide settings</h3>
          <p className="text-sm text-muted-foreground">
            Select slides and customize their layout independently.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close advanced settings">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
            {selectionSummary}
          </div>

          <div
            className={cn("space-y-4", overrideSelection.length === 0 && "pointer-events-none opacity-50")}
          >
            <ControlsPanel settings={selectionSettings} onChange={applyOverridePatch} />
            <div className="space-y-4 rounded-lg border border-border bg-background p-4">
              <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
                <Switch
                  checked={selectionSettings.notesEnabled}
                  onCheckedChange={(value) => applyOverridePatch({ notesEnabled: Boolean(value) })}
                />
                <span className="text-sm">Include note-taking lines</span>
              </label>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Label>Number of lines</Label>
                  <span className="text-muted-foreground">{selectionSettings.notesLineCount}</span>
                </div>
                <Slider
                  value={[selectionSettings.notesLineCount]}
                  min={3}
                  max={12}
                  step={1}
                  disabled={!selectionSettings.notesEnabled}
                  onValueChange={([value]) => applyOverridePatch({ notesLineCount: value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <Label>Line spacing</Label>
                  <span className="text-muted-foreground">{selectionSettings.notesLineSpacingMm} mm</span>
                </div>
                <Slider
                  value={[selectionSettings.notesLineSpacingMm]}
                  min={4}
                  max={10}
                  step={1}
                  disabled={!selectionSettings.notesEnabled}
                  onValueChange={([value]) => applyOverridePatch({ notesLineSpacingMm: value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes position</Label>
                <div className="flex flex-wrap gap-2">
                  {(["bottom", "left", "right"] as const).map((pos) => (
                    <Button
                      key={pos}
                      type="button"
                      variant={selectionSettings.notesPosition === pos ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyOverridePatch({ notesPosition: pos })}
                      disabled={!selectionSettings.notesEnabled}
                    >
                      {pos === "bottom" ? "Under slides" : pos === "left" ? "Left" : "Right"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={clearOverrides}>
              Clear overrides for selected slides
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Slides ({overrideSelection.length}/{pageCount})</span>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <Label className="text-xs">Thumbnail scale</Label>
              <div className="w-[140px]">
                <Slider
                  value={[thumbScale]}
                  min={70}
                  max={140}
                  step={5}
                  onValueChange={([value]) => setThumbScale(value)}
                />
              </div>
              <span className="tabular-nums">{thumbScale}%</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/25 p-4">
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(150, cardWidth)}px, 1fr))`,
              }}
            >
              {Array.from({ length: pageCount }, (_, i) => {
                const isSelected = overrideSelection.includes(i);
                const hasOverride = Boolean(pageOverrides[i]);
                return (
                  <div
                    key={i}
                    className={cn(
                      "relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-background px-3 py-3 transition",
                      isSelected ? "border-primary/60 ring-2 ring-primary/30" : "border-border",
                      !hasOverride && "opacity-90"
                    )}
                    onClick={() => toggleSelection(i)}
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Slide {i + 1}</span>
                      {hasOverride && <span className="text-[10px] text-primary">Override</span>}
                    </div>

                    <div className="relative">
                      <canvas
                        ref={(el) => {
                          if (el) canvasRefs.current[i] = el;
                        }}
                        className="rounded bg-white"
                        style={{ width: "100%", height: "auto" }}
                      />
                    </div>

                    {isSelected && <span className="text-[10px] text-primary">Selected</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function isSameSettings(a: HandoutSettings, b: HandoutSettings) {
  return (
    a.pagesPerSheet === b.pagesPerSheet &&
    a.orientation === b.orientation &&
    a.marginMm === b.marginMm &&
    a.spacingMm === b.spacingMm &&
    a.scale === b.scale &&
    a.showFrame === b.showFrame &&
    a.showPageNumbers === b.showPageNumbers &&
    a.showSlideNumbers === b.showSlideNumbers &&
    a.notesEnabled === b.notesEnabled &&
    a.notesLineCount === b.notesLineCount &&
    a.notesLineSpacingMm === b.notesLineSpacingMm &&
    a.notesPosition === b.notesPosition
  );
}
