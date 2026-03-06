# Itechtivity Voting System — Copilot Instructions

## Project Overview

Laravel 11 + Tailwind CSS + PostgreSQL voting system for a 4th-year student event.
See `ARCHITECTURE.md` for full schema, algorithms, routes, and deployment plan.

## Code Level & Style

Write code at a **3rd-year college student level**. This means:
- Prefer straightforward, readable logic over clever one-liners or abstract patterns
- Avoid over-engineering: no repository pattern, no service-of-services, no excessive abstraction layers
- Use simple `if/else` blocks over deeply nested ternaries
- Keep methods short (under 30 lines) and single-purpose
- Every variable, method, and class name should read like plain English
- Avoid magic numbers — use named constants or config values
- Comment only the **why**, never the **what**

## Naming Conventions

### PHP / Laravel
- **Classes**: `StudentReference`, `VoteService`, `BoothController` — PascalCase, full words, no acronyms
- **Methods**: `castVote()`, `grantVotesToStudent()`, `getActiveBooths()` — camelCase, verb-first, reads like a sentence
- **Variables**: `$votesRemaining`, `$activeBooth`, `$studentReference` — camelCase, descriptive, no `$sr` or `$vr`
- **Database columns**: `student_number`, `votes_remaining`, `is_active` — snake_case, full words
- **Routes**: `/admin/students/{user}/grant-votes` — kebab-case, RESTful, human-readable URLs
- **Blade views**: `booths/index.blade.php`, `admin/students/index.blade.php` — lowercase, slash-separated by feature
- **Config keys**: `voting_open_at`, `max_votes_per_student` — snake_case descriptive keys

### JavaScript
- **Variables/functions**: `camelCase` — `updateVoteCount()`, `boothId`, `totalVotes`
- **Constants**: `UPPER_SNAKE_CASE` — `POLLING_INTERVAL_MS`, `MAX_RECONNECT_ATTEMPTS`
- **CSS classes**: Tailwind utility classes only; custom classes use kebab-case: `vote-bump`, `booth-card`

### Naming Anti-Patterns (NEVER do these)
- `$data`, `$info`, `$temp`, `$result` — too vague
- `$sr`, `$usr`, `$v` — unreadable abbreviations
- `handleStuff()`, `processData()`, `doWork()` — meaningless verbs
- `AbstractBaseVoteServiceFactory` — over-engineered class names

## Architecture Rules

Follow the structure defined in `ARCHITECTURE.md` Section 4:
- **Controllers** handle HTTP request/response only — no business logic in controllers
- **Services** (`CrossCheckService`, `VoteService`, `AuditService`) contain all business logic
- **Models** define relationships, scopes, casts, and attribute accessors — no query logic in controllers
- **Events + Listeners** for side effects (broadcasting, tally updates)
- **Jobs** for async work (CSV import)
- **Middleware** for auth, role checks, rate limiting, security headers

### Patterns to Follow
- Eloquent ORM for all database queries — never raw SQL with user input
- Form Request classes for validation (not inline `$request->validate()` in controllers)
- Resource routes where applicable
- Database transactions with `DB::transaction()` for multi-step writes
- Pessimistic locking (`lockForUpdate()`) for vote casting to prevent race conditions

### Patterns to Avoid
- No repository pattern — use Eloquent directly in services
- No DTOs for internal data — use arrays or Eloquent models
- No event sourcing — simple CRUD with audit logging
- No API resources/transformers — this is a Blade app, not an SPA
- No `app()` or `resolve()` calls — use constructor injection

## Scoped Rules (auto-applied by file type)

Detailed rules are in dedicated instruction files that auto-apply to matching files:
- **Security** (`**/*.php`): See `laravel-security.instructions.md`
- **UI / Tailwind** (`resources/views/**`): See `ui-tailwind.instructions.md`
- **Quality checklist** (`**/*.php`, `resources/views/**`): See `code-quality-checklist.instructions.md`
- **Testing** (`tests/**`): See `testing.instructions.md`
- **Database** (`database/**`): See `database.instructions.md`
- **Routing** (`routes/**`): See `routing.instructions.md`

## Build & Run Commands

```
composer install                          # Install PHP dependencies
npm install                               # Install JS dependencies
cp .env.example .env                      # Setup environment
php artisan key:generate                  # Generate app key
php artisan migrate                       # Run migrations
php artisan db:seed --class=AdminSeeder   # Seed admin account
npm run dev                               # Vite dev server
php artisan serve                         # Laravel dev server
php artisan reverb:start                  # WebSocket server
php artisan queue:work                    # Queue worker
```

## Self-Evaluation (Mandatory)

After generating any code with business logic, **stop and trace through the logic** before presenting it. At minimum:
1. **Happy path**: Walk through with valid input — does it produce the correct result?
2. **Edge cases**: Empty input, null values, zero counts, boundary values (`votes_remaining = 0`)
3. **Failure path**: Validation fails, record not found, transaction rolls back — handled gracefully?

For the full tracing procedure, use the `review-logic` skill.
