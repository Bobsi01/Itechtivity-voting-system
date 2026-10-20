"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Layers,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";

export interface BatchCardItem {
  id: string;
  cardSerial: string;
  status: "GENERATED" | "ACTIVATED" | "VOID";
  activatedAt: string | null;
  buyerName: string | null;
  buyerType: string | null;
  program: string | null;
  yearAndSection: string | null;
}

export interface BatchOverviewItem {
  id: string;
  batchNumber: number;
  fileName: string;
  totalCards: number;
  totalSheets: number;
  status: string;
  createdAt: string;
  counts: {
    total: number;
    generated: number;
    activated: number;
    void: number;
  };
  firstSerial: string | null;
  lastSerial: string | null;
  cards?: BatchCardItem[];
}

export interface CardsSummaryMetrics {
  totalCards: number;
  totalGenerated: number;
  totalActivated: number;
  totalVoid: number;
}

interface BatchActivationCardProps {
  onCardSelect?: (serial: string) => void;
  selectedSerial?: string | null;
  onAwardsLoaded?: (awards: Array<{ slotNumber: number; title: string }>) => void;
}

export function BatchActivationCard({
  onCardSelect,
  selectedSerial,
  onAwardsLoaded,
}: BatchActivationCardProps) {

  const [batches, setBatches] = useState<BatchOverviewItem[]>([]);
  const [summary, setSummary] = useState<CardsSummaryMetrics>({
    totalCards: 0,
    totalGenerated: 0,
    totalActivated: 0,
    totalVoid: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchBatchDirectory = useCallback(async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/cards/batch");
      const data = await res.json();

      if (res.ok && data.success) {
        const loadedBatches: BatchOverviewItem[] = data.batches || [];
        setBatches(loadedBatches);

        if (data.summary) {
          setSummary(data.summary);
        }

        if (data.awards && Array.isArray(data.awards) && onAwardsLoaded) {
          onAwardsLoaded(data.awards);
        }

        if (loadedBatches.length > 0) {
          setExpandedBatchId((prev) => prev ?? loadedBatches[0].id);
        }
      }
    } catch (err) {
      console.warn("Failed to load print batches directory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [onAwardsLoaded]);

  useEffect(() => {

    fetchBatchDirectory();
  }, [fetchBatchDirectory]);

  useEffect(() => {

    if (!selectedSerial || batches.length === 0) return;
    const target = selectedSerial.trim().toUpperCase();
    const matchingBatch = batches.find((b) =>
      (b.cards || []).some((c) => c.cardSerial.toUpperCase() === target)
    );
    if (matchingBatch) {
      setExpandedBatchId(matchingBatch.id);
    }
  }, [selectedSerial, batches]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredBatches = batches.filter((batch) => {
    if (!normalizedQuery) return true;

    const batchMatches =
      `batch #${batch.batchNumber}`.includes(normalizedQuery) ||
      `batch ${batch.batchNumber}`.includes(normalizedQuery) ||
      (batch.firstSerial && batch.firstSerial.toLowerCase().includes(normalizedQuery)) ||
      (batch.lastSerial && batch.lastSerial.toLowerCase().includes(normalizedQuery));

    if (batchMatches) return true;

    return (batch.cards || []).some(
      (card) =>
        card.cardSerial.toLowerCase().includes(normalizedQuery) ||
        (card.buyerName && card.buyerName.toLowerCase().includes(normalizedQuery))
    );
  });

  return (
    <div className="border border-neutral-300 rounded-lg p-4 sm:p-5 space-y-3 bg-white">
      {/* Minimal Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-300 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-neutral-900 flex-shrink-0" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Print Batches
            </h2>
          </div>
          <p className="text-xs font-mono text-neutral-600 mt-0.5">
            { batches.length } Batches · { summary.totalActivated } / { summary.totalCards } Activated
          </p>
        </div>

        <button
          type="button"
          onClick={fetchBatchDirectory}
          disabled={isLoading}
          aria-label="Refresh batches list"
          className="flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Single Clean Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search batch #, card serial, or owner..."
          aria-label="Filter batches or card serials"
          className="w-full pl-9 pr-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 font-mono min-h-[44px]"
        />
      </div>

      {/* Simplified Accordion Batch List */}
      {isLoading && batches.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded p-6 text-center">
          <p className="text-xs font-mono text-neutral-600">Loading batches...</p>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded p-6 text-center">
          <p className="text-xs font-mono text-neutral-600">
            {batches.length === 0 ? "No batches generated yet." : "No matching batches or cards."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-200 border border-neutral-300 rounded overflow-hidden max-h-[640px] overflow-y-auto">
          {filteredBatches.map((batch) => {
            const isExpanded =
              expandedBatchId === batch.id || normalizedQuery.length > 0;

            const batchCards = (batch.cards || []).filter((card) => {
              if (!normalizedQuery) return true;
              const batchMatches =
                `batch #${batch.batchNumber}`.includes(normalizedQuery) ||
                `batch ${batch.batchNumber}`.includes(normalizedQuery);
              if (batchMatches) return true;
              return (
                card.cardSerial.toLowerCase().includes(normalizedQuery) ||
                (card.buyerName && card.buyerName.toLowerCase().includes(normalizedQuery))
              );
            });

            return (
              <div key={batch.id} className="bg-white">
                {/* Clean Single-Row Batch Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedBatchId((prev) => (prev === batch.id ? null : batch.id))
                  }
                  aria-expanded={isExpanded}
                  className="w-full px-3 py-3 flex items-center justify-between gap-2 text-left hover:bg-neutral-50 transition-colors min-h-[48px] touch-manipulation select-none"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-neutral-900 flex-shrink-0 whitespace-nowrap">
                        Batch #{batch.batchNumber}
                      </span>
                      {batch.firstSerial && batch.lastSerial && (
                        <span className="font-mono text-[11px] text-neutral-600 truncate">
                          {batch.firstSerial} – {batch.lastSerial}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[11px] font-semibold text-neutral-800 border border-neutral-300 px-2 py-0.5 rounded">
                      {batch.counts.activated}/{batch.totalCards} Active
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-700" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-700" />
                    )}
                  </div>
                </button>

                {/* Compact Card Rows Inside Batch */}
                {isExpanded && (
                  <div className="border-t border-neutral-200 divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                    {batchCards.map((card) => {
                      const isSelected =
                        selectedSerial?.toUpperCase() === card.cardSerial.toUpperCase();

                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => onCardSelect && onCardSelect(card.cardSerial)}
                          className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left transition-colors min-h-[44px] touch-manipulation select-none ${
                            isSelected
                              ? "bg-neutral-900 text-white font-bold"
                              : "bg-white text-neutral-900 hover:bg-neutral-100"
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-mono text-xs font-bold flex-shrink-0">
                              {card.cardSerial}
                            </span>
                            {card.buyerName && (
                              <span
                                className={`text-xs truncate ${
                                  isSelected ? "text-neutral-200" : "text-neutral-600"
                                }`}
                              >
                                · {card.buyerName}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                                isSelected
                                  ? "border-white text-white"
                                  : card.status === "ACTIVATED"
                                    ? "border-neutral-900 text-neutral-900 font-bold"
                                    : "border-neutral-300 text-neutral-600"
                              }`}
                            >
                              {card.status}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
