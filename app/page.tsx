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
import { Download, Settings, Zap } from "lucide-react";
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

interface LoadedPdfMeta {
  name: string;
  size: number;
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
  const previewZoom = 0.5;
  const presetUploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTokenRef = useRef(0);

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
  const canExport = Boolean(pdfBytes) && selectedPages.length > 0 && !isGenerating && !isParsing;

  const handleUpload = useCallback(async (file: File) => {
    const uploadToken = (uploadTokenRef.current += 1);
    setIsParsing(true);
    setMeta({ name: file.name.replace(/\.pdf$/i, ""), size: file.size });
    setPdfBytes(null);
    setPdfDoc(null);
    setPageCount(0);
    setSelectedPages([]);
    setPageOverrides({});
    setCurrentOutputPage(0);
    try {
      const arrayBuffer = await file.arrayBuffer();
      if (uploadToken !== uploadTokenRef.current) return;
      const bytes = new Uint8Array(arrayBuffer);
      const { loadPdfFromBytes } = await import("@/lib/pdfClient");
      const pdf = await loadPdfFromBytes(bytes);
      if (uploadToken !== uploadTokenRef.current) return;
      setPdfBytes(bytes);
      setPdfDoc(pdf);
      setPageCount(pdf.numPages);
      setSelectedPages(Array.from({ length: pdf.numPages }, (_, i) => i));
      setPageOverrides({});
      setCurrentOutputPage(0);
    } catch (err) {
      if (uploadToken !== uploadTokenRef.current) return;
      console.error("Failed to load PDF", err);
      alert("Sorry, this PDF could not be loaded. Please try another file.");
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
    setIsGenerating(true);
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

      const output = await generateHandout(sourceBytes, settings, selectedPages, pageOverrides, whiteoutRegions);
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
      a.download = `${meta?.name ?? "handout"}_handout.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate handout", err);
      alert("Could not generate the handout PDF. Please re-upload the file and try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [pdfBytes, pdfDoc, settings, meta, pageOverrides, selectedPages, whiteoutRegions]);

  return (
    <main className="min-h-screen">
      <div className="container py-6 md:py-8">
        <Header />

        <section className="mb-5 flex flex-wrap items-center gap-2">
          <InfoChip label={meta?.name ? `Source: ${meta.name}` : "Source: none"} />
          <InfoChip label={`Slides: ${selectedPages.length}`} />
          <InfoChip label={`Layout: ${settings.pagesPerSheet} per sheet`} />
          <InfoChip label={isParsing ? "Parsing..." : isDetecting ? "Analyzing..." : "Ready"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="space-y-5 xl:sticky xl:top-5 xl:h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pr-1">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Source File</CardTitle>
              </CardHeader>
              <CardContent>
                <UploadZone
                  onFile={handleUpload}
                  fileName={meta?.name}
                  fileSize={meta?.size}
                  isLoading={isParsing}
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
                            onClick={() => presetUploadRef.current?.click()}
                          >
                            Upload template JSON
                          </Button>
                          <input
                            ref={presetUploadRef}
                            type="file"
                            accept="application/json"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const text = await file.text();
                                const tpl = JSON.parse(text) as TemplatePreset;
                                if (!tpl?.id || !tpl?.settings) {
                                  alert("Invalid preset file");
                                  return;
                                }
                                setCustomTemplates((prev) => {
                                  const filtered = prev.filter((p) => p.id !== tpl.id);
                                  return [...filtered, tpl];
                                });
                                handleTemplate(tpl);
                              } catch {
                                alert("Could not parse preset JSON");
                              } finally {
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
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

                    <AccordionItem value="notes">
                      <AccordionTrigger>Notes Settings</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
                            <Switch
                              checked={settings.notesEnabled}
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
                              disabled={!settings.notesEnabled}
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
                              disabled={!settings.notesEnabled}
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
                                  disabled={!settings.notesEnabled}
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
                  <div className="flex h-full min-h-[520px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
                    Upload a PDF to generate the workspace preview.
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
                  />

                  <div className="mt-6">
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
            {isGenerating ? "Building PDF..." : "Download handout"}
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
