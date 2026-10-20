"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { X, ExternalLink, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { type PdfFileItem, formatFileSize } from '@/lib/utils/format';
import { SavedPdfPage } from './saved-pdf-page';

interface PdfPreviewModalProps {
  file: PdfFileItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PdfPreviewModal({ file, isOpen, onClose }: PdfPreviewModalProps) {

  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [sheet, setSheet] = useState(1);

  useEffect(() => {
    if (!isOpen || !file) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen, file]);

  if (!isOpen || !file) return null;
  const currentSheet = Math.min(sheet, file.totalSheets);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') || []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-auto w-[calc(100%_-_1rem)] max-w-5xl h-[92dvh] max-h-[92dvh] border border-neutral-900 rounded-lg p-0 bg-white text-neutral-900 backdrop:bg-black/60">
      <div className="flex h-full min-w-0 flex-col">
        <header className="flex-none border-b border-neutral-300 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="break-all text-sm font-bold">{file.fileName}</h2>
              <p className="text-xs mt-1">Batch #{file.batchNumber} - {file.totalSheets} A4 {file.totalSheets === 1 ? 'sheet' : 'sheets'} - {file.totalCards} cards - {formatFileSize(file.fileSizeBytes)}</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview modal" className="min-h-11 min-w-11 shrink-0 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 flex items-center justify-center gap-1 text-xs font-bold transition-colors touch-manipulation select-none">
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a href={file.previewUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-2 text-sm transition-colors touch-manipulation select-none">
              <ExternalLink className="w-4 h-4" />
              <span>Open PDF in New Tab</span>
            </a>
            <a href={`${file.downloadUrl}?download=1`} download={file.fileName} className="min-h-11 min-w-11 flex items-center justify-center gap-1.5 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded px-2 text-sm font-semibold uppercase tracking-wider transition-colors touch-manipulation select-none">
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </a>
          </div>
          <p className="text-xs">This is the saved print file. If it does not display, open or download the PDF.</p>
          {file.totalSheets > 1 && <div className="flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous A4 Sheet" disabled={currentSheet <= 1} onClick={() => setSheet(currentSheet - 1)} className="min-h-11 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 text-xs font-semibold transition-colors touch-manipulation select-none">
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span aria-live="polite" className="text-sm font-mono font-medium">Sheet {currentSheet} of {file.totalSheets}</span>
            <button type="button" aria-label="Next A4 Sheet" disabled={currentSheet >= file.totalSheets} onClick={() => setSheet(currentSheet + 1)} className="min-h-11 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 text-xs font-semibold transition-colors touch-manipulation select-none">
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">
          <SavedPdfPage url={file.previewUrl} pageNumber={currentSheet} />
        </div>
      </div>
    </dialog>
  );
}
