"use client";

import { TemplatePreset } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TemplateSelectorProps {
  templates: TemplatePreset[];
  currentId?: string;
  onSelect: (template: TemplatePreset) => void;
  onDownload?: (template: TemplatePreset) => void;
}

export function TemplateSelector({ templates, onSelect, currentId, onDownload }: TemplateSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(tpl)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(tpl);
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-start rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-left transition hover:border-primary/60 hover:bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary",
            currentId === tpl.id && "border-primary/75 bg-primary/10"
          )}
          aria-label={`Use template ${tpl.name}`}
        >
          <span className="text-sm font-semibold">{tpl.name}</span>
          {tpl.description && (
            <span className="text-xs text-muted-foreground">{tpl.description}</span>
          )}
          {onDownload && (
            <button
              type="button"
              className="mt-2 text-xs text-primary underline"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(tpl);
              }}
            >
              Download preset
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
