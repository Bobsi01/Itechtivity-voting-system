"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, ExternalLink } from "lucide-react";
import { getAllReleases, type VersionRelease } from "@/lib/version/releases";

export default function NotificationsPage() {

  const releases: VersionRelease[] = getAllReleases();
  const [selectedVersion, setSelectedVersion] = useState<string>(
    releases[0]?.version ?? ""
  );

  const currentRelease =
    releases.find((r) => r.version === selectedVersion) ?? releases[0];

  return (
    <main className="flex-1 max-w-5xl lg:max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-800" />
          </Link>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
              Notification System & Release Updates
            </h1>
          </div>
        </div>
      </header>

      {/* 2-Column Responsive Layout: Left = Versions List, Right = Changes Display */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Column 1: Release Versions Navigation */}
        <aside
          className="md:col-span-4 lg:col-span-4 space-y-3 md:sticky md:top-6 self-start"
          aria-label="Release versions list"
        >
          <div className="border-b border-neutral-200 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono">
              Release Versions
            </h2>
            <span className="text-[11px] font-mono text-neutral-500">
              {releases.length} {releases.length === 1 ? "release" : "releases"}
            </span>
          </div>

          <div className="space-y-2">
            {releases.map((release) => {
              const isSelected = release.version === currentRelease?.version;
              return (
                <button
                  key={release.version}
                  type="button"
                  onClick={() => setSelectedVersion(release.version)}
                  aria-current={isSelected ? "true" : undefined}
                  className={`w-full text-left p-3.5 rounded transition-colors min-h-[44px] touch-manipulation flex flex-col gap-1.5 ${
                    isSelected
                      ? "border-2 border-neutral-900 bg-white shadow-sm"
                      : "border border-neutral-300 hover:border-neutral-800 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold uppercase tracking-wider text-neutral-900">
                      {release.version}
                    </span>
                    {release.isLatest && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-neutral-900 rounded text-neutral-900">
                        Latest
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500 font-mono">
                    {release.releaseDate}
                  </span>
                  <p className="text-xs font-medium text-neutral-800 line-clamp-2 leading-snug">
                    {release.title}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Column 2: Selected Release Details & Changes */}
        <section
          className="md:col-span-8 lg:col-span-8"
          aria-label="Release details and changes"
        >
          {currentRelease ? (
            <article className="border-2 border-neutral-900 rounded-lg p-5 sm:p-6 space-y-6 bg-white shadow-sm">
              {/* Release Header */}
              <div className="border-b border-neutral-200 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider px-2.5 py-0.5 border-2 border-neutral-900 rounded text-neutral-900">
                    {currentRelease.version}
                  </span>
                  {currentRelease.isLatest && (
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-neutral-900 rounded text-neutral-900">
                      Latest Release
                    </span>
                  )}
                  <span className="text-xs text-neutral-500 font-mono">
                    {currentRelease.releaseDate}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 mt-2">
                  {currentRelease.title}
                </h3>
              </div>

              {/* Highlighted Major Updates */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-1">
                  <Sparkles className="w-4 h-4 text-neutral-900" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-mono">
                    Highlighted Major Updates
                  </h4>
                </div>
                <ul className="space-y-2">
                  {currentRelease.majorHighlights.map((highlight, idx) => (
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

              {/* Detailed Changes & Point Allocations */}
              <div className="space-y-2.5">
                <div className="border-b border-neutral-200 pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono">
                    Detailed Changes & Point Allocations
                  </h4>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {currentRelease.minorChanges.map((change, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-3 p-2.5 border border-neutral-200 rounded text-xs text-neutral-800 bg-white"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span
                          className="text-neutral-700 font-bold select-none text-sm leading-tight flex-shrink-0"
                          aria-hidden="true"
                        >
                          •
                        </span>
                        <span className="leading-relaxed">{change.description}</span>
                      </div>
                      <span className="font-mono font-bold text-[11px] px-2 py-0.5 border border-neutral-400 rounded text-neutral-900 flex-shrink-0">
                        +{change.points} pt{change.points > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contributors Section */}
              <div className="space-y-2.5 pt-3 border-t border-neutral-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono">
                  Contributors
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  {currentRelease.contributors.map((contrib, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2.5 border border-neutral-300 rounded"
                    >
                      <div>
                        <span className="text-xs font-bold text-neutral-900 block">
                          {contrib.name}
                        </span>
                        {contrib.role && (
                          <span className="text-[11px] text-neutral-500 font-mono">
                            {contrib.role}
                          </span>
                        )}
                      </div>
                      <a
                        href={`https://github.com/${contrib.githubUsername.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-mono font-semibold text-neutral-800 hover:text-neutral-900 transition-colors min-h-[44px] touch-manipulation"
                      >
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
            </article>
          ) : (
            <div className="p-8 border border-neutral-300 rounded-lg text-center text-neutral-500 font-mono text-xs">
              No release selected.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
