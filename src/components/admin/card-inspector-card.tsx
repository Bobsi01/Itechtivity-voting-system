"use client";

import { useEffect, useState } from "react";
import { Search, ShieldAlert, RotateCcw, FileCheck2, User, UserCheck, TicketCheck, CheckCircle2, CircleDashed, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatBuyerType, formatProgramYearSection } from "@/lib/utils/format";

interface InspectedStubRecord {
  id: string;
  slotNumber: number;
  stubSerial: string;
  status: "INACTIVE" | "ACTIVATED" | "REDEEMED";
  award: {
    slotNumber: number;
    title: string;
  } | null;
  vote: {
    id: string;
    scannedAt: string;
    booth: {
      code: string;
      projectTitle: string;
      capstoneCategory?: string | null;
      tableNumber?: string | null;
    };
    scannedByUser?: {
      id: string;
      fullName: string;
      email: string;
    } | null;
  } | null;
}

interface InspectedCardRecord {
  id: string;
  cardSerial: string;
  masterQrHash: string;
  status: "GENERATED" | "ACTIVATED" | "VOID";
  activatedAt: string | null;
  createdAt: string;
  transaction: {
    id: string;
    buyerName: string;
    buyerType: string;
    studentNumber: string | null;
    program: string | null;
    yearAndSection: string | null;
    affiliation?: string | null;
    contactInfo?: string | null;
    createdAt: string;
    processedByUser?: {
      id: string;
      fullName: string;
      email: string;
      role: string;
    } | null;
  } | null;
  pdfBatch: {
    batchNumber: number;
    fileName: string;
  } | null;
  stubs: InspectedStubRecord[];
}

interface CardInspectorCardProps {
  selectedSerial?: string | null;
  onClearSelectedSerial?: () => void;
}

export function CardInspectorCard({ selectedSerial, onClearSelectedSerial }: CardInspectorCardProps) {

  const [lookupError, setLookupError] = useState<string | null>(null);
  const [serialQuery, setSerialQuery] = useState<string>("");
  const [inspectedCard, setInspectedCard] = useState<InspectedCardRecord | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);

  const fetchCardBySerial = async (targetSerial: string) => {

    const trimmed = targetSerial.trim();
    if (!trimmed) {
      toast.error("Enter a card serial or Master QR code to inspect.");
      return;
    }

    setLookupError(null);
    setInspectedCard(null);
    setIsSearching(true);

    try {
      const res = await fetch(`/api/admin/cards?serial=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setInspectedCard(data.card);
      } else {
        const errorMsg = data.error === "CARD_NOT_FOUND" 
          ? "Card serial not found. Check the printed serial number and retry." 
          : "Card inspection failed. Please retry.";
        setLookupError(errorMsg);
        setInspectedCard(null);
        toast.error(data.error === "CARD_NOT_FOUND" ? "Card serial not found." : data.error || "Lookup failed.");
      }
    } catch (err) {
      console.warn("Failed to inspect card serial:", err);
      setLookupError("Network error while inspecting card serial.");
      toast.error("Network error while inspecting card serial.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {

    if (selectedSerial && selectedSerial.trim()) {
      setSerialQuery(selectedSerial.trim().toUpperCase());
      fetchCardBySerial(selectedSerial.trim().toUpperCase());
      if (onClearSelectedSerial) {
        onClearSelectedSerial();
      }
    }
  }, [selectedSerial, onClearSelectedSerial]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = e.currentTarget.querySelector('input[aria-label="Inspect Card Serial"]') as HTMLInputElement | null;
    const query = inputEl?.value?.trim() || serialQuery.trim();
    if (query && query !== serialQuery) {
      setSerialQuery(query);
    }
    fetchCardBySerial(query);
  };

  const handleToggleCardVoidStatus = async (action: "VOID" | "RESTORE") => {

    if (!inspectedCard) return;
    setIsMutating(true);

    try {
      const res = await fetch("/api/admin/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: inspectedCard.id,
          action,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(
          action === "VOID"
            ? `Card ${inspectedCard.cardSerial} marked as VOID. Unredeemed stubs deactivated.`
            : `Card ${inspectedCard.cardSerial} restored to ${data.card.status}.`
        );
        await fetchCardBySerial(inspectedCard.cardSerial);
      } else {
        toast.error(data.error || "Failed to update card status.");
      }
    } catch (err) {
      console.warn("Failed to mutate card status:", err);
      toast.error("Network error while updating card status.");
    } finally {
      setIsMutating(false);
    }
  };

  const redeemedCount = inspectedCard ? inspectedCard.stubs.filter((s) => s.status === "REDEEMED").length : 0;

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="border-b border-neutral-300 pb-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5 text-neutral-900" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
            Individual Card Inspection
          </h2>
        </div>
        <p className="text-xs text-neutral-600 mt-0.5">
          Verify purchaser details, registration clerk, and 6-slot vote redemption status.
        </p>
      </div>

      {/* Card Search Form */}
      <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={serialQuery}
          onChange={(e) => setSerialQuery(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          placeholder="Enter Card Serial (e.g. B27-B01-0001)"
          aria-label="Inspect Card Serial"
          className="flex-1 px-3 py-2 text-base font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="flex items-center justify-center gap-1.5 px-4 py-2 border border-neutral-900 text-neutral-900 hover:border-neutral-950 rounded text-xs font-semibold transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <Search className="w-4 h-4" />
          <span>{isSearching ? "Inspecting..." : "Inspect Card"}</span>
        </button>
      </form>

      {lookupError && (
        <div role="alert" className="flex items-center gap-2 text-sm font-medium text-neutral-900 border border-neutral-300 p-3 rounded bg-white">
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <span>{lookupError}</span>
        </div>
      )}

      {/* Inspected Card Details */}
      {inspectedCard && (
        <div className="space-y-4">
          {/* Top Bar: Card Serial & Status */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-neutral-300 rounded p-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-bold text-neutral-900 select-text">
                  {inspectedCard.cardSerial}
                </span>
                <span className="font-mono text-xs font-bold uppercase border border-neutral-900 px-2 py-0.5 rounded text-neutral-900">
                  Status: {inspectedCard.status}
                </span>
                {inspectedCard.pdfBatch && (
                  <span className="font-mono text-xs text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded">
                    Batch #{inspectedCard.pdfBatch.batchNumber}
                  </span>
                )}
                <span className="font-mono text-xs font-semibold text-neutral-800 border border-neutral-300 px-2 py-0.5 rounded">
                  {redeemedCount} / 6 Voted
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-600 truncate">
                Hash: {inspectedCard.masterQrHash}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {inspectedCard.status !== "VOID" ? (
                <button
                  type="button"
                  onClick={() => handleToggleCardVoidStatus("VOID")}
                  disabled={isMutating}
                  className="flex items-center gap-1.5 px-3 py-2 border border-neutral-900 rounded text-xs font-semibold text-neutral-900 hover:border-neutral-700 transition-colors min-h-[44px]"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Void Card</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleCardVoidStatus("RESTORE")}
                  disabled={isMutating}
                  className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restore Card</span>
                </button>
              )}
            </div>
          </div>

          {/* Section 1: Who Bought the Card */}
          <div className="border border-neutral-300 rounded p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-neutral-900" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Who Bought the Card (Buyer Demographics)
                </h3>
              </div>
              {inspectedCard.transaction && (
                <span className="font-mono text-xs border border-neutral-300 px-2 py-0.5 rounded text-neutral-800">
                  {formatBuyerType(inspectedCard.transaction.buyerType)}
                </span>
              )}
            </div>

            {inspectedCard.transaction ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Full Name</span>
                  <span className="font-bold text-neutral-900 text-sm select-text">
                    {inspectedCard.transaction.buyerName}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Student Number</span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.studentNumber || "N/A (Non-student or guest)"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Degree Program & Section</span>
                  <span className="font-medium text-neutral-900 select-text">
                    {formatProgramYearSection(inspectedCard.transaction.program, inspectedCard.transaction.yearAndSection)}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Affiliation</span>
                  <span className="text-neutral-900 select-text">
                    {inspectedCard.transaction.affiliation || "N/A"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Contact Info</span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.contactInfo || "N/A"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Registered / Bound At</span>
                  <span className="font-mono text-neutral-900 select-text">
                    {new Date(inspectedCard.transaction.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-neutral-300 p-3 rounded text-center">
                <p className="text-xs font-mono text-neutral-600">
                  Unsold / Unbound Card — Has not been registered or bound to a buyer yet.
                </p>
              </div>
            )}
          </div>

          {/* Section 2: Who Sold the Card */}
          <div className="border border-neutral-300 rounded p-4 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-2">
              <UserCheck className="w-4 h-4 text-neutral-900" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                Who Sold / Issued the Card
              </h3>
            </div>

            {inspectedCard.transaction?.processedByUser ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Clerk / Seller Name</span>
                  <span className="font-bold text-neutral-900 text-sm select-text">
                    {inspectedCard.transaction.processedByUser.fullName}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">System Role</span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.processedByUser.role}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Clerk Email</span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.processedByUser.email}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">Transaction ID</span>
                  <span className="font-mono text-xs text-neutral-800 truncate block select-text">
                    {inspectedCard.transaction.id}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-neutral-300 p-3 rounded text-center">
                <p className="text-xs font-mono text-neutral-600">
                  Unissued — Card has not been sold or processed by any desk clerk.
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Which is Voted (6 Detachable Voting Stubs Breakdown) */}
          <div className="border border-neutral-300 rounded p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
              <div className="flex items-center gap-1.5">
                <TicketCheck className="w-4 h-4 text-neutral-900" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                  Which is Voted (6 Award Slots)
                </h3>
              </div>
              <span className="font-mono text-xs font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900">
                {redeemedCount} of 6 Redeemed
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {inspectedCard.stubs.map((stub) => {
                const isRedeemed = stub.status === "REDEEMED";
                const isActivated = stub.status === "ACTIVATED";

                return (
                  <div
                    key={stub.id}
                    className="border border-neutral-300 p-3 rounded flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        {isRedeemed ? (
                          <CheckCircle2 className="w-4 h-4 text-neutral-900" />
                        ) : (
                          <CircleDashed className="w-4 h-4 text-neutral-400" />
                        )}
                        <span className="font-mono text-xs font-bold text-neutral-900 select-text">
                          Slot {stub.slotNumber}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold uppercase border border-neutral-300 px-1.5 py-0.5 rounded text-neutral-800 select-text">
                        {isRedeemed ? "VOTED" : isActivated ? "READY TO VOTE" : "INACTIVE"}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-neutral-900 select-text">
                        {stub.award?.title || `Award Slot ${stub.slotNumber}`}
                      </p>
                      <p className="text-xs font-mono text-neutral-500 select-text">
                        Serial: {stub.stubSerial}
                      </p>
                    </div>

                    {isRedeemed && stub.vote ? (
                      <div className="border-t border-neutral-200 pt-2 space-y-1 text-xs">
                        <div className="font-mono text-neutral-900 select-text">
                          <span className="font-bold text-neutral-900">Voted For: </span>
                          <span className="font-bold border border-neutral-900 px-1 py-0.2 rounded mr-1">
                            {stub.vote.booth.code}
                          </span>
                          <span>{stub.vote.booth.projectTitle}</span>
                        </div>
                        {stub.vote.booth.capstoneCategory && (
                          <p className="text-neutral-600 select-text">
                            Category: {stub.vote.booth.capstoneCategory}
                          </p>
                        )}
                        <p className="font-mono text-neutral-500 select-text">
                          Scanned: {new Date(stub.vote.scannedAt).toLocaleString()}
                          {stub.vote.scannedByUser && ` by ${stub.vote.scannedByUser.fullName}`}
                        </p>
                      </div>
                    ) : isActivated ? (
                      <p className="text-xs font-mono text-neutral-600 border-t border-neutral-100 pt-1.5">
                        Ready to vote (Attendee has not cast this vote stub yet)
                      </p>
                    ) : (
                      <p className="text-xs font-mono text-neutral-400 border-t border-neutral-100 pt-1.5">
                        Inactive (Card unactivated or marked void)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
