import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, GitCommit, ExternalLink, ShieldCheck, Bug, Layers } from "lucide-react";
import { getAllReleases } from "@/lib/version/releases";

export default function NotificationsPage() {

  const releases = getAllReleases();

  return (
    <main className="flex-1 max-w-3xl lg:max-w-4xl mx-auto w-full px-4 py-6 space-y-6">
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

      {/* Versioning Governance Banner */}
      <section className="p-4 border-2 border-neutral-900 rounded-lg space-y-2 bg-white">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-mono">
            3-Tier Semantic & Points-Based Versioning System
          </h2>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed">
          Releases follow the standard <code className="font-mono font-bold">V&lt;major&gt;.&lt;minor&gt;.&lt;patch&gt;</code> format.
          Major production releases (<code className="font-mono font-bold">V1.#.#</code>) are governed exclusively by the repository owner.
          Major system features increment the minor position (<code className="font-mono font-bold">V#.1.#</code>).
          Incremental bug fixes and features accumulate points (1 to 5 pts) to drive patch updates (<code className="font-mono font-bold">V#.#.1</code>).
        </p>
      </section>

      {/* Release List */}
      <section className="space-y-6" aria-label="Version releases history">
        {releases.map((release) => (
          <article
            key={release.version}
            className="border-2 border-neutral-900 rounded-lg p-5 sm:p-6 space-y-5 bg-white shadow-sm"
          >
            {/* Release Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold uppercase tracking-wider px-2.5 py-0.5 border-2 border-neutral-900 rounded text-neutral-900">
                    {release.version}
                  </span>
                  {release.isLatest && (
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border border-neutral-900 rounded text-neutral-900">
                      Latest Release
                    </span>
                  )}
                  <span className="text-xs text-neutral-500 font-mono">{release.releaseDate}</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 mt-1.5">
                  {release.title}
                </h3>
              </div>
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

            {/* Additional Minor Changes & Bug Fixes */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-1">
                <GitCommit className="w-4 h-4 text-neutral-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 font-mono">
                  Detailed Changes & Point Allocations
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {release.minorChanges.map((change, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-3 p-2.5 border border-neutral-200 rounded text-xs text-neutral-800"
                  >
                    <div className="flex items-start gap-2 flex-1">
                      {change.type === "security" && (
                        <ShieldCheck className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
                      )}
                      {change.type === "fix" && (
                        <Bug className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
                      )}
                      {change.type === "feature" && (
                        <Sparkles className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
                      )}
                      {change.type === "perf" && (
                        <GitCommit className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" />
                      )}
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
                {release.contributors.map((contrib, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2.5 border border-neutral-300 rounded"
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
        ))}
      </section>
    </main>
  );
}
