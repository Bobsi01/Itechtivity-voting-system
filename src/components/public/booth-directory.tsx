"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ExternalLink, MapPin, Search, Users, X } from "lucide-react";
import styles from "./booth-directory.module.css";
import { BOOTH_PROGRAM_CODES } from "@/lib/booths/programs";
import { VenueFloorMap } from "@/components/public/venue-floor-map";

export interface PublicBoothItem {
  id: string;
  code: string;
  projectTitle: string;
  description?: string | null;
  websiteUrl?: string | null;
  coverUrl?: string | null;
  mapSlot?: string | null;
  capstoneCategory: string;
  programCode: string | null;
  teamMembers: string | null;
  tableNumber: string | null;
  logoUrl?: string | null;
}

export interface PublicAwardItem {
  id: string;
  slotNumber: number;
  title: string;
  description: string | null;
}

interface BoothDirectoryProps {
  booths: PublicBoothItem[];
  awards: PublicAwardItem[];
}

const PAGE_SIZE = 12;
const DIRECTORY_VIEWS = [
  { id: "directory", label: "Projects" },
  { id: "map", label: "Floor map" },
  { id: "rules", label: "Voting guide" },
  { id: "awards", label: "Awards" },
] as const;

const VOTING_GUIDE = [
  { title: "Register your card", description: "Purchase your physical bingo card at registration. The event team records your attendee details and activates your voting stubs." },
  { title: "Visit the projects", description: "Find booths in the directory, try the demonstrations, and talk to the student teams. Collect booth stamps on your printed bingo grid as you visit." },
  { title: "Choose an award", description: "Each detachable stub corresponds to an award slot. Check the awards guide and the label on your stub before choosing a project." },
  { title: "Hand over your stub", description: "Give the matching award stub to your chosen booth. The exhibitor scans its QR code to record your vote and keeps the physical stub." },
  { title: "Make each choice count", description: "Each activated stub can be redeemed once. You may support the same project in different award categories using the matching stubs." },
];

export function BoothDirectory({ booths, awards }: BoothDirectoryProps) {

  const [activeView, setActiveView] = useState<"directory" | "map" | "rules" | "awards">("directory");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [page, setPage] = useState(1);
  const categories = Array.from(new Set(booths.map((booth) => booth.capstoneCategory))).filter(Boolean).sort();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredBooths = booths.filter((booth) => {

    const searchableText = [
      booth.code,
      booth.projectTitle,
      booth.description,
      booth.mapSlot,
      booth.teamMembers,
      booth.tableNumber,
      booth.capstoneCategory,
      booth.programCode,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesProgram = !selectedProgram || (selectedProgram === "unassigned" ? !booth.programCode : booth.programCode === selectedProgram);
    return searchableText.includes(normalizedQuery) && (!selectedCategory || booth.capstoneCategory === selectedCategory) && matchesProgram;
  });

  const pageCount = Math.max(1, Math.ceil(filteredBooths.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleBooths = filteredBooths.slice(firstIndex, firstIndex + PAGE_SIZE);
  const hasFilters = Boolean(searchQuery || selectedCategory || selectedProgram);
  const unassignedCount = booths.filter((booth) => !booth.programCode).length;
  const resultsSummary = filteredBooths.length
    ? `${firstIndex + 1}–${Math.min(firstIndex + PAGE_SIZE, filteredBooths.length)} of ${filteredBooths.length} ${filteredBooths.length === 1 ? "project" : "projects"}`
    : "0 projects";

  function resetFilters() {

    setSearchQuery("");
    setSelectedCategory("");
    setSelectedProgram("");
    setPage(1);
  }

  function changePage(nextPage: number) {

    setPage(nextPage);
    document.getElementById("project-results")?.focus({ preventScroll: true });
    document.getElementById("project-results")?.scrollIntoView({ block: "start" });
  }

  return (
    <div className={styles.directory}>
      <div className={styles.viewBar}>
        <div className={styles.views} role="group" aria-label="Directory views">
          {DIRECTORY_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-pressed={activeView === view.id}
              aria-controls="directory-content"
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
        <p className={styles.visitorHint}>Open to every visitor. No account needed.</p>
      </div>

      <div id="directory-content">
        {activeView === "directory" && (
          <section aria-label="Capstone project directory">
            <div className={styles.filters}>
              <div className={styles.searchField}>
                <label htmlFor="booth-search-input" className="sr-only">Search projects, teams, or booth codes</label>
                <Search size={19} strokeWidth={1.5} aria-hidden="true" />
                <input id="booth-search-input" type="search" autoComplete="off" value={searchQuery} placeholder="Search projects, teams, or booths" onChange={(event) => {

                  setSearchQuery(event.target.value);
                  setPage(1);
                }} />
                {searchQuery && (
                  <button type="button" aria-label="Clear search" onClick={() => {

                    setSearchQuery("");
                    setPage(1);
                  }}>
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className={styles.categoryField}>
                <label htmlFor="project-category">Category</label>
                <select id="project-category" value={selectedCategory} onChange={(event) => {

                  setSelectedCategory(event.target.value);
                  setPage(1);
                }}>
                  <option value="">All categories</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className={styles.categoryField}>
                <label htmlFor="project-program">Program</label>
                <select id="project-program" value={selectedProgram} onChange={(event) => {

                  setSelectedProgram(event.target.value);
                  setPage(1);
                }}>
                  <option value="">All programs</option>
                  {BOOTH_PROGRAM_CODES.map((program) => <option key={program} value={program}>{program}</option>)}
                  <option value="unassigned">Not assigned</option>
                </select>
              </div>
            </div>

            {unassignedCount > 0 && <p className={styles.programNote}>{unassignedCount} {unassignedCount === 1 ? "group has" : "groups have"} no program assigned yet. They appear under All programs and Not assigned.</p>}

            <div className={styles.resultsHeader} id="project-results" tabIndex={-1}>
              <p role="status">{resultsSummary}{hasFilters && ` · ${booths.length} in the collection`}</p>
              {hasFilters ? <button type="button" onClick={resetFilters}>Reset filters <X size={14} aria-hidden="true" /></button> : <span>Find a project. Start a conversation.</span>}
            </div>

            {visibleBooths.length ? (
              <div className={styles.projectGrid}>
                {visibleBooths.map((booth) => (
                  <article key={booth.id} className={styles.projectCard}>
                    {/* Optional Cover Photo Banner */}
                    {booth.coverUrl && (
                      <div className={styles.coverBanner}>
                        <Image
                          src={booth.coverUrl}
                          alt={`${booth.projectTitle} cover banner`}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    )}

                    {/* Card Top: Booth Code, Program, and Logo */}
                    <div className={styles.cardTop}>
                      <span className={styles.boothCode}>{booth.code}</span>
                      {booth.programCode && <span className={styles.programLabel}>{booth.programCode}</span>}
                      {booth.logoUrl && (
                        <Image
                          src={booth.logoUrl}
                          alt={`${booth.code} project logo`}
                          width={40}
                          height={40}
                          unoptimized
                          className={styles.projectLogo}
                        />
                      )}
                    </div>

                    <p className={styles.category}>{booth.capstoneCategory || "Capstone project"}</p>
                    <h2>{booth.projectTitle}</h2>

                    {/* Optional Synopsis Description */}
                    {booth.description && (
                      <p className={styles.synopsis}>{booth.description}</p>
                    )}

                    {/* Meta: Table & Floor Slot, Team Members */}
                    <div className={styles.projectMeta}>
                      <p>
                        <MapPin size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span>
                          {booth.tableNumber ? `Table ${booth.tableNumber}` : "Table to be announced"}
                          {booth.mapSlot && ` · Slot ${booth.mapSlot}`}
                        </span>
                      </p>
                      {booth.teamMembers && (
                        <p>
                          <Users size={16} strokeWidth={1.5} aria-hidden="true" />
                          <span>{booth.teamMembers}</span>
                        </p>
                      )}
                    </div>

                    {/* Optional External Website Link Button */}
                    {booth.websiteUrl && (
                      <div className={styles.cardActions}>
                        <a
                          href={booth.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.externalLinkButton}
                          aria-label={`Visit demonstration website for ${booth.projectTitle}`}
                        >
                          <span>Visit project website</span>
                          <ExternalLink size={15} strokeWidth={1.5} aria-hidden="true" />
                        </a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Search size={28} strokeWidth={1.3} aria-hidden="true" />
                <h2>{booths.length ? "No projects match just yet." : "The collection is on its way."}</h2>
                <p>{booths.length ? "Try a different project name, booth code, program, or category." : "Projects will appear here once the event team adds them."}</p>
                {hasFilters && <button type="button" onClick={resetFilters}>Show all projects <ArrowRight size={17} aria-hidden="true" /></button>}
              </div>
            )}

            {pageCount > 1 && (
              <nav className={styles.pagination} aria-label="Project pages">
                <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ArrowLeft size={17} aria-hidden="true" /> Previous</button>
                <p>Page <strong>{currentPage}</strong> of {pageCount}</p>
                <button type="button" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next <ArrowRight size={17} aria-hidden="true" /></button>
              </nav>
            )}
          </section>
        )}

        {activeView === "map" && (
          <section className={styles.floorMapSection} aria-labelledby="floormap-heading">
            <div className={styles.guideIntro}>
              <h2 id="floormap-heading">Venue floor layout</h2>
              <p>Explore 40 standardized exhibition slots across the venue hall, from the main entrance to the stage.</p>
            </div>
            <VenueFloorMap
              booths={booths.filter((b): b is PublicBoothItem & { mapSlot: string } => Boolean(b.mapSlot))}
              mode="public"
            />
          </section>
        )}

        {activeView === "rules" && (
          <section className={styles.guide} aria-labelledby="guide-title">
            <div className={styles.guideIntro}>
              <h2 id="guide-title">A card in hand.<br />A choice to make.</h2>
              <p>Voting takes place at the booths using your activated physical award stubs.</p>
            </div>
            <ol className={styles.guideSteps}>
              {VOTING_GUIDE.map((step, index) => (
                <li key={step.title}>
                  <span>0{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.description}</p></div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {activeView === "awards" && (
          <section className={styles.awards} aria-labelledby="awards-title">
            <div className={styles.guideIntro}>
              <h2 id="awards-title">Different strengths.<br />Their moment to shine.</h2>
              <p>Match the award slot on your physical stub to the category you want to support. The event supports up to six awards.</p>
            </div>
            {awards.length ? (
              <div className={styles.awardList}>
                {awards.map((award) => (
                  <article key={award.id}>
                    <span className={styles.awardNumber}>{String(award.slotNumber).padStart(2, "0")}</span>
                    <div>
                      <h3>{award.title}</h3>
                      <p>{award.description || "Award criteria will be announced by the event team."}</p>
                    </div>
                    <span className={styles.stubLabel}>Stub {award.slotNumber}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <h3>Awards are being prepared.</h3>
                <p>Check back for the event’s active award categories.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
