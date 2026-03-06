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
   - Follow component patterns from `.github/instructions/ui-tailwind.instructions.md`

7. **Routes**
   - Add to `routes/web.php` in the correct middleware group
   - Follow patterns from ARCHITECTURE.md §5

### Step 3 — Self-evaluate

After generating all files, run through these checks:

1. **Trace the happy path** end-to-end: form submission → validation → service → database → response
2. **Trace a failure**: invalid input → what does the user see?
3. **Check security**: CSRF present? Input validated? Queries parameterized? Output escaped?
4. **Check naming**: All class/method/variable names readable and consistent?
5. **Check architecture**: Controller thin? Logic in service? Model clean?

## File Naming Convention

| Component | Pattern | Example |
|---|---|---|
| Controller | `{Area}\{Model}Controller` | `Admin\BoothController` |
| Service | `{Feature}Service` | `VoteService` |
| Form Request | `{Action}{Model}Request` | `CastVoteRequest` |
| Model | `{ModelName}` | `Booth`, `StudentReference` |
| Migration | `create_{table}_table` | `create_booths_table` |
| View | `{area}/{feature}/{action}.blade.php` | `admin/booths/create.blade.php` |
