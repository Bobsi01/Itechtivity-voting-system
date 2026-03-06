---
description: "Use after generating or modifying any code in the project. Enforces a mandatory quality and security review checklist covering readability, naming, security, UI consistency, maintainability, efficiency, and architecture compliance."
---
# Post-Generation Code Quality & Security Checklist

After writing or modifying ANY code, run through every item below. This is not optional.

## 1. Readability Check

- [ ] Can a 3rd-year college student read this code and understand it without asking questions?
- [ ] Are `if/else` blocks used instead of nested ternaries or clever one-liners?
- [ ] Are methods under 30 lines and single-purpose?
- [ ] Are comments explaining **why**, not **what**?
- [ ] Is there any "clever" code that should be rewritten for clarity?

## 2. Naming Check

- [ ] Classes use PascalCase with full, readable words: `VoteService`, not `VS` or `VoteSvc`
- [ ] Methods are camelCase, verb-first, and read like a sentence: `castVote()`, not `doVote()`
- [ ] Variables are descriptive: `$votesRemaining`, not `$vr` or `$data`
- [ ] Database columns are snake_case full words: `student_number`, not `stu_num`
- [ ] No vague names: `$data`, `$info`, `$temp`, `$result`, `$stuff`
- [ ] No over-engineered names: `AbstractBaseVoteServiceFactory`

## 3. Security Check

- [ ] Every `<form>` has `@csrf`
- [ ] User input goes through Form Request classes, not inline `$request->validate()`
- [ ] Only `$request->validated()` is used — never `$request->all()` or `$request->input()` without validation
- [ ] All Blade output uses `{{ }}` (escaped) — `{!! !!}` only for HTMLPurifier-sanitized content
- [ ] Database queries use Eloquent/Query Builder with parameter binding — zero raw SQL with user input
- [ ] File uploads validate MIME type + size, stored in `storage/app/private/`, UUID filenames
- [ ] Passwords are bcrypt hashed — never logged, never stored plain
- [ ] Rate limiting applied to registration (5/IP/15min) and login (5/account, 20/IP/10min)
- [ ] Session security: `secure`, `http_only`, `same_site: strict`
- [ ] Admin routes protected by `AdminMiddleware`, student routes by `ActiveUserMiddleware`
- [ ] Vote casting uses `DB::transaction()` with `lockForUpdate()` — no race conditions
- [ ] Admin vote modifications require `justification` field

## 4. UI Consistency Check (for Blade/frontend code)

- [ ] Mobile-first: smallest screen styled first, responsive prefixes (`sm:`, `md:`, `lg:`) scale up
- [ ] No AI slop: no gradients on cards, no glassmorphism, no decorative blobs, no generic hero text
- [ ] Buttons are consistent: same padding, radius, focus rings across entire app
- [ ] Spacing uses multiples of 4: `p-4`, `gap-4`, `space-y-4` — no `mt-7` or `pb-13`
- [ ] Cards use `bg-white border border-gray-200 rounded-lg` — no shadow stacking
- [ ] All tap targets are at least 44px tall
- [ ] Tables → stacked cards on mobile
- [ ] Toast notifications for feedback — no `alert()` boxes

## 5. Maintainability Check

- [ ] Business logic lives in Services (`VoteService`, `CrossCheckService`) — not in controllers
- [ ] Controllers only handle HTTP request/response
- [ ] Models define relationships, scopes, casts — no raw queries
- [ ] Side effects use Events + Listeners (broadcasting, tallies)
- [ ] Constructor injection used — no `app()` or `resolve()` calls
- [ ] No repository pattern, no DTOs, no API resources (this is a Blade app)

## 6. Efficiency Check

- [ ] N+1 query risk? Use `with()` eager loading where relationships are accessed in loops
- [ ] Database indexes on columns used in WHERE/JOIN clauses
- [ ] Vote tallies read from `vote_tallies` cache table — not `COUNT(*)` on `votes`
- [ ] Large imports handled via queued jobs — not in the HTTP request cycle
- [ ] No unnecessary database queries (e.g., fetching full records when only IDs are needed)

## 7. Architecture Compliance

- [ ] File is in the correct directory per `ARCHITECTURE.md` Section 4
- [ ] Route follows the pattern in `ARCHITECTURE.md` Section 5
- [ ] Database changes match the schema in `ARCHITECTURE.md` Section 1
- [ ] New models/controllers/services follow existing naming patterns in the project

## 8. Logic Self-Evaluation (CRITICAL)

Do NOT skip this. Trace through the generated code before presenting it.

- [ ] **Happy path traced**: Walk through with valid input — does the correct thing happen?
- [ ] **Edge cases traced**: Empty input, null values, zero counts, boundary values (`votes_remaining = 0`)
- [ ] **Failure path traced**: What happens when a record isn't found, validation fails, or a transaction rolls back?
- [ ] **Algorithm matches ARCHITECTURE.md**: If implementing cross-check (§2) or vote casting (§3), every step is in correct order with correct conditions
- [ ] **No off-by-one errors**: `>=` vs `>`, `<` vs `<=` used correctly for comparisons
- [ ] **No race conditions**: Multi-step writes wrapped in `DB::transaction()` with `lockForUpdate()`
- [ ] **Boolean logic correct**: `&&`/`||` conditions, negations (`!`) in the right place
- [ ] **Event timing correct**: Broadcasts fire AFTER transaction commits (`afterCommit`), not inside
- [ ] **Error handling complete**: Exceptions either propagate correctly or are caught with proper user feedback
- [ ] **Comparisons normalized**: Emails lowercased + trimmed before comparing, names through Jaro-Winkler before scoring
