"use client";

import { useState } from 'react';
import { BarChart3, Layers, Store, GraduationCap, Download, History } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      <nav aria-label="Administration sections" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {SECTIONS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            aria-pressed={section === label}
            onClick={() => setSection(label)}
            className={`min-h-11 border rounded px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 touch-manipulation ${
              section === label ? 'border-2 border-neutral-900 font-bold text-neutral-900' : 'border-neutral-300 text-neutral-700 hover:border-neutral-700'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <section aria-label={section}>
        {section === 'Overview' && <LiveLeaderboard />}
        {section === 'Cards' && <CardsAdminControl />}
        {section === 'Booths' && <BoothManagementCard />}
        {section === 'Programs' && <AcademicProgramsCard />}
        {section === 'Exports' && <DataExportCard />}
        {section === 'Audit Trail' && <AuditTrailCard />}
      </section>
    </div>
  );
}
