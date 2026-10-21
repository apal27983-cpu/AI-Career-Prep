import { useRef, useState, type DragEvent } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import { SUPPORTED_RESUME_EXTENSIONS } from '@career-prep/shared';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface SelectedFile {
  file: File;
  sizeLabel: string;
  typeLabel: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Describes the file as it actually is, including types we do not accept. */
function typeLabelFor(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (extension === '.pdf') return 'PDF document';
  if (extension === '.docx') return 'Word document (DOCX)';
  return extension ? `${extension.replace('.', '').toUpperCase()} file` : 'Unknown file type';
}

function describe(file: File): SelectedFile {
  return {
    file,
    sizeLabel: formatBytes(file.size),
    typeLabel: typeLabelFor(file.name),
  };
}

/**
 * Client-side pre-check so the obvious rejections do not cost an upload. The
 * backend validates extension, MIME type and file signature again regardless.
 */
export function validateSelection(file: File, maxBytes: number): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!(SUPPORTED_RESUME_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Only PDF and DOCX files are supported.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > maxBytes) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

export function ResumeDropzone({
  maxBytes,
  uploading,
  progress,
  onSelect,
  onReject,
  disabled = false,
}: {
  maxBytes: number;
  uploading: boolean;
  progress: number | null;
  onSelect: (file: File) => void;
  /** Called when the file fails the client-side check, so the page can toast it. */
  onReject?: (message: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const error = validateSelection(file, maxBytes);
    setSelected(describe(file));
    setLocalError(error);
    if (error) {
      onReject?.(error);
      return;
    }
    onSelect(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50/60' : 'border-slate-300 bg-slate-50/60',
          (disabled || uploading) && 'opacity-70',
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-card"
        >
          <UploadCloud className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-slate-900">
          Drag your resume here, or choose a file
        </p>
        <p className="mt-1 text-xs text-slate-500">
          PDF or DOCX, up to {formatBytes(maxBytes)}. Scanned images will not work - the file needs
          a text layer.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          disabled={disabled}
          loading={uploading}
          loadingLabel="Uploading Resume..."
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>

      {selected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <span aria-hidden="true" className="text-slate-400">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{selected.file.name}</p>
            <p className="text-xs text-slate-500">
              {selected.typeLabel} · {selected.sizeLabel}
            </p>
          </div>
          {localError ? (
            <p role="alert" className="text-xs font-medium text-red-600">
              {localError}
            </p>
          ) : null}
        </div>
      ) : null}

      {uploading ? (
        <div role="status" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{progress !== null && progress < 100 ? 'Uploading resume...' : 'Upload complete'}</span>
            {progress !== null ? <span className="tabular-nums">{progress}%</span> : null}
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={progress ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
              style={{ width: `${progress ?? 10}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
