"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SimpleSelectOption {
  value: string;
  label: string;
}

interface SimpleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Customized, tactile dropdown without search bar.
 * Built mobile-first with 44px touch targets and strict monochrome borders.
 */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  ariaLabel,
}: SimpleSelectProps) {

  const optionsId = useId();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when tapping outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (val: string) => {

    onChange(val);
    setIsOpen(false);
    containerRef.current?.querySelector("button")?.focus();
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
      {/* Trigger Button (Min 44px touch target) */}
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={optionsId}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel}
        className={`w-full px-3 py-2 text-left border rounded min-h-[44px] flex items-center justify-between transition-colors bg-white ${
          isOpen ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-300 hover:border-neutral-700"
        }`}
      >
        <span className={`text-sm truncate ${value ? "text-neutral-900 font-medium font-mono" : "text-neutral-500"}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-600 flex-shrink-0 transition-transform ${
            isOpen ? "rotate-180 text-neutral-900" : ""
          }`}
        />
      </button>

      {/* Popover Menu Panel without search bar */}
      {isOpen && (
        <div id={optionsId} role="listbox" aria-label={ariaLabel || placeholder} className="absolute z-50 left-0 right-0 mt-1.5 border border-neutral-900 rounded-lg shadow-xl bg-white overflow-hidden flex flex-col max-h-56 overflow-y-auto divide-y divide-neutral-100">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                role="option"
                aria-selected={isSelected}
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className="w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-neutral-50 transition-colors min-h-[44px] font-mono font-medium"
              >
                <span className={isSelected ? "font-bold text-neutral-900" : "text-neutral-700"}>
                  {opt.label}
                </span>
                {isSelected && (
                  <Check className="w-4 h-4 text-neutral-900 flex-shrink-0" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
