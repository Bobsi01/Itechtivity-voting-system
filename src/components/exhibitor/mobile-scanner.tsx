"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, ArrowRight, History, Search, Keyboard, Award } from "lucide-react";
import { QrScanner } from "@/components/ui/qr-scanner";
import { toast } from "sonner";
import {
  subscribeToVoteEvents,
  subscribeToSystemConfigEvents,
  createResilientPoller,
} from "@/lib/appwrite/client";
import { SimpleSelect, type SimpleSelectOption } from "@/components/ui/simple-select";
import { playAudioFeedback, triggerHaptic } from "@/lib/scanner/feedback";

interface ScopedBoothTally {
  id: string;
  code: string;
  projectTitle: string;
  capstoneCategory: string;
  tableNumber: string | null;
  totalVotes: number;
  awardTallies: Array<{ awardTitle: string; slotNumber: number; count: number }>;
  recentScans: Array<{ awardTitle: string; slotNumber?: number; stubSerial?: string; scannedAt: string }>;
}

export function MobileScanner() {

  const [boothData, setBoothData] = useState<ScopedBoothTally | null>(null);
  const [adminBoothOptions, setAdminBoothOptions] = useState<SimpleSelectOption[]>([]);
  const [selectedAdminBoothId, setSelectedAdminBoothId] = useState<string>("");
  const [activeTallyTab, setActiveTallyTab] = useState<"tally" | "history">("tally");
  const [scanSearchQuery, setScanSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualInputText, setManualInputText] = useState<string>("");
  const [isVotingOpen, setIsVotingOpen] = useState<boolean>(true);

  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    awardTitle?: string;
    stubSerial?: string;
    message?: string;
  } | null>(null);

  const [scanFlash, setScanFlash] = useState<"success" | "error" | null>(null);
  const isProcessingScanRef = useRef<boolean>(false);

  const fetchBoothTally = useCallback(async (overrideBoothId?: string) => {

    try {
      const targetId = overrideBoothId ?? selectedAdminBoothId;
      const url = targetId ? `/api/booths?boothId=${encodeURIComponent(targetId)}` : "/api/booths";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.booth) {
          setBoothData(data.booth);
          if (!selectedAdminBoothId && data.scoped === false) {
            setSelectedAdminBoothId(data.booth.id);
          }
        }
        if (data.scoped === false && Array.isArray(data.booths)) {
          setAdminBoothOptions(
            data.booths.map((b: { id: string; code: string; projectTitle: string }) => ({
              value: b.id,
              label: `${b.code} - ${b.projectTitle}`,
            }))
          );
        }
      }
    } catch (err) {
      console.warn("Failed to fetch booth tally telemetry:", err);
    }
  }, [selectedAdminBoothId]);

  useEffect(() => {

    fetchBoothTally();
  }, [fetchBoothTally]);

  useEffect(() => {

    const unsubscribeConfig = subscribeToSystemConfigEvents((payload) => {
      setIsVotingOpen(payload.isVotingOpen);
      if (!payload.isVotingOpen) {
        toast.error("Emergency Freeze: Voting paused by administrator");
      } else {
        toast.info("Voting Resumed: Scanner active");
      }
    });

    if (!boothData?.id) {
      return () => {
        unsubscribeConfig();
      };
    }

    const poller = createResilientPoller(() => fetchBoothTally(boothData.id), {
      initialIntervalMs: 10000,
      maxIntervalMs: 30000,
      backoffFactor: 1.5,
    });

    const unsubscribeVotes = subscribeToVoteEvents((payload) => {
      if (payload.boothId === boothData.id) {
        fetchBoothTally(boothData.id);
        poller.reset();
      }
    });

    poller.start();

    return () => {
      unsubscribeConfig();
      unsubscribeVotes();
      poller.stop();
    };
  }, [boothData?.id, fetchBoothTally]);

  const handleProcessScan = async (qrPayload: string) => {

    if (!isVotingOpen || isProcessingScanRef.current || !boothData) {
      if (!isVotingOpen) {
        toast.error("Voting is currently frozen. Cannot submit votes.");
      }
      return;
    }
    isProcessingScanRef.current = true;
    setIsSubmitting(true);

    const trimmedPayload = qrPayload.trim();
    // Construct sanitized idempotency key (<booth_id>:<stub_serial_or_prefix>:<nonce>)
    const rawPart = trimmedPayload.split(/[.:]/)[0] || trimmedPayload;
    const stubSerialPart = rawPart.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "scan";
    const nonce =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID().slice(0, 12)
        : Date.now().toString(36);
    const idempotencyKey = `${boothData.id}:${stubSerialPart}:${nonce}`;

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          qrPayload: trimmedPayload,
          boothId: boothData.id,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        playAudioFeedback(true);
        triggerHaptic(true);
        setScanFlash("success");
        setTimeout(() => setScanFlash(null), 1200);

        setLastScanResult({
          success: true,
          awardTitle: data.awardTitle,
          stubSerial: data.stubSerial,
          message: "Vote Accepted & Registered!",
        });
        toast.success(`Vote Accepted: ${data.awardTitle}`);
        setManualInputText("");
        fetchBoothTally();
      } else {
        playAudioFeedback(false);
        triggerHaptic(false);
        setScanFlash("error");
        setTimeout(() => setScanFlash(null), 1200);

        const errMessage = data.error === "TICKET_ALREADY_REDEEMED"
          ? "Duplicate scan: Ticket already redeemed!"
          : data.error === "TICKET_NOT_ACTIVATED"
          ? "Unactivated: Ticket not purchased at desk!"
          : data.error === "TAMPERED_OR_INVALID_QR_CODE"
          ? "This QR code is invalid or damaged. Scan a valid voting stub."
          : data.error === "VOTING_IS_CLOSED" ? "Voting is closed. Ask the event administrator before retrying."
          : data.error === "UNAUTHENTICATED" ? "Your session ended. Sign in again."
          : data.error === "FORBIDDEN_BOOTH_MISMATCH" ? "This account cannot record votes for that booth."
          : "Vote could not be recorded. Please retry or ask the event desk.";

        setLastScanResult({
          success: false,
          message: errMessage,
        });
        toast.error(errMessage);
      }
    } catch (err) {
      playAudioFeedback(false);
      triggerHaptic(false);
      setScanFlash("error");
      setTimeout(() => setScanFlash(null), 1200);

      setLastScanResult({
        success: false,
        message: "Network transmission error",
      });
      toast.error("Network error submitting vote");
    } finally {
      setIsSubmitting(false);
      // Brief debounce pause before allowing next camera frame read
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 1800);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between max-w-md lg:max-w-5xl mx-auto w-full space-y-4 pb-12 relative">
      {/* High-visibility full-screen visual flash for loud gyms and iOS Safari */}
      {scanFlash && (
        <div
          aria-hidden="true"
          className={`fixed inset-0 pointer-events-none z-50 transition-opacity duration-300 ${
            scanFlash === 'success'
              ? 'border-[12px] border-neutral-900 animate-pulse'
              : 'border-[12px] border-dashed border-neutral-700 animate-pulse'
          }`}
        />
      )}

      {/* 2-Column Responsive Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Viewfinder & Input Controls */}
        <div className="space-y-4">
          {/* Emergency Voting Freeze Alert Banner */}
          {!isVotingOpen && (
            <div
              role="alert"
              aria-live="assertive"
              className="border-2 border-neutral-900 rounded-lg p-4 bg-white text-neutral-900 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-neutral-900 flex-shrink-0" />
                <span className="font-bold text-sm uppercase tracking-wider">
                  Emergency Voting Freeze Active
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-700">
                Administrator has temporarily frozen all voting across the venue. Camera scanning and stub redemption are paused until voting is reopened.
              </p>
            </div>
          )}

          {/* Booth Header & Scoped Identity (Fixed layout with min-w-0 and flex-shrink-0 to prevent button overlap) */}
          <div className="border border-neutral-300 p-4 rounded-lg space-y-3 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-500 block">
              Booth Scanner Session
            </span>
            <h2 className="text-base font-bold text-neutral-900 truncate">
              {boothData ? `${boothData.code}: ${boothData.projectTitle}` : "Loading booth..."}
            </h2>
            <p className="text-xs text-neutral-600 font-mono mt-0.5 select-text">
              Table: {boothData?.tableNumber || "Main Hall"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchBoothTally()}
            className="flex-shrink-0 p-2.5 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors touch-manipulation select-none"
            aria-label="Refresh tally"
          >
            <RefreshCw className="w-4 h-4 text-neutral-800" />
          </button>
        </div>

        {adminBoothOptions.length > 0 && (
          <div className="pt-2 border-t border-neutral-200 space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-neutral-600 block">
              Admin Override: Active Target Booth
            </label>
            <SimpleSelect
              value={selectedAdminBoothId}
              onChange={(newBoothId) => {
                setSelectedAdminBoothId(newBoothId);
                fetchBoothTally(newBoothId);
              }}
              options={adminBoothOptions}
              placeholder="Select Booth..."
              ariaLabel="Target Booth Selector"
            />
          </div>
        )}
      </div>

      {isVotingOpen ? (
        <QrScanner onDecode={handleProcessScan} />
      ) : (
        <div className="border border-neutral-300 rounded-lg p-8 text-center bg-white space-y-2 min-h-[220px] flex flex-col items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-neutral-700" />
          <p className="text-sm font-bold text-neutral-900 uppercase">Scanner Viewfinder Paused</p>
          <p className="text-xs font-mono text-neutral-600">
            Viewfinder will automatically resume when voting is reopened.
          </p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={showManualInput}
        onClick={() => setShowManualInput(!showManualInput)}
        className="min-h-11 w-full border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors touch-manipulation select-none"
      >
        <Keyboard className="w-4 h-4 text-neutral-700" />
        <span>{showManualInput ? "Hide Manual Entry" : "Manual Stub Entry"}</span>
      </button>

      {/* Manual Stub Token Input Form */}
      {showManualInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isVotingOpen && manualInputText.trim()) {
              handleProcessScan(manualInputText.trim());
            }
          }}
          className="border border-neutral-300 p-4 rounded-lg bg-white space-y-3"
        >
          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">
              Stub Serial + PIN or QR Token
            </label>
            <p className="text-xs text-neutral-600">
              Enter the Stub Serial and 8-character PIN printed on the stub (`Serial.PIN`) or paste the encoded QR token
            </p>
            <input
              type="text"
              aria-label="QR code text"
              value={manualInputText}
              onChange={(e) => setManualInputText(e.target.value)}
              disabled={!isVotingOpen}
              placeholder={isVotingOpen ? "e.g. B27-B01-0001-S1.9F4A2C8E or QR token" : "Voting is paused"}
              className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={!isVotingOpen || isSubmitting || !manualInputText.trim()}
            className="w-full py-2.5 px-4 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded font-semibold text-xs transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5 touch-manipulation select-none active:bg-neutral-800"
          >
            {!isVotingOpen ? "Voting Temporarily Frozen" : isSubmitting ? "Submitting Vote..." : "Process Manual Stub Vote"}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Visual Feedback Banner */}
      {lastScanResult && (
        <div
          role="status" aria-live="polite"
          className={`p-4 border rounded-lg transition-all bg-white ${
            lastScanResult.success
              ? "border-neutral-900"
              : "border-neutral-400 border-dashed"
          }`}
        >
          <div className="flex items-start gap-3">
            {lastScanResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-neutral-700 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-600">
                {lastScanResult.success ? "Scan Result: Success" : "Scan Result: Error"}
              </span>
              <p className="text-sm font-bold text-neutral-900">{lastScanResult.message}</p>
              {lastScanResult.awardTitle && (
                <p className="text-xs font-semibold text-neutral-800 mt-1">
                  Award: {lastScanResult.awardTitle}
                </p>
              )}
              {lastScanResult.stubSerial && (
                <p className="text-xs font-mono text-neutral-600 select-text">
                  Stub: #{lastScanResult.stubSerial}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Column 2: Scoped Booth Live Tally & Scan History */}
      <div className="space-y-4">
        <div className="border border-neutral-300 p-4 rounded-lg space-y-3 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-300 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTallyTab("tally")}
                className={`text-xs uppercase tracking-wider px-3 py-2 rounded font-bold transition-colors min-h-[44px] flex items-center gap-1.5 ${
                  activeTallyTab === "tally"
                    ? "border border-neutral-900 text-neutral-900"
                    : "border border-neutral-300 text-neutral-600 hover:border-neutral-700"
                }`}
              >
                <Award className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Award Tallies</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTallyTab("history")}
                className={`text-xs uppercase tracking-wider px-3 py-2 rounded font-bold transition-colors min-h-[44px] flex items-center gap-1.5 ${
                  activeTallyTab === "history"
                    ? "border border-neutral-900 text-neutral-900"
                    : "border border-neutral-300 text-neutral-600 hover:border-neutral-700"
                }`}
              >
                <History className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Scan History</span>
                <span className="font-mono text-[11px] border border-neutral-300 px-1 rounded">
                  {boothData?.recentScans.length ?? 0}
                </span>
              </button>
            </div>

            <span className="font-mono text-sm font-bold text-neutral-900 select-text">
              {boothData?.totalVotes ?? 0} Votes
            </span>
          </div>

          {activeTallyTab === "tally" ? (
            <div className="space-y-1.5 divide-y divide-neutral-200">
              {!boothData || boothData.awardTallies.length === 0 ? (
                <p className="text-xs text-neutral-600 text-center py-2">
                  No votes recorded yet for this booth.
                </p>
              ) : (
                boothData.awardTallies.map((tally) => (
                  <div key={tally.slotNumber} className="pt-1.5 flex items-center justify-between text-xs">
                    <span className="text-neutral-800 font-medium">
                      Slot {tally.slotNumber}: {tally.awardTitle}
                    </span>
                    <span className="font-mono font-bold text-neutral-900 border border-neutral-300 px-2 py-0.5 rounded select-text">
                      {tally.count}
                    </span>
                  </div>
                ))
              )}

              {boothData && boothData.recentScans.length > 0 && (
                <div className="pt-3 border-t border-neutral-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-neutral-600">
                    <div className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-neutral-700" />
                      <span>Latest Scans</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTallyTab("history")}
                      className="text-xs font-semibold text-neutral-900 underline underline-offset-2 min-h-[44px] flex items-center"
                    >
                      View All ({boothData.recentScans.length})
                    </button>
                  </div>
                  <div className="divide-y divide-neutral-100 max-h-48 overflow-y-auto">
                    {boothData.recentScans.slice(0, 10).map((scan, idx) => (
                      <div key={`${scan.scannedAt}-${idx}`} className="py-1 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="font-medium text-neutral-800 truncate block">{scan.awardTitle}</span>
                          {scan.stubSerial && (
                            <span className="font-mono text-[11px] text-neutral-500 select-text">#{scan.stubSerial}</span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-neutral-600 flex-shrink-0">
                          {new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Full Scan History Tab with Search Filter */
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={scanSearchQuery}
                  onChange={(e) => setScanSearchQuery(e.target.value)}
                  placeholder="Search stub serial or award..."
                  className="w-full pl-9 pr-3 py-2 text-base sm:text-xs font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
                />
              </div>

              {(!boothData || boothData.recentScans.length === 0) ? (
                <p className="text-xs text-neutral-600 font-mono text-center py-4">
                  No verified scans recorded for this booth.
                </p>
              ) : (
                <div className="divide-y divide-neutral-100 max-h-72 overflow-y-auto pr-1">
                  {boothData.recentScans
                    .filter((s) => {
                      if (!scanSearchQuery) return true;
                      const q = scanSearchQuery.toLowerCase();
                      return (
                        s.awardTitle.toLowerCase().includes(q) ||
                        (s.stubSerial && s.stubSerial.toLowerCase().includes(q))
                      );
                    })
                    .map((scan, idx) => (
                      <div key={`${scan.scannedAt}-${idx}`} className="py-2 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-neutral-900 truncate">{scan.awardTitle}</span>
                            {scan.slotNumber && (
                              <span className="font-mono text-[10px] border border-neutral-300 px-1 rounded text-neutral-600">
                                Slot {scan.slotNumber}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-neutral-600 select-text block">
                            Stub: {scan.stubSerial || "Verified QR"}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 font-mono text-[11px] text-neutral-500">
                          <div>{new Date(scan.scannedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                          <div>{new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

