---
name: versioning
description: >-
  Governs the 3-tier semantic versioning protocol (V<major>.<minor>.<patch>) for Itechtivity 2027.
  Use when planning releases, calculating version increments from pull requests, tracking points for bug fixes
  and features, and publishing release updates to the notification system.
  Do not use for Git branch management, database schema migrations, or third-party package dependency versioning.
---

# Versioning Skill — 3-Tier Semantic & Points-Based Release System

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Core Principles

The Itechtivity 2027 voting web application adheres to a deterministic 3-tier versioning protocol:
```text
V<major>.<minor>.<patch>
```
Examples: `V1.0.0`, `V1.0.33`, `V2.10.45` (double digits are fully supported across all three positions).

---

## 2. The Three Versioning Tiers

### 2.1 Tier 1: Major Production Release (`V1.#.#`)
* **Scope:** Official production releases, university event deployment milestones, or foundational platform paradigm shifts.
* **Governance:** **Exclusively incremented by the repository owner (Daniel Bobis — `@ItsMeYourNightmare`)**. No contributor or automated pipeline may increment the major version without explicit owner direction.
* **Reset Behavior:** When `major` increments, `minor` and `patch` reset to zero (e.g., `V0.9.42 -> V1.0.0`).

### 2.2 Tier 2: Major System Update (`V#.1.#`)
* **Scope:** Substantial system-level architectural enhancements, new portal subsystems (e.g., Production Studio, Live Presentation Stage, Notification Center), or significant protocol changes.
* **Governance:** Incremented via merged pull requests subject to owner review and approval.
* **Reset Behavior:** When `minor` increments, `patch` resets to zero (e.g., `V1.0.18 -> V1.1.0`).

### 2.3 Tier 3: Minor Changes & Points-Based Patch System (`V#.#.1`)
* **Scope:** Incremental feature additions, UI/UX adjustments, performance optimizations, and bug remediations.
* **Increment Rule:** The patch number increments according to the cumulative **points score** awarded to the pull request or commit batch.
* Each PR claims points based on the point scoring matrices below (1 to 5 points per change), using `.github/pull_request_template.md`.

---

## 3. Patch Point Scoring Matrices

### 3.1 Bug Fix Scoring Matrix (1 to 5 Points)

| Points | Severity / Impact | Representative Examples |
|---|---|---|
| **+1 pt** | Cosmetic / Trivial | Typo correction, static label alignment, non-breaking formatting fix. |
| **+2 pts** | Low Impact | Missing error toast, secondary input validation fix, sanitized console warning. |
| **+3 pts** | Moderate Impact | Scanner decoding edge case, modal state desync, broken pagination link. |
| **+4 pts** | High Impact | Concurrency race condition, idempotency collision, session refresh timeout. |
| **+5 pts** | Critical / Security | Cryptographic token bypass fix, double-spending flaw remediation, SQL sink isolation. |

### 3.2 New Features & Adjustments Matrix (1 to 5 Points)

| Points | Complexity / Scope | Representative Examples |
|---|---|---|
| **+1 pt** | Micro Adjustment | Helper utility, minor Tailwind styling polish, new environment configuration flag. |
| **+2 pts** | Component Addition | Reusable card component, filter dropdown, confirmation dialog. |
| **+3 pts** | Endpoint / Feature | New API route handler, CSV export report, real-time status indicator. |
| **+4 pts** | Workflow Capability | WebSocket channel listener, multi-role booth scanner mode, PDF calibration page. |
| **+5 pts** | Subsystem Feature | Full Notification System with update modal, live presentation awards stage. |

---

## 4. Contributor Attribution Standard

Every version release published to the notification system must include explicit contributor attribution linking to `https://github.com/<username>`:
* In `src/components/notifications/version-update-modal.tsx` and `src/app/notifications/page.tsx`, render the contributor name, optional role, and an inline monochrome GitHub `<svg>` icon next to the `githubUsername` and a `lucide-react` `<ExternalLink />` icon inside a `min-h-[44px]` anchor (`https://github.com/<username>`).
* Example contributor entry: `name: "Daniel"`, `githubUsername: "ItsMeYourNightmare"`, `role: "Repository Owner & Lead Systems Architect"`.

---

## 5. Release Update Record Schema & Publishing Workflow

All version updates live in `src/lib/version/releases.ts` (`SYSTEM_RELEASES`, consumed via `getLatestRelease()`, `getAllReleases()`, and `getReleaseByVersion()` by `src/components/notifications/notification-bell.tsx`, `src/components/notifications/version-update-modal.tsx`, and `src/app/notifications/page.tsx`):

```typescript
// src/lib/version/releases.ts
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
  version: ReleaseVersion; // e.g. "V1.0.33"
  releaseDate: string; // e.g. "October 20, 2026"
  title: string; // Release headline
  isLatest: boolean;
  majorHighlights: string[];
  minorChanges: MinorChangeItem[];
  contributors: ContributorItem[];
}
```

### Mandatory Release Update Checklist
1. Prepend the new `VersionRelease` entry to `SYSTEM_RELEASES` in `src/lib/version/releases.ts` with `isLatest: true`, and flip previous entries to `isLatest: false`.
2. Synchronize `"version"` in `package.json` without the `V` prefix (for example, `"version": "1.0.33"` in `package.json` matches `"V1.0.33"` in `SYSTEM_RELEASES`).
3. Verify release history rendering in `src/components/notifications/notification-bell.tsx`, `src/components/notifications/version-update-modal.tsx`, and `src/app/notifications/page.tsx`.
