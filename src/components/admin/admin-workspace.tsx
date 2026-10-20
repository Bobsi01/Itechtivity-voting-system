"use client";

import { useEffect, useState } from 'react';
import {
  BarChart3,
  Layers,
  Store,
  GraduationCap,
  Download,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  LogOut,
  Check,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { LiveLeaderboard } from './live-leaderboard';
import { CardsAdminControl } from './cards-admin-control';
import { BoothManagementCard } from './booth-management-card';
import { AcademicProgramsCard } from './academic-programs-card';
import { DataExportCard } from './data-export-card';
import { AuditTrailCard } from './audit-trail-card';

const SECTIONS = [
  { label: 'Overview', icon: BarChart3 },
  { label: 'Cards', icon: Layers },
  { label: 'Booths', icon: Store },
  { label: 'Programs', icon: GraduationCap },
  { label: 'Exports', icon: Download },
  { label: 'Audit Trail', icon: History },
] as const;

type SectionLabel = (typeof SECTIONS)[number]['label'];

export function AdminWorkspace() {

  const [section, setSection] = useState<SectionLabel>('Overview');
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  // Restore desktop sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('itech_admin_sidebar_collapsed');
      if (saved !== null) {
        setIsDesktopCollapsed(saved === 'true');
      }
    } catch {
      // Safe fallback for restricted or SSR environments
    }
  }, []);

  // Sync scroll lock and Escape key listener when mobile drawer is open
  useEffect(() => {
    if (!isMobileDrawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileDrawerOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileDrawerOpen]);

  const toggleDesktopCollapse = () => {
    setIsDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('itech_admin_sidebar_collapsed', String(next));
      } catch {
        // Safe fallback
      }
      return next;
    });
  };

  // Explicit user rule: If 1 to 3 items, top buttons on phone; if 4+ items, it is a side menu
  const isCompactPhoneMenu = SECTIONS.length <= 3;
  const currentSectionMeta = SECTIONS.find((s) => s.label === section) || SECTIONS[0];
  const CurrentIcon = currentSectionMeta.icon;

  return (
    <div className="flex min-h-dvh w-full">
      {/* ========================================================
          TRUE LEFT SIDEBAR (hidden md:flex)
          Fixed directly to the left edge of the viewport, full height.
          Never moves when scrolling.
         ======================================================== */}
      <aside
        aria-label="Desktop Navigation Sidebar"
        className={`hidden md:flex flex-col flex-shrink-0 fixed inset-y-0 left-0 h-dvh border-r border-neutral-300 bg-white transition-[width] duration-200 ease-in-out z-30 ${
          isDesktopCollapsed ? 'w-16' : 'w-60 lg:w-64'
        }`}
      >
        {/* Sidebar Header: Brand & Minimize/Maximize Toggle
            Height locked to exactly h-16 (64px) with border-b border-neutral-300
            so it lines up perfectly with the main top header line! */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-neutral-300 box-border">
          {!isDesktopCollapsed && (
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-900 truncate">
                Itechtivity 2027
              </span>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-tight">
                Admin Workspace
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={toggleDesktopCollapse}
            aria-label={isDesktopCollapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
            title={isDesktopCollapsed ? 'Maximize sidebar' : 'Minimize sidebar'}
            className={`min-h-10 rounded-md flex items-center justify-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors touch-manipulation select-none active:scale-95 ${
              isDesktopCollapsed ? 'w-full' : 'w-10'
            }`}
          >
            {isDesktopCollapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Sidebar Navigation Items: No outlines; active item is highlighted black across full width */}
        <nav aria-label="Administration sections" className="flex-1 overflow-y-auto p-2 space-y-1">
          {SECTIONS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-pressed={section === label}
              onClick={() => setSection(label)}
              title={label}
              className={`min-h-11 rounded-md text-xs font-semibold transition-colors flex items-center touch-manipulation select-none active:scale-[0.98] w-full ${
                isDesktopCollapsed
                  ? 'justify-center p-2.5'
                  : 'justify-start gap-3 px-3 py-2.5'
              } ${
                section === label
                  ? 'bg-neutral-900 text-white font-bold'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80 font-medium'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className={isDesktopCollapsed ? 'sr-only' : 'truncate'}>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ========================================================
          RIGHT COLUMN: TOP HEADER & WORKSPACE CONTENT
         ======================================================== */}
      <div
        className={`flex-1 min-w-0 flex flex-col transition-[padding] duration-200 ease-in-out ${
          isDesktopCollapsed ? 'md:pl-16' : 'md:pl-60 lg:pl-64'
        }`}
      >
        {/* Top Header: Height locked to exactly h-16 (64px) with border-b border-neutral-300 */}
        <header className="h-16 sticky top-0 z-20 flex items-center justify-between border-b border-neutral-300 bg-white px-4 sm:px-6 box-border">
          <div className="flex items-center gap-3 min-w-0">
            {/* On mobile: Menu button to slide in the side menu drawer */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open side menu drawer"
              className="md:hidden min-h-11 min-w-11 border-2 border-neutral-900 rounded flex items-center justify-center text-neutral-900 active:scale-95 touch-manipulation"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-neutral-900 truncate">
                Live Leaderboard & Governance
              </h1>
              <span className="hidden lg:inline-flex items-center gap-1.5 border border-neutral-300 rounded px-2.5 py-1 text-xs text-neutral-700">
                <CurrentIcon className="w-3.5 h-3.5 text-neutral-900" />
                <span className="font-semibold">{section}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <NotificationBell autoOpenIfUnseen={true} />
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                aria-label="Logout"
                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px] min-w-[44px]"
              >
                <LogOut className="w-4 h-4 text-neutral-600" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </form>
          </div>
        </header>

        {/* Mobile Conditional Nav (Only if 1 to 3 items) */}
        {isCompactPhoneMenu && (
          <nav aria-label="Administration sections" className="grid grid-cols-3 gap-2 p-3 border-b border-neutral-200 bg-white md:hidden">
            {SECTIONS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                aria-pressed={section === label}
                onClick={() => setSection(label)}
                className={`min-h-11 rounded-md px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 touch-manipulation select-none active:scale-[0.98] ${
                  section === label
                    ? 'bg-neutral-900 text-white font-bold'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 lg:p-6 w-full max-w-7xl mx-auto space-y-6">
          <section aria-label={section}>
            {section === 'Overview' && <LiveLeaderboard />}
            {section === 'Cards' && <CardsAdminControl />}
            {section === 'Booths' && <BoothManagementCard />}
            {section === 'Programs' && <AcademicProgramsCard />}
            {section === 'Exports' && <DataExportCard />}
            {section === 'Audit Trail' && <AuditTrailCard />}
          </section>
        </main>
      </div>

      {/* ========================================================
          MOBILE SIDE MENU DRAWER (Only when 4+ items)
          Slide-out from the left edge flush with screen boundary
         ======================================================== */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-neutral-950/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Side Menu Drawer Container */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
            className="relative z-50 w-72 max-w-[85vw] bg-white border-r border-neutral-300 shadow-2xl flex flex-col h-dvh pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-left duration-200"
          >
            {/* Drawer Header: h-16 aligned */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-200 box-border">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-tight text-neutral-900">
                  Workspace Menu
                </h2>
                <p className="text-[11px] font-mono text-neutral-500">
                  {SECTIONS.length} modules available
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Minimize and close side menu"
                className="min-h-11 min-w-11 rounded-md flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 transition-colors touch-manipulation select-none active:scale-95"
              >
                <PanelLeftClose className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Navigation List: No outline, active item highlighted black across full width */}
            <nav aria-label="Administration sections" className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {SECTIONS.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={section === label}
                  onClick={() => {
                    setSection(label);
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`min-h-12 w-full px-4 py-3 rounded-md text-sm font-semibold flex items-center justify-between transition-colors touch-manipulation select-none active:scale-[0.98] ${
                    section === label
                      ? 'bg-neutral-900 text-white font-bold'
                      : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{label}</span>
                  </div>
                  {section === label && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                </button>
              ))}
            </nav>

            {/* Drawer Footer Minimize Control (No outline) */}
            <div className="p-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="w-full min-h-11 rounded-md text-xs font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 flex items-center justify-center gap-2 touch-manipulation select-none active:scale-[0.98] transition-colors"
              >
                <PanelLeftClose className="w-4 h-4" />
                <span>Minimize Menu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
