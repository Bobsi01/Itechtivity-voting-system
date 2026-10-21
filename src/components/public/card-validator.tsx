"use client";

import { useState, useCallback, useRef } from "react";
import {
  Search,
  Camera,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  User,
  Ticket,
  Vote,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { QrScanner } from "@/components/ui/qr-scanner";
import { playAudioFeedback, triggerHaptic } from "@/lib/scanner/feedback";

interface VotedBooth {
  code: string;
  projectTitle: string;
  tableNumber: string | null;
}

interface ValidatedStub {
  slotNumber: number;
  awardTitle: string;
  stubSerial: string;
  status: "INACTIVE" | "ACTIVATED" | "REDEEMED" | "VOID";
  isRedeemed: boolean;
  redeemedAt: string | null;
  votedBooth: VotedBooth | null;
}

interface ValidatedDemographics {
  buyerName: string;
  buyerType: string;
  buyerTypeLabel: string;
  program: string | null;
  yearAndSection: string | null;
  studentNumber: string | null;
  affiliation: string | null;
  academicAffiliation: string | null;
  registeredAt: string;
}

interface ValidatedCardData {
  cardSerial: string;
  masterQrHash: string;
  status: "GENERATED" | "ACTIVATED" | "VOID";
  activatedAt: string | null;
  batchNumber: number | null;
}

interface StubsSummary {
  total: number;
  redeemed: number;
  available: number;
  void: number;
}

interface ValidationApiResponse {
  success: boolean;
  card?: ValidatedCardData;
  demographics?: ValidatedDemographics | null;
  stubsSummary?: StubsSummary;
  stubs?: ValidatedStub[];
  error?: string;
  message?: string;
}

export function CardValidator() {

  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationApiResponse | null>(null);
  const lastValidatedCodeRef = useRef<string>("");

  const executeValidation = useCallback(async (codeToValidate: string) => {

    const trimmed = codeToValidate.trim();
    if (!trimmed) {
      setErrorMessage("Please enter or scan a validation code.");
      return;
    }

    setIsValidating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/cards/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: trimmed }),
      });

      const data: ValidationApiResponse = await response.json();

      if (response.ok && data.success) {
        setResult(data);
        playAudioFeedback(true);
        triggerHaptic(true);
        lastValidatedCodeRef.current = trimmed;
      } else {
        const errorText =
          data.message ||
          (response.status === 429
            ? "Rate limit exceeded. Please wait a moment before trying again."
            : response.status === 404
              ? "No bingo card found matching the provided code."
              : "Unable to validate card. Please try again.");
        setErrorMessage(errorText);
        setResult(null);
        playAudioFeedback(false);
        triggerHaptic(false);
      }
    } catch {
      const networkError = "Network error. Please check your connection and retry.";
      setErrorMessage(networkError);
      setResult(null);
      playAudioFeedback(false);
      triggerHaptic(false);
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {

    e.preventDefault();
    void executeValidation(manualCode);
  };

  const handleQrDecode = useCallback(
    (decodedText: string) => {

      if (isValidating) return;
      if (decodedText === lastValidatedCodeRef.current && result) return;
      void executeValidation(decodedText);
    },
    [executeValidation, isValidating, result]
  );

  const handleReset = () => {

    setResult(null);
    setErrorMessage(null);
    setManualCode("");
    lastValidatedCodeRef.current = "";
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {/* Input Mode Selector */}
      <div className="grid grid-cols-2 gap-2 border border-neutral-300 rounded p-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab("camera");
            setErrorMessage(null);
          }}
          className={`min-h-11 px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded transition-colors touch-manipulation select-none ${
            activeTab === "camera"
              ? "border border-neutral-900 text-neutral-900 font-extrabold"
              : "border border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Camera Scanner</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("manual");
            setErrorMessage(null);
          }}
          className={`min-h-11 px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded transition-colors touch-manipulation select-none ${
            activeTab === "manual"
              ? "border border-neutral-900 text-neutral-900 font-extrabold"
              : "border border-transparent text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Keyboard className="w-4 h-4" />
          <span>Manual Entry</span>
        </button>
      </div>

      {/* Camera Viewfinder View */}
      {activeTab === "camera" && (
        <div className="space-y-3">
          <QrScanner
            autoStart
            imageInput
            onDecode={handleQrDecode}
          />
          <p className="text-xs text-neutral-600 text-center">
            Point camera at the Master QR code on the Bingo Card or any detachable stub QR.
          </p>
        </div>
      )}

      {/* Manual Input View */}
      {activeTab === "manual" && (
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="manual-serial-input"
              className="block text-xs font-bold uppercase tracking-wider text-neutral-800"
            >
              Card or Stub Code
            </label>
            <input
              id="manual-serial-input"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="e.g. B27-B01-0001 or B27-B01-0001-S1"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              autoFocus
              className="w-full min-h-11 px-3 py-2 text-base font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-400"
            />
          </div>

          <button
            type="submit"
            disabled={isValidating || !manualCode.trim()}
            className="w-full min-h-11 px-4 py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 touch-manipulation select-none"
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Validate Code</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Loading Indicator for Camera Scans */}
      {isValidating && activeTab === "camera" && (
        <div
          role="status"
          aria-live="polite"
          className="min-h-11 flex items-center justify-center gap-2 border border-neutral-300 rounded p-3 text-xs font-semibold text-neutral-900"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verifying card in database...</span>
        </div>
      )}

      {/* Error Message Box */}
      {errorMessage && (
        <div
          role="alert"
          className="border border-neutral-900 rounded p-3 flex items-start gap-2.5 text-xs text-neutral-900"
        >
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold uppercase tracking-wide">Validation Notice</p>
            <p className="text-neutral-700">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Validation Result Telemetry */}
      {result && result.card && (
        <div className="space-y-4 border border-neutral-300 rounded-lg p-4">
          {/* Card Status Banner */}
          <div className="border border-neutral-900 rounded p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
              <div className="flex items-center gap-2">
                {result.card.status === "ACTIVATED" ? (
                  <ShieldCheck className="w-5 h-5 text-neutral-900" />
                ) : result.card.status === "GENERATED" ? (
                  <Clock className="w-5 h-5 text-neutral-900" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-neutral-900" />
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                    Card Serial: {result.card.cardSerial}
                  </p>
                  <p className="font-mono text-[11px] text-neutral-600 truncate max-w-[260px]">
                    {result.card.masterQrHash}
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-bold uppercase border border-neutral-900 px-2 py-0.5 rounded text-neutral-900">
                {result.card.status}
              </span>
            </div>

            <div className="text-xs text-neutral-700 space-y-1">
              {result.card.status === "ACTIVATED" && (
                <p>
                  This card has been sold and activated for voting. Attendee details and
                  stub redemption records are confirmed below.
                </p>
              )}
              {result.card.status === "GENERATED" && (
                <p>
                  This card is printed but unsold (unregistered). It cannot be used to cast
                  votes until activated at the registration desk.
                </p>
              )}
              {result.card.status === "VOID" && (
                <p>
                  This card was invalidated by event administration. None of its attached stubs
                  can be redeemed.
                </p>
              )}
              {result.card.batchNumber !== null && (
                <p className="font-mono text-[11px] text-neutral-600">
                  Print Batch #{result.card.batchNumber}
                </p>
              )}
            </div>
          </div>

          {/* Sanitized Demographics Section */}
          <div className="border border-neutral-300 rounded p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-neutral-900" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Attendee Demographics
                </h3>
              </div>
              {result.demographics && (
                <span className="font-mono text-[11px] border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
                  {result.demographics.buyerTypeLabel}
                </span>
              )}
            </div>

            {result.demographics ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-neutral-500 block text-[11px] uppercase tracking-wide">
                    Attendee Name
                  </span>
                  <span className="font-bold text-neutral-900">
                    {result.demographics.buyerName}
                  </span>
                </div>

                {result.demographics.academicAffiliation && (
                  <div>
                    <span className="text-neutral-500 block text-[11px] uppercase tracking-wide">
                      Academic Affiliation
                    </span>
                    <span className="font-mono text-neutral-900">
                      {result.demographics.academicAffiliation}
                    </span>
                  </div>
                )}

                {result.demographics.studentNumber && (
                  <div>
                    <span className="text-neutral-500 block text-[11px] uppercase tracking-wide">
                      Student ID
                    </span>
                    <span className="font-mono text-neutral-900">
                      {result.demographics.studentNumber}
                    </span>
                  </div>
                )}

                {result.demographics.registeredAt && (
                  <div>
                    <span className="text-neutral-500 block text-[11px] uppercase tracking-wide">
                      Registration Date
                    </span>
                    <span className="font-mono text-neutral-900">
                      {new Date(result.demographics.registeredAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-600 italic">
                No attendee is registered to this card.
              </p>
            )}
          </div>

          {/* Stubs Summary Bar */}
          {result.stubsSummary && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="border border-neutral-300 rounded p-2">
                <span className="text-neutral-500 block text-[11px] uppercase">Total Stubs</span>
                <span className="font-bold text-base text-neutral-900">
                  {result.stubsSummary.total}
                </span>
              </div>
              <div className="border border-neutral-300 rounded p-2">
                <span className="text-neutral-500 block text-[11px] uppercase">Redeemed</span>
                <span className="font-bold text-base text-neutral-900">
                  {result.stubsSummary.redeemed}
                </span>
              </div>
              <div className="border border-neutral-300 rounded p-2">
                <span className="text-neutral-500 block text-[11px] uppercase">Available</span>
                <span className="font-bold text-base text-neutral-900">
                  {result.stubsSummary.available}
                </span>
              </div>
            </div>
          )}

          {/* 6 Detachable Award Stubs Breakdown */}
          {result.stubs && result.stubs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-1.5">
                <Ticket className="w-4 h-4 text-neutral-900" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Voting Stubs Telemetry (Slots 1 to 6)
                </h3>
              </div>

              <div className="space-y-2">
                {result.stubs.map((stub) => (
                  <div
                    key={stub.slotNumber}
                    className="border border-neutral-300 rounded p-3 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold border border-neutral-900 rounded px-1.5 py-0.5 text-neutral-900">
                          S{stub.slotNumber}
                        </span>
                        <span className="text-xs font-bold text-neutral-900">
                          {stub.awardTitle}
                        </span>
                      </div>

                      <span className="font-mono text-[11px] uppercase border border-neutral-300 px-2 py-0.5 rounded text-neutral-900 font-bold">
                        {stub.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-neutral-600 gap-2">
                      <span className="font-mono">{stub.stubSerial}</span>

                      {stub.status === "REDEEMED" && stub.votedBooth && (
                        <div className="flex items-center gap-1.5 text-neutral-900 font-medium">
                          <Vote className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            Voted: {stub.votedBooth.code} ({stub.votedBooth.projectTitle})
                          </span>
                        </div>
                      )}

                      {stub.status === "ACTIVATED" && (
                        <span className="text-neutral-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-neutral-900" />
                          <span>Available to vote</span>
                        </span>
                      )}

                      {stub.status === "INACTIVE" && (
                        <span className="text-neutral-500 italic">Unsold (inactive)</span>
                      )}

                      {stub.status === "VOID" && (
                        <span className="text-neutral-500 italic">Deactivated</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reset / Validate Another Button */}
          <button
            type="button"
            onClick={handleReset}
            className="w-full min-h-11 px-4 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center justify-center gap-2 transition-colors touch-manipulation select-none"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Validate Another Card</span>
          </button>
        </div>
      )}
    </div>
  );
}
