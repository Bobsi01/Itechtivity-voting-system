---
description: "Use when defining or modifying routes. Enforces middleware groups, RESTful conventions, route naming, and rate limiting for the Itechtivity voting system."
applyTo: "routes/**"
---
# Routing Rules

## Route Groups and Middleware

Follow the middleware structure from `ARCHITECTURE.md` §5:

```php
// Public routes — no auth required
Route::get('/transparency', [TransparencyController::class, 'index'])->name('transparency.index');

// Auth routes — rate limited
Route::middleware(['throttle:login'])->group(function () {
    Route::post('/login', [LoginController::class, 'store']);
});

// Student routes — authenticated + active
Route::middleware(['auth', 'active-user'])->group(function () {
    Route::resource('votes', VoteController::class)->only(['index', 'store']);
});

// Admin routes — authenticated + admin role
Route::middleware(['auth', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::resource('booths', Admin\BoothController::class);
    Route::resource('students', Admin\StudentController::class)->only(['index', 'show', 'edit', 'update']);
    Route::post('students/{user}/grant-votes', [Admin\StudentController::class, 'grantVotes'])
        ->name('students.grant-votes');
});
```

## Conventions

- **RESTful resource routes** where applicable — `Route::resource()` over individual route definitions
- **Route names**: dot-separated, matching controller structure — `admin.booths.index`, `votes.store`
- **URL paths**: kebab-case, human-readable — `/admin/grant-votes`, not `/admin/grantVotes`
- **Prefixes**: Group admin routes under `/admin`, API routes under `/api`

## Rate Limiting

Apply rate limiting middleware to auth-related routes:

| Route | Limit |
|---|---|
| Registration | 5 attempts/IP/15 min |
| Login | 5 per account, 20 per IP per 10 min |
| Vote casting | Handled by `lockForUpdate()`, not rate limiting |

Use Laravel's `RateLimiter` facade to define limits in `AppServiceProvider` — never custom throttle logic.

## Anti-Patterns

- DON'T define routes without middleware — every route must be in a middleware group
- DON'T use closures in route files — always reference controller methods
- DON'T duplicate route logic — use resource routes and additional methods on the same controller
- DON'T put business logic in route files — routes only map URLs to controller methods
