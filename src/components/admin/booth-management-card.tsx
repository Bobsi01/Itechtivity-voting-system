"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Edit2, Store, X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

interface ExhibitorAccountSummary {
  id: string;
  email: string;
  fullName: string;
}

interface BoothRecord {
  id: string;
  code: string;
  projectTitle: string;
  capstoneCategory: string;
  teamMembers: string | null;
  tableNumber: string | null;
  voteCount: number;
  exhibitors: ExhibitorAccountSummary[];
}

export function BoothManagementCard() {

  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [booths, setBooths] = useState<BoothRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isFormExpanded, setIsFormExpanded] = useState<boolean>(false);

  // Booth & Exhibitor Form State
  const [code, setCode] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [capstoneCategory, setCapstoneCategory] = useState<string>("");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<string>("");
  const [exhibitorEmail, setExhibitorEmail] = useState<string>("");
  const [exhibitorName, setExhibitorName] = useState<string>("");
  const [exhibitorPassword, setExhibitorPassword] = useState<string>("");

  const fetchBooths = async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/booths");
      const data = await res.json();
      if (res.ok && data.success) {
        setBooths(data.booths);
      }
    } catch (err) {
      console.warn("Failed to load capstone booths:", err);
      toast.error("Failed to load capstone booths");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {

    fetchBooths();
  }, []);

  const resetForm = () => {

    setCode("");
    setProjectTitle("");
    setCapstoneCategory("");
    setTableNumber("");
    setTeamMembers("");
    setExhibitorEmail("");
    setExhibitorName("");
    setExhibitorPassword("");
  };

  const handleSelectBoothForEdit = (booth: BoothRecord) => {

    const primaryExhibitor = booth.exhibitors[0];
    setCode(booth.code);
    setProjectTitle(booth.projectTitle);
    setCapstoneCategory(booth.capstoneCategory);
    setTableNumber(booth.tableNumber || "");
    setTeamMembers(booth.teamMembers || "");
    setExhibitorEmail(primaryExhibitor?.email || "");
    setExhibitorName(primaryExhibitor?.fullName || "");
    setExhibitorPassword("");
    setIsFormExpanded(true);
  };

  const handleSubmitBooth = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!code.trim() || !projectTitle.trim() || !capstoneCategory.trim()) {
      toast.error("Booth code, project title, and category are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/booths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          projectTitle: projectTitle.trim(),
          capstoneCategory: capstoneCategory.trim(),
          tableNumber: tableNumber.trim() || undefined,
          teamMembers: teamMembers.trim() || undefined,
          exhibitorEmail: exhibitorEmail.trim() || undefined,
          exhibitorName: exhibitorName.trim() || undefined,
          exhibitorPassword: exhibitorPassword || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Booth ${data.booth.code} saved.`);
        resetForm();
        setIsFormExpanded(false);
        fetchBooths();
      } else {
        toast.error(data.error || "Failed to save capstone booth.");
      }
    } catch (err) {
      console.warn("Network error while saving booth:", err);
      toast.error("Network error while saving capstone booth.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBooths = booths.filter((booth) => `${booth.code} ${booth.projectTitle}`.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredBooths.length / 10));
  const page = Math.min(pageIndex, pageCount - 1);

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-neutral-900" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Capstone Booth & Exhibitor Registry
            </h2>
          </div>
          <p className="text-xs text-neutral-600 mt-0.5">
            Register capstone booths (CS-01 to CS-40) and provision mobile scanner accounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isFormExpanded) {
                resetForm();
              }
              setIsFormExpanded(!isFormExpanded);
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
          >
            {isFormExpanded ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>Close Form</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Add / Update Booth</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={fetchBooths}
            disabled={isLoading}
            className="p-2.5 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
            aria-label="Refresh booths"
          >
            <RefreshCw className={`w-4 h-4 text-neutral-700 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expandable Booth & Exhibitor Upsert Form */}
      {isFormExpanded && (
        <form onSubmit={handleSubmitBooth} className="border border-neutral-300 rounded p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-1">
                Booth Code *
              </label>
              <input id="booth-management-card-field-1"
                type="text"
                placeholder="e.g. CS-09"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                className="w-full px-3 py-2 text-base font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-2">
                Capstone Project Title *
              </label>
              <input id="booth-management-card-field-2"
                type="text"
                placeholder="e.g. SecureMesh Distributed Edge Firewall"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-3">
                Capstone Category *
              </label>
              <input id="booth-management-card-field-3"
                type="text"
                placeholder="e.g. Cybersecurity & AI"
                value={capstoneCategory}
                onChange={(e) => setCapstoneCategory(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-4">
                Table Assignment
              </label>
              <input id="booth-management-card-field-4"
                type="text"
                placeholder="e.g. Booth-9"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-5">
                Team Members
              </label>
              <input id="booth-management-card-field-5"
                type="text"
                placeholder="e.g. Santos, Reyes, Cruz"
                value={teamMembers}
                onChange={(e) => setTeamMembers(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-6">
                Exhibitor Login Email
              </label>
              <input id="booth-management-card-field-6"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                placeholder="e.g. booth9@ucc-csd.edu.ph"
                value={exhibitorEmail}
                onChange={(e) => setExhibitorEmail(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-7">
                Exhibitor Lead Name
              </label>
              <input id="booth-management-card-field-7"
                type="text"
                placeholder="e.g. CS-09 Booth Lead"
                value={exhibitorName}
                onChange={(e) => setExhibitorName(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-management-card-field-8">
                Scanner Password (Optional)
              </label>
              <input id="booth-management-card-field-8"
                type="password"
                placeholder="Default: itech2027"
                value={exhibitorPassword}
                onChange={(e) => setExhibitorPassword(e.target.value)}
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormExpanded(false);
              }}
              className="px-3 py-2 border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 min-h-[44px] touch-manipulation select-none"
            >
              <Plus className="w-4 h-4" />
              <span>Save Booth Record</span>
            </button>
          </div>
        </form>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          aria-label="Search booth registry"
          placeholder="Search booth code or project..."
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPageIndex(0); }}
          className="w-full min-h-11 border border-neutral-300 rounded pl-9 pr-3 text-base font-mono"
        />
      </div>
      <div className="flex justify-between items-center gap-2 text-sm font-mono text-xs">
        <button
          type="button"
          aria-label="Previous registry page"
          disabled={page === 0}
          onClick={() => setPageIndex(page - 1)}
          className="min-h-11 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 transition-colors touch-manipulation select-none"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>
        <span aria-live="polite">Page {page + 1} of {pageCount}</span>
        <button
          type="button"
          aria-label="Next registry page"
          disabled={page + 1 >= pageCount}
          onClick={() => setPageIndex(page + 1)}
          className="min-h-11 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded px-3 disabled:opacity-40 flex items-center gap-1 transition-colors touch-manipulation select-none"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {/* Registered Booths List (Scrollable internally) */}
      <div className="border border-neutral-200 rounded divide-y divide-neutral-200 max-h-[480px] overflow-y-auto">
        {filteredBooths.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-neutral-600">
            No matching booths.
          </div>
        ) : (
          filteredBooths.slice(page * 10, (page + 1) * 10).map((booth) => (
            <div
              key={booth.id}
              className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-neutral-900 border border-neutral-300 px-2 py-0.5 rounded select-text">
                    {booth.code}
                  </span>
                  <span className="font-semibold text-neutral-900 truncate select-text">
                    {booth.projectTitle}
                  </span>
                  <span className="text-xs font-mono text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded select-text">
                    {booth.capstoneCategory}
                  </span>
                </div>
                <p className="text-xs font-mono text-neutral-600 select-text">
                  Table: {booth.tableNumber || "Unassigned"}
                  {booth.exhibitors.length > 0
                    ? ` • Scanner Login: ${booth.exhibitors.map((u) => u.email).join(", ")}`
                    : " • Scanner Login: None"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono font-bold text-neutral-900 border border-neutral-300 px-2.5 py-1 rounded select-text">
                  {booth.voteCount} votes
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectBoothForEdit(booth)}
                  className="p-2.5 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                  aria-label={`Edit booth ${booth.code}`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
