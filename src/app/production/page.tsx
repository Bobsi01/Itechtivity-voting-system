"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { BatchGeneratorCard } from "@/components/production/batch-generator-card";
import { PdfFileExplorer } from "@/components/production/pdf-file-explorer";
import { PdfPreviewModal } from "@/components/production/pdf-preview-modal";
import { type PdfFileItem } from "@/lib/utils/format";
import { subscribeToBatchEvents } from "@/lib/appwrite/client";
import { toast } from "sonner";

export default function ProductionPage() {

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

    const unsubscribe = subscribeToBatchEvents((batchEvent) => {
      if (batchEvent.status === "COMPLETED") {
        toast.info(`Appwrite Cloud Sync: Batch #${batchEvent.batchNumber} archived to Storage`);
        fetchFiles();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const totalCardsGenerated = files.reduce((acc, f) => acc + f.totalCards, 0);
  const totalSheetsGenerated = files.reduce((acc, f) => acc + f.totalSheets, 0);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
      {/* Top Navigation */}
      <header className="flex items-center justify-between border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-800" />
          </Link>
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-neutral-500">
              Computer Studies Department • University of Caloocan City
            </span>
            <h1 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
              Bingo Card Printing & Prep
            </h1>
          </div>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            aria-label="Logout"
            className="flex items-center justify-center gap-2 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px] min-w-[44px]"
          >
            <LogOut className="w-4 h-4 text-neutral-600" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </form>
      </header>

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
          <p className="text-xl font-bold text-neutral-900 font-mono mt-0.5 select-text">0.2&quot; / 14.4pt</p>
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
    </main>
  );
}
