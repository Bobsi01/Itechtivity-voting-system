"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, ArrowRight, Eye, Sparkles } from "lucide-react";
import { getLatestRelease, type VersionRelease } from "@/lib/version/releases";
import { VersionUpdateModal } from "./version-update-modal";

const SEEN_VERSION_STORAGE_KEY = "itechtivity_seen_version";

interface NotificationBellProps {
  autoOpenIfUnseen?: boolean;
}

export function NotificationBell({ autoOpenIfUnseen = false }: NotificationBellProps) {

  const latestRelease: VersionRelease = getLatestRelease();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [hasUnseenUpdate, setHasUnseenUpdate] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check whether this update has been viewed on client mount
  useEffect(() => {

    try {
      const seenVersion = localStorage.getItem(SEEN_VERSION_STORAGE_KEY);
      const isUnseen = seenVersion !== latestRelease.version;
      setHasUnseenUpdate(isUnseen);

      // Auto-open modal on first login / authenticated entry if unseen
      if (isUnseen && autoOpenIfUnseen) {
        setModalOpen(true);
      }
    } catch (storageErr) {
      // Gracefully handle localStorage access restrictions in private browsing modes
      console.warn("Unable to read seen version from localStorage:", storageErr);
    }
  }, [latestRelease.version, autoOpenIfUnseen]);

  // Click-outside and Escape key listener to close dropdown
  useEffect(() => {

    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const markVersionAsSeen = () => {

    try {
      localStorage.setItem(SEEN_VERSION_STORAGE_KEY, latestRelease.version);
      setHasUnseenUpdate(false);
    } catch (storageErr) {
      console.warn('Unable to persist seen version to localStorage:', storageErr);
    }
  };

  const handleOpenModal = () => {

    setIsOpen(false);
    setModalOpen(true);
  };

  const handleCloseModal = () => {

    setModalOpen(false);
    markVersionAsSeen();
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Notification Icon Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="View system notifications and version updates"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="notification-dropdown-menu"
        className="relative min-h-[44px] min-w-[44px] p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors flex items-center justify-center text-neutral-800 hover:text-neutral-900 touch-manipulation"
      >
        <Bell className="w-5 h-5" />
        {/* Unread indicator border-dot (NO background color fill per rule) */}
        {hasUnseenUpdate && (
          <span
            className="absolute top-2 right-2 w-2 h-2 rounded-full border-2 border-neutral-900 bg-white"
            aria-label="New version update available"
          />
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div
          id="notification-dropdown-menu"
          role="menu"
          aria-label="System version notifications"
          className="fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top,0px))] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 bg-white border-2 border-neutral-900 rounded-lg shadow-xl z-50 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Dropdown Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-neutral-900" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-mono">
                System Updates
              </h3>
            </div>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 border border-neutral-900 rounded text-neutral-900">
              {latestRelease.version}
            </span>
          </div>

          {/* Latest Release Summary */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-neutral-900">{latestRelease.title}</p>
            <p className="text-[11px] text-neutral-500 font-mono">{latestRelease.releaseDate}</p>
            <p className="text-xs text-neutral-700 leading-relaxed line-clamp-2">
              {latestRelease.majorHighlights[0]}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-neutral-200 flex flex-col gap-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenModal}
              className="w-full min-h-[44px] px-3 py-2 border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 rounded text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 touch-manipulation select-none"
            >
              <Eye className="w-4 h-4" />
              <span>View Update Details</span>
            </button>

            <Link
              href="/notifications"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="w-full min-h-[44px] px-3 py-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 touch-manipulation select-none"
            >
              <span>All Releases & Changelog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Version Update Modal */}
      <VersionUpdateModal
        release={latestRelease}
        isOpen={modalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
