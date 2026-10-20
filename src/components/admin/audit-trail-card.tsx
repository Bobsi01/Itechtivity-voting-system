"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  Filter,
  Eye,
  X,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
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

  // Selected Log for Details Modal
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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
            onChange={(e) => {
              setResourceFilter(e.target.value);
              setPage(1);
            }}
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
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
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

      {/* Metadata Counter Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-neutral-600 border-b border-neutral-200 pb-2">
        <span>Showing {logs.length} of {totalCount} Recorded Events</span>
        <span>Page {page} of {totalPages}</span>
      </div>

      {/* Contained Internal Scrolling Table / Feed */}
      <div className="border border-neutral-300 rounded-lg overflow-hidden bg-white">
        {logs.length === 0 ? (
          <div className="p-12 text-center text-xs font-mono text-neutral-600 space-y-1">
            <p className="font-semibold text-neutral-800">No audit log records found</p>
            <p>Try modifying your search query or selecting &quot;All Event Categories&quot;.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 max-h-[560px] overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-neutral-50 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4 text-xs"
              >
                {/* Event Narrative and Identifiers */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 select-text">
                      {log.action}
                    </span>
                    <span className="font-mono text-[11px] border border-neutral-300 px-2 py-0.5 rounded text-neutral-700">
                      {getResourceLabel(log.resource)}
                    </span>
                    <span className="font-mono text-[11px] border border-neutral-200 px-2 py-0.5 rounded text-neutral-600 select-text">
                      IP: {log.ipAddress}
                    </span>
                  </div>

                  {/* Human-Readable Narrative Sentence */}
                  <p className="text-sm font-medium text-neutral-900 leading-relaxed select-text pt-0.5">
                    {log.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 font-mono">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-neutral-500" />
                      <strong className="text-neutral-700">{log.actorName}</strong> ({log.actorRole})
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 select-text">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      {new Date(log.createdAt).toLocaleString([], {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Inspect Details Button */}
                <div className="flex-shrink-0 self-start md:self-center">
                  <button
                    type="button"
                    onClick={() => setSelectedLog(log)}
                    className="px-3 py-1.5 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors min-h-[44px] touch-manipulation select-none"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Payload</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || isLoading}
          className="px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold disabled:opacity-40 transition-colors min-h-[44px] flex items-center gap-1 touch-manipulation select-none"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <span className="text-xs font-mono text-neutral-600">
          Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        </span>

        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || isLoading}
          className="px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold disabled:opacity-40 transition-colors min-h-[44px] flex items-center gap-1 touch-manipulation select-none"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Technical Payload Inspector Modal */}
      {selectedLog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
        >
          <div className="bg-white border border-neutral-300 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[85dvh] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-neutral-500 block">
                  Event Audit Inspection
                </span>
                <h3 id="log-detail-title" className="text-base font-bold text-neutral-900">
                  {selectedLog.action}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-2 border border-transparent hover:border-neutral-300 rounded text-neutral-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[50dvh] pr-1">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 font-mono">
                  Human-Readable Summary
                </span>
                <p className="text-xs text-neutral-900 font-medium select-text border border-neutral-300 p-2.5 rounded bg-white">
                  {selectedLog.summary}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-neutral-500 block">Actor:</span>
                  <strong className="text-neutral-900 select-text">{selectedLog.actorName}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Email:</span>
                  <strong className="text-neutral-900 select-text">{selectedLog.actorEmail}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Role:</span>
                  <strong className="text-neutral-900 select-text">{selectedLog.actorRole}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">IP Address:</span>
                  <strong className="text-neutral-900 select-text">{selectedLog.ipAddress}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Timestamp:</span>
                  <strong className="text-neutral-900 select-text">{new Date(selectedLog.createdAt).toISOString()}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Log ID:</span>
                  <strong className="text-neutral-900 select-text">{selectedLog.id}</strong>
                </div>
              </div>

              <div className="space-y-1 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 font-mono">
                  Complete Technical Payload (JSON)
                </span>
                <pre className="font-mono text-xs border border-neutral-300 p-3 rounded bg-white overflow-x-auto max-h-48 select-text">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded text-xs font-bold uppercase tracking-wider transition-colors min-h-[44px] touch-manipulation select-none"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
