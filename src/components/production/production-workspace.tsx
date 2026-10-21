"use client";

import { useEffect, useState } from "react";
import { BatchGeneratorCard } from "@/components/production/batch-generator-card";
import { PdfFileExplorer } from "@/components/production/pdf-file-explorer";
import { PdfPreviewModal } from "@/components/production/pdf-preview-modal";
import { type PdfFileItem } from "@/lib/utils/format";
import { subscribeToBatchEvents, createResilientPoller } from "@/lib/appwrite/client";
import { toast } from "sonner";

export function ProductionWorkspace() {

  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [previewFile, setPreviewFile] = useState<PdfFileItem | null>(null);

  const fetchFiles = async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/production/files");
      const data = await res.json();
      if (res.ok && data.success) {
        setFiles(data.files || []);
      } else {
        toast.error("Failed to load generated files list");
      }
    } catch (err) {
      toast.error("Network error fetching file list");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {

    fetchFiles();

    const poller = createResilientPoller(() => fetchFiles(), {
      initialIntervalMs: 5000,
      maxIntervalMs: 30000,
      backoffFactor: 1.5,
    });

    const unsubscribe = subscribeToBatchEvents((batchEvent) => {
      if (batchEvent.status === "PENDING") {
        toast.info(`PDF Generation Queued: Batch #${batchEvent.batchNumber} pending`);
        poller.reset();
      } else if (batchEvent.status === "PROCESSING") {
        toast.info(`PDF Generation Processing: Batch #${batchEvent.batchNumber} in progress`);
        poller.reset();
      } else if (batchEvent.status === "COMPLETED") {
        toast.success(`Appwrite Cloud Sync: Batch #${batchEvent.batchNumber} archived to Storage`);
        fetchFiles();
        poller.reset();
      } else if (batchEvent.status === "FAILED") {
        toast.error(`PDF Generation Failed: Batch #${batchEvent.batchNumber} encountered an error`);
        fetchFiles();
        poller.reset();
      }
    });

    poller.start();

    return () => {
      unsubscribe();
      poller.stop();
    };
  }, []);

  const totalCardsGenerated = files.reduce((acc, f) => acc + f.totalCards, 0);
  const totalSheetsGenerated = files.reduce((acc, f) => acc + f.totalSheets, 0);

  return (
    <div className="space-y-6">
      {/* Production Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 border border-neutral-300 rounded-lg">
          <span className="text-[11px] font-mono uppercase text-neutral-500">Total Batches</span>
          <p className="text-xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{files.length}</p>
        </div>
        <div className="p-3.5 border border-neutral-300 rounded-lg">
          <span className="text-[11px] font-mono uppercase text-neutral-500">Total Cards</span>
          <p className="text-xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{totalCardsGenerated}</p>
        </div>
        <div className="p-3.5 border border-neutral-300 rounded-lg">
          <span className="text-[11px] font-mono uppercase text-neutral-500">A4 Sheets (4/Sheet)</span>
          <p className="text-xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{totalSheetsGenerated}</p>
        </div>
        <div className="p-3.5 border border-neutral-300 rounded-lg">
          <span className="text-[11px] font-mono uppercase text-neutral-500">Paper Margins</span>
          <p className="text-xl font-bold text-neutral-900 font-mono mt-0.5 select-text">5.0mm / 14.2pt</p>
        </div>
      </div>

      {/* 2-Column Responsive Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Batch Generator Control */}
        <div>
          <BatchGeneratorCard onBatchGenerated={fetchFiles} />
        </div>

        {/* Column 2: File Explorer with Built-In Modal Preview */}
        <div>
          <PdfFileExplorer
            files={files}
            isLoading={isLoading}
            onRefresh={fetchFiles}
            onPreview={(file) => setPreviewFile(file)}
          />
        </div>
      </div>

      {/* Built-in PDF Previewer Modal */}
      <PdfPreviewModal
        key={previewFile?.id || "closed"}
        file={previewFile}
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
