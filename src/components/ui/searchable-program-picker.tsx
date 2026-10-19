"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

export interface ProgramOption {
  code: string;
  name: string;
  label: string;
}

interface SearchableProgramPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: ProgramOption[];
  isLoading?: boolean;
}

export function SearchableProgramPicker({
  value,
  onChange,
  options,
  isLoading = false,
}: SearchableProgramPickerProps) {

  const optionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close popover when tapping outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-focus search input when dropdown expands
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const filteredOptions = options.filter(
    (opt) =>
      opt.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedOption = options.find((opt) => opt.code === value || opt.label === value);
  const displayLabel = selectedOption ? selectedOption.label : value || "Select Academic Program...";

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    containerRef.current?.querySelector("button")?.focus();
  };

  const handleCustomSubmit = () => {
    if (searchQuery.trim()) {
      onChange(searchQuery.trim().toUpperCase());
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        containerRef.current?.querySelector('button')?.focus();
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      setIsOpen(true);
      const choices = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []);
      const index = choices.findIndex((choice) => choice === document.activeElement);
      const next = event.key === "ArrowDown" ? (index + 1) % choices.length : (index <= 0 ? choices.length - 1 : index - 1);
      choices[next]?.focus();
    }}>
      {/* Trigger Button with Minimum 44px Touch Target */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={optionsId}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`w-full px-3 py-2 text-left border rounded min-h-[44px] flex items-center justify-between transition-colors bg-white ${
          isOpen ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-300 hover:border-neutral-700"
        }`}
      >
        <span className={`text-sm truncate ${value ? "text-neutral-900 font-medium" : "text-neutral-500"}`}>
          {isLoading ? "Loading programs..." : displayLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-600 flex-shrink-0 transition-transform ${
            isOpen ? "rotate-180 text-neutral-900" : ""
          }`}
        />
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 border border-neutral-900 rounded-lg shadow-xl bg-white overflow-hidden flex flex-col">
          {/* Search Bar Inside Dropdown */}
          <div className="px-2 py-1 border-b border-neutral-200 flex items-center gap-2 bg-white">
            <Search className="w-4 h-4 text-neutral-600 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0].code);
                  } else {
                    handleCustomSubmit();
                  }
                }
              }}
              aria-label="Search academic programs"
              placeholder="Search program or code..."
              className="w-full text-base py-1.5 text-neutral-900 placeholder:text-neutral-500 focus:outline-none min-h-[44px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="p-2 text-neutral-600 hover:text-neutral-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Program Options List */}
          <div id={optionsId} role="listbox" aria-label="Academic programs" className="max-h-56 overflow-y-auto divide-y divide-neutral-100">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.code || value === opt.label;
                return (
                  <button
                    role="option"
                    aria-selected={isSelected}
                    key={opt.code}
                    type="button"
                    onClick={() => handleSelect(opt.code)}
                    className="w-full px-3 py-2.5 text-left text-xs flex items-center justify-between hover:bg-neutral-50 transition-colors min-h-[44px]"
                  >
                    <span className="min-w-0 pr-2 block">
                      <span className="font-bold text-neutral-900 font-mono">{opt.code}</span>
                      <span className="text-neutral-500 mx-1.5">-</span>
                      <span className="text-neutral-800">{opt.name}</span>
                    </span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-neutral-900 flex-shrink-0" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center space-y-2">
                <p className="text-xs text-neutral-500">
                  No program matching <strong className="font-bold">&quot;{searchQuery}&quot;</strong>
                </p>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={handleCustomSubmit}
                    className="w-full py-2 px-3 border border-neutral-900 rounded text-xs font-semibold text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors min-h-[44px]"
                  >
                    Use custom: &quot;{searchQuery.trim().toUpperCase()}&quot;
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
