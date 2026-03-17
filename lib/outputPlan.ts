import { HandoutSettings, PagesPerSheet } from "./types";

export type SlideSettingsOverrideMap = Record<number, HandoutSettings>;

export interface OutputPagePlan {
  settings: HandoutSettings;
  pageIndices: number[];
  isSpacer?: boolean;
}

export interface BuildOutputPlanOptions {
  chapterStartPageIndices?: number[];
  forceOddChapterStart?: boolean;
}

export function buildOutputPlan(
  orderedPages: number[],
  globalSettings: HandoutSettings,
  overrides: SlideSettingsOverrideMap = {},
  options: BuildOutputPlanOptions = {}
): OutputPagePlan[] {
  if (!orderedPages || orderedPages.length === 0) return [];

  const plan: OutputPagePlan[] = [];
  let current: OutputPagePlan | null = null;
  let currentSignature: string | null = null;
  const chapterStartSet = new Set(options.chapterStartPageIndices ?? []);

  for (let i = 0; i < orderedPages.length; i++) {
    const pageIndex = orderedPages[i];
    const effectiveSettings = overrides[pageIndex] ?? globalSettings;
    const isChapterStart = i > 0 && chapterStartSet.has(pageIndex);

    if (isChapterStart) {
      current = null;
      currentSignature = null;

      if (options.forceOddChapterStart && plan.length % 2 === 1) {
        plan.push({ settings: effectiveSettings, pageIndices: [], isSpacer: true });
      }
    }

    const signature = settingsSignature(effectiveSettings);
    if (!current || currentSignature !== signature || current.pageIndices.length >= effectiveSettings.pagesPerSheet) {
      current = { settings: effectiveSettings, pageIndices: [] };
      currentSignature = signature;
      plan.push(current);
    }
    current.pageIndices.push(pageIndex);
  }

  return plan;
}

function settingsSignature(settings: HandoutSettings) {
  return JSON.stringify({
    pagesPerSheet: settings.pagesPerSheet,
    orientation: settings.orientation,
    marginMm: settings.marginMm,
    spacingMm: settings.spacingMm,
    scale: settings.scale,
    showFrame: settings.showFrame,
    showPageNumbers: settings.showPageNumbers,
    showSlideNumbers: settings.showSlideNumbers,
    notesEnabled: settings.notesEnabled,
    notesLineCount: settings.notesLineCount,
    notesLineSpacingMm: settings.notesLineSpacingMm,
    notesPosition: settings.notesPosition,
    whiteoutEnabled: settings.whiteoutEnabled,
  });
}
