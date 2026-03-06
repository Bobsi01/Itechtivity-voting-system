---
name: write-test
description: "Generate feature tests for a Laravel feature or class. Use when writing tests for vote casting, registration, admin actions, or any controller/service. Produces tests with happy path, edge cases, failure paths, and proper assertions."
argument-hint: "Feature or class to test (e.g., 'vote casting', 'VoteService', 'admin booth management')"
---

# Write Feature Tests

Generate comprehensive feature tests that verify behavior through the HTTP layer.

## When to Use
- After scaffolding a new feature with `scaffold-feature`
- After implementing a Service class with business logic
- When adding test coverage to existing untested code
- Before merging any feature that touches critical paths

## Procedure

### Step 1 — Identify what to test

Read the controller and service for the feature. List:
- All routes/actions available to users
- All validation rules in Form Requests
- All business logic conditions in the Service
- All authorization checks (middleware, policies)
- All database state changes

### Step 2 — Define test cases

For each action, write tests covering:

**Happy path** — valid input, authorized user, expected outcome:
```
test_student_can_cast_vote_for_active_booth()
test_admin_can_grant_votes_to_student()
```

**Validation failures** — each validation rule should have a test:
```
test_vote_requires_booth_id()
test_vote_rejects_nonexistent_booth()
```

**Authorization failures** — wrong role, inactive account:
```
test_guest_cannot_cast_vote()
test_inactive_student_cannot_cast_vote()
test_student_cannot_access_admin_routes()
```

**Business logic edge cases** — boundary values, constraints:
```
test_student_cannot_vote_with_zero_remaining()
test_student_cannot_vote_for_same_booth_twice()
test_student_cannot_vote_for_inactive_booth()
test_student_cannot_vote_outside_time_window()
```

**Database state verification** — data actually persisted correctly:
```
test_casting_vote_decrements_votes_remaining()
test_casting_vote_increments_booth_tally()
test_casting_vote_creates_audit_log()
```

### Step 3 — Write the test class

```php
namespace Tests\Feature;

use App\Models\User;
use App\Models\Booth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoteCastingTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_cast_vote_for_active_booth(): void
    {
        // Arrange
        $student = User::factory()->student()->create(['votes_remaining' => 3]);
        $booth = Booth::factory()->create(['is_active' => true]);

        // Act
        $response = $this->actingAs($student)
            ->post(route('votes.store'), ['booth_id' => $booth->id]);

        // Assert
        $response->assertRedirect();
        $response->assertSessionHas('success');
        $this->assertDatabaseHas('votes', [
            'user_id' => $student->id,
            'booth_id' => $booth->id,
        ]);
        $this->assertEquals(2, $student->fresh()->votes_remaining);
    }
}
```

### Step 4 — Verify test quality

Before presenting the tests:
- [ ] Every test has Arrange / Act / Assert sections
- [ ] Test names read like requirements
- [ ] Tests use factories, not manual model creation
- [ ] Tests assert HTTP status, database state, AND session messages
- [ ] Each test is independent — no shared state between tests
- [ ] Tests would FAIL if the feature logic were removed (not false-positive passing)

### Step 5 — Run and verify

Run the tests and confirm they pass:
```bash
php artisan test --filter={TestClassName}
```

If tests fail, diagnose and fix either the test or the implementation.

## Output Format

Present the test file, then a summary:

| Test | Covers |
|---|---|
| `test_student_can_cast_vote_for_active_booth` | Happy path — vote created, remaining decremented |
| `test_student_cannot_vote_with_zero_remaining` | Edge case — boundary at 0 votes |
| `test_student_cannot_vote_for_same_booth_twice` | Constraint — unique (user_id, booth_id) |
| `test_guest_cannot_cast_vote` | Auth — unauthenticated rejected |
| `test_casting_vote_decrements_votes_remaining` | State — database updated correctly |

**"X tests written covering Y happy paths, Z edge cases, W auth checks."**
