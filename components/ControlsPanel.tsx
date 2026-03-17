"use client";

import { HandoutSettings, PagesPerSheet } from "@/lib/types";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";

interface ControlsPanelProps {
  settings: HandoutSettings;
  onChange: (patch: Partial<HandoutSettings>) => void;
  onReset?: () => void;
  disabled?: boolean;
}

const pageOptions: PagesPerSheet[] = [1, 2, 3, 4, 6, 9];

export function ControlsPanel({ settings, onChange, onReset, disabled }: ControlsPanelProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Pages per sheet</Label>
          <Select
            disabled={disabled}
            value={String(settings.pagesPerSheet)}
            onValueChange={(value) => onChange({ pagesPerSheet: Number(value) as PagesPerSheet })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pages" />
            </SelectTrigger>
            <SelectContent>
              {pageOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt} pages
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Orientation</Label>
          <Select
            disabled={disabled}
            value={settings.orientation}
            onValueChange={(value) => onChange({ orientation: value as HandoutSettings["orientation"] })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Orientation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="portrait">Portrait</SelectItem>
              <SelectItem value="landscape">Landscape</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Margins</Label>
            <span className="text-muted-foreground">{settings.marginMm} mm</span>
          </div>
          <Slider
            value={[settings.marginMm]}
            min={0}
            max={30}
            step={1}
            disabled={disabled}
            onValueChange={([value]) => onChange({ marginMm: value })}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Spacing</Label>
            <span className="text-muted-foreground">{settings.spacingMm} mm</span>
          </div>
          <Slider
            value={[settings.spacingMm]}
            min={0}
            max={25}
            step={1}
            disabled={disabled}
            onValueChange={([value]) => onChange({ spacingMm: value })}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Scale</Label>
            <span className="text-muted-foreground">{settings.scale}%</span>
          </div>
          <Slider
            value={[settings.scale]}
            min={80}
            max={100}
            step={1}
            disabled={disabled}
            onValueChange={([value]) => onChange({ scale: value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
          <Switch
            checked={settings.showFrame}
            disabled={disabled}
            onCheckedChange={(value) => onChange({ showFrame: Boolean(value) })}
          />
          <span className="text-sm">Show frame</span>
        </label>
        <label className="flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
          <Switch
            checked={settings.showPageNumbers}
            disabled={disabled}
            onCheckedChange={(value) => onChange({ showPageNumbers: Boolean(value) })}
          />
          <span className="text-sm">Page numbers</span>
        </label>
        <label className="col-span-2 flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
          <Switch
            checked={settings.showSlideNumbers}
            disabled={disabled}
            onCheckedChange={(value) => onChange({ showSlideNumbers: Boolean(value) })}
          />
          <span className="text-sm">Slide numbers on cards</span>
        </label>
        <label className="col-span-2 flex items-center space-x-3 rounded-lg border border-border bg-secondary px-3 py-2">
          <Switch
            checked={settings.whiteoutEnabled}
            disabled={disabled}
            onCheckedChange={(value) => onChange({ whiteoutEnabled: Boolean(value) })}
          />
          <span className="text-sm">Hide repeated elements</span>
        </label>
      </div>

      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-2" disabled={disabled}>
          <RotateCw className="h-4 w-4" /> Reset to defaults
        </Button>
      )}
    </div>
  );
}
