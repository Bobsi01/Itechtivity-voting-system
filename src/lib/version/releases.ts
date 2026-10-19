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
    version: "V1.0.0",
    releaseDate: "October 19, 2026",
    title: "Initial Public Production Release & Security Hardening",
    isLatest: true,
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
