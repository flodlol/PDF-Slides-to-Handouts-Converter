"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { useDropzone } from "react-dropzone";
import { FileDown, Upload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFile: (file: File | File[]) => void;
  fileName?: string;
  fileSize?: number;
  isLoading?: boolean;
  disabled?: boolean;
  allowMultiple?: boolean;
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function UploadZone({
  onFile,
  fileName,
  fileSize,
  isLoading,
  disabled,
  allowMultiple,
}: UploadZoneProps) {
  const [error, setError] = useState<string | null>(null);

  const accept = useMemo(() => ({ "application/pdf": [".pdf"] }), []);

  const handleAccept = useCallback(
    (accepted: File[]) => {
      if (!accepted.length) return;
      setError(null);
      if (allowMultiple) {
        onFile(accepted);
        return;
      }
      const pdf = accepted[0];
      if (pdf) onFile(pdf);
    },
    [allowMultiple, onFile]
  );

  const handleReject = useCallback(() => {
    setError("Please drop a PDF file (.pdf).");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept,
    multiple: Boolean(allowMultiple),
    maxFiles: allowMultiple ? 24 : 1,
    noKeyboard: true,
    disabled,
    onDropAccepted: handleAccept,
    onDropRejected: handleReject,
  });

  const handleBrowse = useCallback(
    (event: MouseEvent) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      open();
    },
    [disabled, open]
  );

  return (
    <div
      className={cn(
        "group flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition hover:border-primary/60 hover:bg-accent/40",
        isDragActive && "border-primary/80 bg-accent/60",
        fileName && "border-border",
        disabled && "cursor-not-allowed opacity-70 hover:border-border hover:bg-muted/30"
      )}
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {fileName ? <FileDown /> : <Upload />}
      </div>
      <p className="mt-3 text-base font-semibold tracking-tight">
        {fileName
          ? "PDF loaded"
          : allowMultiple
            ? "Drop your PDFs or click to upload"
            : "Drop your PDF or click to upload"}
      </p>
      <p className="text-sm text-muted-foreground">
        {fileName
          ? `${fileName} • ${formatSize(fileSize)}`
          : allowMultiple
            ? "Upload one or more .pdf files"
            : "Only .pdf files are accepted"}
      </p>
      {isLoading && <p className="mt-2 text-xs text-muted-foreground">Parsing PDF…</p>}
      {error && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
      <div className="mt-4">
        <Button variant="secondary" size="sm" type="button" onClick={handleBrowse} disabled={disabled}>
          Browse
        </Button>
      </div>
    </div>
  );
}
