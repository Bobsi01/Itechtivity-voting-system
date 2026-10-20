"use client";

import { Download, FileSpreadsheet, ShieldAlert, Users } from "lucide-react";

export function DataExportCard() {

  const exportItems = [
    {
      title: "Official Final Standings CSV",
      description: "Complete ranking of all 40 capstone booths with total vote counts and per-award slot breakdowns for faculty evaluation.",
      href: "/api/admin/export?type=standings",
      filename: "itechtivity-2027-official-standings.csv",
      icon: FileSpreadsheet,
    },
    {
      title: "Complete Vote Audit Trail CSV",
      description: "Cryptographic tamper-evident audit record of every vote cast, including timestamps, stub serials, card IDs, booth codes, and scanning accounts.",
      href: "/api/admin/export?type=votes",
      filename: "itechtivity-2027-vote-audit-trail.csv",
      icon: ShieldAlert,
    },
    {
      title: "Registration & Demographics CSV",
      description: "Comprehensive attendee sales intake log featuring buyer categories, student IDs, programs, section details, card serials, and cashier assignments.",
      href: "/api/admin/export?type=registrations",
      filename: "itechtivity-2027-registration-demographics.csv",
      icon: Users,
    },
  ];

  return (
    <div className="border border-neutral-300 p-6 rounded-lg bg-white space-y-6">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
          Official Data & Audit Export Portal
        </h2>
        <p className="text-xs text-neutral-600 font-mono mt-1">
          Download certified CSV data sheets for steering committee documentation, accreditation reports, and final awards validation.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {exportItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.href}
              className="border border-neutral-300 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <Icon className="w-5 h-5 text-neutral-800 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-neutral-900">{item.title}</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed font-mono">
                    {item.description}
                  </p>
                </div>
              </div>

              <a
                href={item.href}
                download={item.filename}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border-2 border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white rounded text-xs font-bold transition-colors min-h-[44px] whitespace-nowrap self-start sm:self-center touch-manipulation select-none"
              >
                <Download className="w-4 h-4 text-neutral-900" />
                <span>Export CSV</span>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
