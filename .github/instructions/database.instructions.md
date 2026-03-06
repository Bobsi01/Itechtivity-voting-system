---
description: "Use when writing migrations, seeders, or factories. Enforces PostgreSQL compatibility, foreign key constraints, indexes, CHECK constraints, and naming conventions for the Itechtivity voting system."
applyTo: "database/**"
---
# Database & Migration Rules

## PostgreSQL Only

All migrations must be PostgreSQL-compatible. Do not use MySQL-only syntax.

## Migration Structure

```php
// DO — complete migration with constraints
Schema::create('votes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->onDelete('cascade');
    $table->foreignId('booth_id')->constrained()->onDelete('cascade');
    $table->timestamps();

    $table->unique(['user_id', 'booth_id']); // Prevent duplicate votes
    $table->index('booth_id');               // Used in WHERE/JOIN
});

// DON'T — missing constraints
Schema::create('votes', function (Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('user_id'); // No foreign key
    $table->unsignedBigInteger('booth_id');
    $table->timestamps();
    // No unique constraint, no indexes
});
```

## Required Constraints

- **Foreign keys**: Always use `->constrained()->onDelete('cascade')` or `->onDelete('restrict')` as appropriate per `ARCHITECTURE.md` §1
- **Unique indexes**: On columns with uniqueness requirements (`student_number`, `email`, `[user_id, booth_id]`)
- **Indexes**: On every column used in WHERE clauses or JOINs
- **CHECK constraints**: For business rules — `votes_remaining >= 0` on users table
- **Timestamps**: `$table->timestamps()` on all tables unless there's a specific reason not to

## Naming Conventions

| Item | Pattern | Example |
|---|---|---|
| Migration file | `create_{table}_table` | `create_booths_table` |
| Migration file (alter) | `add_{column}_to_{table}_table` | `add_category_to_booths_table` |
| Table names | plural snake_case | `student_references`, `vote_tallies` |
| Column names | snake_case full words | `student_number`, `votes_remaining`, `is_active` |
| Foreign keys | `{singular_table}_id` | `user_id`, `booth_id` |
| Boolean columns | `is_` prefix | `is_active`, `is_claimed` |

## Seeders

- `AdminSeeder` — creates the initial admin account (required for deployment)
- Factory-based seeders for development data
- Never seed production-sensitive data (real student records, passwords)

## Factories

- Every model must have a Factory in `database/factories/`
- Use meaningful default values, not random gibberish
- Define states for common variants: `User::factory()->student()`, `User::factory()->admin()`
- Use `sequence()` for lists with varied data
