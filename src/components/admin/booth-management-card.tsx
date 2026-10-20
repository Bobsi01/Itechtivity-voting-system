"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, RefreshCw, Edit2, Store, X, Search, ChevronLeft, ChevronRight, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BOOTH_PROGRAM_CODES } from "@/lib/booths/programs";

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
  programCode: string | null;
  teamMembers: string | null;
  tableNumber: string | null;
  logoUrl?: string | null;
  voteCount: number;
  exhibitors: ExhibitorAccountSummary[];
}

export function BoothManagementCard() {

  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [booths, setBooths] = useState<BoothRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingBooth, setEditingBooth] = useState<BoothRecord | null>(null);

  // Booth & Exhibitor Form State
  const [code, setCode] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [capstoneCategory, setCapstoneCategory] = useState<string>("");
  const [programCode, setProgramCode] = useState("");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
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

  const resetForm = useCallback(() => {

    setCode("");
    setProjectTitle("");
    setCapstoneCategory("");
    setProgramCode("");
    setTableNumber("");
    setTeamMembers("");
    setLogoUrl("");
    setExhibitorEmail("");
    setExhibitorName("");
    setExhibitorPassword("");
  }, []);

  const handleCloseModal = useCallback(() => {

    setIsModalOpen(false);
    setEditingBooth(null);
    resetForm();
  }, [resetForm]);

  // Keyboard accessibility for modal dismissal
  useEffect(() => {

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        handleCloseModal();
      }
    };

    if (isModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, handleCloseModal]);

  const handleOpenCreateModal = () => {

    setEditingBooth(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleSelectBoothForEdit = (booth: BoothRecord) => {

    const primaryExhibitor = booth.exhibitors[0];
    setEditingBooth(booth);
    setCode(booth.code);
    setProjectTitle(booth.projectTitle);
    setCapstoneCategory(booth.capstoneCategory);
    setProgramCode(booth.programCode || "");
    setTableNumber(booth.tableNumber || "");
    setTeamMembers(booth.teamMembers || "");
    setLogoUrl(booth.logoUrl || "");
    setExhibitorEmail(primaryExhibitor?.email || "");
    setExhibitorName(primaryExhibitor?.fullName || "");
    setExhibitorPassword("");
    setIsModalOpen(true);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file (PNG, JPEG, WEBP, or SVG).");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      toast.error("Logo file size must be under 3MB.");
      return;
    }

    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/booths/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLogoUrl(data.url);
        toast.success("Booth logo uploaded successfully.");
      } else {
        toast.error(data.message || data.error || "Failed to upload logo.");
      }
    } catch (err) {
      console.warn("Upload network error:", err);
      toast.error("Network error while uploading logo.");
    } finally {
      setIsUploadingLogo(false);
      e.target.value = "";
    }
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
          programCode: programCode || null,
          tableNumber: tableNumber.trim() || undefined,
          teamMembers: teamMembers.trim() || undefined,
          logoUrl: logoUrl.trim() || null,
          exhibitorEmail: exhibitorEmail.trim() || undefined,
          exhibitorName: exhibitorName.trim() || undefined,
          exhibitorPassword: exhibitorPassword || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Booth ${data.booth.code} saved.`);
        handleCloseModal();
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

  const filteredBooths = booths.filter((booth) =>
    `${booth.code} ${booth.projectTitle} ${booth.capstoneCategory}`.toLowerCase().includes(search.toLowerCase())
  );
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredBooths.length / pageSize));
  const page = Math.min(pageIndex, pageCount - 1);

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-neutral-900" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Capstone Booth & Exhibitor Registry
            </h2>
          </div>
          <p className="text-xs text-neutral-600 mt-0.5">
            Register capstone booths (CS-01 to CS-40), assign table spots, upload stamp logos, and provision exhibitor scanner logins.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Booth</span>
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

      {/* Search and Pagination Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            aria-label="Search booth registry"
            placeholder="Search booth code, project title, or category..."
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPageIndex(0); }}
            className="w-full min-h-11 border border-neutral-300 rounded pl-9 pr-3 text-base sm:text-sm font-mono placeholder:text-neutral-500 focus:outline-none focus:border-neutral-900 text-neutral-900"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs font-mono">
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
          <span aria-live="polite" className="px-2 font-semibold">
            Page {page + 1} of {pageCount} ({filteredBooths.length} booths)
          </span>
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
      </div>

      {/* Registered Booths Grid (Card-like Display) */}
      {filteredBooths.length === 0 ? (
        <div className="border border-neutral-300 rounded-lg p-8 text-center text-xs font-mono text-neutral-600">
          No matching booths found in registry.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredBooths.slice(page * pageSize, (page + 1) * pageSize).map((booth) => (
            <div
              key={booth.id}
              className="border border-neutral-300 rounded-lg p-4 bg-white flex flex-col justify-between space-y-3.5 hover:border-neutral-900 transition-colors"
            >
              {/* Top Row: Logo / Stamp Icon + Booth Code + Vote Count */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {booth.logoUrl ? (
                      <div className="w-11 h-11 rounded border border-neutral-300 flex-shrink-0 flex items-center justify-center p-1 bg-white overflow-hidden">
                        <img
                          src={booth.logoUrl}
                          alt={`${booth.code} logo`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded border border-neutral-300 flex-shrink-0 flex items-center justify-center font-mono font-bold text-xs text-neutral-700 bg-white">
                        {booth.code}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-xs text-neutral-900 border border-neutral-900 px-1.5 py-0.5 rounded select-text">
                          {booth.code}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded truncate select-text">
                          Table: {booth.tableNumber || "Unassigned"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-xs text-neutral-900 border border-neutral-300 px-2 py-1 rounded flex-shrink-0 select-text">
                    {booth.voteCount} votes
                  </span>
                </div>

                {/* Project Title and Category */}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-neutral-900 leading-snug line-clamp-2 select-text">
                    {booth.projectTitle}
                  </h3>
                  <p className="text-xs font-mono text-neutral-600 border border-neutral-200 px-1.5 py-0.5 rounded inline-block select-text">
                    {booth.capstoneCategory}
                  </p>
                </div>

                {/* Team Members & Exhibitor Scanner Login */}
                <div className="space-y-1 pt-1 border-t border-neutral-200 text-xs text-neutral-600 font-mono">
                  {booth.teamMembers && (
                    <p className="truncate select-text" title={booth.teamMembers}>
                      Team: {booth.teamMembers}
                    </p>
                  )}
                  <p className="truncate text-neutral-500 select-text" title={booth.exhibitors.map((u) => u.email).join(", ")}>
                    Scanner: {booth.exhibitors.length > 0 ? booth.exhibitors.map((u) => u.email).join(", ") : "None assigned"}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => handleSelectBoothForEdit(booth)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
                  aria-label={`Edit booth ${booth.code}`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Booth</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accessible Modal Dialog for Add / Edit Booth */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booth-modal-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal();
            }
          }}
        >
          <div className="relative w-full max-w-xl bg-white border border-neutral-300 rounded-lg shadow-xl my-auto flex flex-col max-h-[92dvh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-300 px-4 sm:px-5 py-3.5 bg-white">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-neutral-900" />
                <h3 id="booth-modal-title" className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                  {editingBooth ? `Edit Booth ${editingBooth.code}` : "Register New Capstone Booth"}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-700 hover:text-neutral-900 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSubmitBooth} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Booth Stamp / Icon Logo Upload Control */}
              <div className="border border-neutral-300 rounded-lg p-3 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase font-semibold text-neutral-900">
                    Booth Stamp / Icon Logo
                  </label>
                  <span className="text-[11px] font-mono text-neutral-500">
                    Printed on Bingo Cards
                  </span>
                </div>

                {logoUrl ? (
                  <div className="flex items-center gap-3.5">
                    <div className="w-16 h-16 rounded border border-neutral-300 p-1 flex items-center justify-center bg-white flex-shrink-0">
                      <img
                        src={logoUrl}
                        alt="Booth logo preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-xs font-mono text-neutral-700 truncate select-text">
                        Logo attached
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-900 transition-colors min-h-[44px] touch-manipulation">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Replace Logo</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={handleLogoUpload}
                            className="sr-only"
                            disabled={isUploadingLogo}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setLogoUrl("")}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px] touch-manipulation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-300 hover:border-neutral-900 rounded-lg p-4 text-center cursor-pointer transition-colors group">
                      {isUploadingLogo ? (
                        <div className="flex items-center gap-2 py-2 text-xs font-mono text-neutral-700">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Uploading image to storage...</span>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-neutral-600 group-hover:text-neutral-900 transition-colors mb-1" />
                          <span className="text-xs font-semibold text-neutral-900">
                            Click or tap to upload booth icon / logo
                          </span>
                          <span className="text-[11px] font-mono text-neutral-500 mt-0.5">
                            PNG, JPEG, WEBP or SVG (Max 3MB)
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="sr-only"
                        disabled={isUploadingLogo}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Booth Information Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-code-input">
                    Booth Code *
                  </label>
                  <input
                    id="booth-code-input"
                    type="text"
                    placeholder="e.g. CS-09"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    disabled={Boolean(editingBooth)}
                    className="w-full px-3 py-2 text-base font-mono uppercase border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px] disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-title-input">
                    Capstone Project Title *
                  </label>
                  <input
                    id="booth-title-input"
                    type="text"
                    placeholder="e.g. SecureMesh Distributed Edge Firewall"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-category-input">
                    Capstone Category *
                  </label>
                  <input
                    id="booth-category-input"
                    type="text"
                    placeholder="e.g. Cybersecurity & AI"
                    value={capstoneCategory}
                    onChange={(e) => setCapstoneCategory(e.target.value)}
                    className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-program-input">Academic Program</label>
                  <select id="booth-program-input" value={programCode} onChange={(event) => setProgramCode(event.target.value)} className="w-full min-h-11 rounded border border-neutral-300 px-3 py-2 text-base text-neutral-900">
                    <option value="">Not assigned</option>
                    {BOOTH_PROGRAM_CODES.map((program) => <option key={program} value={program}>{program}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-table-input">
                    Table Assignment
                  </label>
                  <input
                    id="booth-table-input"
                    type="text"
                    placeholder="e.g. Booth-9"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-team-input">
                  Team Members
                </label>
                <input
                  id="booth-team-input"
                  type="text"
                  placeholder="e.g. Santos, Reyes, Cruz"
                  value={teamMembers}
                  onChange={(e) => setTeamMembers(e.target.value)}
                  className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                />
              </div>

              {/* Exhibitor Scanner Account Section */}
              <div className="border-t border-neutral-200 pt-3.5 space-y-3">
                <h4 className="text-xs font-mono uppercase font-semibold text-neutral-900">
                  Exhibitor Scanner Account
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-email-input">
                      Login Email
                    </label>
                    <input
                      id="booth-email-input"
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
                    <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-lead-input">
                      Lead Name
                    </label>
                    <input
                      id="booth-lead-input"
                      type="text"
                      placeholder="e.g. CS-09 Booth Lead"
                      value={exhibitorName}
                      onChange={(e) => setExhibitorName(e.target.value)}
                      className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-mono uppercase text-neutral-700" htmlFor="booth-pwd-input">
                      Password (Optional)
                    </label>
                    <input
                      id="booth-pwd-input"
                      type="password"
                      placeholder="Default: itech2027"
                      value={exhibitorPassword}
                      onChange={(e) => setExhibitorPassword(e.target.value)}
                      className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500 min-h-[44px]"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 rounded text-xs font-semibold transition-colors min-h-[44px] touch-manipulation select-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingLogo}
                  className="flex items-center gap-1.5 px-4 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:bg-black rounded text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 min-h-[44px] touch-manipulation select-none"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingBooth ? "Update Booth Record" : "Save Booth Record"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
