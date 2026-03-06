---
description: "Use when writing or modifying tests. Enforces feature test conventions, factory usage, naming standards, and assertion patterns for the Itechtivity voting system."
applyTo: "tests/**"
---
# Testing Rules

## Test Type

Write **feature tests** (HTTP-level) for all critical paths. Unit tests only for isolated algorithms (e.g., Jaro-Winkler scoring).

## Test Structure — Arrange, Act, Assert

```php
public function test_student_cannot_vote_for_inactive_booth(): void
{
    // Arrange — set up the world
    $student = User::factory()->student()->create(['votes_remaining' => 3]);
    $booth = Booth::factory()->create(['is_active' => false]);

    // Act — perform the action
    $response = $this->actingAs($student)
        ->post(route('votes.store'), ['booth_id' => $booth->id]);

    // Assert — verify the outcome
    $response->assertStatus(422);
    $this->assertDatabaseMissing('votes', ['user_id' => $student->id]);
    $this->assertEquals(3, $student->fresh()->votes_remaining);
}
```

## Conventions

- Every test class uses `RefreshDatabase` trait
- Every model has a corresponding Factory class in `database/factories/`
- Test names read like requirements: `test_student_cannot_vote_twice_for_same_booth()`
- Use `test_` prefix method naming — not `@test` annotations
- One assertion concept per test — don't combine unrelated checks

## What to Assert

- **HTTP status codes**: `assertStatus(200)`, `assertRedirect()`, `assertForbidden()`
- **Database state**: `assertDatabaseHas()`, `assertDatabaseMissing()`, `assertDatabaseCount()`
- **Session messages**: `assertSessionHas('success')`, `assertSessionHasErrors('email')`
- **Model state**: `$user->fresh()->votes_remaining` after operations

## Critical Paths That Must Have Tests

1. **Registration cross-check**: valid student, invalid student number, email mismatch, duplicate claim
2. **Vote casting**: successful vote, no votes remaining, inactive booth, duplicate vote, outside time window
3. **Admin grant votes**: valid grant, grant to inactive student
4. **Admin vote modification**: valid modification with justification, missing justification rejected
5. **Login**: valid credentials, invalid credentials, inactive account blocked

## Anti-Patterns

- DON'T mock Eloquent models — test through the HTTP layer with real database
- DON'T test framework behavior (e.g., "does Laravel hash passwords?")
- DON'T write tests that pass regardless of implementation (always verify they fail when logic is wrong)
- DON'T use `$this->withoutExceptionHandling()` unless debugging — tests should verify user-facing behavior
