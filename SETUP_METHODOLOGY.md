# Repository Architecture & Initialization Methodology

This document summarizes the chronological, step-by-step methodology used by the user and the assistant to design, architect, and establish the governance framework of the **Itechtivity 2027** repository prior to production implementation.

---

## 1. Domain Concept & Physical Workflow Design

The user introduced the core requirement: a university capstone exhibition voting system featuring up to six awards.

* **Physical Engagement & Redemption Model:** The user designed a dual-purpose physical Bingo Card with six detachable QR ticket stubs. This ensured physical attendees engaged with exhibitor booths while preserving paper-trail auditing.
* **Role-Based Access Boundaries:** Four core personas were formalized: Admin (governance, award configuration, global tally), Production (HMAC signing, batch generation, PDF printing), Registration Desk (demographic capture and atomic card binding), and Exhibitors (handheld booth scanning restricted to own-booth tallies).
* **Demographic Capture:** Explicit buyer demographics (CSD Student, Non-CSD Student, Visitor, Alumni) were specified to prevent vote scalping and collect event analytics.
* **Artifact Authored:** [CONCEPT.md](file:///c:/Workspace/Itech%202027/CONCEPT.md).

---

## 2. Infrastructure Architecture & DevOps Consultation

The user outlined operational constraints, specifically single-worker hosting limits and external service integrations.

* **Full-Stack Selection:** Next.js 15 App Router with TypeScript and PostgreSQL 16 via Prisma ORM.
* **External Managed Services:** Appwrite Cloud was chosen for object storage (print PDF batches) and real-time WebSockets (live tally broadcasts), eliminating ephemeral dyno disk issues and socket connection bloat on application dynos.
* **Cryptographic Signatures:** Fast HMAC-SHA256 tokens were selected over heavy password hashing algorithms (such as bcrypt) to allow sub-millisecond barcode verification.
* **Independent QA Review:** A senior QA architecture subagent evaluated Heroku router timeouts (30-second H12 limit), dyno memory ceilings (512MB RAM), PgBouncer connection pools, and double-scan race conditions.
* **Artifacts Authored:** [TECHSTACK.md](file:///c:/Workspace/Itech%202027/TECHSTACK.md) and [QA_REPORT.md](file:///c:/Workspace/Itech%202027/QA_REPORT.md).

---

## 3. Modular Governance & Defect Memory

To ensure coding consistency and architectural safety across autonomous workflows, the user mandated strict, non-negotiable rules.

* **Modular Rules (`.agents/rules/`):**
  * `security.md`: Mandatory signature verification before database reads, `crypto.timingSafeEqual` length guards, atomic single-statement SQL row transitions, and database-level unique constraints.
  * `ui-ux.md`: Strict No Emoji Policy, strict No Background Color Policy on text/icons (clean borders and high-contrast typography only), and 44x44px minimum touch targets.
  * `code-craftsmanship.md`: Anti-slop engineering, zero `any` or `@ts-ignore` types, and explicit error propagation.
  * `code-quality.md`: Student-friendly naming conventions, vertical breathing spacing, and concise 1-2 sentence comments.
* **Failure Mode Memory:** The user instituted a defect log to capture failure modes (e.g., buffer length mismatch crashes in Node.js crypto, vector vs raster PDF generation, Appwrite resource-scoped channel syntax).
* **Artifact Authored:** [LESSONS_LEARNED.md](file:///c:/Workspace/Itech%202027/LESSONS_LEARNED.md).

---

## 4. Specialized Skill Engineering & Orchestration

The user instructed the creation of targeted runbooks for complex engineering domains.

* **Specialized Skills (`.agents/skills/`):** Runbooks were authored for anti-slop review, code formatting, web design, Next.js 15 App Router conventions, QR cryptography and idempotency, Appwrite cloud integrations, and streaming vector PDF generation.
* **Repository Orchestration:** The user mandated a root governance contract establishing rule precedence and skill indexing.
* **Artifact Authored:** [AGENTS.md](file:///c:/Workspace/Itech%202027/AGENTS.md).

---

## 5. Token Economy & Table Optimization

The user directed a repository-wide optimization pass across all Markdown instructions.

* **Table Padding Stripping:** 2-to-4 column routing matrices were compressed by stripping interior cell padding (`|Col|Col|` and `|---|---|`).
* **Structured Bullet Lists:** Large tables containing multiline prose and 5+ columns were transformed into structured bullet lists across architecture documents.
* **Frontmatter Hardening:** Subagent audits verified that all skill descriptions used third-person phrasing with positive triggers and negative trigger guards ("Do not use for...").

---

## 6. Mobile-First Web App UI Enforcement

The user directed that all user interfaces be engineered mobile-first for handheld event operations.

* **Governance Update:** `.agents/rules/ui-ux.md` and `AGENTS.md` were updated to require unprefixed Tailwind styling for 360-430px viewports, dynamic viewport units (`h-dvh` instead of `h-screen`), notch/home-bar safe area insets, and iOS Safari 16px auto-zoom prevention.
* **Dedicated Mobile Skill:** Authored `.agents/skills/mobile-web-ui/SKILL.md`, including single-screen no-scroll scanner viewfinders, bottom drawers, and Web Audio/haptic feedback with AudioContext lifecycle cleanup.
* **Verification & Audit:** Validated via an automated mobile QA subagent for zero emoji and zero text/icon background fill violations.
