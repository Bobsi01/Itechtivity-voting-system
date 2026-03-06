# .github Prompt Engineering Improvement Plan

## Summary

The current `.github` instructions and skills are well-written for a v1 but suffer from
significant duplication, missing scoped files, and structural inefficiency. This plan
addresses 11 issues found during review, ordered by priority.

---

## Phase 1 — Eliminate Duplication (High Impact)

### 1.1 Refactor `copilot-instructions.md` into a concise hub

**Current problem**: 200 lines that duplicate content from all three instruction files.

**Action**: Rewrite `copilot-instructions.md` to be ~60 lines:
- Project overview (what it is, tech stack, student-level code)
- Naming conventions summary (keep — this is universal)
- Architecture rules summary (thin controllers, services, Eloquent)
- Build & run commands (keep)
- Explicit delegation: "For security rules see `laravel-security.instructions.md`,
  for UI rules see `ui-tailwind.instructions.md`, for quality checks see
  `code-quality-checklist.instructions.md`"
- Remove all duplicated security, UI, and checklist content

**Why**: Saves ~800 tokens per interaction. Removes drift risk where 4 copies of
the same rule go out of sync.

### 1.2 Deduplicate security rules

**Current problem**: CSRF, `$request->validated()`, bcrypt, rate-limiting rules appear in:
- `copilot-instructions.md` (§ Security Requirements)
- `code-quality-checklist.instructions.md` (§3 Security Check)
- `laravel-security.instructions.md` (full file)
- `security-audit/SKILL.md` (§ Check each vulnerability class)

**Action**:
- `laravel-security.instructions.md` — single source of truth for security rules
- `code-quality-checklist.instructions.md` — reference security instruction file,
  keep only a 3-item reminder checklist (not the full rules)
- `copilot-instructions.md` — remove security section, add one-liner referencing
  the instruction file
- `security-audit/SKILL.md` — keep as-is (it's a deeper audit procedure, not
  just rules)

### 1.3 Deduplicate logic self-evaluation

**Current problem**: Logic tracing rules appear in both `copilot-instructions.md`
(lines 169-200) and `review-logic/SKILL.md`.

**Action**: Keep the full procedure in `review-logic/SKILL.md`. In
`copilot-instructions.md`, keep only a 3-line mandate: "After generating business
logic, mentally trace happy path, edge cases, and failure paths. For the full
procedure, see the review-logic skill."

---

## Phase 2 — Add Missing Scoped Instructions

### 2.1 Add `applyTo` to code-quality-checklist

**File**: `code-quality-checklist.instructions.md`

**Action**: Add `applyTo: "**/*.php,resources/views/**/*.blade.php"` to frontmatter.
This prevents it from loading when editing config files, markdown, or JS.

### 2.2 Create `testing.instructions.md`

**File**: `.github/instructions/testing.instructions.md`
**Scope**: `applyTo: "tests/**"`

**Contents**:
- Feature tests for critical paths (registration, vote casting, admin actions)
- `RefreshDatabase` trait on all test classes
- Factory classes for every model
- Test naming: `test_student_cannot_vote_twice_for_same_booth()`
- Assert HTTP status, database state, session messages
- Arrange-Act-Assert structure
- Do/don't patterns (no mocking Eloquent, test through HTTP)

### 2.3 Create `database.instructions.md`

**File**: `.github/instructions/database.instructions.md`
**Scope**: `applyTo: "database/**"`

**Contents**:
- PostgreSQL-compatible migrations only
- Foreign keys with `constrained()->onDelete()` always specified
- Indexes on WHERE/JOIN columns
- `timestamps()` on all tables
- CHECK constraints for business rules (`votes_remaining >= 0`)
- Migration naming conventions
- Seeder patterns

### 2.4 Create `routing.instructions.md`

**File**: `.github/instructions/routing.instructions.md`
**Scope**: `applyTo: "routes/**"`

**Contents**:
- Middleware group structure (admin, student, public)
- RESTful resource routes
- Route naming conventions
- Rate limiting middleware on auth routes
- CSRF middleware presence

---

## Phase 3 — Improve Skills

### 3.1 Add output format contracts to all skills

**Current problem**: Skills describe procedures but not deliverables.

**Action**: Add an "Output Format" section to each skill:

**review-logic**:
```
## Output Format
A markdown table with columns: Severity | Location | Issue | Fix
Followed by a summary: "X critical, Y warning, Z info issues found."
```

**scaffold-feature**:
```
## Output Format
List of files created with brief description of each.
Then run review-logic and security-audit on the generated code.
```

**security-audit**:
```
## Output Format
A markdown table per vulnerability class with columns: Severity | File:Line | Issue | Fix
Final summary with pass/fail per OWASP category.
```

### 3.2 Add skill chaining to scaffold-feature

**Action**: Add to the end of `scaffold-feature/SKILL.md`:

```markdown
### Step 4 — Run follow-up skills
After scaffolding, suggest running:
1. `review-logic` on any Service class generated
2. `security-audit` on the controller and form request
```

### 3.3 Add a `write-test` skill

**File**: `.github/skills/write-test/SKILL.md`

**Contents**:
- Takes a feature or class name as input
- Generates feature test with happy path, edge cases, and failure paths
- Uses factories, `RefreshDatabase`, proper assertions
- Names tests as readable requirements
- Runs tests and verifies they pass

---

## Phase 4 — Fix Specific Content Issues

### 4.1 Fix spacing rule accuracy

**File**: `ui-tailwind.instructions.md` line 56

**Current**: "Never use arbitrary values like `mt-7`, `pb-13`, `gap-5`"
**Fix**: Remove `gap-5` from the banned list — it's 20px, a valid Tailwind default value.
Reword to: "Never use non-standard Tailwind spacing values like `mt-7`, `pb-13`, `gap-9`.
Stick to the default scale: 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24."

### 4.2 Standardize code example labels

**Action**: Across all instruction files, use consistent labels:
- `// DO — [explanation]` for correct patterns
- `// DON'T — [explanation]` for incorrect patterns

### 4.3 Add error handling patterns

**File**: `laravel-security.instructions.md` (new section)

**Contents**:
```markdown
## Error Handling
- Let Laravel's exception handler manage 404/403/500 — don't catch ModelNotFoundException
  in controllers unless you need custom behavior
- Use `abort(403)` / `abort(404)` for authorization/not-found — not custom exceptions
- In Services: throw specific exceptions, let controller/handler translate to HTTP responses
- Never catch exceptions silently — always log or re-throw
- Never log full request payloads (may contain passwords)
```

---

## Implementation Order

| Step | Action | Files Affected | Effort |
|------|--------|---------------|--------|
| 1 | Refactor copilot-instructions.md to hub | 1 file | Medium |
| 2 | Add applyTo to code-quality-checklist | 1 file | Trivial |
| 3 | Deduplicate security from checklist + copilot | 2 files | Low |
| 4 | Deduplicate logic eval from copilot | 1 file | Low |
| 5 | Create testing.instructions.md | New file | Medium |
| 6 | Create database.instructions.md | New file | Medium |
| 7 | Create routing.instructions.md | New file | Low |
| 8 | Add output contracts to 3 skills | 3 files | Low |
| 9 | Add skill chaining to scaffold-feature | 1 file | Trivial |
| 10 | Fix spacing rule in ui-tailwind | 1 file | Trivial |
| 11 | Add error handling to laravel-security | 1 file | Low |
| 12 | Create write-test skill | New file | Medium |
| 13 | Standardize code example labels | 4 files | Low |

**Estimated token savings**: ~40% reduction in per-interaction prompt size by eliminating
duplication and adding proper `applyTo` scoping.
