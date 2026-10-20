"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { UserCheck, QrCode, Plus, Trash2, CheckCircle2, ArrowRight, History, RefreshCw, Camera, ImageUp, X, Eye, FileText, Layers, Search, AlertTriangle } from "lucide-react";
import { QrScanner } from "@/components/ui/qr-scanner";
import { decodeQrImage } from "@/lib/scanner/decode-image";
import { toast } from "sonner";
import { SearchableProgramPicker, type ProgramOption } from "@/components/ui/searchable-program-picker";
import { SimpleSelect, type SimpleSelectOption } from "@/components/ui/simple-select";
import { formatProgramYearSection } from "@/lib/utils/format";
import {
  subscribeToRegistrationEvents,
  subscribeToSystemConfigEvents,
  createResilientPoller,
  createEventDeduplicator,
} from "@/lib/appwrite/client";

const YEAR_LEVEL_OPTIONS: SimpleSelectOption[] = [
  { value: "1", label: "Year 1" },
  { value: "2", label: "Year 2" },
  { value: "3", label: "Year 3" },
  { value: "4", label: "Year 4" },
  { value: "5", label: "Year 5" },
];

const SECTION_OPTIONS: SimpleSelectOption[] = [
  { value: "A", label: "Section A" },
  { value: "B", label: "Section B" },
  { value: "C", label: "Section C" },
  { value: "D", label: "Section D" },
  { value: "E", label: "Section E" },
];

interface RecentTxItem {
  id: string;
  buyerName: string;
  buyerType: string;
  studentNumber: string | null;
  program: string | null;
  yearAndSection: string | null;
  affiliation: string | null;
  quantityBought: number;
  createdAt: string;
  cards?: Array<{ cardSerial: string }>;
}

export function RegistrationCounter() {

  const [isRegistrationOpen, setIsRegistrationOpen] = useState<boolean>(true);
  const [selectedTxDetails, setSelectedTxDetails] = useState<RecentTxItem | null>(null);
  const [buyerType, setBuyerType] = useState<"CSD_STUDENT" | "NON_CSD_STUDENT" | "VISITOR" | "ALUMNI">("CSD_STUDENT");
  const [buyerName, setBuyerName] = useState<string>("");
  const [studentNumber, setStudentNumber] = useState<string>("");
  const [program, setProgram] = useState<string>("BSCS");
  const [yearLevel, setYearLevel] = useState<string>("1");
  const [section, setSection] = useState<string>("A");
  const [affiliation, setAffiliation] = useState<string>("");
  const [contactInfo, setContactInfo] = useState<string>("");

  const [programsList, setProgramsList] = useState<ProgramOption[]>([
    { code: "BSCS", name: "BS in Computer Science", label: "BSCS - BS in Computer Science" },
    { code: "BSIT", name: "BS in Information Technology", label: "BSIT - BS in Information Technology" },
    { code: "BSIS", name: "BS in Information Systems", label: "BSIS - BS in Information Systems" },
    { code: "BSEMC", name: "BS in Entertainment and Multimedia Computing", label: "BSEMC - BS in Entertainment and Multimedia Computing" },
  ]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState<boolean>(false);

  const [cardSerials, setCardSerials] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentTransactions, setRecentTransactions] = useState<RecentTxItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Cashier Financials & Shift Ledger
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "GCASH" | "COMPLIMENTARY">("CASH");
  const [cashTendered, setCashTendered] = useState<string>("");
  const [shiftCardsSold, setShiftCardsSold] = useState<number>(0);
  const [shiftCashCollected, setShiftCashCollected] = useState<number>(0);
  const [venueCardsBound, setVenueCardsBound] = useState<number>(0);
  const CARD_PRICE = 50;
  const deduplicatorRef = useRef(createEventDeduplicator(500, 60000));

  // Sequential Batch Range Queueing State
  const [showRangeQueue, setShowRangeQueue] = useState<boolean>(false);
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");

  // History Search Query State
  const [historySearchQuery, setHistorySearchQuery] = useState<string>("");

  // Camera Scanner State for Registration Master QR
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const queuedSerialsRef = useRef<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const regFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedSerialRef = useRef<string>("");

  const [lastReceipt, setLastReceipt] = useState<{
    buyerName: string;
    classFormat: string | null;
    cardsCount: number;
    stubsCount: number;
    transactionId: string;
    amountPaid: number;
  } | null>(null);

  const fetchRecentHistory = useCallback(async (searchQuery?: string) => {

    setIsLoadingHistory(true);
    try {
      const q = typeof searchQuery === "string" ? searchQuery : historySearchQuery;
      const url = q ? `/api/registration/bind?q=${encodeURIComponent(q)}` : "/api/registration/bind";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        if (typeof data.isRegistrationOpen === "boolean") {
          setIsRegistrationOpen(data.isRegistrationOpen);
        }
        if (Array.isArray(data.transactions)) {
          setRecentTransactions((prev) => {
            const txMap = new Map<string, RecentTxItem>();
            for (const tx of prev) {
              txMap.set(tx.id, tx);
            }
            for (const tx of data.transactions) {
              txMap.set(tx.id, tx);
            }
            return Array.from(txMap.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });
        }
      }
    } catch (err) {
      console.warn("Failed to load recent registration history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historySearchQuery]);

  const loadRecentTransactions = fetchRecentHistory;

  useEffect(() => {
    async function loadPrograms() {
      setIsLoadingPrograms(true);
      try {
        const res = await fetch("/api/programs");
        const data = await res.json();
        if (data.success && Array.isArray(data.programs) && data.programs.length > 0) {
          setProgramsList(data.programs);
        }
      } catch (err) {
        console.warn("Failed to load programs list, using defaults:", err);
      } finally {
        setIsLoadingPrograms(false);
      }
    }
    loadPrograms();
    fetchRecentHistory();
  }, [fetchRecentHistory]);

  useEffect(() => {

    const poller = createResilientPoller(() => fetchRecentHistory(), {
      initialIntervalMs: 10000,
      maxIntervalMs: 30000,
      backoffFactor: 1.5,
    });

    const unsubscribe = subscribeToRegistrationEvents((payload) => {
      if (!deduplicatorRef.current.shouldProcess(payload.transactionId)) {
        return;
      }

      setVenueCardsBound((prev) => prev + payload.quantity);
      toast.info(`Registration Sync: ${payload.quantity} card(s) bound by ${payload.processedByRole}`);
      fetchRecentHistory();
      poller.reset();
    });

    const unsubscribeConfig = subscribeToSystemConfigEvents((event) => {
      if (typeof event.isRegistrationOpen === "boolean") {
        setIsRegistrationOpen(event.isRegistrationOpen);
        if (!event.isRegistrationOpen) {
          setIsCameraOpen(false);
          toast.error("Registration Paused: Sales temporarily closed by administrator");
        } else {
          toast.info("Registration Resumed: Sales active");
        }
      }
    });

    poller.start();

    return () => {
      unsubscribe();
      unsubscribeConfig();
      poller.stop();
    };
  }, [fetchRecentHistory]);

  const normalizeAndQueueSerial = (rawValue: string): boolean => {

    // Extract card serial even if user accidentally scanned a stub QR (B27-B01-0001-S1:1:sig)
    const beforeColon = rawValue.trim().split(":")[0] || "";
    const trimmed = rawValue
      .trim()
      .toUpperCase()
      .replace(/^(#|MASTER:|M-)/i, "")
      .replace(/-S[1-6](\|.*|:.*)?$/i, "")
      .trim() || beforeColon.toUpperCase();

    if (!trimmed) return false;

    if (queuedSerialsRef.current.includes(trimmed)) {
      if (lastScannedSerialRef.current !== trimmed) toast.info(`Card ${trimmed} is already queued.`);
      lastScannedSerialRef.current = trimmed;
      return false;
    }
    queuedSerialsRef.current = [...queuedSerialsRef.current, trimmed];
    setCardSerials(queuedSerialsRef.current);
    toast.success(`Queued Card: ${trimmed}`);
    lastScannedSerialRef.current = trimmed;
    return true;
  };

  const handleAddSerial = (e?: React.FormEvent) => {

    if (e) e.preventDefault();
    if (!serialInput.trim()) return;
    normalizeAndQueueSerial(serialInput);
    setSerialInput("");
  };

  const handleQueueRange = () => {

    const start = rangeStart.trim().toUpperCase();
    const end = rangeEnd.trim().toUpperCase();

    const startMatch = start.match(/^(B27-B\d{2}-)(\d+)$/i);
    const endMatch = end.match(/^(B27-B\d{2}-)(\d+)$/i);

    if (!startMatch || !endMatch) {
      toast.error("Range must be in format B27-B01-0001");
      return;
    }

    if (startMatch[1] !== endMatch[1]) {
      toast.error("Batch prefix must match between start and end");
      return;
    }

    const prefix = startMatch[1];
    const startNum = parseInt(startMatch[2], 10);
    const endNum = parseInt(endMatch[2], 10);

    if (endNum < startNum) {
      toast.error("End serial must be greater than or equal to start serial");
      return;
    }

    if (endNum - startNum + 1 > 100) {
      toast.error("Maximum 100 cards can be queued in a single range");
      return;
    }

    const padLen = startMatch[2].length;
    let addedCount = 0;
    const newQueue = [...queuedSerialsRef.current];

    for (let n = startNum; n <= endNum; n++) {
      const serial = `${prefix}${n.toString().padStart(padLen, "0")}`;
      if (!newQueue.includes(serial)) {
        newQueue.push(serial);
        addedCount++;
      }
    }

    queuedSerialsRef.current = newQueue;
    setCardSerials(newQueue);
    toast.success(`Queued ${addedCount} card(s) from range`);
    setRangeStart("");
    setRangeEnd("");
    setShowRangeQueue(false);
  };

  const stopRegistrationCamera = async () => {

    setIsCameraOpen(false);
  };

  const startRegistrationCamera = async () => {

    setCameraError(null);
    setIsCameraOpen(true);
  };

  const handleScanRegistrationImage = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);

    try {
      const decodedText = await decodeQrImage(file);
      normalizeAndQueueSerial(decodedText);
    } catch (err) {
      console.warn("Failed to decode Master QR from image:", err);
      const message = err instanceof Error ? err.message : "Image could not be read. Use manual entry.";
      setCameraError(message);
      toast.error(message);
    } finally {
      if (regFileInputRef.current) {
        regFileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveSerial = (index: number) => {

    queuedSerialsRef.current = queuedSerialsRef.current.filter((_, i) => i !== index);
    setCardSerials(queuedSerialsRef.current);
    lastScannedSerialRef.current = "";
  };

  const handleBindCards = async (e: React.FormEvent) => {

    e.preventDefault();
    setFormError(null);
    setLastReceipt(null);

    if (!isRegistrationOpen) {
      toast.error("Registration is currently paused by administrators.");
      return;
    }

    if (buyerName.trim().length < 2) {
      setFormError("Enter the purchaser’s full name (at least two characters).");
      return;
    }

    if (cardSerials.length === 0) {
      toast.error("Please add at least 1 card serial to bind");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(`Binding and activating ${cardSerials.length} card(s)...`);

    const isStudent = buyerType === "CSD_STUDENT" || buyerType === "NON_CSD_STUDENT";
    const formattedYearAndSection = isStudent ? `${yearLevel} ${section}` : undefined;
    const formattedClassString = isStudent ? formatProgramYearSection(program, `${yearLevel} ${section}`) : null;
    const idempotencyKey =
      typeof window !== "undefined" && window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `reg-${Date.now()}`;

    try {
      const res = await fetch("/api/registration/bind", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          buyerType,
          buyerName: buyerName.trim(),
          studentNumber: isStudent ? studentNumber.trim() || undefined : undefined,
          program: isStudent ? program.trim() || undefined : undefined,
          yearAndSection: formattedYearAndSection,
          affiliation: buyerType === "VISITOR" ? affiliation.trim() || undefined : undefined,
          contactInfo: contactInfo.trim() || undefined,
          cardSerials,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const message = typeof data.error === "string" ? data.error.replace(/^[A-Z_]+:\s*/, "") : "Card binding failed. Please retry.";
        setFormError(message);
        toast.error(message, { id: toastId });
        setIsSubmitting(false);
        return;
      }

      toast.success(
        `Successfully activated ${data.cardsActivatedCount} card(s) and ${data.stubsActivatedCount} voting stubs!`,
        { id: toastId }
      );

      if (data.transactionId) {
        deduplicatorRef.current.add(data.transactionId);
      }
      const cost = paymentMethod === "COMPLIMENTARY" ? 0 : cardSerials.length * CARD_PRICE;
      setShiftCardsSold((prev) => prev + cardSerials.length);
      setShiftCashCollected((prev) => prev + cost);
      setVenueCardsBound((prev) => prev + data.cardsActivatedCount);

      setLastReceipt({
        buyerName,
        classFormat: formattedClassString,
        cardsCount: data.cardsActivatedCount,
        stubsCount: data.stubsActivatedCount,
        transactionId: data.transactionId,
        amountPaid: cost,
      });

      // Clear form for next purchaser
      queuedSerialsRef.current = [];
      lastScannedSerialRef.current = "";
      setCardSerials([]);
      setAffiliation("");
      setBuyerName("");
      setStudentNumber("");
      setContactInfo("");
      setCashTendered("");
      fetchRecentHistory();
    } catch (err) {
      setFormError("Connection lost. Your entry is preserved. Retry to check whether the card was activated.");
      toast.error("Network error during card registration", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const queuedCards = cardSerials;

  return (
    <div className="space-y-6">
      {/* Registration Paused Alert Banner */}
      {!isRegistrationOpen && (
        <div
          role="alert"
          aria-live="assertive"
          className="border-2 border-neutral-900 bg-white p-4 mb-4 text-center rounded-lg space-y-1"
        >
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5 text-neutral-900 flex-shrink-0" />
            <h2 className="font-bold text-sm uppercase tracking-wider text-neutral-900">
              Registration Paused
            </h2>
          </div>
          <p className="text-xs font-mono text-neutral-700">
            Point-of-sale card binding is currently paused by event administration. Cashier checkout is disabled.
          </p>
        </div>
      )}

      {/* Cashier Shift Ledger & Pricing Bar */}
      <div className="border border-neutral-300 p-3.5 rounded-lg bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-neutral-900 uppercase">Cashier Shift Summary:</span>
          <span className="border border-neutral-300 px-2 py-0.5 rounded text-neutral-900 font-bold select-text">
            {isRegistrationOpen ? "REGISTRATION ACTIVE" : "REGISTRATION PAUSED"}
          </span>
          <span>Shift Cards: <strong className="text-neutral-900 font-bold select-text">{shiftCardsSold}</strong></span>
          <span>Session Cash: <strong className="text-neutral-900 font-bold select-text">₱{shiftCashCollected.toLocaleString()}</strong></span>
          <span>Venue Bound: <strong className="text-neutral-900 font-bold select-text">{venueCardsBound}</strong></span>
        </div>
        <div className="text-neutral-600">
          Standard Card Price: <strong className="text-neutral-900 font-bold">₱{CARD_PRICE}</strong>
        </div>
      </div>

      {/* 2-Column Responsive Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Purchaser Intake & Card Binding */}
        <div className="space-y-6">
          {/* Demographic Registration Form */}
          <div className="border border-neutral-300 p-5 rounded-lg space-y-4 bg-white">
          <div className="flex items-center gap-2 border-b border-neutral-300 pb-3">
          <UserCheck className="w-5 h-5 text-neutral-800" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Purchaser Demographics
            </h2>
            <p className="text-xs text-neutral-600">
              Record attendee category and contact info before physical card handover
            </p>
          </div>
        </div>

        {/* Buyer Type Tabs */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
            Attendee Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { type: "CSD_STUDENT", label: "CSD Student" },
              { type: "NON_CSD_STUDENT", label: "Non-CSD Student" },
              { type: "VISITOR", label: "Guest / Visitor" },
              { type: "ALUMNI", label: "Alumni" },
            ].map((tab) => (
              <button
                key={tab.type}
                type="button"
                disabled={!isRegistrationOpen || isSubmitting}
                aria-pressed={buyerType === tab.type}
                onClick={() => { setBuyerType(tab.type as typeof buyerType); setAffiliation(""); setStudentNumber(""); setFormError(null); setLastReceipt(null); }}
                className={`p-2.5 border rounded text-xs transition-colors min-h-[44px] flex items-center justify-center font-medium disabled:opacity-50 ${
                  buyerType === tab.type
                    ? "border-neutral-900 font-bold"
                    : "border-neutral-300 hover:border-neutral-600 text-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="registration-counter-field-1">
              Full Name *
            </label>
            <input id="registration-counter-field-1"
              type="text"
              aria-label="Full name"
              disabled={!isRegistrationOpen || isSubmitting}
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              required
              className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="registration-counter-field-2">
              Contact / Mobile / Email (Optional)
            </label>
            <input id="registration-counter-field-2"
              type="text"
              aria-label="Contact or email"
              disabled={!isRegistrationOpen || isSubmitting}
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="e.g. 0917-000-0000 or email"
              className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
            />
          </div>

          {(buyerType === "CSD_STUDENT" || buyerType === "NON_CSD_STUDENT") && (
            <>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="registration-counter-field-3">
                  Student Number (Optional)
                </label>
                <input id="registration-counter-field-3"
                  type="text"
                  aria-label="Student number"
                  disabled={!isRegistrationOpen || isSubmitting}
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  placeholder="e.g. 2023-12345"
                  className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
                />
              </div>

              {/* Customized Searchable Program Picker Dropdown */}
              <div className={`space-y-1 sm:col-span-2 ${!isRegistrationOpen || isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
                <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Program / Degree (Searchable)
                </label>
                <SearchableProgramPicker
                  value={program}
                  onChange={setProgram}
                  options={programsList}
                  isLoading={isLoadingPrograms}
                />
              </div>

              {/* Year Level Dropdown (1 to 5, without search bar) */}
              <div className={`space-y-1 ${!isRegistrationOpen || isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
                <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Year Level
                </label>
                <SimpleSelect
                  value={yearLevel}
                  onChange={setYearLevel}
                  options={YEAR_LEVEL_OPTIONS}
                  placeholder="Select Year..."
                  ariaLabel="Year Level"
                />
              </div>

              {/* Section Dropdown (A to E, without search bar) */}
              <div className={`space-y-1 ${!isRegistrationOpen || isSubmitting ? "pointer-events-none opacity-50" : ""}`}>
                <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Section
                </label>
                <SimpleSelect
                  value={section}
                  onChange={setSection}
                  options={SECTION_OPTIONS}
                  placeholder="Select Section..."
                  ariaLabel="Section"
                />
              </div>

              {/* Standardized Program Year Section Format Preview */}
              <div className="sm:col-span-2 p-2.5 border border-neutral-200 rounded flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-500 uppercase">Log Format Preview:</span>
                <span className="font-bold text-neutral-900 border border-neutral-300 px-2.5 py-0.5 rounded select-text">
                  {formatProgramYearSection(program, `${yearLevel} ${section}`)}
                </span>
              </div>
            </>
          )}

          {buyerType === "VISITOR" && (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="registration-counter-field-4">
                Affiliation / Organization
              </label>
              <input id="registration-counter-field-4"
                type="text"
                aria-label="Affiliation or organization"
                disabled={!isRegistrationOpen || isSubmitting}
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="e.g. Industry Partner / High School Guest / Family"
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Sequential Card Scanner / Serial Binding Section */}
      <div className="border border-neutral-300 p-5 rounded-lg space-y-4 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-neutral-800" strokeWidth={1.75} />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Card Serials to Bind
              </h2>
              <p className="text-xs text-neutral-600">
                Scan Master QR code or type serials to activate for this purchaser
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isRegistrationOpen || isSubmitting}
              onClick={() => {
                if (isCameraOpen) {
                  stopRegistrationCamera();
                  setIsCameraOpen(false);
                } else {
                  startRegistrationCamera();
                }
              }}
              className="px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {isCameraOpen ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Close Camera</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Scan Master QR</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!isRegistrationOpen || isSubmitting}
              onClick={() => regFileInputRef.current?.click()}
              className="px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors min-h-[44px] disabled:opacity-50"
            >
              <ImageUp className="w-4 h-4" />
              <span>Scan QR Image</span>
            </button>

            <span className="font-mono text-xs border border-neutral-300 px-2.5 py-2 rounded min-h-[44px] flex items-center">
              {cardSerials.length} {cardSerials.length === 1 ? "Card" : "Cards"} Queued
            </span>
          </div>
        </div>

        <div id="registration-file-helper" className="hidden" />
        <input
          ref={regFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleScanRegistrationImage}
          className="hidden"
          aria-label="Upload Master QR Image"
        />

        {cameraError && <p role="alert" className="text-sm text-neutral-900">{cameraError}</p>}
        {isCameraOpen && <QrScanner autoStart imageInput={false} onDecode={(text) => { normalizeAndQueueSerial(text); }} />}

        {/* Serial Input Field */}
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <input
            type="text"
            aria-label="Card serial"
            disabled={!isRegistrationOpen || isSubmitting}
            value={serialInput}
            onChange={(e) => setSerialInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSerial();
              }
            }}
            placeholder="e.g. B27-B01-0001"
            className="min-w-0 flex-1 px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!isRegistrationOpen || isSubmitting || !serialInput.trim()}
            onClick={() => handleAddSerial()}
            className="px-4 py-2 border border-neutral-300 hover:border-neutral-900 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors min-h-[44px] disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Card</span>
          </button>
          <button
            type="button"
            disabled={!isRegistrationOpen || isSubmitting}
            onClick={() => setShowRangeQueue(!showRangeQueue)}
            className="px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors min-h-[44px] disabled:opacity-50"
          >
            <Layers className="w-4 h-4 text-neutral-700" />
            <span>{showRangeQueue ? "Cancel Range" : "Batch Range"}</span>
          </button>
        </div>

        {/* Range Queueing Box */}
        {showRangeQueue && (
          <div className="border border-neutral-300 p-3 rounded-lg bg-white space-y-2 text-xs">
            <span className="font-bold text-neutral-900 font-mono uppercase">Queue Sequential Card Range</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-neutral-600 font-mono mb-1">Start Serial</label>
                <input
                  type="text"
                  disabled={!isRegistrationOpen || isSubmitting}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  placeholder="e.g. B27-B01-0001"
                  className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded min-h-[44px] disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-neutral-600 font-mono mb-1">End Serial</label>
                <input
                  type="text"
                  disabled={!isRegistrationOpen || isSubmitting}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  placeholder="e.g. B27-B01-0020"
                  className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded min-h-[44px] disabled:opacity-50"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={!isRegistrationOpen || isSubmitting}
              onClick={handleQueueRange}
              className="w-full py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 transition-colors min-h-[44px] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Queue Cards in Range</span>
            </button>
          </div>
        )}

        {/* Queued Serials List */}
        {cardSerials.length > 0 && (
          <div className="border border-neutral-200 rounded divide-y divide-neutral-200 max-h-48 overflow-y-auto">
            {cardSerials.map((serial, index) => (
              <div key={serial} className="px-3 py-2 flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-900 select-text">
                  Card #{index + 1}: <strong className="font-bold">{serial}</strong>
                </span>
                <button
                  type="button"
                  disabled={!isRegistrationOpen || isSubmitting}
                  onClick={() => handleRemoveSerial(index)}
                  className="min-h-[44px] min-w-[44px] p-2 flex items-center justify-center border border-transparent hover:border-neutral-300 hover:text-red-700 rounded transition-colors disabled:opacity-50"
                  aria-label={`Remove card ${serial}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Payment & Cashier Calculation Box */}
        {cardSerials.length > 0 && (
          <div className="border border-neutral-300 p-4 rounded-lg bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                Payment & Fee Settlement
              </span>
              <span className="font-mono text-xs text-neutral-700">
                {cardSerials.length} card(s) × ₱{CARD_PRICE}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-neutral-600 font-mono mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-1">
                  {(["CASH", "GCASH", "COMPLIMENTARY"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      disabled={!isRegistrationOpen || isSubmitting}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 px-2 border rounded font-mono text-[11px] min-h-[44px] flex items-center justify-center disabled:opacity-50 ${
                        paymentMethod === method
                          ? "border-neutral-900 font-bold text-neutral-900"
                          : "border-neutral-300 text-neutral-600"
                      }`}
                    >
                      {method === "COMPLIMENTARY" ? "Comp" : method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-neutral-600 font-mono mb-1">Total Amount Due</label>
                <div className="font-mono font-bold text-sm text-neutral-900 border border-neutral-300 px-3 py-2 rounded min-h-[44px] flex items-center">
                  ₱{paymentMethod === "COMPLIMENTARY" ? "0 (Free)" : (cardSerials.length * CARD_PRICE).toLocaleString()}
                </div>
              </div>

              <div>
                <label htmlFor="cash-tendered-input" className="block text-neutral-600 font-mono mb-1">Cash Tendered</label>
                <input
                  id="cash-tendered-input"
                  type="number"
                  min="0"
                  disabled={!isRegistrationOpen || isSubmitting}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full px-3 py-2 font-mono text-base border border-neutral-300 rounded min-h-[44px] focus:outline-none focus:border-neutral-900 disabled:opacity-50"
                />
              </div>
            </div>

            {paymentMethod === "CASH" && Number(cashTendered) > 0 && (
              <div className="text-xs font-mono pt-1 text-neutral-800 flex justify-between border-t border-neutral-100">
                <span>Change to Return:</span>
                <strong className="text-neutral-900 select-text">
                  ₱{Math.max(0, Number(cashTendered) - cardSerials.length * CARD_PRICE).toLocaleString()}
                </strong>
              </div>
            )}
          </div>
        )}

        {formError && <p role="alert" className="text-sm font-medium text-neutral-900 break-words">{formError}</p>}
        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleBindCards}
          disabled={!isRegistrationOpen || isSubmitting || queuedCards.length === 0}
          className="w-full py-3 px-4 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 font-semibold text-sm rounded transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2 touch-manipulation select-none active:bg-neutral-800"
        >
          {isRegistrationOpen
            ? (isSubmitting ? "Activating Cards in Database..." : `Bind & Activate ${cardSerials.length} Card(s)`)
            : "Registration Paused by Admin"}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      </div>

      {/* Column 2: Receipts & Activity Logs */}
      <div className="space-y-6">
        {/* Last Transaction Receipt Banner */}
        {lastReceipt && (
        <div className="border border-neutral-900 p-4 rounded-lg bg-white space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-neutral-900" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Registration Receipt
            </span>
          </div>
          <p className="text-xs text-neutral-800">
            Handed over <strong className="font-bold">{lastReceipt.cardsCount} {lastReceipt.cardsCount === 1 ? "card" : "cards"}</strong> ({lastReceipt.stubsCount} voting stubs activated) to <strong>{lastReceipt.buyerName}</strong>
            {lastReceipt.classFormat && (
              <> (<strong className="font-mono font-bold select-text">{lastReceipt.classFormat}</strong>)</>
            )}.
          </p>
          <p className="text-xs font-mono text-neutral-500 select-text">
            Ref Tx: {lastReceipt.transactionId}
          </p>
        </div>
      )}

      {/* Recent Desk Registration Activity Logs (Standardized Program Year Section Format) */}
      <div className="border border-neutral-300 rounded-lg p-4 bg-white space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-neutral-800" strokeWidth={1.75} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              Recent Desk Registration Logs
            </h3>
          </div>
          <button
            type="button"
            onClick={() => fetchRecentHistory(historySearchQuery)}
            disabled={isLoadingHistory}
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search Activity Logs */}
        <div className="flex gap-2">
          <input
            type="text"
            value={historySearchQuery}
            onChange={(e) => setHistorySearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchRecentHistory(historySearchQuery);
              }
            }}
            placeholder="Search by buyer name, student #, or card serial..."
            className="min-w-0 flex-1 px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
          />
          <button
            type="button"
            onClick={() => fetchRecentHistory(historySearchQuery)}
            className="px-3.5 py-2 border border-neutral-300 hover:border-neutral-900 rounded font-semibold text-xs min-h-[44px] flex items-center gap-1.5 touch-manipulation"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
          {historySearchQuery && (
            <button
              type="button"
              onClick={() => {
                setHistorySearchQuery("");
                fetchRecentHistory("");
              }}
              className="px-3 py-2 border border-amber-500 text-amber-600 bg-white hover:bg-amber-500 hover:text-neutral-950 active:bg-amber-600 rounded text-xs min-h-[44px] flex items-center gap-1 touch-manipulation select-none transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-xs text-neutral-500 font-mono text-center py-3">
            No registrations found matching criteria.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100 overflow-x-auto max-h-[460px] overflow-y-auto">
            {recentTransactions.map((tx) => (
              <div
                key={tx.id}
                onClick={() => setSelectedTxDetails(tx)}
                className="py-2.5 px-2 -mx-2 rounded hover:bg-neutral-50 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-900 truncate select-text">
                      {tx.buyerName}
                    </span>
                    {/* Standardized Format: BSCS 1 A */}
                    {tx.program && (
                      <span className="font-mono font-bold text-neutral-900 border border-neutral-300 px-2 py-0.5 rounded text-xs select-text">
                        {formatProgramYearSection(tx.program, tx.yearAndSection)}
                      </span>
                    )}
                    {tx.affiliation && (
                      <span className="font-mono text-xs text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded select-text">
                        {tx.affiliation}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-neutral-500 mt-0.5 select-text">
                    ID: {tx.studentNumber || "N/A"} • Ref: {tx.id.slice(0, 8)} • {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <span className="font-mono font-bold text-neutral-900 text-xs border border-neutral-300 px-2 py-1 rounded select-text">
                    {tx.quantityBought} card{tx.quantityBought > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTxDetails(tx);
                    }}
                    className="p-2 border border-transparent hover:border-neutral-300 rounded text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors touch-manipulation"
                    aria-label="View transaction details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>

    {/* Transaction Details & Receipt Modal */}
    {selectedTxDetails && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      >
        <div className="bg-white border border-neutral-300 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-neutral-800" />
              <h3 id="receipt-dialog-title" className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                Registration Receipt & Serial Lookup
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTxDetails(null)}
              className="p-1.5 border border-transparent hover:border-neutral-300 rounded text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2 border border-neutral-300 p-3 rounded bg-white">
              <div>
                <span className="text-neutral-500 block">Buyer Name:</span>
                <strong className="text-neutral-900 font-bold select-text">{selectedTxDetails.buyerName}</strong>
              </div>
              <div>
                <span className="text-neutral-500 block">Category:</span>
                <strong className="text-neutral-900 select-text">{selectedTxDetails.buyerType}</strong>
              </div>
              <div>
                <span className="text-neutral-500 block">Student ID:</span>
                <strong className="text-neutral-900 select-text">{selectedTxDetails.studentNumber || "N/A"}</strong>
              </div>
              <div>
                <span className="text-neutral-500 block">Program & Section:</span>
                <strong className="text-neutral-900 select-text">
                  {selectedTxDetails.program
                    ? formatProgramYearSection(selectedTxDetails.program, selectedTxDetails.yearAndSection)
                    : selectedTxDetails.affiliation || "General Attendee"}
                </strong>
              </div>
            </div>

            <div className="border border-neutral-200 p-3 rounded space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span>Quantity Activated:</span>
                <strong className="font-bold text-neutral-900">{selectedTxDetails.quantityBought} Bingo Card(s)</strong>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span>Total Amount (₱50/card):</span>
                <strong className="font-bold text-neutral-900">₱{selectedTxDetails.quantityBought * 50}</strong>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span>Timestamp:</span>
                <span className="select-text">{new Date(selectedTxDetails.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span>Transaction Ref:</span>
                <span className="select-text font-bold text-neutral-900">{selectedTxDetails.id}</span>
              </div>
            </div>

            {selectedTxDetails.cards && selectedTxDetails.cards.length > 0 && (
              <div className="space-y-1">
                <span className="text-neutral-600 block">Activated Card Serials:</span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border border-neutral-200 p-2 rounded">
                  {selectedTxDetails.cards.map((c) => (
                    <span key={c.cardSerial} className="border border-neutral-300 px-2 py-0.5 rounded text-neutral-900 select-text">
                      {c.cardSerial}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setSelectedTxDetails(null)}
              className="px-4 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded text-xs font-bold uppercase tracking-wider transition-colors min-h-[44px] touch-manipulation select-none"
            >
              Close Receipt
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
