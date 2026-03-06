---
description: "Mandatory post-generation quality checklist. Run after writing or modifying any PHP or Blade code. Covers readability, naming, security, UI, maintainability, efficiency, architecture, and logic correctness."
applyTo: "**/*.php,resources/views/**/*.blade.php"
---
# Post-Generation Code Quality Checklist

After writing or modifying ANY code, run through every item below. This is not optional.

## 1. Readability

- [ ] Can a 3rd-year college student read this code and understand it without asking questions?
- [ ] Are `if/else` blocks used instead of nested ternaries or clever one-liners?
- [ ] Are methods under 30 lines and single-purpose?
- [ ] Are comments explaining **why**, not **what**?
- [ ] Is there any "clever" code that should be rewritten for clarity?

## 2. Naming

- [ ] Classes use PascalCase with full, readable words: `VoteService`, not `VS` or `VoteSvc`
- [ ] Methods are camelCase, verb-first, and read like a sentence: `castVote()`, not `doVote()`
- [ ] Variables are descriptive: `$votesRemaining`, not `$vr` or `$data`
- [ ] Database columns are snake_case full words: `student_number`, not `stu_num`
- [ ] No vague names: `$data`, `$info`, `$temp`, `$result`, `$stuff`
- [ ] No over-engineered names: `AbstractBaseVoteServiceFactory`

## 3. Security (quick check — full rules in `laravel-security.instructions.md`)

- [ ] Every `<form>` has `@csrf`
- [ ] User input validated via Form Request classes, accessed with `$request->validated()`
- [ ] All Blade output uses `{{ }}` (escaped) — `{!! !!}` only for HTMLPurifier-sanitized content
- [ ] Database queries use Eloquent/Query Builder — zero raw SQL with user input
- [ ] Vote casting uses `DB::transaction()` with `lockForUpdate()`

## 4. UI Consistency (for Blade/frontend code — full rules in `ui-tailwind.instructions.md`)

- [ ] Mobile-first: smallest screen styled first, responsive prefixes scale up
- [ ] No AI slop: no gradients on cards, no glassmorphism, no decorative blobs
- [ ] Buttons, cards, inputs are consistent project-wide
- [ ] Spacing uses Tailwind's default scale — no arbitrary values

## 5. Maintainability

- [ ] Business logic lives in Services — not in controllers
- [ ] Controllers only handle HTTP request/response
- [ ] Models define relationships, scopes, casts — no raw queries
- [ ] Side effects use Events + Listeners (broadcasting, tallies)
- [ ] Constructor injection used — no `app()` or `resolve()` calls
- [ ] No repository pattern, no DTOs, no API resources (this is a Blade app)

## 6. Efficiency

- [ ] N+1 query risk? Use `with()` eager loading where relationships are accessed in loops
- [ ] Database indexes on columns used in WHERE/JOIN clauses
- [ ] Vote tallies read from `vote_tallies` cache table — not `COUNT(*)` on `votes`
- [ ] Large imports handled via queued jobs — not in the HTTP request cycle

## 7. Architecture Compliance

- [ ] File is in the correct directory per `ARCHITECTURE.md` Section 4
- [ ] Route follows the pattern in `ARCHITECTURE.md` Section 5
- [ ] Database changes match the schema in `ARCHITECTURE.md` Section 1
- [ ] New models/controllers/services follow existing naming patterns

## 8. Logic Correctness (trace before presenting — full procedure in `review-logic` skill)

- [ ] **Happy path traced**: Valid input produces correct output
- [ ] **Edge cases traced**: Empty input, null, zero, boundary values
- [ ] **Failure path traced**: Record not found, validation fails, transaction rolls back
- [ ] **Algorithm matches ARCHITECTURE.md**: Steps in correct order with correct conditions
- [ ] **No off-by-one errors**: `>=` vs `>`, `<` vs `<=` used correctly
- [ ] **No race conditions**: Multi-step writes use `DB::transaction()` + `lockForUpdate()`
- [ ] **Event timing**: Broadcasts fire AFTER transaction commits (`afterCommit`)
