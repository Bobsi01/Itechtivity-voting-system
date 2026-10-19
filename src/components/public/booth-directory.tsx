"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, MapPin, Users, Award, BookOpen, ArrowLeft, LayoutGrid } from "lucide-react";

export interface PublicBoothItem {
  id: string;
  code: string;
  projectTitle: string;
  capstoneCategory: string;
  teamMembers: string | null;
  tableNumber: string | null;
}

export interface PublicAwardItem {
  id: string;
  slotNumber: number;
  title: string;
  description: string | null;
}

interface BoothDirectoryProps {
  booths: PublicBoothItem[];
  awards: PublicAwardItem[];
}

export function BoothDirectory({ booths, awards }: BoothDirectoryProps) {

  const [activeTab, setActiveTab] = useState<"directory" | "rules" | "awards">("directory");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const categories = ["ALL", ...Array.from(new Set(booths.map((b) => b.capstoneCategory)))];

  const filteredBooths = booths.filter((b) => {
    const matchesSearch =
      b.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.teamMembers && b.teamMembers.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.tableNumber && b.tableNumber.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === "ALL" || b.capstoneCategory === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Navigation and View Selector */}
      <div className="flex items-center justify-between border-b border-neutral-300 pb-3 gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 hover:text-neutral-950 border border-neutral-300 px-3 py-2 rounded min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-neutral-700" />
          <span>Home</span>
        </Link>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            className={`px-3 py-2 text-xs font-semibold rounded border min-h-[44px] transition-colors flex items-center gap-1.5 ${
              activeTab === "directory"
                ? "border-neutral-900 text-neutral-900 font-bold"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-700"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Booth Directory</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`px-3 py-2 text-xs font-semibold rounded border min-h-[44px] transition-colors flex items-center gap-1.5 ${
              activeTab === "rules"
                ? "border-neutral-900 text-neutral-900 font-bold"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-700"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Voting Rules</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("awards")}
            className={`px-3 py-2 text-xs font-semibold rounded border min-h-[44px] transition-colors flex items-center gap-1.5 ${
              activeTab === "awards"
                ? "border-neutral-900 text-neutral-900 font-bold"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-700"
            }`}
          >
            <Award className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Awards Guide</span>
          </button>
        </div>
      </div>

      {/* Directory Tab View */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <label htmlFor="booth-search-input" className="sr-only">
                Search projects, teams, or booth codes
              </label>
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="booth-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by project name, team, or CS-XX code..."
                className="w-full border border-neutral-300 pl-9 pr-3 py-2.5 text-base sm:text-sm rounded font-mono placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            {/* Category Filter Chips */}
            {categories.length > 2 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`text-[11px] font-mono px-3 py-2 rounded border whitespace-nowrap min-h-[44px] transition-colors ${
                      selectedCategory === cat
                        ? "border-neutral-900 text-neutral-900 font-bold"
                        : "border-neutral-300 text-neutral-600 hover:border-neutral-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-neutral-600">
            <span>Showing {filteredBooths.length} of {booths.length} Capstone Booths</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-neutral-500" />
              <span>Gymnasium Main Floor</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredBooths.length === 0 ? (
              <div className="col-span-full border border-neutral-300 p-8 text-center rounded-lg space-y-1">
                <p className="text-sm font-semibold text-neutral-800">No matching booths found</p>
                <p className="text-xs text-neutral-600 font-mono">Try adjusting your search query or category filter.</p>
              </div>
            ) : (
              filteredBooths.map((booth) => (
                <div
                  key={booth.id}
                  className="border border-neutral-300 p-4 rounded-lg bg-white space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 select-text">
                        {booth.code}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-700">
                        <MapPin className="w-3 h-3 text-neutral-600" />
                        <span>Table {booth.tableNumber || "TBD"}</span>
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-neutral-900 leading-snug">
                      {booth.projectTitle}
                    </h3>

                    <p className="text-xs text-neutral-600 font-mono">
                      Category: {booth.capstoneCategory}
                    </p>
                  </div>

                  {booth.teamMembers && (
                    <div className="pt-2 border-t border-neutral-200 flex items-center gap-2 text-xs text-neutral-700">
                      <Users className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                      <span className="truncate">{booth.teamMembers}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Rules Tab View */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="border border-neutral-300 p-5 rounded-lg bg-white space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-300 pb-2">
              <BookOpen className="w-4 h-4 text-neutral-900" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Official Voting & Bingo Card Guidelines
              </h2>
            </div>

            <ol className="space-y-3 text-xs text-neutral-700 leading-relaxed font-mono list-decimal pl-4">
              <li>
                <strong className="text-neutral-900">Card Registration:</strong> Purchase your official physical Bingo Card at the registration counter near the entrance. The counter clerk will register your attendee details and activate your 6 voting stubs.
              </li>
              <li>
                <strong className="text-neutral-900">Booth Exploration:</strong> Visit capstone exhibition booths across the gymnasium. Interact with graduating student teams, test their project demonstrations, and ask questions.
              </li>
              <li>
                <strong className="text-neutral-900">Bingo Activity Grid:</strong> Have exhibitors stamp or sign their corresponding cell on your physical 7x6 card grid to complete lines and qualify for event raffle draws.
              </li>
              <li>
                <strong className="text-neutral-900">Detachable Award Stubs:</strong> Your card contains 6 detachable voting stubs at the bottom, one for each Capstone Award slot. Carefully tear along the perforation for the award you wish to cast.
              </li>
              <li>
                <strong className="text-neutral-900">Vote Cast via Mobile Scan:</strong> Hand your chosen stub to the booth team. The exhibitor will scan your stub QR code with their mobile device to record your vote in real time.
              </li>
              <li>
                <strong className="text-neutral-900">Single Redemption & Anti-Fraud:</strong> Each physical stub can only be redeemed once. Once scanned, the stub is voided digitally and placed in the booth ballot box.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Awards Tab View */}
      {activeTab === "awards" && (
        <div className="space-y-4">
          <div className="border border-neutral-300 p-5 rounded-lg bg-white space-y-3">
            <div className="flex items-center gap-2 border-b border-neutral-300 pb-2">
              <Award className="w-4 h-4 text-neutral-900" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Capstone Award Categories
              </h2>
            </div>
            <p className="text-xs text-neutral-600 font-mono">
              The showcase features up to 6 distinct awards. Cast your physical stubs at the booths that excel in each category.
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2">
              {awards.map((award) => (
                <div
                  key={award.id}
                  className="border border-neutral-300 p-4 rounded space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                      Slot {award.slotNumber}: {award.title}
                    </span>
                    <span className="font-mono text-[11px] border border-neutral-300 px-2 py-0.5 rounded text-neutral-600">
                      Stub #{award.slotNumber}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed font-mono">
                    {award.description || "Award criteria determined by the University Capstone Evaluation Committee."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
