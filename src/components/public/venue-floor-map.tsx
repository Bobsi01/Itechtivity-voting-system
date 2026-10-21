"use client";

import { useState, useId } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Users,
  X,
} from "lucide-react";

export interface VenueFloorMapBooth {
  id?: string;
  code: string;
  projectTitle: string;
  mapSlot: string;
  tableNumber?: string | null;
  capstoneCategory?: string | null;
  programCode?: string | null;
  teamMembers?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
}

export interface VenueFloorMapProps {
  booths: VenueFloorMapBooth[];
  mode?: "public" | "admin-assign" | "exhibitor-preview";
  highlightedSlot?: string | null;
  selectedSlot?: string | null;
  onSelectSlot?: (slot: string) => void;
  onSelectBooth?: (booth: VenueFloorMapBooth) => void;
  className?: string;
}

const ROW_1: readonly string[] = [
  "BOX-01", "BOX-02", "BOX-03", "BOX-04", "BOX-05",
  "BOX-06", "BOX-07", "BOX-08", "BOX-09", "BOX-10",
];

const ROW_2: readonly string[] = [
  "BOX-11", "BOX-12", "BOX-13", "BOX-14", "BOX-15",
  "BOX-16", "BOX-17", "BOX-18", "BOX-19", "BOX-20",
];

const ROW_3: readonly string[] = [
  "BOX-21", "BOX-22", "BOX-23", "BOX-24", "BOX-25",
  "BOX-26", "BOX-27", "BOX-28", "BOX-29", "BOX-30",
];

const ROW_4: readonly string[] = [
  "BOX-31", "BOX-32", "BOX-33", "BOX-34", "BOX-35",
  "BOX-36", "BOX-37", "BOX-38", "BOX-39", "BOX-40",
];

export function VenueFloorMap({
  booths,
  mode = "public",
  highlightedSlot = null,
  selectedSlot = null,
  onSelectSlot,
  onSelectBooth,
  className = "",
}: VenueFloorMapProps) {
  const [inspectedBooth, setInspectedBooth] = useState<VenueFloorMapBooth | null>(null);
  const modalTitleId = useId();

  // Create quick lookup map by slot identifier
  const slotMap = new Map<string, VenueFloorMapBooth>();
  for (const b of booths) {
    if (b.mapSlot) {
      slotMap.set(b.mapSlot, b);
    }
  }

  const handleBoxClick = (slot: string) => {
    const assigned = slotMap.get(slot);

    if (mode === "admin-assign") {
      onSelectSlot?.(slot);
      return;
    }

    if (mode === "public") {
      if (assigned) {
        if (onSelectBooth) {
          onSelectBooth(assigned);
        } else {
          setInspectedBooth(assigned);
        }
      }
      return;
    }

    // exhibitor-preview is read-only
  };

  const renderRow = (slots: readonly string[], rowLabel: string) => {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 uppercase tracking-wider px-1">
          <span>{rowLabel}</span>
          <span>{slots[0]} - {slots[slots.length - 1]}</span>
        </div>
        <div className="grid grid-cols-10 gap-2">
          {slots.map((slot) => {
            const booth = slotMap.get(slot);
            const isHighlighted = highlightedSlot === slot;
            const isSelected = selectedSlot === slot;
            const isOccupied = Boolean(booth);

            let borderClasses = "border border-dashed border-neutral-300";
            if (isHighlighted || isSelected) {
              borderClasses = "border-2 border-neutral-900 ring-2 ring-neutral-900 ring-offset-1";
            } else if (isOccupied) {
              borderClasses = "border border-neutral-900";
            }

            const isInteractive = mode === "admin-assign" || (mode === "public" && isOccupied);

            return (
              <button
                key={slot}
                type="button"
                disabled={!isInteractive}
                onClick={() => handleBoxClick(slot)}
                className={`min-w-[64px] min-h-[64px] p-1.5 rounded flex flex-col justify-between text-left transition-colors touch-manipulation select-none relative ${borderClasses} ${
                  isInteractive ? "hover:border-neutral-900 cursor-pointer" : "cursor-default"
                }`}
                aria-label={
                  isOccupied
                    ? `${slot}: Booth ${booth?.code} - ${booth?.projectTitle}`
                    : `${slot}: Available`
                }
              >
                <div className="flex items-center justify-between w-full leading-none">
                  <span className="font-mono text-[10px] font-bold text-neutral-900">
                    {slot}
                  </span>
                  {isHighlighted && (
                    <span className="font-mono text-[9px] uppercase font-bold text-neutral-900 border border-neutral-900 px-1 rounded">
                      You
                    </span>
                  )}
                  {isSelected && (
                    <span className="font-mono text-[9px] uppercase font-bold text-neutral-900 border border-neutral-900 px-1 rounded">
                      Active
                    </span>
                  )}
                </div>

                {isOccupied && booth ? (
                  <div className="space-y-0.5 mt-1 min-w-0">
                    <span className="font-mono text-xs font-bold text-neutral-900 block truncate">
                      {booth.code}
                    </span>
                    <span className="text-[10px] text-neutral-600 block truncate leading-tight">
                      {booth.projectTitle}
                    </span>
                  </div>
                ) : (
                  <span className="font-mono text-[10px] text-neutral-400 block mt-auto">
                    Empty
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Legend & Mode Guidance */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-neutral-600 border border-neutral-300 rounded-lg p-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 border border-dashed border-neutral-300 rounded" />
            <span>Available (Unoccupied)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 border border-neutral-900 rounded" />
            <span>Assigned Booth</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 border-2 border-neutral-900 rounded" />
            <span>Target / Your Slot</span>
          </div>
        </div>

        <span className="text-[11px] text-neutral-500">
          40 Hall Boxes (4 Rows of 10)
        </span>
      </div>

      {/* Horizontally Scrollable Floor Canvas */}
      <div className="relative border border-neutral-300 rounded-lg overflow-hidden">
        {/* Horizontal Scroll Wrapper */}
        <div className="overflow-x-auto p-4 sm:p-6 scrollbar-thin">
          <div className="min-w-[720px] max-w-[960px] mx-auto space-y-4">
            {/* Top Anchor: Stage / Presentation Screen */}
            <div className="border border-neutral-900 rounded p-2.5 text-center">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-900 block">
                Stage / Presentation Screen & Audio-Visual Deck
              </span>
              <span className="font-mono text-[10px] text-neutral-500 block">
                Front of Exhibition Hall
              </span>
            </div>

            {/* Row 1: BOX-01 to BOX-10 */}
            {renderRow(ROW_1, "Row 1 (North Hall)")}

            {/* Walking Aisle A */}
            <div className="border-t border-b border-dashed border-neutral-300 py-1.5 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Walking Aisle A (North-South Traverse)
              </span>
            </div>

            {/* Row 2: BOX-11 to BOX-20 */}
            {renderRow(ROW_2, "Row 2 (Upper Central)")}

            {/* Central Promenade Aisle */}
            <div className="border border-neutral-300 rounded py-2 text-center">
              <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-neutral-900 block">
                Main Promenade Aisle (Primary Flow Corridor)
              </span>
            </div>

            {/* Row 3: BOX-21 to BOX-30 */}
            {renderRow(ROW_3, "Row 3 (Lower Central)")}

            {/* Walking Aisle B */}
            <div className="border-t border-b border-dashed border-neutral-300 py-1.5 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                Walking Aisle B (North-South Traverse)
              </span>
            </div>

            {/* Row 4: BOX-31 to BOX-40 */}
            {renderRow(ROW_4, "Row 4 (South Hall)")}

            {/* Bottom Anchor: Main Entrance & Registration */}
            <div className="border border-neutral-900 rounded p-2.5 text-center">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-neutral-900 block">
                Main Entrance & Attendee Registration Counter
              </span>
              <span className="font-mono text-[10px] text-neutral-500 block">
                Rear of Exhibition Hall (Turnstiles & Cashier Checkpoint)
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Scroll Hint */}
        <div className="sm:hidden border-t border-neutral-200 px-3 py-1.5 text-center font-mono text-[10px] text-neutral-500">
          Scroll horizontally to view all 10 slots per row.
        </div>
      </div>

      {/* Public Inspection Modal */}
      {inspectedBooth && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setInspectedBooth(null);
            }
          }}
        >
          <div className="relative w-full max-w-lg bg-white border border-neutral-300 rounded-lg p-5 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold border border-neutral-900 px-1.5 py-0.5 rounded text-neutral-900">
                    {inspectedBooth.code}
                  </span>
                  <span className="font-mono text-xs border border-neutral-300 px-1.5 py-0.5 rounded text-neutral-700">
                    Slot {inspectedBooth.mapSlot}
                  </span>
                  {inspectedBooth.tableNumber && (
                    <span className="font-mono text-xs border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                      Table {inspectedBooth.tableNumber}
                    </span>
                  )}
                </div>
                <h3 id={modalTitleId} className="text-base font-bold text-neutral-900 leading-snug">
                  {inspectedBooth.projectTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBooth(null)}
                className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 hover:text-neutral-900 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation flex-shrink-0"
                aria-label="Close project inspection dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Optional Cover Banner */}
            {inspectedBooth.coverUrl && (
              <div className="w-full h-36 rounded border border-neutral-300 overflow-hidden relative">
                <Image
                  src={inspectedBooth.coverUrl}
                  alt={`${inspectedBooth.projectTitle} cover banner`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            )}

            {/* Details Grid */}
            <div className="space-y-3 text-xs">
              {inspectedBooth.capstoneCategory && (
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                    Award Category
                  </span>
                  <span className="font-mono font-semibold text-neutral-800 block">
                    {inspectedBooth.capstoneCategory}
                  </span>
                </div>
              )}

              {inspectedBooth.description && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                    Synopsis
                  </span>
                  <p className="text-neutral-700 leading-relaxed font-mono">
                    {inspectedBooth.description}
                  </p>
                </div>
              )}

              {inspectedBooth.teamMembers && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase text-neutral-500 block">
                    Team Members
                  </span>
                  <div className="flex items-center gap-1.5 text-neutral-800 font-mono">
                    <Users className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                    <span>{inspectedBooth.teamMembers}</span>
                  </div>
                </div>
              )}

              {inspectedBooth.websiteUrl && (
                <div className="pt-2">
                  <a
                    href={inspectedBooth.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-4 py-2 border border-neutral-900 rounded text-xs font-bold uppercase tracking-wider text-neutral-900 hover:border-neutral-700 transition-colors inline-flex items-center gap-1.5 touch-manipulation"
                  >
                    <span>Visit Live Project Showcase</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
