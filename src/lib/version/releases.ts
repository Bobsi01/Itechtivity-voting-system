export type PointAllocation = 1 | 2 | 3 | 4 | 5;
export type ReleaseVersion = `V${number}.${number}.${number}`;

export interface MinorChangeItem {
  description: string;
  points: PointAllocation; // 1 to 5 points
  type: 'fix' | 'feature' | 'perf' | 'security';
}

export interface ContributorItem {
  name: string; // First name or display name
  githubUsername: string; // GitHub username without @
  role?: string;
}

export interface VersionRelease {
  version: ReleaseVersion;
  releaseDate: string;
  title: string;
  isLatest: boolean;
  majorHighlights: string[];
  minorChanges: MinorChangeItem[];
  contributors: ContributorItem[];
}

export const SYSTEM_RELEASES: VersionRelease[] = [
  {
    version: "V1.0.33",
    releaseDate: "October 20, 2026",
    title: "52-Booth Production Grid Architecture & Master QR Centering",
    isLatest: true,
    majorHighlights: [
      "Production-wide expansion to 52 capstone booths (CS-01 to CS-52) across an 8x7 matrix without unused cells.",
      "Maximized 2x2 Master QR center block (44.5pt / 1.57cm) with bilateral alignment and enhanced camera acquisition.",
      "Prominent 30% enlarged CSD department heading (7.8pt Helvetica-Bold) with clean monospaced card serial.",
      "Removed legacy labels (MASTER QR, bottom gray CSD, prototype annotations) for a cleaner layout.",
      "Full synchronization across Next.js PDF engine, Appwrite Cloud Functions, PostgreSQL seed, and Admin SVG preview.",
    ],
    minorChanges: [
      {
        description: "Re-engineered bingo grid layout to 8 columns x 7 rows for exact 52-booth capacity and 2x2 center clearing",
        points: 4,
        type: "feature",
      },
      {
        description: "Enlarged Master QR to 44.5pt with 3-tier vertical stack featuring bold CSD title and clean serial code",
        points: 3,
        type: "feature",
      },
      {
        description: "Synchronized Appwrite Cloud Function generator and Admin Workspace SVG preview to match production geometry",
        points: 3,
        type: "feature",
      },
      {
        description: "Expanded database seed and schema mappings to initialize and track 52 capstone booths in PostgreSQL",
        points: 2,
        type: "feature",
      },
      {
        description: "Updated regression test assertions to validate full 52-booth O(1) grid mapping and PDF rendering",
        points: 2,
        type: "fix",
      },
    ],
    contributors: [
      {
        name: "Daniel",
        githubUsername: "ItsMeYourNightmare",
        role: "Repository Owner & Lead Systems Architect",
      },
    ],
  },
  {
    version: "V1.0.19",
    releaseDate: "October 20, 2026",
    title: "Registration Lifecycle Gate, Admin Workspace Ergonomics & Booth Programs",
    isLatest: false,
    majorHighlights: [
      "Dynamic Event Registration Gate with administrative pause/resume toggle and immediate POS blocking.",
      "Admin Workspace ergonomics overhaul with persistent collapsible sidebar, mobile slide-out drawer, and unified h-16 headers.",
      "Academic Program filtering and Booth management enhancements supporting BSIT, BSCS, ACT, and BSEMC curricula.",
      "Card Inspector directory explorer with live status telemetry, buyer attribution, and card lifecycle timeline.",
      "Permanent deprecation of batch activation endpoint in favor of exclusive sequential cashier desk POS binding.",
    ],
    minorChanges: [
      {
        description: "Enforced isRegistrationOpen gating across registration bind API and cashier POS UI with real-time WebSocket broadcasting",
        points: 5,
        type: "security",
      },
      {
        description: "Implemented persistent collapsible desktop sidebar and mobile slide-out drawer navigation with scroll locking",
        points: 4,
        type: "feature",
      },
      {
        description: "Permanently deprecated batch card activation endpoint and enforced exclusive atomic cashier desk POS binding",
        points: 4,
        type: "security",
      },
      {
        description: "Added programCode schema field, database migration, and bulk booth upload route handler with academic filtering",
        points: 3,
        type: "feature",
      },
      {
        description: "Engineered comprehensive adversarial stress test suites for registration flapping and voting concurrency",
        points: 3,
        type: "fix",
      },
    ],
    contributors: [
      {
        name: "Daniel",
        githubUsername: "ItsMeYourNightmare",
        role: "Repository Owner & Lead Systems Architect",
      },
    ],
  },
  {
    version: "V1.0.0",
    releaseDate: "October 19, 2026",
    title: "Initial Public Production Release & Security Hardening",
    isLatest: false,
    majorHighlights: [
      "Production Deployment on Appwrite Sites with automated CI/CD pipeline and multi-dyno scaling.",
      "Comprehensive Security Hardening across 16 audited AppSec/OWASP vectors including in-memory HMAC verification.",
      "Full Serverless Cloud Functions integration for PDF generation, idempotency cleanup, and real-time leaderboard caching.",
      "Mobile-First Exhibitor Scanner optimized for 360px-430px handheld viewports and dim event lighting.",
      "Deterministic 3-tier versioning system with point-based patch tracking (1 to 5 pts) and contributor attribution.",
    ],
    minorChanges: [
      {
        description: "Enforced in-memory HMAC-SHA256 signature and PIN verification before database queries",
        points: 5,
        type: "security",
      },
      {
        description: "Implemented Appwrite Realtime WebSocket broadcasting for live tallies and batch creation",
        points: 5,
        type: "feature",
      },
      {
        description: "Added sequential card binding and registration counter demographic collection",
        points: 4,
        type: "feature",
      },
      {
        description: "Migrated serverless functions deploy script to native HTTP fetch bypassing undici incompatibility",
        points: 3,
        type: "fix",
      },
      {
        description: "Relocated site bundle archiving to system temp directory resolving tar directory mutation errors",
        points: 3,
        type: "fix",
      },
      {
        description: "Optimized live stage tally queries utilizing PostgreSQL groupBy aggregation",
        points: 2,
        type: "perf",
      },
      {
        description: "Hardened session cookies with HttpOnly, SameSite=Lax, and strict route middleware isolation",
        points: 2,
        type: "security",
      },
    ],
    contributors: [
      {
        name: "Daniel",
        githubUsername: "ItsMeYourNightmare",
        role: "Repository Owner & Lead Systems Architect",
      },
    ],
  },
];

export function getLatestRelease(): VersionRelease {
  return SYSTEM_RELEASES[0];
}

export function getAllReleases(): VersionRelease[] {
  return SYSTEM_RELEASES;
}

export function getReleaseByVersion(version: string): VersionRelease | undefined {
  return SYSTEM_RELEASES.find((r) => r.version.toLowerCase() === version.toLowerCase());
}
