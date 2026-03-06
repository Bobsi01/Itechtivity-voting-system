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
- Every variable, method, and class name should read like plain English — a student seeing the code for the first time should understand it without documentation
- Avoid magic numbers — use named constants or config values
- Comment only the **why**, never the **what** (the code itself should explain the what)

## Naming Conventions

All names must be human-readable and natural, never abbreviated or cryptic:

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

## Security Requirements

Security is mandatory on every piece of code. Follow `ARCHITECTURE.md` Sections 15.1–15.12:

### Authentication & Authorization
- All passwords hashed with `bcrypt` (Laravel default)
- Session config: `secure: true`, `http_only: true`, `same_site: strict`
- Role checks via `AdminMiddleware` and `ActiveUserMiddleware`
- Laravel Policies for vote casting, booth management, vote modification
- Regenerate session ID after login (`$request->session()->regenerate()`)

### Input Handling
- **Every** form uses `@csrf` Blade directive
- **Every** user input validated via Form Request classes with strict rules
- **Never** trust client-side data — always re-validate server-side
- Use `$request->validated()` to get only validated fields — never `$request->all()`

### Database Security
- Eloquent ORM or Query Builder with parameter binding for ALL queries
- **Zero** raw SQL with interpolated user input
- Database constraints: unique indexes, CHECK constraints, foreign keys

### File Uploads
- Validate MIME type, file size, and dimensions server-side
- Store uploads in `storage/app/private/` — never in `public/`
- Use UUID filenames to prevent path traversal

### Output Security
- Use `{{ }}` (escaped) for all Blade output — never `{!! !!}` unless HTML-purified
- Apply `SecurityHeadersMiddleware` on all routes (X-Frame-Options, CSP, HSTS, etc.)

### Rate Limiting
- Registration: max 5 attempts per IP per 15 minutes
- Login: max 5 failed attempts per account, 20 per IP per 10 minutes
- Use Laravel `RateLimiter` — never roll custom throttling

## UI / Frontend Rules

### Design Philosophy
- **Mobile-first**: Design for 375px screens, then scale up with Tailwind responsive prefixes (`sm:`, `md:`, `lg:`)
- **Consistent and clean**: Every page must feel like part of the same app
- **No AI slop**: Avoid overly polished, generic-looking hero sections, gradient-heavy cards, or "startup template" aesthetics. The UI should look like a **real student project** — clean, functional, slightly opinionated

### Tailwind CSS Rules
- Use Tailwind utility classes directly in Blade templates — no custom CSS unless absolutely necessary
- Stick to a consistent color palette defined in `tailwind.config.js` (primary, secondary, accent, neutral)
- Use `space-y-*`, `gap-*` for spacing — avoid arbitrary `mt-7` or `pb-13` values
- Button styles must be consistent project-wide: same padding, border-radius, font-size, hover states
- Minimum tap target: 44px height for all interactive elements on mobile

### UI Anti-Patterns (NEVER do these)
- No gradient text or gradient backgrounds on cards
- No floating particles, animated backgrounds, or decorative SVG blobs
- No "glassmorphism" or frosted-glass card effects
- No oversized hero sections with stock-photo-style placeholder text
- No excessive rounded corners (`rounded-3xl` on everything)
- No shadow stacking (`shadow-lg shadow-xl shadow-2xl`)
- No generic placeholder copy like "Welcome to our amazing platform" or "Empowering students with technology"
- No lorem ipsum in committed code

### UI Patterns to Follow
- Simple white/gray cards with subtle borders (`border border-gray-200`)
- Clear visual hierarchy: one primary action per screen, secondary actions are visually quieter
- Consistent spacing rhythm: use multiples of 4 (`p-4`, `p-8`, `gap-4`, `gap-8`)
- Tables on desktop → stacked cards on mobile for data-heavy views
- Form inputs: clear labels above inputs, visible focus rings, inline validation errors below fields
- Toast notifications for success/error feedback — not alert boxes
- Loading states: simple spinner or skeleton, not elaborate animations

## Database & Migration Rules

Follow the schema in `ARCHITECTURE.md` Section 1 exactly:
- PostgreSQL as the database — all migrations must be PostgreSQL-compatible
- Always add foreign key constraints with `constrained()->onDelete('cascade')` or `restrict` as appropriate
- Always add indexes on columns used in WHERE clauses or JOINs
- Use `timestamps()` on all tables unless there's a specific reason not to
- Migration names: `create_votes_table`, `add_category_to_booths_table` — descriptive, Laravel convention

## Testing Approach

- Write feature tests for critical paths: registration cross-check, vote casting, admin actions
- Use Laravel's built-in `TestCase` with `RefreshDatabase` trait
- Factory classes for all models
- Test names: `test_student_cannot_vote_twice_for_same_booth()` — reads like a requirement
- Assert HTTP status codes, database state, and session messages

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

## Self-Evaluation of Logic (Mandatory)

After generating any code that contains business logic, **stop and trace through the logic manually** before presenting it. This is not optional.

### How to Self-Evaluate
1. **Trace the happy path**: Walk through the code line by line with valid input. Does it produce the correct output?
2. **Trace edge cases**: What happens with empty input, null values, zero counts, boundary values (e.g., `votes_remaining = 0`)?
3. **Trace the failure path**: What happens when validation fails, a record isn't found, or a transaction rolls back? Are errors handled gracefully?
4. **Check algorithm correctness against ARCHITECTURE.md**: If implementing a documented algorithm (cross-check registration §2, vote casting §3), verify every step is implemented in the correct order with the correct conditions.
5. **Check for off-by-one errors**: Are comparisons using `<` vs `<=` correctly? Is `votes_remaining >= 1` (not `> 1`)?
6. **Check for race conditions**: Any multi-step write without a transaction + lock? Any read-then-write without `lockForUpdate()`?
7. **Verify boolean logic**: Are `&&`/`||` conditions correct? Could De Morgan's law have been misapplied? Are negations (`!`, `not`) in the right place?

### Common Logic Bugs to Catch
- Decrementing `votes_remaining` BEFORE checking if it's sufficient
- Checking `is_claimed` but not inside the same transaction as the create
- Broadcasting the event BEFORE the transaction commits (use `afterCommit`)
- Returning a success response when an exception was silently caught
- Using `firstOrFail()` without a try-catch or letting the 404 propagate correctly
- Comparing emails without normalizing (lowercase + trim) first

## Code Quality Checklist (Run After Every Generation)

After generating any code, mentally verify:

1. **Readability**: Can a 3rd-year student understand this code without extra explanation?
2. **Naming**: Are all names human-readable, descriptive, and consistent with conventions above?
3. **Security**: Is user input validated? Is output escaped? Are queries parameterized? Is CSRF present on forms?
4. **No AI slop**: Does the UI look like a real student project, not a SaaS landing page template?
5. **Maintainability**: Are methods short and single-purpose? Is business logic in services, not controllers?
6. **Efficiency**: Are there N+1 query risks? Is eager loading used where needed? Are database indexes in place?
7. **Architecture compliance**: Does the code follow the structure in `ARCHITECTURE.md`?
8. **Logic correctness**: Did you trace through the code with valid input, edge cases, and failure paths? Does it match the algorithm in `ARCHITECTURE.md`?
