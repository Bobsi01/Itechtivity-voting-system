"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X, ExternalLink, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { type VersionRelease } from "@/lib/version/releases";

interface VersionUpdateModalProps {
  release: VersionRelease;
  isOpen: boolean;
  onClose: () => void;
}

export function VersionUpdateModal({ release, isOpen, onClose }: VersionUpdateModalProps) {

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm touch-manipulation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg max-h-[90dvh] flex flex-col bg-white border-2 border-neutral-900 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-neutral-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider px-2 py-0.5 border border-neutral-900 rounded text-neutral-900">
                {release.version}
              </span>
              <span className="text-xs text-neutral-500 font-mono">{release.releaseDate}</span>
            </div>
            <h2 id="version-modal-title" className="text-base sm:text-lg font-bold text-neutral-900 mt-1">
              {release.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close update modal"
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded text-neutral-600 hover:text-neutral-900 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-sm">
          {/* Highlighted Major Updates */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-1">
              <Sparkles className="w-4 h-4 text-neutral-900" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-mono">
                Highlighted Major Updates
              </h3>
            </div>
            <ul className="space-y-2">
              {release.majorHighlights.map((highlight, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 p-3 border border-neutral-300 rounded text-neutral-900 text-xs sm:text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 text-neutral-900 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Minor Changes & Bug Fixes (Smaller display) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono border-b border-neutral-200 pb-1">
              Additional Changes & Bug Fixes
            </h3>
            <ul className="space-y-1.5">
              {release.minorChanges.map((change, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-3 py-1.5 border-b border-neutral-100 last:border-b-0 text-xs text-neutral-700"
                >
                  <span className="leading-relaxed flex-1">{change.description}</span>
                  <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 border border-neutral-300 rounded text-neutral-800 flex-shrink-0">
                    +{change.points} pt{change.points > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contributors Section */}
          <div className="space-y-2.5 pt-2 border-t border-neutral-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono">
              Release Contributors
            </h3>
            <div className="space-y-2">
              {release.contributors.map((contrib, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 border border-neutral-300 rounded"
                >
                  <div>
                    <span className="text-xs font-bold text-neutral-900 block">{contrib.name}</span>
                    {contrib.role && (
                      <span className="text-[11px] text-neutral-500 font-mono">{contrib.role}</span>
                    )}
                  </div>
                  <a
                    href={`https://github.com/${contrib.githubUsername.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-mono font-medium text-neutral-800 hover:text-neutral-900 transition-colors min-h-[44px] touch-manipulation"
                  >
                    {/* GitHub SVG Icon */}
                    <svg
                      className="w-4 h-4 fill-current"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                    <span>{contrib.githubUsername.replace(/^@/, '')}</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-300 flex items-center justify-between gap-3 bg-neutral-50">
          <Link
            href="/notifications"
            onClick={onClose}
            className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 underline flex items-center gap-1 min-h-[44px] touch-manipulation"
          >
            <span>All Updates Log</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 rounded text-xs font-bold uppercase tracking-wider transition-colors touch-manipulation select-none"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}
