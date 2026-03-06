---
name: scaffold-feature
description: "Scaffold a new Laravel feature with controller, service, form request, and Blade views. Use when building a new page, form, or CRUD feature in the Itechtivity voting system. Generates all files following ARCHITECTURE.md structure."
argument-hint: "Name of the feature to scaffold (e.g., 'admin booth management', 'student vote casting')"
---

# Scaffold a Laravel Feature

Generate all the files needed for a new feature, following the project's architecture and conventions.

## When to Use
- Building a new admin CRUD page (students, booths, votes)
- Adding a new student-facing feature (vote casting, history)
- Creating a new public page (transparency, booth listing)

## Procedure

### Step 1 — Identify the feature scope

Determine from the user's request:
- **Area**: admin, student, or public
- **Actions**: index, show, create, store, edit, update, destroy (which ones?)
- **Has business logic?** → needs a Service class
- **Accepts user input?** → needs Form Request classes
- **Modifies data?** → needs `DB::transaction()`, audit logging

### Step 2 — Generate files in this order

1. **Migration** (if new table needed)
   - File: `database/migrations/{timestamp}_create_{table}_table.php`
   - Include foreign keys, indexes, CHECK constraints per ARCHITECTURE.md §1
   - Follow rules in `database.instructions.md`

2. **Model**
   - File: `app/Models/{ModelName}.php`
   - Define: `$fillable`, relationships, scopes, casts
   - No query logic — just model definitions

3. **Service** (if business logic exists)
   - File: `app/Services/{FeatureName}Service.php`
   - Constructor injection for dependencies
   - Short methods, each doing one thing
   - `DB::transaction()` for multi-step writes
   - `lockForUpdate()` for anything involving vote counts

4. **Form Request** (one per action that accepts input)
   - File: `app/Http/Requests/{Action}{Model}Request.php`
   - Example: `CastVoteRequest`, `StoreBoothRequest`, `GrantVotesRequest`
   - Include `authorize()` method for policy checks
   - Strict validation rules — validate types, existence, boundaries

5. **Controller**
   - File: `app/Http/Controllers/{Area}/{Model}Controller.php`
   - Thin controller — delegates to Service, returns views
   - Uses Form Request type hints, not inline validation
   - Never contains business logic

6. **Blade Views**
   - Directory: `resources/views/{area}/{feature}/`
   - Mobile-first layout, Tailwind utility classes
   - `@csrf` in every form, `{{ }}` for all output
   - Follow rules in `ui-tailwind.instructions.md`

7. **Routes**
   - Add to `routes/web.php` in the correct middleware group
   - Follow patterns from ARCHITECTURE.md §5 and `routing.instructions.md`

8. **Tests**
   - File: `tests/Feature/{Area}/{Feature}Test.php`
   - Cover happy path, validation failures, authorization
   - Follow rules in `testing.instructions.md`

### Step 3 — Self-evaluate

After generating all files, run through these checks:

1. **Trace the happy path** end-to-end: form submission → validation → service → database → response
2. **Trace a failure**: invalid input → what does the user see?
3. **Check security**: CSRF present? Input validated? Queries parameterized? Output escaped?
4. **Check naming**: All class/method/variable names readable and consistent?
5. **Check architecture**: Controller thin? Logic in service? Model clean?

### Step 4 — Run follow-up reviews

After scaffolding is complete, run these skills on the generated code:
1. **`review-logic`** — on any Service class generated (catches race conditions, off-by-one errors)
2. **`security-audit`** — on the controller and form request (catches auth gaps, input handling issues)

## File Naming Convention

| Component | Pattern | Example |
|---|---|---|
| Controller | `{Area}\{Model}Controller` | `Admin\BoothController` |
| Service | `{Feature}Service` | `VoteService` |
| Form Request | `{Action}{Model}Request` | `CastVoteRequest` |
| Model | `{ModelName}` | `Booth`, `StudentReference` |
| Migration | `create_{table}_table` | `create_booths_table` |
| View | `{area}/{feature}/{action}.blade.php` | `admin/booths/create.blade.php` |
| Test | `{Area}/{Feature}Test` | `Admin/BoothManagementTest` |

## Output Format

After scaffolding, present a summary table of all files created:

| File | Purpose |
|---|---|
| `database/migrations/..._create_booths_table.php` | Migration with FK, indexes, constraints |
| `app/Models/Booth.php` | Model with relationships and scopes |
| `app/Services/BoothService.php` | Business logic for booth CRUD |
| `app/Http/Requests/StoreBoothRequest.php` | Validation for creating a booth |
| `app/Http/Controllers/Admin/BoothController.php` | Thin controller delegating to service |
| `resources/views/admin/booths/index.blade.php` | Listing page |
| `tests/Feature/Admin/BoothManagementTest.php` | Feature tests for booth CRUD |

Then state: **"Scaffolding complete. Running review-logic and security-audit..."**
