"use client";

import { useState } from "react";
import { Printer, ArrowRight, Crosshair } from "lucide-react";
import { toast } from "sonner";

interface BatchGeneratorCardProps {
  onBatchGenerated: () => void;
}

export function BatchGeneratorCard({ onBatchGenerated }: BatchGeneratorCardProps) {

  const [cardCount, setCardCount] = useState<string>("20");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const presets = [
    { cards: 4, sheets: 1 },
    { cards: 20, sheets: 5 },
    { cards: 40, sheets: 10 },
    { cards: 100, sheets: 25 },
    { cards: 200, sheets: 50 },
  ];

  const calculatedSheets = Math.ceil(Number(cardCount) / 4);

  const handleGenerate = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!Number.isInteger(Number(cardCount)) || Number(cardCount) < 4 || Number(cardCount) % 4 !== 0) {
      toast.error("Minimum batch size is 4 cards (1 A4 sheet)");
      return;
    }

    if (Number(cardCount) > 200) {
      toast.error("Maximum batch size is 200 cards (50 A4 sheets)");
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading(`Rendering ${cardCount} cards across ${calculatedSheets} A4 sheets...`);

    try {
      const res = await fetch("/api/production/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalCards: Number(cardCount) }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Batch generation failed", { id: toastId });
        setIsGenerating(false);
        return;
      }

      toast.success(
        `Batch #${data.batch.batchNumber} generated! (${data.batch.totalSheets} A4 sheets ready)`,
        { id: toastId }
      );
      onBatchGenerated();
    } catch (err) {
      toast.error("Network error during generation", { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="border border-neutral-300 p-5 rounded-lg space-y-4">
      <div className="flex items-center justify-between border-b border-neutral-300 pb-3">
        <div className="flex items-center gap-2.5">
          <Printer className="w-5 h-5 text-neutral-800" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Batch Ticket Sheet Generator
            </h2>
            <p className="text-xs text-neutral-600">
              A4 Vellum Paper (4 Cards / Sheet with 0.2&quot; margins)
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xs font-mono whitespace-nowrap border border-neutral-300 px-2.5 py-1 rounded text-neutral-800 select-text">
            {calculatedSheets} A4 {calculatedSheets === 1 ? "Sheet" : "Sheets"}
          </span>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4">
        {/* Preset Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
            Quick Batch Presets
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.cards}
                type="button"
                onClick={() => setCardCount(String(preset.cards))}
                className={`p-2.5 border rounded text-left transition-colors min-h-[44px] flex flex-col justify-center ${
                  Number(cardCount) === preset.cards
                    ? "border-neutral-900 font-bold"
                    : "border-neutral-300 hover:border-neutral-600"
                }`}
              >
                <span className="text-xs text-neutral-900">{preset.cards} Cards</span>
                <span className="text-xs text-neutral-500 font-mono">
                  {preset.sheets} A4 {preset.sheets === 1 ? "Sheet" : "Sheets"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input & Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-1">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="batch-generator-card-field-1">
              Exact Card Quantity (4-200, Multiples of 4)
            </label>
            <input id="batch-generator-card-field-1"
              aria-label="Exact card quantity"
              required
              type="number"
              min={4}
              max={200}
              step={4}
              value={cardCount}
              onChange={(e) => setCardCount(e.target.value)}
              className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <a
              href="/api/production/calibration"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 border border-neutral-300 hover:border-neutral-900 text-neutral-800 rounded font-semibold text-sm transition-colors min-h-[44px] flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
            >
              <Crosshair className="w-4 h-4 text-neutral-700" />
              <span>Print Calibration Sheet</span>
            </a>

            <button
              type="submit"
              disabled={isGenerating}
              className="px-5 py-2.5 border border-neutral-900 text-neutral-900 rounded font-semibold text-sm transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap"
            >
              {isGenerating ? "Rendering Vector PDF..." : "Generate Batch PDF"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
