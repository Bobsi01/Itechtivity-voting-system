"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers, CheckCircle2, RefreshCw, ArrowRight, Hash, FileText } from "lucide-react";
import { toast } from "sonner";
import { BuyerType } from "@prisma/client";

interface BatchItem {
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
}

interface AcademicProgramOption {
  code: string;
  name: string;
}

interface BatchActivationCardProps {
  onCardSelect?: (serial: string) => void;
}

export function BatchActivationCard({ onCardSelect }: BatchActivationCardProps) {

  const [mode, setMode] = useState<"BY_BATCH" | "BY_RANGE" | "BY_SERIALS">("BY_BATCH");
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [programs, setPrograms] = useState<AcademicProgramOption[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Fields
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [limitCount, setLimitCount] = useState<string>("");
  const [startSerial, setStartSerial] = useState<string>("");
  const [endSerial, setEndSerial] = useState<string>("");
  const [serialsText, setSerialsText] = useState<string>("");

  // Recipient / Issuance Demographics
  const [buyerName, setBuyerName] = useState<string>("");
  const [buyerType, setBuyerType] = useState<BuyerType>("CSD_STUDENT");
  const [program, setProgram] = useState<string>("");
  const [yearAndSection, setYearAndSection] = useState<string>("");
  const [studentNumber, setStudentNumber] = useState<string>("");
  const [affiliation, setAffiliation] = useState<string>("");
  const [contactInfo, setContactInfo] = useState<string>("");

  // Success Result State
  const [lastActivationResult, setLastActivationResult] = useState<{
    count: number;
    buyerName: string;
    transactionId: string;
    serials: string[];
  } | null>(null);

  const fetchBatchData = useCallback(async () => {

    setIsLoadingBatches(true);
    try {
      const res = await fetch("/api/admin/cards/batch");
      const data = await res.json();

      if (res.ok && data.success) {
        setBatches(data.batches);
        setPrograms(data.programs || []);
        if (data.batches.length > 0) {
          setSelectedBatchId((current) => {
            if (current) return current;
            const firstWithUnactivated = data.batches.find((b: BatchItem) => b.counts.generated > 0);
            return firstWithUnactivated ? firstWithUnactivated.id : data.batches[0].id;
          });
        }
      } else {
        toast.error("Failed to load PDF batch metrics.");
      }
    } catch (err) {
      console.warn("Failed to fetch batch metrics:", err);
      toast.error("Network error while loading batch metrics.");
    } finally {
      setIsLoadingBatches(false);
    }
  }, []);

  useEffect(() => {

    fetchBatchData();
  }, [fetchBatchData]);

  const activeBatch = batches.find((b) => b.id === selectedBatchId);

  const handleBatchActivationSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!buyerName.trim()) {
      toast.error("Recipient or Buyer Name is required.");
      return;
    }

    if (mode === "BY_BATCH" && !selectedBatchId) {
      toast.error("Select a PDF batch to activate.");
      return;
    }

    if (mode === "BY_RANGE" && (!startSerial.trim() || !endSerial.trim())) {
      toast.error("Start and End card serials are required for range activation.");
      return;
    }

    if (mode === "BY_SERIALS" && !serialsText.trim()) {
      toast.error("Enter at least one card serial to activate.");
      return;
    }

    setIsSubmitting(true);
    setLastActivationResult(null);

    try {
      const payload: Record<string, unknown> = {
        mode,
        buyerName: buyerName.trim(),
        buyerType,
        program: program.trim() || null,
        yearAndSection: yearAndSection.trim() || null,
        studentNumber: studentNumber.trim() || null,
        affiliation: affiliation.trim() || null,
        contactInfo: contactInfo.trim() || null,
      };

      if (mode === "BY_BATCH") {
        payload.pdfBatchId = selectedBatchId;
        if (limitCount && parseInt(limitCount, 10) > 0) {
          payload.limit = parseInt(limitCount, 10);
        }
      } else if (mode === "BY_RANGE") {
        payload.startSerial = startSerial.trim();
        payload.endSerial = endSerial.trim();
        if (limitCount && parseInt(limitCount, 10) > 0) {
          payload.limit = parseInt(limitCount, 10);
        }
      } else if (mode === "BY_SERIALS") {
        const serialsList = serialsText
          .split(/[\n,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        payload.serials = serialsList;
      }

      const res = await fetch("/api/admin/cards/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Successfully activated ${data.activatedCount} cards!`);
        setLastActivationResult({
          count: data.activatedCount,
          buyerName: data.transaction.buyerName,
          transactionId: data.transaction.id,
          serials: data.activatedSerials || [],
        });

        // Reset inputs that shouldn't persist
        setSerialsText("");
        setStartSerial("");
        setEndSerial("");
        setLimitCount("");

        // Refresh batch telemetry
        await fetchBatchData();
      } else {
        toast.error(data.message || data.error || "Batch activation failed.");
      }
    } catch (err) {
      console.warn("Failed to submit batch activation:", err);
      toast.error("Network error during batch activation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-300 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-neutral-900" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Batch Card Activation
            </h2>
          </div>
          <p className="text-xs text-neutral-600 mt-0.5">
            Bulk-activate card batches or serial ranges for physical distribution.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchBatchData}
          disabled={isLoadingBatches}
          aria-label="Refresh Batch Data"
          className="p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingBatches ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1.5 border border-neutral-300 p-1 rounded">
        <button
          type="button"
          onClick={() => setMode("BY_BATCH")}
          className={`py-2 px-3 text-xs font-bold rounded transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mode === "BY_BATCH"
              ? "border border-neutral-900 text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900 border border-transparent"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>By Batch</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("BY_RANGE")}
          className={`py-2 px-3 text-xs font-bold rounded transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mode === "BY_RANGE"
              ? "border border-neutral-900 text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900 border border-transparent"
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>By Range</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("BY_SERIALS")}
          className={`py-2 px-3 text-xs font-bold rounded transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mode === "BY_SERIALS"
              ? "border border-neutral-900 text-neutral-900"
              : "text-neutral-600 hover:text-neutral-900 border border-transparent"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>By Serials</span>
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleBatchActivationSubmit} className="space-y-4">
        {/* Mode Specific Inputs */}
        {mode === "BY_BATCH" && (
          <div className="space-y-3 border border-neutral-300 p-3.5 rounded">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-800 block">
              Select Printed PDF Batch
            </label>

            {batches.length === 0 ? (
              <p className="text-xs text-neutral-500 font-mono">
                {isLoadingBatches ? "Loading batch records..." : "No generated PDF batches found."}
              </p>
            ) : (
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch #{b.batchNumber} — {b.counts.generated} unactivated of {b.totalCards} cards ({b.fileName})
                  </option>
                ))}
              </select>
            )}

            {activeBatch && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="border border-neutral-300 p-2 rounded">
                    <span className="text-neutral-500 block text-[10px] uppercase">Unactivated</span>
                    <span className="font-bold text-neutral-900 text-sm">{activeBatch.counts.generated}</span>
                  </div>
                  <div className="border border-neutral-300 p-2 rounded">
                    <span className="text-neutral-500 block text-[10px] uppercase">Activated</span>
                    <span className="font-bold text-neutral-900 text-sm">{activeBatch.counts.activated}</span>
                  </div>
                  <div className="border border-neutral-300 p-2 rounded">
                    <span className="text-neutral-500 block text-[10px] uppercase">Total</span>
                    <span className="font-bold text-neutral-900 text-sm">{activeBatch.totalCards}</span>
                  </div>
                </div>

                {activeBatch.firstSerial && activeBatch.lastSerial && (
                  <p className="text-xs font-mono text-neutral-600">
                    Serial Span: <span className="font-bold text-neutral-800">{activeBatch.firstSerial}</span> to{" "}
                    <span className="font-bold text-neutral-800">{activeBatch.lastSerial}</span>
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-mono text-neutral-600 block mb-1">
                Quantity to Activate (Optional, leave blank for all unactivated)
              </label>
              <input
                type="number"
                min="1"
                max={activeBatch?.counts.generated || undefined}
                value={limitCount}
                onChange={(e) => setLimitCount(e.target.value)}
                placeholder={`All ${activeBatch?.counts.generated ?? ""} unactivated cards`}
                className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              />
            </div>
          </div>
        )}

        {mode === "BY_RANGE" && (
          <div className="space-y-3 border border-neutral-300 p-3.5 rounded">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-800 block">
              Serial Number Range
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-mono text-neutral-600 block mb-1">Start Serial</span>
                <input
                  type="text"
                  value={startSerial}
                  onChange={(e) => setStartSerial(e.target.value.toUpperCase())}
                  placeholder="e.g. B27-B01-0001"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
                />
              </div>
              <div>
                <span className="text-xs font-mono text-neutral-600 block mb-1">End Serial</span>
                <input
                  type="text"
                  value={endSerial}
                  onChange={(e) => setEndSerial(e.target.value.toUpperCase())}
                  placeholder="e.g. B27-B01-0050"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
                />
              </div>
            </div>
          </div>
        )}

        {mode === "BY_SERIALS" && (
          <div className="space-y-3 border border-neutral-300 p-3.5 rounded">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-800 block">
              Enter Card Serials (One per line or comma-separated)
            </label>
            <textarea
              rows={4}
              value={serialsText}
              onChange={(e) => setSerialsText(e.target.value.toUpperCase())}
              placeholder="B27-B01-0001&#10;B27-B01-0002&#10;B27-B01-0003"
              className="w-full px-3 py-2 text-xs font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900"
            />
          </div>
        )}

        {/* Recipient & Demographics Form */}
        <div className="space-y-3 border border-neutral-300 p-3.5 rounded">
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-800 block">
            Recipient Demographics & Allocation Details
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Recipient / Group Name *
              </span>
              <input
                type="text"
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. Dean's Office, VIP Delegates, or Student Name"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              />
            </div>

            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Buyer Category *
              </span>
              <select
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value as BuyerType)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              >
                <option value="CSD_STUDENT">CSD Student</option>
                <option value="NON_CSD_STUDENT">Non-CSD Student</option>
                <option value="VISITOR">Guest / Visitor / VIP</option>
                <option value="ALUMNI">Alumni</option>
              </select>
            </div>

            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Academic Program (Optional)
              </span>
              <select
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              >
                <option value="">None / Not Applicable</option>
                {programs.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Year & Section (Optional)
              </span>
              <input
                type="text"
                value={yearAndSection}
                onChange={(e) => setYearAndSection(e.target.value)}
                placeholder="e.g. 4A"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              />
            </div>

            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Affiliation / Department (Optional)
              </span>
              <input
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="e.g. College of Computer Studies"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              />
            </div>

            <div>
              <span className="text-xs font-mono text-neutral-600 block mb-1">
                Contact Info / Notes (Optional)
              </span>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="e.g. dean@ucc.edu.ph"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || (mode === "BY_BATCH" && (!activeBatch || activeBatch.counts.generated === 0))}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-neutral-900 text-neutral-900 hover:border-neutral-950 rounded text-sm font-bold transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{isSubmitting ? "Executing Batch Activation..." : "Activate Cards Batch"}</span>
        </button>
      </form>

      {/* Success Summary Banner & Quick Inspect Links */}
      {lastActivationResult && (
        <div className="border border-neutral-900 rounded p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 block">
                Batch Activation Completed
              </span>
              <p className="text-xs text-neutral-700">
                Activated <span className="font-bold">{lastActivationResult.count}</span> cards for{" "}
                <span className="font-bold">{lastActivationResult.buyerName}</span>.
              </p>
            </div>
            <span className="font-mono text-xs border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
              Tx: {lastActivationResult.transactionId.slice(0, 8)}...
            </span>
          </div>

          <div>
            <span className="text-xs font-mono text-neutral-600 block mb-1.5">
              Activated Card Serials (Click to inspect in Right Column):
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
              {lastActivationResult.serials.map((serial) => (
                <div
                  key={serial}
                  className="flex items-center justify-between border border-neutral-200 px-2.5 py-1.5 rounded text-xs"
                >
                  <span className="font-mono font-bold text-neutral-900">{serial}</span>
                  {onCardSelect && (
                    <button
                      type="button"
                      onClick={() => onCardSelect(serial)}
                      className="flex items-center gap-1 text-xs font-bold text-neutral-900 hover:text-neutral-700 border border-neutral-300 hover:border-neutral-900 px-2 py-1 rounded min-h-[32px]"
                    >
                      <span>Inspect</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PDF Batches Summary Table */}
      {batches.length > 0 && (
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 block">
            Generated Print Batches Overview
          </span>
          <div className="border border-neutral-300 rounded overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-neutral-300">
                <tr>
                  <th className="p-2 text-neutral-600">Batch</th>
                  <th className="p-2 text-neutral-600">Total</th>
                  <th className="p-2 text-neutral-600">Unactivated</th>
                  <th className="p-2 text-neutral-600">Activated</th>
                  <th className="p-2 text-neutral-600">Span</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-neutral-100 last:border-b-0">
                    <td className="p-2 font-bold text-neutral-900">#{b.batchNumber}</td>
                    <td className="p-2 text-neutral-800">{b.totalCards}</td>
                    <td className="p-2 font-bold text-neutral-900">{b.counts.generated}</td>
                    <td className="p-2 text-neutral-700">{b.counts.activated}</td>
                    <td className="p-2 text-neutral-500 text-[11px] truncate max-w-[120px]">
                      {b.firstSerial ? `${b.firstSerial} - ${b.lastSerial}` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
