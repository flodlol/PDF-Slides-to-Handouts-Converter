"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { Header } from "@/components/Header";
import { UploadZone } from "@/components/UploadZone";
import { ControlsPanel } from "@/components/ControlsPanel";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TemplateSelector } from "@/components/TemplateSelector";
import { generateHandout } from "@/lib/generateHandout";
import { buildLayoutPlan } from "@/lib/layoutEngine";
import { defaultSettings, templates, downloadTemplate } from "@/lib/templates";
import { HandoutSettings, TemplatePreset } from "@/lib/types";
import { AlertCircle, Download, RotateCcw, Settings, X, Zap } from "lucide-react";
import { getCookie, setCookie } from "@/lib/cookies";
import { SlideStrip } from "@/components/SlideStrip";
import { CookieBanner } from "@/components/CookieBanner";
import { Footer } from "@/components/Footer";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SlideSettingsOverrideMap } from "@/lib/outputPlan";
import { SlideOverridePanel } from "@/components/SlideOverridePanel";
import { detectRepeatedRegions, WhiteoutMap } from "@/lib/detectRepeatedRegions";
import { Input } from "@/components/ui/input";

interface LoadedPdfMeta {
  name: string;
  size: number;
  fileCount: number;
}

interface CourseChapter {
  id: string;
  title: string;
  sourceName: string;
  startPageIndex: number;
  endPageIndex: number;
  pageCount: number;
}

interface AppErrorState {
  scope: "upload" | "export" | "template";
  message: string;
  details?: string;
  retryAction?: "upload" | "export";
}

const SELECTED_TEMPLATE_KEY = "phs-selected-template";

export default function HomePage() {
  const [settings, setSettings] = useState<HandoutSettings>(defaultSettings);
  const [currentTemplate, setCurrentTemplate] = useState<string | undefined>();
  const [customTemplates, setCustomTemplates] = useState<TemplatePreset[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageOverrides, setPageOverrides] = useState<SlideSettingsOverrideMap>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [meta, setMeta] = useState<LoadedPdfMeta | null>(null);
  const [currentOutputPage, setCurrentOutputPage] = useState(0);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [whiteoutRegions, setWhiteoutRegions] = useState<WhiteoutMap>({});
  const [isDetecting, setIsDetecting] = useState(false);
  const [courseChapters, setCourseChapters] = useState<CourseChapter[]>([]);
  const [includeContentsTable, setIncludeContentsTable] = useState(false);
  const [forceOddChapterStart, setForceOddChapterStart] = useState(true);
  const [appError, setAppError] = useState<AppErrorState | null>(null);
  const [exportStage, setExportStage] = useState<"idle" | "validating" | "rendering" | "finalizing">("idle");
  const previewZoom = 0.5;
  const presetUploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTokenRef = useRef(0);
  const lastUploadFilesRef = useRef<File[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("phs-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as HandoutSettings;
        setSettings({ ...defaultSettings, ...parsed });
      } catch (err) {
        console.warn("Failed to parse stored settings", err);
      }
    }

    const storedCustom = localStorage.getItem("phs-custom-templates");
    if (storedCustom) {
      try {
        const parsed = JSON.parse(storedCustom) as TemplatePreset[];
        setCustomTemplates(parsed);
      } catch (err) {
        console.warn("Failed to parse stored custom templates", err);
      }
    }

    const selected = localStorage.getItem(SELECTED_TEMPLATE_KEY);
    const cookiePreset = getCookie("phs-default-preset");
    const templateId = selected || cookiePreset;
    if (templateId) setCurrentTemplate(templateId);

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("phs-settings", JSON.stringify(settings));
  }, [settings, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem("phs-custom-templates", JSON.stringify(customTemplates));
  }, [customTemplates, isHydrated]);

  useEffect(() => {
    if (!pdfDoc || !settings.whiteoutEnabled || selectedPages.length < 2) {
      setWhiteoutRegions({});
      return;
    }
    let cancelled = false;
    setIsDetecting(true);
    detectRepeatedRegions(pdfDoc, selectedPages)
      .then((regions) => {
        if (!cancelled) setWhiteoutRegions(regions);
      })
      .catch((err) => {
        console.warn("Whiteout detection failed", err);
        if (!cancelled) setWhiteoutRegions({});
      })
      .finally(() => {
        if (!cancelled) setIsDetecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, selectedPages, settings.whiteoutEnabled]);

  const layout = useMemo(() => buildLayoutPlan(settings), [settings]);
  const isInteractionLocked = isParsing || isGenerating;
  const isBusy = isInteractionLocked || isDetecting;
  const canExport = Boolean(pdfBytes) && selectedPages.length > 0 && !isBusy;
  const chapterStartPageIndices = useMemo(() => {
    if (!courseChapters.length || !selectedPages.length) return [];
    const sortedSelected = [...selectedPages].sort((a, b) => a - b);
    return courseChapters
      .map((chapter) =>
        sortedSelected.find(
          (pageIndex) =>
            pageIndex >= chapter.startPageIndex && pageIndex <= chapter.endPageIndex
        )
      )
      .filter((index): index is number => typeof index === "number");
  }, [courseChapters, selectedPages]);

  const handleUpload = useCallback(async (incoming: File | File[]) => {
    const files = toFileList(incoming);
    if (!files.length) return;

    const uploadToken = (uploadTokenRef.current += 1);
    lastUploadFilesRef.current = files;
    setAppError(null);
    setIsParsing(true);
    setMeta(null);
    setPdfBytes(null);
    setPdfDoc(null);
    setPageCount(0);
    setSelectedPages([]);
    setPageOverrides({});
    setCurrentOutputPage(0);
    setCourseChapters([]);

    try {
      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      const chapters: CourseChapter[] = [];

      let mergedCursor = 0;
      let totalBytes = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        if (uploadToken !== uploadTokenRef.current) return;

        const bytes = new Uint8Array(arrayBuffer);
        totalBytes += bytes.length;
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const sourcePageCount = source.getPageCount();
        if (sourcePageCount < 1) continue;

        const copied = await merged.copyPages(source, source.getPageIndices());
        copied.forEach((page) => merged.addPage(page));

        const sourceName = stripPdfExtension(file.name) || `Chapter ${i + 1}`;
        chapters.push({
          id: `chapter-${Date.now()}-${i}`,
          title: sourceName,
          sourceName,
          startPageIndex: mergedCursor,
          endPageIndex: mergedCursor + sourcePageCount - 1,
          pageCount: sourcePageCount,
        });
        mergedCursor += sourcePageCount;
      }

      if (chapters.length === 0 || merged.getPageCount() === 0) {
        throw new Error("No readable pages were found in the selected PDFs.");
      }

      const mergedBytes = await merged.save();
      if (uploadToken !== uploadTokenRef.current) return;

      const { loadPdfFromBytes } = await import("@/lib/pdfClient");
      const pdf = await loadPdfFromBytes(mergedBytes);
      if (uploadToken !== uploadTokenRef.current) return;

      const single = files.length === 1;
      setMeta({
        name: single ? stripPdfExtension(files[0].name) : `${files.length} PDFs`,
        size: totalBytes,
        fileCount: files.length,
      });
      setPdfBytes(mergedBytes);
      setPdfDoc(pdf);
      setPageCount(pdf.numPages);
      setSelectedPages(Array.from({ length: pdf.numPages }, (_, i) => i));
      setPageOverrides({});
      setCurrentOutputPage(0);
      setCourseChapters(chapters);
    } catch (err) {
      if (uploadToken !== uploadTokenRef.current) return;
      console.error("Failed to load PDF", err);
      setAppError({
        scope: "upload",
        message: "Could not load these PDFs. Please check the files and try again.",
        details: getErrorMessage(err),
        retryAction: "upload",
      });
    } finally {
      if (uploadToken === uploadTokenRef.current) setIsParsing(false);
    }
  }, []);

  const handleTemplate = useCallback((tpl: TemplatePreset) => {
    setSettings({ ...defaultSettings, ...tpl.settings });
    setCurrentTemplate(tpl.id);
    setCookie("phs-default-preset", tpl.id, 365);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SELECTED_TEMPLATE_KEY, tpl.id);
    }
  }, []);

  const handleSettingsChange = useCallback((patch: Partial<HandoutSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleReset = useCallback(() => {
    setSettings(defaultSettings);
    setCurrentTemplate(undefined);
    setSelectedPages((prev) => prev);
    setPageOverrides({});
  }, []);

  const handleDownload = useCallback(async () => {
    setAppError(null);
    setIsGenerating(true);
    setExportStage("validating");
    try {
      const sourceBytes = await (async () => {
        if (pdfBytes && pdfBytes.length > 4) return pdfBytes;
        if (pdfDoc) {
          const data = await pdfDoc.getData();
          return data instanceof Uint8Array ? data : new Uint8Array(data);
        }
        throw new Error("No PDF loaded");
      })();

      const hasHeader =
        sourceBytes[0] === 0x25 &&
        sourceBytes[1] === 0x50 &&
        sourceBytes[2] === 0x44 &&
        sourceBytes[3] === 0x46;
      if (!hasHeader) {
        throw new Error("Source data is not a valid PDF (missing %PDF header).");
      }

      if (selectedPages.length === 0) {
        throw new Error("No slides selected.");
      }

      setExportStage("rendering");
      const output = await generateHandout(sourceBytes, settings, selectedPages, pageOverrides, whiteoutRegions, {
        includeContentsTable,
        forceOddChapterStart: forceOddChapterStart && courseChapters.length > 1,
        courseSections: courseChapters.map((chapter) => ({
          title: chapter.title,
          startPageIndex: chapter.startPageIndex,
          endPageIndex: chapter.endPageIndex,
        })),
      });
      setExportStage("finalizing");
      const arrayBuffer =
        output.byteOffset === 0 && output.byteLength === output.buffer.byteLength
          ? (output.buffer as ArrayBuffer)
          : (output.buffer as ArrayBuffer).slice(
              output.byteOffset,
              output.byteOffset + output.byteLength
            );
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = meta?.fileCount && meta.fileCount > 1 ? "slide-course" : meta?.name ?? "handout";
      a.download = `${baseName}_handout.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate handout", err);
      setAppError({
        scope: "export",
        message: "Could not generate the handout PDF.",
        details: getErrorMessage(err),
        retryAction: "export",
      });
    } finally {
      setIsGenerating(false);
      setExportStage("idle");
    }
  }, [
    pdfBytes,
    pdfDoc,
    settings,
    meta,
    pageOverrides,
    selectedPages,
    whiteoutRegions,
    includeContentsTable,
    forceOddChapterStart,
    courseChapters,
  ]);

  const retryLastAction = useCallback(() => {
    if (!appError?.retryAction) return;
    if (appError.retryAction === "upload" && lastUploadFilesRef.current.length) {
      void handleUpload(lastUploadFilesRef.current);
      return;
    }
    if (appError.retryAction === "export") {
      void handleDownload();
    }
  }, [appError, handleDownload, handleUpload]);

  return (
    <main className="min-h-screen">
      <div className="container py-6 md:py-8">
        <Header />

        <section className="mb-5 flex flex-wrap items-center gap-2">
          <InfoChip
            label={
              meta?.name
                ? meta.fileCount > 1
                  ? `Source: ${meta.fileCount} PDFs`
                  : `Source: ${meta.name}`
                : "Source: none"
            }
          />
          <InfoChip label={`Chapters: ${courseChapters.length}`} />
          <InfoChip label={`Slides: ${selectedPages.length}`} />
          <InfoChip label={`Layout: ${settings.pagesPerSheet} per sheet`} />
          <InfoChip label={isBusy ? "Busy" : "Ready"} />
        </section>

        {appError && (
          <section className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{appError.message}</p>
                {appError.details && (
                  <p className="mt-1 text-xs text-muted-foreground">{appError.details}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {appError.retryAction && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={retryLastAction} disabled={isBusy}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Dismiss error"
                  onClick={() => setAppError(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-5 xl:h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pr-1">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Source File</CardTitle>
              </CardHeader>
              <CardContent>
                <UploadZone
                  onFile={handleUpload}
                  fileName={
                    meta?.fileCount && meta.fileCount > 1
                      ? `${meta.fileCount} merged PDFs`
                      : meta?.name
                  }
                  fileSize={meta?.size}
                  isLoading={isParsing}
                  disabled={isInteractionLocked}
                  allowMultiple
                />
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Layout Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <ControlsPanel
                    settings={settings}
                    onChange={handleSettingsChange}
                    onReset={handleReset}
                    disabled={isInteractionLocked}
                  />

                  <Accordion type="single" collapsible>
                    <AccordionItem value="templates">
                      <AccordionTrigger>Templates</AccordionTrigger>
                      <AccordionContent>
                        <TemplateSelector
                          templates={[...templates, ...customTemplates]}
                          onSelect={handleTemplate}
                          currentId={currentTemplate}
                          onDownload={downloadTemplate}
                        />
                        <div className="mt-4 space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            disabled={isInteractionLocked}
                            onClick={() => {
                              const name = prompt("Template name?");
                              if (!name) return;
                              const id = name.toLowerCase().replace(/\s+/g, "-");
                              const newTpl: TemplatePreset = {
                                id,
                                name,
                                description: "Custom preset",
                                settings,
                              };
                              setCustomTemplates((prev) => [...prev, newTpl]);
                              handleTemplate(newTpl);
                            }}
                          >
                            Save current settings as template
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            disabled={isInteractionLocked}
                            onClick={() => presetUploadRef.current?.click()}
                          >
                            Upload template JSON
                          </Button>
                          <input
                            ref={presetUploadRef}
                            type="file"
                            accept="application/json"
                            className="hidden"
                            disabled={isInteractionLocked}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const text = await file.text();
                                const tpl = JSON.parse(text) as TemplatePreset;
                                if (!tpl?.id || !tpl?.settings) {
                                  setAppError({
                                    scope: "template",
                                    message: "Invalid template file.",
                                    details: "The JSON is missing required fields: id and settings.",
                                  });
                                  return;
                                }
                                setCustomTemplates((prev) => {
                                  const filtered = prev.filter((p) => p.id !== tpl.id);
                                  return [...filtered, tpl];
                                });
                                handleTemplate(tpl);
                              } catch {
                                setAppError({
                                  scope: "template",
                                  message: "Could not parse template JSON.",
                                  details: "Please validate the JSON format and try again.",
                                });
                              } finally {
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            disabled={isInteractionLocked}
                            onClick={() => {
                              setCookie("phs-default-preset", "", -1);
                              setCurrentTemplate(undefined);
                              if (typeof localStorage !== "undefined") {
                                localStorage.removeItem(SELECTED_TEMPLATE_KEY);
                              }
                            }}
                          >
                            Clear default preset cookie
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="course">
                      <AccordionTrigger>Course Builder</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
                            <Switch
                              checked={includeContentsTable}
                              disabled={!courseChapters.length || isInteractionLocked}
                              onCheckedChange={(value) => setIncludeContentsTable(Boolean(value))}
                            />
                            <span className="text-sm">Add a contents page</span>
                          </label>

                          <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
                            <Switch
                              checked={forceOddChapterStart}
                              disabled={!courseChapters.length || isInteractionLocked}
                              onCheckedChange={(value) => setForceOddChapterStart(Boolean(value))}
                            />
                            <span className="text-sm">Start each chapter on an odd page number</span>
                          </label>

                          <p className="text-xs text-muted-foreground">
                            Upload multiple PDFs to build a slide course. Each file becomes a chapter.
                          </p>

                          {courseChapters.length > 0 ? (
                            <div className="space-y-2">
                              {courseChapters.map((chapter, index) => (
                                <div key={chapter.id} className="rounded-lg border border-border bg-muted/20 p-3">
                                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Chapter {index + 1}</span>
                                    <span>{chapter.pageCount} slides</span>
                                  </div>
                                  <Input
                                    value={chapter.title}
                                    disabled={isInteractionLocked}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setCourseChapters((prev) =>
                                        prev.map((item) =>
                                          item.id === chapter.id ? { ...item, title: value } : item
                                        )
                                      );
                                    }}
                                    placeholder={`Chapter ${index + 1}`}
                                  />
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Start slide: {chapter.startPageIndex + 1}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No chapters yet. Upload 2 or more PDF files.
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="notes">
                      <AccordionTrigger>Notes Settings</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
                            <Switch
                              checked={settings.notesEnabled}
                              disabled={isInteractionLocked}
                              onCheckedChange={(value) => handleSettingsChange({ notesEnabled: Boolean(value) })}
                            />
                            <span className="text-sm">Include note-taking lines</span>
                          </label>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Number of lines</Label>
                              <span className="text-muted-foreground">{settings.notesLineCount}</span>
                            </div>
                            <Slider
                              value={[settings.notesLineCount]}
                              min={3}
                              max={12}
                              step={1}
                              disabled={!settings.notesEnabled || isInteractionLocked}
                              onValueChange={([value]) => handleSettingsChange({ notesLineCount: value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Line spacing</Label>
                              <span className="text-muted-foreground">{settings.notesLineSpacingMm} mm</span>
                            </div>
                            <Slider
                              value={[settings.notesLineSpacingMm]}
                              min={4}
                              max={10}
                              step={1}
                              disabled={!settings.notesEnabled || isInteractionLocked}
                              onValueChange={([value]) => handleSettingsChange({ notesLineSpacingMm: value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Notes position</Label>
                            <div className="flex flex-wrap gap-2">
                              {(["bottom", "left", "right"] as const).map((pos) => (
                                <Button
                                  key={pos}
                                  type="button"
                                  variant={settings.notesPosition === pos ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleSettingsChange({ notesPosition: pos })}
                                  disabled={!settings.notesEnabled || isInteractionLocked}
                                >
                                  {pos === "bottom" ? "Under slides" : pos === "left" ? "Left" : "Right"}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </CardContent>
            </Card>
          </aside>

          <section className="space-y-5">
            <Card className="min-h-[620px] rounded-3xl lg:flex lg:h-[calc(100vh-150px)] lg:min-h-[calc(100vh-150px)] lg:flex-col">
              <CardHeader className="flex items-center justify-between space-y-0 border-b border-border pb-4">
                <CardTitle>Preview Workspace</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {isDetecting ? "Optimizing pages" : "Live preview"}
                </span>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-5 pt-4">
                {!pdfDoc ? (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
                    Upload one or more PDFs to generate the workspace preview.
                  </div>
                ) : (
                  <PreviewCanvas
                    pdf={pdfDoc}
                    settings={settings}
                    pageCount={pageCount}
                    selectedPages={selectedPages}
                    currentOutputPage={currentOutputPage}
                    onPageChange={setCurrentOutputPage}
                    zoom={previewZoom}
                    pageOverrides={pageOverrides}
                    whiteoutRegions={whiteoutRegions}
                    chapterStartPageIndices={chapterStartPageIndices}
                    forceOddChapterStart={forceOddChapterStart && courseChapters.length > 1}
                  />
                )}
              </CardContent>
            </Card>

            {pdfDoc && (
              <Card className="rounded-3xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle>Slide Selection</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isInteractionLocked}
                    onClick={() => setIsAdvancedOpen((prev) => !prev)}
                    aria-label="Advanced slide settings"
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Advanced
                  </Button>
                </CardHeader>
                <CardContent>
                  <SlideStrip
                    pdf={pdfDoc}
                    selectedPages={selectedPages}
                    onToggle={(pageIndex) => {
                      setSelectedPages((prev) =>
                        prev.includes(pageIndex)
                          ? prev.filter((p) => p !== pageIndex)
                          : [...prev, pageIndex].sort((a, b) => a - b)
                      );
                    }}
                    onSelectRange={(fromPageIndex, toPageIndex) => {
                      const start = Math.min(fromPageIndex, toPageIndex);
                      const end = Math.max(fromPageIndex, toPageIndex);
                      const range = Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
                      setSelectedPages((prev) =>
                        Array.from(new Set([...prev, ...range])).sort((a, b) => a - b)
                      );
                    }}
                    onSelectAll={() =>
                      setSelectedPages(Array.from({ length: pageCount }, (_, i) => i))
                    }
                    onDeselectAll={() => setSelectedPages([])}
                    onInvertSelection={() =>
                      setSelectedPages((prev) =>
                        Array.from({ length: pageCount }, (_, i) => i).filter((i) => !prev.includes(i))
                      )
                    }
                    onSelectOdd={() =>
                      setSelectedPages(Array.from({ length: pageCount }, (_, i) => i).filter((i) => i % 2 === 0))
                    }
                    onSelectEven={() =>
                      setSelectedPages(Array.from({ length: pageCount }, (_, i) => i).filter((i) => i % 2 === 1))
                    }
                    maxWidth={layout.pageWidthPx * previewZoom + 160}
                    pageOverrides={pageOverrides}
                    disabled={isInteractionLocked}
                  />

                  <div className={isInteractionLocked ? "mt-6 pointer-events-none opacity-70" : "mt-6"}>
                    <SlideOverridePanel
                      open={isAdvancedOpen}
                      pdf={pdfDoc}
                      settings={settings}
                      pageOverrides={pageOverrides}
                      onOverridesChange={setPageOverrides}
                      onClose={() => setIsAdvancedOpen(false)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
      <div className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100%-2rem))]">
        <div className="rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
          <Button
            className="h-11 w-full gap-2"
            disabled={!canExport}
            onClick={handleDownload}
          >
            {isGenerating ? <Zap className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
            {isGenerating
              ? exportStage === "validating"
                ? "Validating..."
                : exportStage === "rendering"
                  ? "Rendering pages..."
                  : "Finalizing..."
              : "Download handout"}
          </Button>
        </div>
      </div>
      <Footer />
      <CookieBanner />
    </main>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unexpected error.";
}

function toFileList(input: File | File[]) {
  if (Array.isArray(input)) return input.filter(Boolean);
  return input ? [input] : [];
}

function stripPdfExtension(name: string) {
  return name.replace(/\.pdf$/i, "").trim();
}
