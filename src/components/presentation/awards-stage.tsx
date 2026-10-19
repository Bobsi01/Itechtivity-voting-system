"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy, Maximize, Minimize, ArrowLeft, Eye, EyeOff } from "lucide-react";

export interface StageAwardData {
  id: string;
  slotNumber: number;
  title: string;
  description: string | null;
  winners: Array<{
    rank: number;
    boothCode: string;
    projectTitle: string;
    category: string;
    tableNumber: string | null;
    teamMembers: string | null;
    votes: number;
  }>;
}

interface AwardsStageProps {
  awards: StageAwardData[];
}

export function AwardsStage({ awards }: AwardsStageProps) {

  const [selectedSlot, setSelectedSlot] = useState<number>(awards[0]?.slotNumber ?? 1);
  const [revealedRanks, setRevealedRanks] = useState<Record<number, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const currentAward = awards.find((a) => a.slotNumber === selectedSlot) || awards[0];

  const toggleFullscreen = () => {

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleRevealAll = () => {

    setRevealedRanks({ 1: true, 2: true, 3: true });
  };

  const handleResetReveals = () => {

    setRevealedRanks({});
  };

  const toggleRank = (rank: number) => {

    setRevealedRanks((prev) => ({ ...prev, [rank]: !prev[rank] }));
  };

  if (!currentAward) {
    return (
      <div className="p-12 text-center text-sm font-mono border border-neutral-300 rounded-lg">
        No active awards configured for stage presentation.
      </div>
    );
  }

  return (
    <div className="min-h-[80dvh] flex flex-col justify-between space-y-8">
      {/* Top Ceremony Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 border border-neutral-300 px-3 py-2 rounded min-h-[44px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Stage</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 uppercase">
              ITECHTIVITY 2027 AWARDS CEREMONY
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRevealAll}
            className="px-3 py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 min-h-[44px] flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Reveal All</span>
          </button>
          <button
            type="button"
            onClick={handleResetReveals}
            className="px-3 py-2 border border-neutral-300 hover:border-neutral-700 rounded text-xs font-semibold text-neutral-800 min-h-[44px] flex items-center gap-1.5"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Hide Standings</span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 border border-neutral-300 hover:border-neutral-900 rounded min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-800"
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Award Category Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {awards.map((award) => (
          <button
            key={award.id}
            type="button"
            onClick={() => {
              setSelectedSlot(award.slotNumber);
              setRevealedRanks({});
            }}
            className={`px-4 py-2.5 rounded border text-xs font-bold whitespace-nowrap min-h-[44px] transition-colors ${
              selectedSlot === award.slotNumber
                ? "border-2 border-neutral-900 text-neutral-900"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-800"
            }`}
          >
            Slot {award.slotNumber}: {award.title}
          </button>
        ))}
      </div>

      {/* Main Stage Presentation Centerpiece */}
      <div className="border border-neutral-300 rounded-xl p-8 bg-white space-y-8 flex-1 flex flex-col justify-between">
        <div className="text-center space-y-2 border-b border-neutral-200 pb-6">
          <div className="flex items-center justify-center gap-1.5">
            <Trophy className="w-4 h-4 text-neutral-900" />
            <span className="text-xs font-mono uppercase tracking-widest text-neutral-500 border border-neutral-300 px-3 py-1 rounded">
              Award Slot #{currentAward.slotNumber}
            </span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 uppercase pt-2">
            {currentAward.title}
          </h2>
          <p className="text-xs text-neutral-600 max-w-xl mx-auto font-mono">
            {currentAward.description || "Official Capstone Award presented by the University of Caloocan City."}
          </p>
        </div>

        {/* Podium Layout: 2nd Place (Left), 1st Place (Center), 3rd Place (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* 2nd Place / 1st Runner Up */}
          <div className="border border-neutral-300 rounded-lg p-6 bg-white space-y-4 md:order-1 text-center">
            <div className="border-b border-neutral-200 pb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-600 font-bold">
                1st Runner-Up
              </span>
              <p className="text-base font-bold text-neutral-800">2nd Place</p>
            </div>

            {currentAward.winners[1] ? (
              <div className="space-y-3">
                {revealedRanks[2] ? (
                  <>
                    <div className="space-y-1">
                      <span className="font-mono text-sm font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 inline-block">
                        {currentAward.winners[1].boothCode}
                      </span>
                      <h4 className="text-base font-bold text-neutral-900 leading-snug">
                        {currentAward.winners[1].projectTitle}
                      </h4>
                      <p className="text-xs text-neutral-600 font-mono">
                        Table {currentAward.winners[1].tableNumber || "TBD"} • {currentAward.winners[1].category}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-neutral-200">
                      <span className="font-mono text-sm font-bold text-neutral-900">
                        {currentAward.winners[1].votes} Votes
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-6 space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleRank(2)}
                      className="px-4 py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 min-h-[44px] flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Reveal 2nd Place</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 font-mono py-6">No qualifying votes</p>
            )}
          </div>

          {/* 1st Place / Champion (Elevated Center) */}
          <div className="border-2 border-neutral-900 rounded-xl p-8 bg-white space-y-4 md:order-2 text-center md:-translate-y-4 shadow-sm">
            <div className="border-b border-neutral-200 pb-3">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Trophy className="w-4 h-4 text-neutral-900" />
                <span className="text-xs font-mono uppercase tracking-widest text-neutral-900 font-bold">
                  Champion
                </span>
              </div>
              <p className="text-xl font-extrabold text-neutral-900">1st Place Winner</p>
            </div>

            {currentAward.winners[0] ? (
              <div className="space-y-4">
                {revealedRanks[1] ? (
                  <>
                    <div className="space-y-2">
                      <span className="font-mono text-base font-bold border-2 border-neutral-900 px-3 py-1 rounded text-neutral-900 inline-block">
                        {currentAward.winners[0].boothCode}
                      </span>
                      <h3 className="text-xl font-extrabold text-neutral-900 leading-tight">
                        {currentAward.winners[0].projectTitle}
                      </h3>
                      <p className="text-xs text-neutral-600 font-mono">
                        Table {currentAward.winners[0].tableNumber || "TBD"} • {currentAward.winners[0].category}
                      </p>
                      {currentAward.winners[0].teamMembers && (
                        <p className="text-xs text-neutral-700 font-medium">
                          {currentAward.winners[0].teamMembers}
                        </p>
                      )}
                    </div>
                    <div className="pt-3 border-t border-neutral-200">
                      <span className="font-mono text-lg font-extrabold text-neutral-900 border border-neutral-900 px-3 py-1 rounded">
                        {currentAward.winners[0].votes} Total Votes
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-8 space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleRank(1)}
                      className="px-6 py-3 border-2 border-neutral-900 hover:border-neutral-700 rounded text-sm font-extrabold text-neutral-900 min-h-[44px] flex items-center justify-center gap-2 mx-auto"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>Reveal Champion Winner</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 font-mono py-8">No qualifying votes</p>
            )}
          </div>

          {/* 3rd Place / 2nd Runner Up */}
          <div className="border border-neutral-300 rounded-lg p-6 bg-white space-y-4 md:order-3 text-center">
            <div className="border-b border-neutral-200 pb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-600 font-bold">
                2nd Runner-Up
              </span>
              <p className="text-base font-bold text-neutral-800">3rd Place</p>
            </div>

            {currentAward.winners[2] ? (
              <div className="space-y-3">
                {revealedRanks[3] ? (
                  <>
                    <div className="space-y-1">
                      <span className="font-mono text-sm font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 inline-block">
                        {currentAward.winners[2].boothCode}
                      </span>
                      <h4 className="text-base font-bold text-neutral-900 leading-snug">
                        {currentAward.winners[2].projectTitle}
                      </h4>
                      <p className="text-xs text-neutral-600 font-mono">
                        Table {currentAward.winners[2].tableNumber || "TBD"} • {currentAward.winners[2].category}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-neutral-200">
                      <span className="font-mono text-sm font-bold text-neutral-900">
                        {currentAward.winners[2].votes} Votes
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-6 space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleRank(3)}
                      className="px-4 py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 min-h-[44px] flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Reveal 3rd Place</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 font-mono py-6">No qualifying votes</p>
            )}
          </div>
        </div>

        {/* Footer Ceremony Metadata */}
        <div className="pt-4 border-t border-neutral-200 flex items-center justify-between text-xs font-mono text-neutral-500">
          <span>Computer Studies Department • University of Caloocan City</span>
          <span>Verified Cryptographic Tally</span>
        </div>
      </div>
    </div>
  );
}
