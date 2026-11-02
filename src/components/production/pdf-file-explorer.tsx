"use client";

import { useState } from "react";
import { Eye, Download, RefreshCw, FileText, Calendar, Layers, Search } from "lucide-react";
import { type PdfFileItem, formatFileSize } from "@/lib/utils/format";

export type { PdfFileItem };

interface PdfFileExplorerProps {
  files: PdfFileItem[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPreview: (file: PdfFileItem) => void;
}

export function PdfFileExplorer({
  files,
  isLoading,
  error,
  onRefresh,
  onPreview,
}: PdfFileExplorerProps) {

  const [searchQuery, setSearchQuery] = useState("");

  const formatDate = (isoDate: string): string => {

    const d = new Date(isoDate);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredFiles = files.filter((file) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      file.fileName.toLowerCase().includes(q) ||
      `batch #${file.batchNumber}`.toLowerCase().includes(q) ||
      `batch ${file.batchNumber}`.toLowerCase().includes(q) ||
      (file.serialRange && file.serialRange.toLowerCase().includes(q))
    );
  });

  return (
    <div className="border border-neutral-300 rounded-lg overflow-hidden space-y-0 bg-white">
      {/* Explorer Header */}
      <div className="p-4 border-b border-neutral-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
            Batch history
          </h3>
          <p className="text-xs text-neutral-600">
            Preview completed batches or inspect generation status.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="p-3 border-b border-neutral-200">
        <div className="relative">
          <label htmlFor="batch-search-input" className="sr-only">
            Search batches by filename or serial range
          </label>
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="batch-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search batches by number, filename, or serial range..."
            className="w-full pl-9 pr-3 py-2 text-base sm:text-xs font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] font-mono text-neutral-600">
          <span>Showing {filteredFiles.length} of {files.length} Batches</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-neutral-900 underline hover:no-underline min-h-[44px] flex items-center"
            >
              Clear Search
            </button>
          )}
        </div>
      </div>

      {/* Explorer Content */}
      {error && <p role="alert" className="p-4 text-sm text-neutral-900">{error}{files.length > 0 && " Showing the last loaded batches."}</p>}
      {error && files.length === 0 ? null : isLoading && files.length === 0 ? (
        <p role="status" className="p-8 text-sm text-neutral-700">Loading print batches...</p>
      ) : files.length === 0 ? (
        <div className="p-12 text-center space-y-2">
          <FileText className="w-8 h-8 text-neutral-700 mx-auto" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-neutral-800">No print batches generated yet</p>
          <p className="text-xs text-neutral-600 max-w-sm mx-auto">
            Use the batch generator to render your first set of A4 Bingo Card print sheets.
          </p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="p-12 text-center space-y-2">
          <FileText className="w-8 h-8 text-neutral-700 mx-auto" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-neutral-800">No matching batches found</p>
          <p className="text-xs text-neutral-600 max-w-sm mx-auto">
            No batch matches your search query &quot;{searchQuery}&quot;.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 overflow-x-auto max-h-[520px] overflow-y-auto">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/50 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-5 h-5 text-neutral-700 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-neutral-900 truncate select-text">
                      Batch #{file.batchNumber}
                    </span>

                    <span className="text-[10px] font-mono border border-neutral-900 px-1.5 py-0.5 rounded text-neutral-900 flex-shrink-0 select-text uppercase">
                      {file.status || "COMPLETED"}
                    </span>
                  </div>

                  <details className="text-xs text-neutral-700">
                    <summary className="min-h-11 flex items-center cursor-pointer underline">File details</summary>
                    <p className="break-all select-text">{file.fileName}</p>
                    {file.serialRange && <p className="break-all select-text">Serials: {file.serialRange}</p>}
                    <p>{formatFileSize(file.fileSizeBytes)}</p>
                  </details>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 font-mono select-text">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{file.totalSheets} A4 {file.totalSheets === 1 ? "Sheet" : "Sheets"} ({file.totalCards} Cards)</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                      <span>{formatDate(file.createdAt)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {file.status === "COMPLETED" ? <div className="flex items-center gap-2 flex-shrink-0 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={() => onPreview(file)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-900 text-neutral-900 hover:border-neutral-950 rounded text-xs font-semibold transition-colors min-h-[44px]"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview</span>
                </button>

                <a
                  href={file.downloadUrl}
                  download={file.fileName}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div> : <p className="text-xs text-neutral-700">{file.status === "FAILED" ? "Generation failed. Create a new batch to retry." : "PDF is being prepared."}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
