"use client";

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface SavedPdfPageProps {
  url: string;
  pageNumber: number;
}

export function SavedPdfPage({ url, pageNumber }: SavedPdfPageProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(800);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const entryWidth = Math.floor(entry.contentRect.width);
      if (entryWidth > 0) {
        setWidth(entryWidth);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    setError(null);
    setPdf(null);
    void (async () => {
      try {
        const viewer = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (cancelled) return;
        viewer.GlobalWorkerOptions.workerSrc = '/pdf-viewer/pdf.worker.min.mjs';
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const task = viewer.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: '/pdf-viewer/standard_fonts/' });
        destroy = () => task.destroy();
        const document = await task.promise;
        if (!cancelled) setPdf(document);
      } catch (cause) {
        if (cancelled) return;
        console.warn('Saved PDF loading failed:', cause);
        setError('The PDF could not be displayed. Open or download the saved file above.');
      }
    })();
    return () => {
      cancelled = true;
      void destroy?.().catch((cause: unknown) => console.warn('PDF cleanup failed:', cause));
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || !width || !canvasRef.current) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    setRendering(true);
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(2, window.devicePixelRatio || 1) * width / natural.width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setRendering(false);
      } catch (cause) {
        // Cancellation is expected when switching sheets or resizing the preview.
        if (cancelled) return;
        console.warn('Saved PDF rendering failed:', cause);
        setError('This page could not be rendered. Open or download the PDF above.');
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNumber, width]);

  return (
    <div ref={containerRef} className="w-full space-y-3" aria-busy={rendering && !error}>
      {error && (
        <div role="alert" className="p-4 text-sm flex items-center gap-2 border border-neutral-300 rounded text-neutral-900 bg-white">
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {rendering && !error && (
        <div role="status" className="p-3 text-sm flex items-center gap-2 text-neutral-700">
          <Loader2 className="w-4 h-4 animate-spin text-neutral-700" />
          <span>Rendering saved PDF page...</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Saved print PDF, sheet ${pageNumber}`}
        className="w-full h-auto border border-neutral-300"
      />
    </div>
  );
}
