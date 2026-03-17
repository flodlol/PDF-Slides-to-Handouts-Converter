import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildLayoutPlan, mmToPt } from "./layoutEngine";
import { HandoutSettings } from "./types";
import { buildOutputPlan, SlideSettingsOverrideMap } from "./outputPlan";
import { getNotesLayout } from "./notesLayout";
import { WhiteoutMap } from "./detectRepeatedRegions";

export interface CourseSection {
  title: string;
  startPageIndex: number;
  endPageIndex: number;
}

export interface GenerateHandoutOptions {
  includeContentsTable?: boolean;
  forceOddChapterStart?: boolean;
  courseSections?: CourseSection[];
}

/**
 * Generate an N-up handout PDF based on incoming PDF bytes and layout settings.
 */
export async function generateHandout(
  inputPdfBytes: Uint8Array,
  settings: HandoutSettings,
  selectedPages?: number[], // zero-based page indices to keep; defaults to all
  overrides: SlideSettingsOverrideMap = {},
  whiteoutRegions: WhiteoutMap = {},
  options: GenerateHandoutOptions = {}
): Promise<Uint8Array> {
  if (!inputPdfBytes || inputPdfBytes.length < 4) {
    throw new Error("Input PDF bytes are empty.");
  }

  const src = await PDFDocument.load(inputPdfBytes, { ignoreEncryption: true });
  const target = await PDFDocument.create();
  const font = await target.embedFont(StandardFonts.Helvetica);
  const boldFont = await target.embedFont(StandardFonts.HelveticaBold);
  const pageIndices =
    selectedPages && selectedPages.length > 0
      ? selectedPages
      : Array.from({ length: src.getPageCount() }, (_, i) => i);
  const effectiveSections = resolveSelectedCourseSections(options.courseSections ?? [], pageIndices);
  const outputPlan = buildOutputPlan(pageIndices, settings, overrides, {
    chapterStartPageIndices: effectiveSections.map((section) => section.startPageIndex),
    forceOddChapterStart: options.forceOddChapterStart,
  });

  const contentsEntriesBase = effectiveSections
    .map((section) => ({
      title: section.title,
      pageNumber: findOutputPageNumberForSource(outputPlan, section.startPageIndex),
    }))
    .filter((entry): entry is { title: string; pageNumber: number } => typeof entry.pageNumber === "number");

  const layout = buildLayoutPlan(settings);
  const contentsPageCount =
    options.includeContentsTable && contentsEntriesBase.length > 0
      ? estimateContentsPageCount(layout.pageHeightPt, contentsEntriesBase.length)
      : 0;
  const outputPageCount = Math.max(1, outputPlan.length + contentsPageCount);

  if (contentsPageCount > 0) {
    const contentsEntries = contentsEntriesBase.map((entry) => ({
      title: entry.title,
      pageNumber: entry.pageNumber + contentsPageCount,
    }));
    drawContentsPages(target, layout.pageWidthPt, layout.pageHeightPt, font, boldFont, contentsEntries);
  }

  let orderIndex = 0;
  for (let outIndex = 0; outIndex < outputPlan.length; outIndex++) {
    const plan = outputPlan[outIndex];
    const pageLayout = buildLayoutPlan(plan.settings);
    const page = target.addPage([pageLayout.pageWidthPt, pageLayout.pageHeightPt]);

    if (plan.isSpacer) {
      continue;
    }

    const contentScale = plan.settings.scale / 100;

    for (let slotIndex = 0; slotIndex < plan.pageIndices.length; slotIndex++) {
      const inputIndex = plan.pageIndices[slotIndex];
      const sourcePage = src.getPage(inputIndex);
      const embedded = await target.embedPage(sourcePage);
      const slot = pageLayout.slotsPt[slotIndex];
      const slotMm = pageLayout.slots[slotIndex];
      const notes = getNotesLayout(slotMm.widthMm, slotMm.heightMm, plan.settings);
      const notesOffsetPt =
        notes.position === "bottom" ? mmToPt(notes.notesAreaMm + notes.gapMm) : 0;
      const sideOffsetPt =
        notes.position === "left" || notes.position === "right"
          ? mmToPt(notes.notesAreaWidthMm + notes.gapMm)
          : 0;
      const contentHeightPt = Math.max(8, slot.height - notesOffsetPt);
      const contentWidthPt = Math.max(8, slot.width - sideOffsetPt);

      const fit = Math.min(contentWidthPt / embedded.width, contentHeightPt / embedded.height);
      const renderScale = fit * contentScale;
      const renderWidth = embedded.width * renderScale;
      const renderHeight = embedded.height * renderScale;

      const x =
        notes.position === "left"
          ? slot.x + sideOffsetPt + (contentWidthPt - renderWidth) / 2
          : slot.x + (contentWidthPt - renderWidth) / 2;
      // PDF-lib's origin is bottom-left; convert from top-based slot y
      const slotBottom = pageLayout.pageHeightPt - slot.y - slot.height;
      const contentBottom = slotBottom + notesOffsetPt;
      const y = contentBottom + (contentHeightPt - renderHeight) / 2;

      page.drawPage(embedded, {
        x,
        y,
        xScale: renderScale,
        yScale: renderScale,
      });

      // Draw white rectangles over repeated elements
      const pageRegions = plan.settings.whiteoutEnabled ? whiteoutRegions[inputIndex] : undefined;
      if (pageRegions && pageRegions.length > 0) {
        for (const region of pageRegions) {
          const rx = x + region.xPct * renderWidth;
          // PDF-lib y is bottom-up, and embedded page origin is at (x, y) bottom-left
          const ry = y + (1 - region.yPct - region.heightPct) * renderHeight;
          const rw = region.widthPct * renderWidth;
          const rh = region.heightPct * renderHeight;
          page.drawRectangle({
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            color: rgb(1, 1, 1),
            borderColor: rgb(1, 1, 1),
            borderWidth: 0.5,
          });
        }
      }

      if (plan.settings.showFrame) {
        page.drawRectangle({
          x: slot.x,
          y: pageLayout.pageHeightPt - slot.y - slot.height,
          width: slot.width,
          height: slot.height,
          borderColor: rgb(0.55, 0.57, 0.6),
          borderWidth: 0.8,
        });
      }

      if (plan.settings.showSlideNumbers) {
        const slideLabel = `${orderIndex + 1}`;
        const fontSize = chooseFontSize(pageLayout.pageWidthPt) - 1;
        page.drawText(slideLabel, {
          x: slot.x + 6,
          y: contentBottom + 6,
          size: fontSize,
          font,
          color: rgb(0.25, 0.27, 0.3),
        });
      }

      if (notes.enabled) {
        const lineSpacingPt = mmToPt(notes.lineSpacingMm);
        const paddingPt = mmToPt(4);
        if (notes.position === "bottom") {
          const startY = slotBottom + mmToPt(notes.gapMm) + lineSpacingPt;
          const lineStartX = slot.x + paddingPt;
          const lineEndX = slot.x + slot.width - paddingPt;
          for (let i = 0; i < notes.lineCount; i++) {
            const yLine = startY + i * lineSpacingPt;
            page.drawLine({
              start: { x: lineStartX, y: yLine },
              end: { x: lineEndX, y: yLine },
              thickness: 0.6,
              color: rgb(0.8, 0.82, 0.85),
            });
          }
        } else {
          const areaStartX =
            notes.position === "left"
              ? slot.x + paddingPt
              : slot.x + slot.width - mmToPt(notes.notesAreaWidthMm) + paddingPt;
          const areaEndX =
            notes.position === "left"
              ? slot.x + mmToPt(notes.notesAreaWidthMm) - paddingPt
              : slot.x + slot.width - paddingPt;
          const startY = slotBottom + mmToPt(notes.gapMm) + lineSpacingPt;
          for (let i = 0; i < notes.lineCount; i++) {
            const yLine = startY + i * lineSpacingPt;
            page.drawLine({
              start: { x: areaStartX, y: yLine },
              end: { x: areaEndX, y: yLine },
              thickness: 0.6,
              color: rgb(0.8, 0.82, 0.85),
            });
          }
        }
      }

      orderIndex += 1;
    }

    if (plan.settings.showPageNumbers) {
      const absolutePageNumber = contentsPageCount + outIndex + 1;
      const label = `${absolutePageNumber} / ${outputPageCount}`;
      const fontSize = chooseFontSize(pageLayout.pageWidthPt);
      const textWidth = font.widthOfTextAtSize(label, fontSize);
      page.drawText(label, {
        x: (pageLayout.pageWidthPt - textWidth) / 2,
        y: 18,
        size: fontSize,
        font,
        color: rgb(0.3, 0.32, 0.36),
      });
    }
  }

  return target.save();
}

function resolveSelectedCourseSections(
  sections: CourseSection[],
  selectedPages: number[]
): Array<{ title: string; startPageIndex: number }> {
  if (!sections.length || !selectedPages.length) return [];
  const sortedSelected = [...selectedPages].sort((a, b) => a - b);
  const entries = sections
    .map((section) => {
      const firstSelected = sortedSelected.find(
        (page) => page >= section.startPageIndex && page <= section.endPageIndex
      );
      if (typeof firstSelected !== "number") return null;
      return {
        title: section.title.trim() || "Chapter",
        startPageIndex: firstSelected,
      };
    })
    .filter((entry): entry is { title: string; startPageIndex: number } => Boolean(entry));

  entries.sort((a, b) => a.startPageIndex - b.startPageIndex);
  return entries;
}

function findOutputPageNumberForSource(
  outputPlan: Array<{ pageIndices: number[] }>,
  sourcePageIndex: number
) {
  for (let i = 0; i < outputPlan.length; i++) {
    if (outputPlan[i].pageIndices.includes(sourcePageIndex)) return i + 1;
  }
  return null;
}

function estimateContentsPageCount(pageHeightPt: number, entryCount: number) {
  const top = 64;
  const bottom = 52;
  const rowHeight = 20;
  const firstPageHeader = 92;
  const continuationHeader = 38;
  const firstPageRows = Math.max(1, Math.floor((pageHeightPt - top - bottom - firstPageHeader) / rowHeight));
  if (entryCount <= firstPageRows) return 1;
  const continuationRows = Math.max(
    1,
    Math.floor((pageHeightPt - top - bottom - continuationHeader) / rowHeight)
  );
  return 1 + Math.ceil((entryCount - firstPageRows) / continuationRows);
}

function drawContentsPages(
  target: PDFDocument,
  pageWidthPt: number,
  pageHeightPt: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  boldFont: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  entries: Array<{ title: string; pageNumber: number }>
) {
  if (!entries.length) return;

  const left = 56;
  const right = 56;
  const top = 64;
  const bottom = 52;
  const rowHeight = 20;
  const firstPageHeader = 92;
  const continuationHeader = 38;
  const titleSize = 24;
  const subtitleSize = 11;
  const rowSize = 11;
  const firstPageRows = Math.max(1, Math.floor((pageHeightPt - top - bottom - firstPageHeader) / rowHeight));
  const continuationRows = Math.max(
    1,
    Math.floor((pageHeightPt - top - bottom - continuationHeader) / rowHeight)
  );

  let cursor = 0;
  let pageIndex = 0;

  while (cursor < entries.length) {
    const page = target.addPage([pageWidthPt, pageHeightPt]);
    const rowsAllowed = pageIndex === 0 ? firstPageRows : continuationRows;
    const headerOffset = pageIndex === 0 ? firstPageHeader : continuationHeader;
    const headingY = pageHeightPt - top;

    if (pageIndex === 0) {
      page.drawText("Contents", {
        x: left,
        y: headingY,
        size: titleSize,
        font: boldFont,
        color: rgb(0.12, 0.14, 0.18),
      });
      page.drawText("Chapter overview", {
        x: left,
        y: headingY - 20,
        size: subtitleSize,
        font,
        color: rgb(0.38, 0.42, 0.48),
      });
    } else {
      page.drawText("Contents (continued)", {
        x: left,
        y: headingY,
        size: 15,
        font: boldFont,
        color: rgb(0.2, 0.24, 0.3),
      });
    }

    const baseY = pageHeightPt - top - headerOffset;
    for (let row = 0; row < rowsAllowed && cursor < entries.length; row++) {
      const entry = entries[cursor];
      const rowY = baseY - row * rowHeight;
      const label = `${cursor + 1}. ${entry.title}`;
      const pageLabel = `${entry.pageNumber}`;
      const pageLabelWidth = font.widthOfTextAtSize(pageLabel, rowSize);

      page.drawText(label, {
        x: left,
        y: rowY,
        size: rowSize,
        font,
        color: rgb(0.18, 0.2, 0.24),
      });
      page.drawText(pageLabel, {
        x: pageWidthPt - right - pageLabelWidth,
        y: rowY,
        size: rowSize,
        font: boldFont,
        color: rgb(0.12, 0.14, 0.18),
      });

      const lineY = rowY - 5;
      if (lineY > bottom) {
        page.drawLine({
          start: { x: left, y: lineY },
          end: { x: pageWidthPt - right, y: lineY },
          thickness: 0.5,
          color: rgb(0.84, 0.86, 0.9),
        });
      }

      cursor += 1;
    }

    pageIndex += 1;
  }
}

function chooseFontSize(pageWidthPt: number) {
  if (pageWidthPt >= 700) return 12;
  if (pageWidthPt >= 600) return 11;
  return 10;
}
