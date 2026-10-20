"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  X,
  User,
  ChevronLeft,
  ChevronRight,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { subscribeToAuditEvents, createResilientPoller } from "@/lib/appwrite/client";

export interface AuditLogItem {
  id: string;
  action: string;
  resource: string;
  summary: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  ipAddress: string;
  createdAt: string;
  details: unknown;
}

interface ParsedLogDetails {
  email?: string;
  attemptedEmail?: string;
  boothCode?: string;
  projectTitle?: string;
  awardTitle?: string;
  buyerName?: string;
  cardCount?: number;
  batchNumber?: number;
  totalCards?: number;
  cardSerial?: string;
  code?: string;
  reason?: string;
}

function getShortSummary(log: AuditLogItem): string {

  const details = (
    typeof log.details === "object" && log.details !== null ? log.details : {}
  ) as ParsedLogDetails;

  switch (log.action) {
    case "AUTH_LOGIN_SUCCESS": {
      const email = details.email || log.actorEmail;
      return email ? `Signed in: ${email}` : "Signed in successfully";
    }

    case "AUTH_LOGIN_FAILED": {
      const email = details.attemptedEmail;
      return email ? `Failed sign-in: ${email}` : "Failed sign-in attempt";
    }

    case "AUTH_LOGOUT":
      return "Signed out of session";

    case "VOTE_CAST": {
      if (details.boothCode && details.awardTitle) {
        return `${details.boothCode} • ${details.awardTitle}`;
      }
      const match = log.summary.match(/Exhibitor\s+([^\s(]+).*?for award\s+"([^"]+)"/i);
      if (match) {
        return `${match[1]} • ${match[2]}`;
      }
      return "Vote stub redeemed";
    }

    case "REGISTRATION_BIND": {
      if (details.buyerName) {
        const count = details.cardCount || 1;
        return `${count} Card(s) • ${details.buyerName}`;
      }
      const match = log.summary.match(/activated\s+(\d+\s+Bingo\s+Card\(s\)|\d+\s+Card[s]?)\s+(?:with.*?)?for\s+([^([.]+)/i);
      if (match) {
        const count = match[1].replace(/Bingo\s+/i, "");
        return `${count} • ${match[2].trim()}`;
      }
      return "Card(s) activated";
    }

    case "PRODUCTION_GENERATE_BATCH": {
      if (details.batchNumber) {
        return `Batch #${details.batchNumber} (${details.totalCards ?? 0} Cards)`;
      }
      const match = log.summary.match(/Batch\s+#([0-9]+)/i);
      if (match) {
        return `Batch #${match[1]} generated`;
      }
      return "Production batch generated";
    }

    case "PRODUCTION_CALIBRATION":
      return "Calibration sheet generated";

    case "ADMIN_FREEZE_VOTING":
      return "Global voting freeze paused scans";

    case "ADMIN_UNFREEZE_VOTING":
      return "Global voting freeze lifted";

    case "ADMIN_LOCK_AWARDS":
      return "Award configurations locked";

    case "ADMIN_UNLOCK_AWARDS":
      return "Award configurations unlocked";

    case "ADMIN_UPDATE_AWARDS":
      return "Updated award categories";

    case "ADMIN_VOID_CARD": {
      const serial = details.cardSerial;
      return serial ? `Voided Card #${serial}` : "Voided Bingo Card";
    }

    case "ADMIN_RESTORE_CARD": {
      const serial = details.cardSerial;
      return serial ? `Restored Card #${serial}` : "Restored Bingo Card";
    }

    case "ADMIN_BOOTH_UPSERT": {
      const code = details.code || details.boothCode;
      return code ? `Configured booth ${code}` : "Booth configured";
    }

    case "ADMIN_PROGRAM_UPSERT":
      return "Degree programs updated";

    case "ADMIN_EXPORT_CSV":
      return "Certified CSV data exported";

    default: {
      let cleaned = log.summary;
      const prefix = `${log.actorName} (${log.actorRole})`;
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length).trim();
      } else if (cleaned.startsWith(log.actorName)) {
        cleaned = cleaned.slice(log.actorName.length).trim();
      }

      if (cleaned.length > 55) {
        return `${cleaned.slice(0, 52)}...`;
      }
      return cleaned || log.action;
    }
  }
}

function formatTimestampCompact(dateString: string): string {

  try {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function AuditTrailCard() {

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Selected Log for Details Pane
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = useCallback(async () => {

    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        resource: resourceFilter,
        actorRole: roleFilter,
        search,
      });

      const res = await fetch(`/api/admin/audit-logs?${query.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
        setTotalCount(data.pagination.totalCount);
      } else {
        toast.error("Failed to load audit logs");
      }
    } catch {
      toast.error("Network error loading audit trail");
    } finally {
      setIsLoading(false);
    }
  }, [page, resourceFilter, roleFilter, search]);

  useEffect(() => {
    fetchLogs();

    const poller = createResilientPoller(() => fetchLogs(), {
      initialIntervalMs: 15000,
      maxIntervalMs: 60000,
      backoffFactor: 1.5,
    });

    const unsubscribe = subscribeToAuditEvents((payload) => {
      toast.info(`Audit Log: ${payload.action} on ${payload.resource}`);
      fetchLogs();
      poller.reset();
    });

    poller.start();

    return () => {
      unsubscribe();
      poller.stop();
    };
  }, [fetchLogs]);

  const handleExportAuditCsv = () => {

    window.open("/api/admin/export?type=votes", "_blank");
  };

  const handleCopyJson = async () => {

    if (!selectedLog) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2));
      toast.success("Payload copied to clipboard");
    } catch {
      toast.error("Failed to copy payload to clipboard");
    }
  };

  const handleSearchChange = (value: string) => {

    setSearch(value);
    setPage(1);
    setSelectedLog(null);
  };

  const handleResourceFilterChange = (value: string) => {

    setResourceFilter(value);
    setPage(1);
    setSelectedLog(null);
  };

  const handleRoleFilterChange = (value: string) => {

    setRoleFilter(value);
    setPage(1);
    setSelectedLog(null);
  };

  const handlePageChange = (newPage: number) => {

    setPage(newPage);
    setSelectedLog(null);
  };

  const getResourceLabel = (resource: string) => {

    switch (resource) {
      case "AUTH":
        return "Authentication";
      case "REGISTRATION":
        return "Registration & Sales";
      case "VOTING":
        return "Voting & Scans";
      case "PRODUCTION":
        return "Production Batches";
      case "SYSTEM_CONFIG":
        return "System Governance";
      case "CARDS":
        return "Card Management";
      case "BOOTHS":
        return "Booth Setup";
      case "PROGRAMS":
        return "Degree Programs";
      case "REPORTS":
        return "Certified Reports";
      default:
        return resource;
    }
  };

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-neutral-800 flex-shrink-0" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              System-Wide Audit & Activity Log Trail
            </h2>
            <p className="text-xs text-neutral-600 font-mono">
              Immutable, chronological record of every system event, registration, and vote
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
            aria-label="Refresh audit logs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="px-3 py-2 border border-neutral-900 hover:border-neutral-700 rounded text-xs font-bold text-neutral-900 flex items-center gap-1.5 transition-colors min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            <span>Export Log CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
        {/* Search Input */}
        <div className="sm:col-span-6 relative">
          <label htmlFor="audit-search-input" className="sr-only">
            Search audit trail
          </label>
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="audit-search-input"
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by attendee, serial, booth, actor, or keyword..."
            className="w-full pl-9 pr-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
          />
        </div>

        {/* Category Filter */}
        <div className="sm:col-span-3">
          <label htmlFor="audit-resource-filter" className="sr-only">
            Filter by Category
          </label>
          <select
            id="audit-resource-filter"
            value={resourceFilter}
            onChange={(e) => handleResourceFilterChange(e.target.value)}
            className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] bg-white"
          >
            <option value="ALL">All Event Categories</option>
            <option value="AUTH">Authentication & Sessions</option>
            <option value="REGISTRATION">Registration & Card Binds</option>
            <option value="VOTING">Voting & Scans</option>
            <option value="PRODUCTION">Production Batches</option>
            <option value="SYSTEM_CONFIG">System Governance</option>
            <option value="CARDS">Card Voids & Restorations</option>
            <option value="BOOTHS">Booth Configurations</option>
            <option value="PROGRAMS">Academic Programs</option>
            <option value="REPORTS">Certified Reports</option>
          </select>
        </div>

        {/* Role Filter */}
        <div className="sm:col-span-3">
          <label htmlFor="audit-role-filter" className="sr-only">
            Filter by Actor Role
          </label>
          <select
            id="audit-role-filter"
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
            className="w-full px-3 py-2.5 font-mono text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px] bg-white"
          >
            <option value="ALL">All Actor Roles</option>
            <option value="ADMIN">Admin Staff</option>
            <option value="REGISTRATION">Registration Clerks</option>
            <option value="EXHIBITOR">Exhibitor Teams</option>
            <option value="PRODUCTION">Production Operators</option>
          </select>
        </div>
      </div>

      {/* Master-Detail Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Compact Log Feed & Pagination */}
        <div
          className={`lg:col-span-6 xl:col-span-5 flex flex-col gap-2 ${
            selectedLog !== null ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Metadata Counter Bar */}
          <div className="flex items-center justify-between text-xs font-mono text-neutral-600 px-0.5">
            <span>Showing {logs.length} of {totalCount} Events</span>
            <span>Page {page} of {totalPages}</span>
          </div>

          {/* Compact List Container */}
          <div className="border border-neutral-300 rounded-lg overflow-hidden bg-white flex flex-col h-[560px]">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-neutral-600 space-y-1 my-auto">
                <p className="font-semibold text-neutral-800">No audit log records found</p>
                <p>Try modifying your search query or selecting &quot;All Event Categories&quot;.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-neutral-200">
                {logs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      aria-pressed={isSelected}
                      className={`w-full text-left px-3 py-2.5 transition-colors touch-manipulation flex flex-col justify-center gap-1 border-l-4 min-h-[44px] ${
                        isSelected
                          ? "border-l-neutral-900 bg-neutral-100/70"
                          : "border-l-transparent hover:bg-neutral-50"
                      }`}
                    >
                      {/* Row 1: Action + Category + Timestamp */}
                      <div className="flex items-center justify-between gap-2 w-full text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-xs font-bold text-neutral-900 truncate">
                            {log.action}
                          </span>
                          <span className="font-mono text-[10px] border border-neutral-300 px-1 py-0.5 rounded text-neutral-600 flex-shrink-0">
                            {getResourceLabel(log.resource)}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-neutral-500 whitespace-nowrap flex-shrink-0">
                          {formatTimestampCompact(log.createdAt)}
                        </span>
                      </div>

                      {/* Row 2: Human-readable summary (distilled compact headline) */}
                      <p className="text-xs text-neutral-800 truncate w-full font-normal">
                        {getShortSummary(log)}
                      </p>

                      {/* Row 3: Actor Name + Role */}
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-500 truncate">
                        <User className="w-3 h-3 text-neutral-500 flex-shrink-0" />
                        <span className="text-neutral-700 font-medium truncate">{log.actorName}</span>
                        <span>•</span>
                        <span className="truncate">{log.actorRole}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            <div className="border-t border-neutral-200 px-3 py-2 flex items-center justify-between bg-white text-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1 || isLoading}
                className="px-2.5 py-1.5 border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900 rounded text-xs font-semibold disabled:opacity-40 transition-colors min-h-[44px] flex items-center gap-1 touch-manipulation select-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="text-xs font-mono text-neutral-600">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </span>

              <button
                type="button"
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || isLoading}
                className="px-2.5 py-1.5 border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900 rounded text-xs font-semibold disabled:opacity-40 transition-colors min-h-[44px] flex items-center gap-1 touch-manipulation select-none"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Event Details & Technical Inspector */}
        <div
          className={`lg:col-span-6 xl:col-span-7 ${
            selectedLog !== null ? "block" : "hidden lg:block"
          }`}
        >
          {selectedLog ? (
            <div className="border border-neutral-300 rounded-lg p-4 sm:p-5 bg-white flex flex-col justify-between h-[560px] overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 flex-shrink-0">
                <div className="min-w-0 space-y-1">
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="lg:hidden flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 pb-1 touch-manipulation min-h-[44px]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Activity List</span>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 select-text">
                      {selectedLog.action}
                    </span>
                    <span className="font-mono text-xs border border-neutral-300 px-2 py-0.5 rounded text-neutral-700">
                      {getResourceLabel(selectedLog.resource)}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-neutral-900 font-mono">
                    Event Record Inspection
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 hover:text-neutral-900 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    title="Copy payload JSON"
                    aria-label="Copy payload JSON"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 hover:text-neutral-900 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    title="Close details"
                    aria-label="Close details"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Inspector Body */}
              <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
                {/* Event Narrative Summary */}
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 font-mono block">
                    Event Summary
                  </span>
                  <p className="text-xs text-neutral-900 font-medium select-text border border-neutral-300 p-2.5 rounded bg-white leading-relaxed">
                    {selectedLog.summary}
                  </p>
                </div>

                {/* Actor & Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono border border-neutral-200 p-3 rounded">
                  <div>
                    <span className="text-neutral-500 block">Actor:</span>
                    <strong className="text-neutral-900 select-text">{selectedLog.actorName}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Role:</span>
                    <strong className="text-neutral-900 select-text">{selectedLog.actorRole}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Email:</span>
                    <strong className="text-neutral-900 select-text">{selectedLog.actorEmail}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">IP Address:</span>
                    <strong className="text-neutral-900 select-text">{selectedLog.ipAddress}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Timestamp:</span>
                    <strong className="text-neutral-900 select-text">
                      {new Date(selectedLog.createdAt).toLocaleString([], {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block">Log ID:</span>
                    <strong className="text-neutral-900 select-text break-all">{selectedLog.id}</strong>
                  </div>
                </div>

                {/* Technical JSON Payload */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 font-mono">
                      Complete Technical Payload (JSON)
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="text-[11px] font-mono text-neutral-600 hover:text-neutral-900 underline select-none min-h-[44px] inline-flex items-center px-1"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="font-mono text-xs border border-neutral-300 p-3 rounded bg-white overflow-x-auto max-h-48 select-text">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-neutral-300 border-dashed rounded-lg p-6 bg-white flex flex-col items-center justify-center text-center h-[560px] space-y-3">
              <FileText className="w-10 h-10 text-neutral-400 stroke-1" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-neutral-800">
                  No Audit Event Selected
                </h3>
                <p className="text-xs text-neutral-500 max-w-xs font-mono">
                  Select an event from the activity list on the left to inspect its complete details, actor metadata, and payload.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
