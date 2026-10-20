"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ShieldAlert,
  RotateCcw,
  FileCheck2,
  User,
  UserCheck,
  TicketCheck,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  Maximize2,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  CARD_WIDTH_PT,
  CARD_HEIGHT_PT,
  getCardInternalLayout,
} from "@/lib/pdf/a4-geometry";
import { getBoothCode } from "@/lib/pdf/booth-grid";
import { formatBuyerType, formatProgramYearSection } from "@/lib/utils/format";

interface InspectedStubRecord {
  id: string;
  slotNumber: number;
  stubSerial: string;
  status: "INACTIVE" | "ACTIVATED" | "REDEEMED" | "VOID";
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

export interface AwardSlotMeta {
  slotNumber: number;
  title: string;
}

interface CardInspectorCardProps {
  selectedSerial?: string | null;
  onClearSelectedSerial?: () => void;
  onCardInspected?: (serial: string) => void;
  defaultAwards?: AwardSlotMeta[];
}

const DEFAULT_AWARD_SLOTS: AwardSlotMeta[] = [
  { slotNumber: 1, title: "PEOPLE'S CHOICE" },
  { slotNumber: 2, title: "DREAM TEAM" },
  { slotNumber: 3, title: "MOST AESTHETIC BOOTH" },
  { slotNumber: 4, title: "BEST INTERACTIVE DEMONSTRATION" },
  { slotNumber: 5, title: "BEST SOFTWARE PRODUCT" },
  { slotNumber: 6, title: "BEST INNOVATION" },
];

/**
 * Generates an SVG path string positioned at (x, y) with the exact PDFKit vector QR size.
 */
function buildVectorQrSvgElements(text: string, x: number, y: number, size: number): string {

  try {
    const qr = QRCode.create(text || "ITECH2027", { errorCorrectionLevel: "M" });
    const modules = qr.modules;
    const count = modules.size;
    const cellSize = size / count;
    const segments: string[] = [];

    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (modules.get(r, c)) {
          const rx = (x + c * cellSize).toFixed(2);
          const ry = (y + r * cellSize).toFixed(2);
          const rw = cellSize.toFixed(2);
          segments.push(`M${rx},${ry}h${rw}v${rw}h-${rw}z`);
        }
      }
    }

    return segments.join("");
  } catch {
    return "";
  }
}

/**
 * Wraps an uppercase award title into lines that fit within a 45pt stub column,
 * matching PDFKit's text wrapping inside renderSingleCardQuadrant.
 */
function wrapAwardTitleLines(title: string, maxCharsPerLine = 12): string[] {

  const words = title.trim().toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 4);
}

interface SingleBingoCardTemplatePreviewProps {
  card: InspectedCardRecord | null;
  defaultAwards: AwardSlotMeta[];
  maxWidthClass?: string;
}

/**
 * Exact 1:1 vector replica of renderSingleCardQuadrant from src/lib/pdf/a4-sheet-renderer.ts
 * using identical PDF point geometry (283.24pt x 406.545pt).
 */
function SingleBingoCardTemplatePreview({
  card,
  defaultAwards,
  maxWidthClass = "max-w-[330px]",
}: SingleBingoCardTemplatePreviewProps) {

  const displaySerial = card ? card.cardSerial : "B27-B01-0001";
  const width = CARD_WIDTH_PT;
  const height = CARD_HEIGHT_PT;
  const internal = getCardInternalLayout(0);

  const ownerNameValue = useMemo(() => {
    if (!card?.transaction?.buyerName) return null;
    return card.transaction.buyerName;
  }, [card]);

  const ownerProgramYearSecValue = useMemo(() => {
    if (!card?.transaction) return null;
    const formatted = formatProgramYearSection(
      card.transaction.program,
      card.transaction.yearAndSection
    );
    if (formatted !== "N/A") {
      return formatted;
    }
    if (card.transaction.affiliation) {
      return card.transaction.affiliation;
    }
    return formatBuyerType(card.transaction.buyerType);
  }, [card]);

  const votedBoothMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!card) return map;
    for (const stub of card.stubs) {
      if (stub.status === "REDEEMED" && stub.vote?.booth?.code) {
        map.set(stub.vote.booth.code.toUpperCase(), stub.slotNumber);
      }
    }
    return map;
  }, [card]);

  const previewStubs = useMemo(() => {
    if (card && card.stubs.length > 0) {
      return card.stubs.map((stub) => ({
        slotNumber: stub.slotNumber,
        stubSerial: stub.stubSerial,
        awardTitle: stub.award?.title || `Award Slot ${stub.slotNumber}`,
        status: stub.status,
        votedBoothCode: stub.vote?.booth?.code || null,
      }));
    }

    const awardsSource = defaultAwards.length > 0 ? defaultAwards : DEFAULT_AWARD_SLOTS;
    return awardsSource.slice(0, 6).map((award) => ({
      slotNumber: award.slotNumber,
      stubSerial: `${displaySerial}-S${award.slotNumber}`,
      awardTitle: award.title,
      status: "INACTIVE" as const,
      votedBoothCode: null,
    }));
  }, [card, defaultAwards, displaySerial]);

  // Grid geometry matching a4-sheet-renderer.ts (8x7 Grid, 52 booths)
  const gridX = 3;
  const gridY = internal.headerHeight; // 42
  const gridW = width - 6; // 277.24
  const gridH = internal.gridHeight; // 240
  const cols = 8;
  const rows = 7;
  const cellW = gridW / cols;
  const cellH = gridH / rows;

  const masterX = gridX + 3 * cellW;
  const masterY = gridY + 2 * cellH;
  const masterW = cellW * 2;
  const masterH = cellH * 2;
  const masterQrSize = 44.5;
  const masterQrX = masterX + (masterW - masterQrSize) / 2;
  const masterQrY = masterY + 2.5 + 10.5;
  const masterQrPath = useMemo(
    () =>
      buildVectorQrSvgElements(
        `MASTER:${displaySerial}`,
        masterQrX,
        masterQrY,
        masterQrSize
      ),
    [displaySerial, masterQrX, masterQrY, masterQrSize]
  );

  // Demographic & Stub geometry matching a4-sheet-renderer.ts lines 209-279
  const demoY = gridY + gridH + 10.5;
  const perfY = internal.perforationY; // 300
  const stubY = perfY + 1;
  const stubH = internal.stubHeight - 2;
  const stubW = internal.stubWidth;

  return (
    <div
      aria-label="Bingo Card Print Template Preview"
      className={`${maxWidthClass} mx-auto w-full select-text`}
    >
      {/* Accessible hidden summary for screen readers & DOM text assertions */}
      <div
        aria-label="Card Owner Name and Program Year Section"
        className="sr-only"
      >
        <span>Name:{ownerNameValue || "______________________"}</span>
        <span>Program/Yr/Sec:{ownerProgramYearSecValue || "________________"}</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block bg-white shadow-sm"
        role="img"
        aria-label={`Printed Bingo Card Preview #${displaySerial}`}
      >
        {/* Page background */}
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" />

        {/* 1. Outer Card Border */}
        <rect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          fill="none"
          stroke="#000000"
          strokeWidth={0.75}
        />

        {/* 2. Header Section (~42pt) */}
        <line x1={4} y1={5} x2={width - 4} y2={5} stroke="#666666" strokeWidth={0.5} />
        <line x1={4} y1={8} x2={40} y2={8} stroke="#666666" strokeWidth={0.5} />
        <line x1={width - 40} y1={8} x2={width - 4} y2={8} stroke="#666666" strokeWidth={0.5} />

        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          fill="#000000"
          fontSize={11}
          fontWeight={700}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          ITECHTIVITY 2027
        </text>

        <text
          x={width / 2}
          y={29.5}
          textAnchor="middle"
          fill="#333333"
          fontSize={6}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          UNIVERSITY OF CALOOCAN CITY - CSD CAPSTONE
        </text>

        <text
          x={width / 2}
          y={38.5}
          textAnchor="middle"
          fill="#000000"
          fontSize={6.5}
          fontWeight={700}
          fontFamily="Courier New, Courier, monospace"
        >
          {`CARD SERIAL: #${displaySerial}`}
        </text>

        {/* 3. Interactive Bingo Grid (8 cols x 7 rows = 56 cells, 52 booths + 4-cell Master QR) */}
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const cx = gridX + c * cellW;
            const cy = gridY + r * cellH;
            const isCenterBlock = (c === 3 || c === 4) && (r === 2 || r === 3);

            if (isCenterBlock) {
              if (r === 2 && c === 3) {
                return (
                  <g key={`master-${r}-${c}`}>
                    <rect
                      x={cx + 0.5}
                      y={cy + 0.5}
                      width={masterW - 1}
                      height={masterH - 1}
                      fill="#ffffff"
                      stroke="#000000"
                      strokeWidth={0.65}
                    />
                    <text
                      x={masterX + masterW / 2}
                      y={masterY + 9}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize={7.8}
                      fontWeight={700}
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      CSD
                    </text>
                    <path d={masterQrPath} fill="#000000" shapeRendering="crispEdges" />
                    <text
                      x={masterX + masterW / 2}
                      y={masterQrY + masterQrSize + 6.5}
                      textAnchor="middle"
                      fill="#000000"
                      fontSize={4.8}
                      fontWeight={700}
                      fontFamily="Courier New, Courier, monospace"
                    >
                      {`#${displaySerial}`}
                    </text>
                  </g>
                );
              }
              return null;
            }

            const boothCode = getBoothCode(r, c);
            if (!boothCode) return null;
            const votedSlot = votedBoothMap.get(boothCode.toUpperCase());

            return (
              <g key={`cell-${r}-${c}`}>
                <rect
                  x={cx + 0.5}
                  y={cy + 0.5}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill="#ffffff"
                  stroke="#888888"
                  strokeWidth={0.35}
                />
                <text
                  x={cx + cellW / 2}
                  y={cy + 7.5}
                  textAnchor="middle"
                  fill="#000000"
                  fontSize={5.5}
                  fontWeight={700}
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {boothCode}
                </text>
                <rect
                  x={cx + 3}
                  y={cy + 9.5}
                  width={cellW - 6}
                  height={cellH - 12.5}
                  fill="none"
                  stroke={votedSlot ? "#000000" : "#bbbbbb"}
                  strokeWidth={votedSlot ? 0.6 : 0.25}
                />
                <text
                  x={cx + cellW / 2}
                  y={cy + 19.5}
                  textAnchor="middle"
                  fill={votedSlot ? "#000000" : "#666666"}
                  fontSize={votedSlot ? 4.8 : 4.5}
                  fontWeight={votedSlot ? 700 : 400}
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {votedSlot ? `S${votedSlot} VOTED` : "STAMP"}
                </text>
              </g>
            );
          })
        )}

        {/* 4. Demographic Info Line (Name & Program/Yr/Sec on Printed Card) */}
        <text
          x={5}
          y={demoY}
          fill="#000000"
          fontSize={6}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          Name:
        </text>
        <line
          x1={25}
          y1={demoY + 1.2}
          x2={width / 2 - 6}
          y2={demoY + 1.2}
          stroke="#000000"
          strokeWidth={0.45}
        />
        {ownerNameValue && (
          <text
            x={27}
            y={demoY - 0.5}
            fill="#000000"
            fontSize={5.8}
            fontWeight={700}
            fontFamily="Courier New, Courier, monospace"
          >
            {ownerNameValue.length > 23 ? `${ownerNameValue.slice(0, 22)}...` : ownerNameValue}
          </text>
        )}

        <text
          x={width / 2}
          y={demoY}
          fill="#000000"
          fontSize={6}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          Program/Yr/Sec:
        </text>
        <line
          x1={width / 2 + 48}
          y1={demoY + 1.2}
          x2={width - 5}
          y2={demoY + 1.2}
          stroke="#000000"
          strokeWidth={0.45}
        />
        {ownerProgramYearSecValue && (
          <text
            x={width / 2 + 50}
            y={demoY - 0.5}
            fill="#000000"
            fontSize={5.8}
            fontWeight={700}
            fontFamily="Courier New, Courier, monospace"
          >
            {ownerProgramYearSecValue.length > 16
              ? `${ownerProgramYearSecValue.slice(0, 15)}...`
              : ownerProgramYearSecValue}
          </text>
        )}

        {/* 5. Perforation Cut Guideline */}
        <line
          x1={1}
          y1={perfY}
          x2={width - 1}
          y2={perfY}
          stroke="#000000"
          strokeWidth={0.6}
          strokeDasharray="3,2"
        />

        {/* 6. Detachable Voting Stubs (6 vertical columns) */}
        {previewStubs.map((stub, s) => {
          const sx = s * stubW;
          const qrSize = 32;
          const qrX = sx + (stubW - qrSize) / 2;
          const qrY = stubY + 3;
          const qrPath = buildVectorQrSvgElements(stub.stubSerial, qrX, qrY, qrSize);
          const titleLines = wrapAwardTitleLines(stub.awardTitle, 12);
          const isRedeemed = stub.status === "REDEEMED";
          const isVoid = stub.status === "VOID";

          return (
            <g key={stub.slotNumber}>
              {s > 0 && (
                <line
                  x1={sx}
                  y1={stubY}
                  x2={sx}
                  y2={stubY + stubH}
                  stroke="#555555"
                  strokeWidth={0.4}
                  strokeDasharray="2,2"
                />
              )}

              <path d={qrPath} fill="#000000" shapeRendering="crispEdges" />

              <text
                x={sx + stubW / 2}
                y={qrY + qrSize + 5.5}
                textAnchor="middle"
                fill="#000000"
                fontSize={4.0}
                fontWeight={700}
                fontFamily="Courier New, Courier, monospace"
              >
                {`#${stub.stubSerial}`}
              </text>

              <text
                x={sx + stubW / 2}
                y={qrY + qrSize + 15}
                textAnchor="middle"
                fill="#000000"
                fontSize={4.8}
                fontWeight={700}
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {`SLOT ${stub.slotNumber}`}
              </text>

              {titleLines.map((line, lineIdx) => (
                <text
                  key={lineIdx}
                  x={sx + stubW / 2}
                  y={qrY + qrSize + 21.5 + lineIdx * 5}
                  textAnchor="middle"
                  fill="#222222"
                  fontSize={4.2}
                  fontWeight={700}
                  fontFamily="Helvetica, Arial, sans-serif"
                >
                  {line}
                </text>
              ))}

              <text
                x={sx + stubW / 2}
                y={stubY + stubH - 5}
                textAnchor="middle"
                fill={isRedeemed ? "#000000" : isVoid ? "#777777" : "#bbbbbb"}
                fontSize={isRedeemed ? 5.5 : 7}
                fontWeight={700}
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {isRedeemed ? stub.votedBoothCode || "VOTED" : isVoid ? "VOID" : "VOTE"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CardInspectorCard({
  selectedSerial,
  onClearSelectedSerial,
  onCardInspected,
  defaultAwards = DEFAULT_AWARD_SLOTS,
}: CardInspectorCardProps) {

  const [lookupError, setLookupError] = useState<string | null>(null);
  const [serialQuery, setSerialQuery] = useState<string>("");
  const [inspectedCard, setInspectedCard] = useState<InspectedCardRecord | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState<boolean>(false);
  const [isPreviewExpandedModalOpen, setIsPreviewExpandedModalOpen] = useState<boolean>(false);

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
        if (onCardInspected && data.card?.cardSerial) {
          onCardInspected(data.card.cardSerial);
        }
      } else {
        const errorMsg =
          data.error === "CARD_NOT_FOUND"
            ? "Card serial not found. Check the printed serial number and retry."
            : "Card inspection failed. Please retry.";
        setLookupError(errorMsg);
        setInspectedCard(null);
        toast.error(
          data.error === "CARD_NOT_FOUND" ? "Card serial not found." : data.error || "Lookup failed."
        );
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
      const normalized = selectedSerial.trim().toUpperCase();
      setSerialQuery(normalized);
      fetchCardBySerial(normalized);
      if (onClearSelectedSerial) {
        onClearSelectedSerial();
      }
    }
  }, [selectedSerial, onClearSelectedSerial]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = e.currentTarget.querySelector(
      'input[aria-label="Inspect Card Serial"]'
    ) as HTMLInputElement | null;
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

  const redeemedCount = inspectedCard
    ? inspectedCard.stubs.filter((s) => s.status === "REDEEMED").length
    : 0;

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-300 pb-3">
        <div>
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

        <button
          type="button"
          onClick={() => setIsPreviewExpandedModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none flex-shrink-0"
        >
          <Maximize2 className="w-4 h-4" />
          <span>Expand Card Preview</span>
        </button>
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
          className="flex items-center justify-center gap-1.5 px-4 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors disabled:opacity-50 min-h-[44px] touch-manipulation select-none"
        >
          <Search className="w-4 h-4" />
          <span>{isSearching ? "Inspecting..." : "Inspect Card"}</span>
        </button>
      </form>

      {lookupError && (
        <div
          role="alert"
          className="flex items-center gap-2 text-sm font-medium text-neutral-900 border border-neutral-300 p-3 rounded bg-white"
        >
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <span>{lookupError}</span>
        </div>
      )}

      {/* Inspected Card Top Control Bar */}
      {inspectedCard && (
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
                onClick={() => setShowVoidConfirm(true)}
                disabled={isMutating}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-900 text-neutral-900 bg-white hover:bg-neutral-900 hover:text-white rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Void Card</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleToggleCardVoidStatus("RESTORE")}
                disabled={isMutating}
                className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restore Card</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Exact 1:1 PDF-Geometry Bingo Card Preview (Scaled down to fit cleanly) */}
      <div className="py-1">
        <SingleBingoCardTemplatePreview
          card={inspectedCard}
          defaultAwards={defaultAwards}
          maxWidthClass="max-w-[330px]"
        />
      </div>

      {/* Inspected Card Detailed Telemetry Sections */}
      {inspectedCard && (
        <div className="space-y-4">
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
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Full Name
                  </span>
                  <span className="font-bold text-neutral-900 text-sm select-text">
                    {inspectedCard.transaction.buyerName}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Student Number
                  </span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.studentNumber || "N/A (Non-student or guest)"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Degree Program & Section
                  </span>
                  <span className="font-medium text-neutral-900 select-text">
                    {formatProgramYearSection(
                      inspectedCard.transaction.program,
                      inspectedCard.transaction.yearAndSection
                    )}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Affiliation
                  </span>
                  <span className="text-neutral-900 select-text">
                    {inspectedCard.transaction.affiliation || "N/A"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Contact Info
                  </span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.contactInfo || "N/A"}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Registered / Bound At
                  </span>
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
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Clerk / Seller Name
                  </span>
                  <span className="font-bold text-neutral-900 text-sm select-text">
                    {inspectedCard.transaction.processedByUser.fullName}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    System Role
                  </span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.processedByUser.role}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Clerk Email
                  </span>
                  <span className="font-mono text-neutral-900 select-text">
                    {inspectedCard.transaction.processedByUser.email}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 uppercase tracking-wider block font-mono">
                    Transaction ID
                  </span>
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

      {/* Expanded Card Preview Modal */}
      {isPreviewExpandedModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded Bingo Card Print Preview"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60"
        >
          <div className="bg-white border-2 border-neutral-900 rounded-lg max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-neutral-300 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  Bingo Card Print Preview
                </h3>
                <p className="text-xs font-mono text-neutral-600">
                  {inspectedCard
                    ? `Card #${inspectedCard.cardSerial} — ${
                        inspectedCard.transaction?.buyerName || "Unbound"
                      }`
                    : "1-Card A4 Quadrant Print Template"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewExpandedModalOpen(false)}
                aria-label="Close card preview modal"
                className="flex items-center justify-center gap-1 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] min-w-[44px] touch-manipulation select-none"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>

            <div className="p-3 sm:p-5 overflow-y-auto flex-1">
              <SingleBingoCardTemplatePreview
                card={inspectedCard}
                defaultAwards={defaultAwards}
                maxWidthClass="max-w-[400px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Void Card Confirmation Modal */}
      {showVoidConfirm && inspectedCard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="void-card-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="bg-white border border-neutral-300 rounded-lg max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3
              id="void-card-dialog-title"
              className="text-base font-bold text-neutral-900 uppercase"
            >
              Void Bingo Card?
            </h3>
            <p className="text-xs text-neutral-600 leading-relaxed font-mono">
              Are you sure you want to void card{" "}
              <strong className="text-neutral-900 font-bold">{inspectedCard.cardSerial}</strong>? All
              unredeemed stubs will be deactivated immediately.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowVoidConfirm(false)}
                className="px-4 py-2 border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowVoidConfirm(false);
                  handleToggleCardVoidStatus("VOID");
                }}
                disabled={isMutating}
                className="px-4 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded text-xs font-bold uppercase tracking-wider transition-colors min-h-[44px] touch-manipulation select-none disabled:opacity-50"
              >
                Confirm Void Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
