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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PdfFileItem | null>(null);

  const fetchFiles = async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/production/files");
      const data = await res.json();
      if (res.ok && data.success) {
        setFiles(data.files || []);
        setLoadError(null);
      } else {
        setLoadError("Could not load print batches. Use Refresh to retry.");
        toast.error("Failed to load generated files list");
      }
    } catch (err) {
      setLoadError("Connection lost. Use Refresh to reload print batches.");
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

  const completedFiles = files.filter((file) => file.status === "COMPLETED");
  const totalCardsGenerated = completedFiles.reduce((total, file) => total + file.totalCards, 0);
  const totalSheetsGenerated = completedFiles.reduce((total, file) => total + file.totalSheets, 0);

  return (
    <div className="space-y-6">
      <div role="status" className="text-sm text-neutral-700">
        {loadError && files.length === 0 ? "Print batch totals unavailable." : isLoading && files.length === 0 ? "Loading print batches..." : (
          <p>{completedFiles.length} completed batches · {totalCardsGenerated} cards · {totalSheetsGenerated} A4 sheets
            {files.some((file) => file.status !== "COMPLETED") && (
              <span> · {files.filter((file) => file.status === "FAILED").length} failed · {files.filter((file) => file.status !== "COMPLETED" && file.status !== "FAILED").length} in progress</span>
            )}
          </p>
        )}
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
            error={loadError}
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
