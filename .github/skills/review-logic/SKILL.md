---
name: review-logic
description: "Review and trace through business logic in PHP code. Use when verifying vote casting, cross-check registration, admin grant operations, or any multi-step database writes. Catches race conditions, off-by-one errors, wrong comparison operators, missing transaction locks, and algorithm mismatches against ARCHITECTURE.md."
argument-hint: "File or feature to review (e.g., 'VoteService', 'CrossCheckService', 'registration flow')"
---

# Logic Review

Trace through business logic line-by-line to catch bugs before they reach production.

## When to Use
- After writing or modifying any Service class
- After implementing cross-check registration (ARCHITECTURE.md §2)
- After implementing vote casting (ARCHITECTURE.md §3)
- After writing any code with `DB::transaction()` or `lockForUpdate()`
- When a feature "works" but you suspect an edge case is unhandled

## Review Procedure

### Step 1 — Read the code

Read the entire file being reviewed. Identify:
- All database writes (create, update, delete, increment, decrement)
- All conditionals that guard those writes
- Any transaction boundaries
- Any events dispatched

### Step 2 — Trace the happy path

Walk through with **valid, typical input**:
1. What enters the method? (parameters, request data)
2. What gets queried from the database?
3. What conditions are checked, and do they pass?
4. What gets written to the database?
5. What response does the user get?
6. Are all writes inside the same transaction?

### Step 3 — Trace edge cases

Test these inputs mentally:

| Input | Expected Behavior |
|---|---|
| `votes_remaining = 0` | Reject vote — not allow it through |
| `votes_remaining = 1` | Allow exactly 1 more vote, then 0 remaining |
| Booth `is_active = false` | Reject vote for this booth |
| Same user voting same booth twice | Reject — unique constraint `(user_id, booth_id)` |
| Voting outside time window | Reject — check `voting_open_at` / `voting_close_at` |
| Student number not in references | Reject registration |
| Email doesn't match reference | Reject — after lowercase + trim normalization |
| `is_claimed = true` already | Reject duplicate registration |
| Name similarity score < 0.70 | Flag for review, still create account |
| Empty string for `justification` | Reject vote modification |

### Step 4 — Check for common bugs

- [ ] **Decrement before check**: Is `votes_remaining` checked BEFORE decrementing? Never decrement first.
- [ ] **Lock before read**: Is `lockForUpdate()` called BEFORE reading `votes_remaining`? Reading without lock → race condition.
- [ ] **Transaction boundary**: Are ALL related writes inside the same `DB::transaction()`?
- [ ] **Event timing**: Are broadcast events fired AFTER the transaction commits? Use `afterCommit` on the event or dispatch outside the transaction.
- [ ] **Comparison operators**: `>=` vs `>` — is `votes_remaining >= 1` correct (yes), or was `> 0` used (also correct, but `> 1` is wrong)?
- [ ] **Boolean logic**: Are `&&` / `||` correct? Read the condition aloud: "user has votes remaining AND booth is active AND current time is within window."
- [ ] **Null checks**: Could any queried model be null? Is `findOrFail()` used, or is null handled?
- [ ] **Email normalization**: Is `strtolower(trim($email))` applied BEFORE comparison?
- [ ] **String comparison**: Are strings compared with `===` not `==` where type matters?
- [ ] **Return early pattern**: Do rejections `return` or `throw` before the main logic? Or could code fall through?

### Step 5 — Verify against ARCHITECTURE.md

For documented algorithms, verify each step:

**Cross-check registration (§2):**
1. Lookup by student_number → found?
2. Email cross-check → normalized match?
3. Name Jaro-Winkler → score >= 0.70?
4. Duplicate check → not exists AND not claimed?
5. Rate limiting applied?
6. All creation inside transaction?
7. `is_claimed` set in same transaction as user create?

**Vote casting (§3):**
1. Auth check → student role?
2. `votes_remaining >= 1`?
3. Booth active?
4. No duplicate vote for this booth?
5. Within voting window?
6. Transaction with `lockForUpdate()` on user row?
7. Re-check `votes_remaining` after lock?
8. Insert vote → decrement remaining → increment tally?
9. Audit log created?
10. Broadcast event after commit?

### Step 6 — Report findings

## Output Format

Present findings as a markdown table:

| Severity | Location | Issue | Fix |
|---|---|---|---|
| critical | `VoteService::castVote()` line 42 | `votes_remaining` decremented before check | Move check `if ($user->votes_remaining < 1)` before `$user->decrement()` |
| warning | `VoteService::castVote()` line 58 | Event dispatched inside transaction | Move `VoteCast::dispatch()` after `DB::transaction()` closure or add `afterCommit` |
| info | `VoteService::castVote()` line 30 | Variable `$v` is not descriptive | Rename to `$vote` |

End with a summary: **"X critical, Y warning, Z info issues found."**

If no issues: **"0 issues found — logic verified against ARCHITECTURE.md."**
