# Contributing to Itechtivity 2027

Thank you for contributing to **Itechtivity 2027**, a high-concurrency university capstone voting web application designed for fraud-proof physical Bingo card scanning and real-time result broadcasting.

To maintain production stability, cryptographic security, and UI craftsmanship, all contributors must adhere to the workflows, guidelines, and quality gates detailed below.

---

## 1. Repository Architecture & Branching Strategy

The repository maintains two primary branches:

- **`Production`**: The live production branch deployed to Appwrite Sites and Cloud Functions. This branch is strictly protected: **only the repository owner (Daniel Bobis — `@ItsMeYourNightmare` / `Bobsi01`) has merge permissions**.
- **`staging`**: The pre-production integration and staging branch used for testing and validating pull requests before production releases.

### Branch Workflow
1. Fork the repository and create your feature or bugfix branch from `staging`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```
2. Make your atomic, focused commits following standard commit conventions:
   - `feat(...)`: New feature or capability
   - `fix(...)`: Bug fix or remediation
   - `perf(...)`: Performance optimization
   - `refactor(...)`: Code refactoring without behavior change
   - `docs(...)`: Documentation updates
3. Push your branch and open a Pull Request targeting **`staging`**.

---

## 2. Pull Request Submission & Guidelines

All pull requests must follow the format defined in `.github/pull_request_template.md`.

### Key PR Requirements
1. **Clear Description:** Summarize what was changed and why.
2. **Versioning Point Contribution:** Identify whether your change is a Bug Fix (1-5 pts) or Feature / Adjustment (1-5 pts) according to our versioning points system (see Section 3).
3. **Mandatory UI Screenshots:** If your PR modifies or adds any user interface components:
   - You **must** attach screenshots or screen recordings showing the changes in a mobile viewport (**360px - 430px**).
   - Include both Before and After comparisons where applicable.
4. **Contributor Attribution:** Provide your first name and GitHub username (without leading `@`) for inclusion in system release update notes.

---

## 3. Versioning Points & Rating System

Itechtivity 2027 follows a 3-part versioning system: `V<major>.<minor>.<patch>` (e.g., `V1.0.0` or double digits such as `V1.12.35`):

| Segment | Significance | Permissions |
|---|---|---|
| **`V1.#.#`** (Major) | Official production releases and university event deployment milestones. | **Repository Owner Only (Daniel Bobis — `@ItsMeYourNightmare` / `Bobsi01`)** |
| **`V#.1.#`** (System Update) | Major system features, architectural refactors, or new portal subsystems. | Maintained via PR review and owner merge |
| **`V#.#.1`** (Minor / Patch) | Incremental bug fixes, UI adjustments, and performance enhancements. | Points-based accumulation (1 to 5 pts) |

### Minor / Patch Point Allocation Guide
- **Bug Fixes (1 to 5 points):**
  - **+1 pt:** Minor typo, layout alignment, or non-functional visual glitch.
  - **+2 pts:** Edge case error handling, logging fix, or small validation defect.
  - **+3 pts:** Component state defect, scanner decoding edge case, or UI flow blocker.
  - **+4 pts:** API race condition, cache invalidation defect, or transaction timeout issue.
  - **+5 pts:** Critical vulnerability remediation, data integrity fix, or voting security patch.
- **New Features & Adjustments (1 to 5 points):**
  - **+1 pt:** Minor utility addition, helper formatting, or config adjustment.
  - **+2 pts:** Small reusable component, supplementary modal, or table filter.
  - **+3 pts:** New API route, dedicated sub-view, or exported CSV report format.
  - **+4 pts:** Multi-role workflow improvement, Realtime WebSocket channel sync, or batch processing capability.
  - **+5 pts:** Major new page subsystem, new authentication integration, or comprehensive verification suite.

---

## 4. Mandatory UI & UX Design Standards

All contributions touching the user interface must strictly adhere to the project rules in `AGENTS.md` and `.agents/rules/ui-ux.md`:

1. **Mandatory Mobile-First Web App UI:**
   - All layouts, forms, and interactive views must be designed first for mobile devices (**360px - 430px width**).
   - Use `h-dvh` (dynamic viewport height) and safe-area padding (`env(safe-area-inset-bottom)`).
   - All interactive touch targets (buttons, scanner toggles, dropdowns) must meet a minimum size of **44x44px** for reliable operation in dim event environments.
2. **Strict NO EMOJI Policy:**
   - **Never** use emojis in chat responses, commit messages, code comments, UI labels, or templates.
   - Use standard SVG or Lucide icons (`lucide-react`) instead.
3. **Strict NO BACKGROUND COLOR Policy on Text & Icons:**
   - **Never** apply colored background fills on text badges or icon containers (no colored pill badges, no circular background colored containers behind icons).
   - Use crisp borders (`border border-neutral-300` / `border-neutral-700`) and high-contrast typography instead.

---

## 5. Security & Quality Invariants

1. **Zero TypeScript Errors & Zero Any:** The project enforces strict TypeScript. The use of `any`, `unknown as any`, or `@ts-ignore` is strictly prohibited.
2. **Cryptographic Invariants:**
   - In-memory HMAC-SHA256 signature verification before database operations.
   - Mandatory byte-length check before `crypto.timingSafeEqual`.
3. **Atomic Concurrency & Single Redemption:**
   - All ticket redemptions must execute via atomic conditional updates (`WHERE status = 'ACTIVATED'`).
   - Single-redemption constraint `UNIQUE(ticket_stub_id)` enforced at the database level.
4. **Secret Hygiene:**
   - Never commit `.env` or sensitive credentials.
   - External inputs must be validated at trust boundaries via strict Zod schemas.

---

## 6. Pre-Submission Local Verification

Before opening your pull request, run the complete pre-push verification suite locally:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Linting
npm run lint

# 3. Cryptographic invariant tests
npm run test:crypto

# 4. A4 Geometry & PDF generation tests
npm run test:pdf

# 5. Security regression & audit suite
npm run test:audit
```

All 5 commands must pass with zero errors and zero warnings.
