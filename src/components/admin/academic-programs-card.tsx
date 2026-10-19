"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

interface AcademicProgramItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  order: number;
}

export function AcademicProgramsCard() {

  const [programs, setPrograms] = useState<AcademicProgramItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // New program form state
  const [newCode, setNewCode] = useState<string>("");
  const [newName, setNewName] = useState<string>("");

  const fetchPrograms = async () => {

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/programs");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.programs)) {
        setPrograms(data.programs);
      }
    } catch (err) {
      console.warn("Failed to fetch programs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrograms();
  }, []);

  const handleCreateProgram = async (e: React.FormEvent) => {

    e.preventDefault();

    const trimmedCode = newCode.trim().toUpperCase();
    const trimmedName = newName.trim();

    if (!trimmedCode || !trimmedName) {
      toast.error("Please enter both program code and full program title");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: trimmedCode,
          name: trimmedName,
          order: programs.length + 1,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`Program ${trimmedCode} added successfully`);
        setNewCode("");
        setNewName("");
        fetchPrograms();
      } else {
        toast.error(data.error || "Failed to create program");
      }
    } catch (err) {
      toast.error("Network error creating program");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {

    try {
      const res = await fetch("/api/admin/programs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Program status updated`);
        fetchPrograms();
      } else {
        toast.error("Failed to update status");
      }
    } catch (err) {
      toast.error("Network error updating program");
    }
  };

  const handleDeleteProgram = async (id: string, code: string) => {

    try {
      const res = await fetch(`/api/admin/programs?id=${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Program ${code} deleted`);
        fetchPrograms();
      } else {
        toast.error("Failed to delete program");
      }
    } catch (err) {
      toast.error("Network error deleting program");
    }
  };

  return (
    <div className="border border-neutral-300 rounded-lg p-5 space-y-5 bg-white">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-neutral-300 pb-3">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-neutral-800" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Academic Degree Programs Configuration
            </h2>
            <p className="text-xs text-neutral-600">
              Configured programs appear in the registration desk searchable dropdown picker
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchPrograms}
          disabled={isLoading}
          className="p-2.5 border border-neutral-300 hover:border-neutral-900 rounded min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          aria-label="Refresh programs"
        >
          <RefreshCw className={`w-4 h-4 text-neutral-800 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* 2-Column Responsive Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Add New Program Form */}
        <form onSubmit={handleCreateProgram} className="border border-neutral-200 p-4 rounded-lg space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 block">
            Add New Academic Program
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="academic-programs-card-field-1">
                Abbreviation / Code *
              </label>
              <input id="academic-programs-card-field-1"
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="e.g. BSCS"
                required
                className="w-full px-3 py-2 text-base font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider" htmlFor="academic-programs-card-field-2">
                Full Program Degree Name *
              </label>
              <input id="academic-programs-card-field-2"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. BS in Computer Science"
                required
                className="w-full px-3 py-2 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            <div className="text-xs text-neutral-600 font-mono">
              Preview: <strong className="font-bold text-neutral-900">{newCode ? `${newCode} - ${newName || "Full Degree Name"}` : "BSCS - BS in Computer Science"}</strong>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newCode.trim() || !newName.trim()}
              className="px-4 py-2 border border-neutral-900  text-neutral-900 rounded font-semibold text-xs  transition-colors disabled:opacity-50 min-h-[44px] flex items-center gap-1.5 touch-manipulation select-none"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? "Adding..." : "Add Program"}</span>
            </button>
          </div>
        </form>

        {/* Column 2: Existing Programs Table */}
        <div className="border border-neutral-300 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-300 bg-white flex items-center justify-between text-xs font-mono text-neutral-700">
            <span>Degree Programs ({programs.filter((program) => program.isActive).length} active / {programs.length} total)</span>
            <span>Display: Abbreviation - Full Title</span>
          </div>

          {programs.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-600 font-mono">
              No academic programs configured.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 max-h-80 overflow-y-auto">
            {programs.map((prog) => (
              <div
                key={prog.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="font-mono text-xs font-bold border border-neutral-300 px-2.5 py-1 rounded text-neutral-900 select-text">
                    {prog.code}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 select-text">
                      {prog.code} - {prog.name}
                    </p>
                    <p className="text-xs text-neutral-600 font-mono">
                      Full Degree: {prog.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(prog.id, prog.isActive)}
                    className={`px-3 py-1.5 border rounded text-xs font-semibold transition-colors min-h-[44px] flex items-center gap-1.5 touch-manipulation select-none ${
                      prog.isActive
                        ? "border-neutral-900 text-neutral-900"
                        : "border-neutral-300 text-neutral-600"
                    }`}
                  >
                    {prog.isActive ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    <span>{prog.isActive ? "Active in Picker" : "Disabled"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteProgram(prog.id, prog.code)}
                    className="p-2 border border-transparent hover:border-neutral-300 hover:text-red-700 rounded min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                    aria-label={`Delete ${prog.code}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);
}
