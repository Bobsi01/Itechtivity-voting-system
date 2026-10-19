"use client";

import { useEffect, useState } from "react";
import { Shield, Lock, Unlock, RefreshCw, Trophy, Users, History, Edit2, Check, X, Pause, Play, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { subscribeToVoteEvents } from "@/lib/appwrite/client";
import { toast } from "sonner";
import { formatBuyerType } from "@/lib/utils/format";

interface AdminStatsData {
  config: {
    eventName: string;
    isAwardsLocked: boolean;
    isVotingOpen: boolean;
    maxAwards: number;
  };
  counts: {
    totalCards: number;
    activatedCards: number;
    totalVotes: number;
  };
  demographics: Array<{
    buyerType: string;
    cardsBought: number;
    transactionsCount: number;
  }>;
  recentRegistrations?: Array<{
    id: string;
    buyerName: string;
    buyerType: string;
    studentNumber: string | null;
    program: string | null;
    yearAndSection: string | null;
    classFormat: string;
    affiliation: string | null;
    quantityBought: number;
    createdAt: string;
  }>;
  leaderboard: Array<{
    boothId: string;
    code: string;
    projectTitle: string;
    category: string;
    totalVotes: number;
    awardCounts: Record<string, number>;
  }>;
  awards: Array<{
    id: string;
    slotNumber: number;
    title: string;
    voteCount: number;
  }>;
}

export function LiveLeaderboard() {

  const [boothSearch, setBoothSearch] = useState("");
  const [standingsPage, setStandingsPage] = useState(0);
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState<boolean>(false);
  const [isEditingAwards, setIsEditingAwards] = useState<boolean>(false);
  const [awardDrafts, setAwardDrafts] = useState<Record<number, string>>({});
  const [showFreezeConfirm, setShowFreezeConfirm] = useState<boolean>(false);

  const fetchStats = async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data);
      }
    } catch (err) {
      console.warn("Failed to fetch administrative telemetry stats:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {

    fetchStats();

    // Subscribe to real-time vote broadcasts via Appwrite Realtime
    const unsubscribe = subscribeToVoteEvents((payload) => {
      toast.info(`Live Vote: ${payload.boothCode} received vote for ${payload.awardTitle}`);
      fetchStats();
    });

    // Fallback polling every 5 seconds for resilience
    const interval = setInterval(fetchStats, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleStartEditAwards = () => {

    if (!stats || stats.config.isAwardsLocked) return;

    const initialDrafts: Record<number, string> = {};
    for (const award of stats.awards) {
      initialDrafts[award.slotNumber] = award.title;
    }

    setAwardDrafts(initialDrafts);
    setIsEditingAwards(true);
  };

  const handleSaveAwardTitles = async () => {

    if (!stats) return;

    const awardUpdates = stats.awards.map((award) => ({
      slotNumber: award.slotNumber,
      title: (awardDrafts[award.slotNumber] ?? award.title).trim(),
    }));

    if (awardUpdates.some((item) => item.title.length < 2)) {
      toast.error("Each award slot title must be at least 2 characters.");
      return;
    }

    setIsUpdatingConfig(true);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awardUpdates }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Award slot titles updated.");
        setIsEditingAwards(false);
        fetchStats();
      } else {
        toast.error(data.error || "Failed to update award slot titles.");
      }
    } catch (err) {
      console.warn("Failed to save award slot titles:", err);
      toast.error("Network error while saving award slot titles.");
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleToggleLock = async () => {

    if (!stats) return;
    setIsUpdatingConfig(true);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAwardsLocked: !stats.config.isAwardsLocked }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.config.isAwardsLocked) {
          setIsEditingAwards(false);
        }
        toast.success(
          data.config.isAwardsLocked
            ? "Award Configuration Locked (Printing hardcoded)"
            : "Award Configuration Unlocked"
        );
        fetchStats();
      }
    } catch (err) {
      console.warn("Failed to toggle award lock:", err);
      toast.error("Failed to update config");
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const executeToggleVoting = async () => {

    if (!stats) return;
    setIsUpdatingConfig(true);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVotingOpen: !stats.config.isVotingOpen }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          data.config.isVotingOpen ? "Voting is now OPEN" : "Emergency Freeze: Voting PAUSED"
        );
        fetchStats();
      }
    } catch (err) {
      toast.error("Failed to update config");
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleToggleVotingClick = () => {

    if (!stats) return;
    if (stats.config.isVotingOpen) {
      setShowFreezeConfirm(true);
    } else {
      executeToggleVoting();
    }
  };

  if (!stats) {
    return (
      <div className="p-12 text-center text-xs font-mono text-neutral-500">
        Loading administrative telemetry...
      </div>
    );
  }

  const filteredStandings = stats.leaderboard.filter((booth) => `${booth.code} ${booth.projectTitle}`.toLowerCase().includes(boothSearch.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredStandings.length / 10));
  const page = Math.min(standingsPage, pageCount - 1);

  return (
    <div className="space-y-6">
      {/* Top Controls & Status Bar */}
      <div className="border border-neutral-300 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-neutral-900" strokeWidth={1.75} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-neutral-900 uppercase">
                {stats.config.eventName} System Controls
              </span>
              <span className="text-xs font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-700 select-text">
                {stats.config.isVotingOpen ? "Voting ACTIVE" : "Voting FROZEN"}
              </span>
            </div>
            <p className="text-xs text-neutral-600 font-mono">
              Awards Status: {stats.config.isAwardsLocked ? "Locked to Physical Print" : "Configurable / Generic"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleLock}
            disabled={isUpdatingConfig}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
          >
            {stats.config.isAwardsLocked ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock Awards</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Configuration</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleToggleVotingClick}
            disabled={isUpdatingConfig}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-900 text-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px]"
          >
            {stats.config.isVotingOpen ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Freeze Voting</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Open Voting</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={fetchStats}
            disabled={isLoading}
            className="p-2.5 border border-neutral-300 hover:border-neutral-900 rounded min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Refresh stats"
          >
            <RefreshCw className={`w-4 h-4 text-neutral-800 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 border border-neutral-300 rounded-lg bg-white">
          <span className="text-xs font-mono uppercase text-neutral-500">Cards Printed</span>
          <p className="text-2xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{stats.counts.totalCards}</p>
        </div>
        <div className="p-4 border border-neutral-300 rounded-lg bg-white">
          <span className="text-xs font-mono uppercase text-neutral-500">Cards Bound (Sales)</span>
          <p className="text-2xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{stats.counts.activatedCards}</p>
        </div>
        <div className="p-4 border border-neutral-300 rounded-lg bg-white">
          <span className="text-xs font-mono uppercase text-neutral-500">Total Scanned Votes</span>
          <p className="text-2xl font-bold text-neutral-900 font-mono mt-0.5 select-text">{stats.counts.totalVotes}</p>
        </div>
        <div className="p-4 border border-neutral-300 rounded-lg bg-white">
          <span className="text-xs font-mono uppercase text-neutral-500">Redemption Rate</span>
          <p className="text-xs text-neutral-700">Used stubs / activated stubs</p>
          <p className="text-2xl font-bold text-neutral-900 font-mono mt-0.5 select-text">
            {stats.counts.activatedCards > 0
              ? `${Math.round((stats.counts.totalVotes / (stats.counts.activatedCards * 6)) * 100)}%`
              : "0%"}
          </p>
        </div>
      </div>

      {/* 2-Column Responsive Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Configuration, Demographics & Activity Logs */}
        <div className="space-y-6">
          {/* 6 Award Slots Breakdown & Editor */}
          {stats.awards && stats.awards.length > 0 && (
        <div className="border border-neutral-300 p-4 rounded-lg space-y-3 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-neutral-800" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                Award Slots Configuration & Tally (6 Slots)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
                {stats.config.isAwardsLocked ? "Locked" : "Unlocked"}
              </span>
              {!stats.config.isAwardsLocked && !isEditingAwards && (
                <button
                  type="button"
                  onClick={handleStartEditAwards}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Slot Titles</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {stats.awards.map((award) => (
              <div key={award.id} className="border border-neutral-200 p-3 rounded flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase text-neutral-600 block">
                    Slot {award.slotNumber}
                  </span>
                  <span className="font-mono text-xs font-bold text-neutral-900 border border-neutral-300 px-2 py-0.5 rounded flex-shrink-0 select-text">
                    {award.voteCount} {award.voteCount === 1 ? "vote" : "votes"}
                  </span>
                </div>

                {isEditingAwards && !stats.config.isAwardsLocked ? (
                  <input
                    type="text"
                    value={awardDrafts[award.slotNumber] ?? award.title}
                    onChange={(e) =>
                      setAwardDrafts((prev) => ({
                        ...prev,
                        [award.slotNumber]: e.target.value,
                      }))
                    }
                    aria-label={`Slot ${award.slotNumber} Award Title`}
                    className="w-full px-3 py-2 text-base font-medium border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 min-h-[44px]"
                  />
                ) : (
                  <p className="text-xs font-bold text-neutral-900 truncate select-text">
                    {award.title}
                  </p>
                )}
              </div>
            ))}
          </div>

          {isEditingAwards && !stats.config.isAwardsLocked && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setIsEditingAwards(false)}
                disabled={isUpdatingConfig}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={handleSaveAwardTitles}
                disabled={isUpdatingConfig}
                className="flex items-center gap-1.5 px-4 py-2  text-neutral-900  rounded text-xs font-semibold transition-colors min-h-[44px]"
              >
                <Check className="w-4 h-4" />
                <span>Save Slot Titles</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demographics Summary */}
      <div className="border border-neutral-300 p-4 rounded-lg space-y-3 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-300 pb-2">
          <Users className="w-4 h-4 text-neutral-800" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
            Attendance Demographics (Cards Purchased)
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.demographics.map((demo) => (
            <div key={demo.buyerType} className="border border-neutral-200 p-2.5 rounded">
              <span className="text-xs font-mono uppercase text-neutral-600">
                {formatBuyerType(demo.buyerType)}
              </span>
              <p className="text-sm font-bold font-mono text-neutral-900 mt-0.5 select-text">
                {demo.cardsBought} {demo.cardsBought === 1 ? "card" : "cards"} ({demo.transactionsCount} {demo.transactionsCount === 1 ? "transaction" : "transactions"})
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Attendee Activity Logs (Displaying Program Year Section format, e.g. BSCS 1 A) */}
      {stats.recentRegistrations && stats.recentRegistrations.length > 0 && (
        <div className="border border-neutral-300 rounded-lg p-4 space-y-3 bg-white">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
            <History className="w-4 h-4 text-neutral-800" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Recent Attendee Registrations & Class Logs
            </h3>
          </div>

          <div className="divide-y divide-neutral-100 overflow-x-auto max-h-60 overflow-y-auto">
            {stats.recentRegistrations.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-900 truncate select-text">
                      {log.buyerName}
                    </span>
                    {/* Standardized Program Year Section format: e.g. BSCS 1 A */}
                    {log.classFormat && log.classFormat !== "N/A" && (
                      <span className="font-mono font-bold text-neutral-900 border border-neutral-300 px-2 py-0.5 rounded text-xs select-text">
                        {log.classFormat}
                      </span>
                    )}
                    <span className="font-mono text-xs text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded select-text">
                      {formatBuyerType(log.buyerType)}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-neutral-600 mt-0.5 select-text">
                    ID: {log.studentNumber || "N/A"} • Tx: {log.id.slice(0, 8)}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="font-mono font-bold text-neutral-900 text-xs border border-neutral-300 px-2 py-1 rounded select-text">
                    {log.quantityBought} card{log.quantityBought > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Column 2: Global Live Leaderboard Standings */}
      <div className="space-y-6">
        {/* Global Live Leaderboard Table */}
        <div className="border border-neutral-300 rounded-lg overflow-hidden space-y-0 bg-white">
        <div className="p-4 border-b border-neutral-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-neutral-900" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Global Booth Live Standings
            </h3>
          </div>
          <span className="text-xs font-mono text-neutral-600">Updates every 5 seconds</span>
        </div>

        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              aria-label="Search standings"
              value={boothSearch}
              onChange={(event) => { setBoothSearch(event.target.value); setStandingsPage(0); }}
              placeholder="Search booth code or project..."
              className="min-h-11 w-full border border-neutral-300 rounded pl-9 pr-3 text-base font-mono"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm font-mono text-xs">
            <button
              type="button"
              aria-label="Previous standings page"
              disabled={page === 0}
              onClick={() => setStandingsPage(page - 1)}
              className="min-h-11 border border-neutral-300 hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span aria-live="polite">Page {page + 1} of {pageCount}</span>
            <button
              type="button"
              aria-label="Next standings page"
              disabled={page + 1 >= pageCount}
              onClick={() => setStandingsPage(page + 1)}
              className="min-h-11 border border-neutral-300 hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {filteredStandings.length === 0 && <p role="status" className="text-xs text-neutral-500 font-mono py-2">No matching booths.</p>}
        </div>
        <div className="divide-y divide-neutral-200 overflow-x-auto max-h-96 overflow-y-auto">
          {filteredStandings.slice(page * 10, (page + 1) * 10).map((booth) => (
            <div
              key={booth.boothId}
              className="p-3 sm:p-4 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className="font-mono text-sm font-bold text-neutral-700 w-6 text-center select-text flex-shrink-0 pt-0.5">
                  #{stats.leaderboard.findIndex((entry) => entry.boothId === booth.boothId) + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-neutral-900 truncate select-text block">
                      {booth.code}: {booth.projectTitle}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 font-mono truncate select-text">{booth.category}</p>
                  {Object.keys(booth.awardCounts).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1.5 text-[11px] font-mono text-neutral-700">
                      {Object.entries(booth.awardCounts).map(([awardTitle, count]) => (
                        <span key={awardTitle} className="border border-neutral-200 px-1.5 py-0.5 rounded select-text">
                          {awardTitle.slice(0, 12)}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center flex-shrink-0 pl-2">
                <span className="font-mono text-base font-bold text-neutral-900 border border-neutral-900 px-3 py-1 rounded select-text">
                  {booth.totalVotes}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
      </div>

      {/* Emergency Freeze Confirmation Modal */}
      {showFreezeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="freeze-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="bg-white border border-neutral-300 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 id="freeze-dialog-title" className="text-base font-bold text-neutral-900 uppercase">
              Emergency: Freeze Global Voting?
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed font-mono">
              Are you sure you want to FREEZE global voting? All exhibitor booth scans across the entire venue will be paused immediately.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFreezeConfirm(false)}
                className="px-4 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFreezeConfirm(false);
                  executeToggleVoting();
                }}
                disabled={isUpdatingConfig}
                className="px-4 py-2 border-2 border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 transition-colors min-h-[44px]"
              >
                Confirm Emergency Freeze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
