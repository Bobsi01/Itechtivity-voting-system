---
description: "Use when writing PHP controllers, services, middleware, form requests, models, or any Laravel backend code. Enforces security-first coding: CSRF, parameterized queries, input validation, session hardening, rate limiting, file upload safety, and output escaping."
applyTo: "**/*.php"
---
# Laravel Security Rules

## Input Validation — Non-Negotiable

Every controller action that accepts user input MUST use a dedicated Form Request class:

```php
// DO — dedicated Form Request
public function store(CastVoteRequest $request)
{
    $validated = $request->validated();
    // ...
}

// DON'T — inline validation in controller
public function store(Request $request)
{
    $request->validate([...]); // Never do this
}
```

- Never use `$request->all()` — always `$request->validated()`
- Never trust hidden form fields or client-side computed values
- Validate IDs as `exists:table,column` to prevent tampering

## Database Queries — Parameterized Only

```php
// DO — parameterized queries
User::where('student_number', $studentNumber)->first();
DB::select('SELECT * FROM users WHERE id = ?', [$id]);

// DON'T — SQL injection risk
DB::statement("DELETE FROM users WHERE id = $id");
DB::raw("WHERE name = '{$name}'");
```

- Use Eloquent ORM or Query Builder exclusively
- Use `lockForUpdate()` inside `DB::transaction()` for vote casting
- Never interpolate variables into raw SQL strings

## Authentication & Sessions

- Hash passwords with bcrypt (Laravel default) — never store plaintext
- Regenerate session after login: `$request->session()->regenerate()`
- Check `is_active` on every authenticated request via `ActiveUserMiddleware`
- Check role via `AdminMiddleware` — never inline role checks in controllers
- Use Laravel Policies for authorization (`VotePolicy`, `BoothPolicy`)

## CSRF Protection

- Every `<form>` in Blade templates MUST include `@csrf`
- Every AJAX POST/PATCH/DELETE must send `X-CSRF-TOKEN` header
- Only the public transparency page (read-only GET) is CSRF-exempt

## Output Escaping

```php
// DO — auto-escaped
{{ $booth->name }}

// DON'T — unless content is sanitized through HTMLPurifier
{!! $purifiedDescription !!}
```

- Default to `{{ }}` for all Blade output
- Only use `{!! !!}` for content sanitized through HTMLPurifier
- Never echo raw user input in any context

## Rate Limiting

- Registration: max 5 attempts/IP/15 min, 3 failed attempts/student_number/hour
- Login: 5 failed attempts per account → 15 min lockout, 20 per IP per 10 min
- Use Laravel `RateLimiter` facade — never write custom throttle logic

## File Uploads

```php
// Validate strictly
$request->validate([
    'file' => ['required', 'file', 'mimes:csv,xlsx', 'max:10240'],
    'banner_image' => ['image', 'mimes:jpeg,png,webp', 'max:5120',
                        'dimensions:min_width=400,min_height=200'],
]);

// UUID filename — prevents path traversal
$filename = Str::uuid() . '.' . $file->extension();
// Store in private directory — never in public/
$file->storeAs('private/uploads', $filename);
```

## Security Headers (SecurityHeadersMiddleware)

Applied to all responses:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

## Audit Logging

Every admin action that modifies data must be logged via `AuditService::log()`:

```php
AuditService::log(
    action: 'vote.modify',
    target: $vote,
    oldValue: $vote->getOriginal(),
    newValue: $request->validated(),
    justification: $request->justification
);
```

- Vote modifications REQUIRE a non-empty `justification` field
- Audit logs are append-only — no delete capability

## Error Handling

```php
// DO — let Laravel's exception handler manage standard errors
public function show(Booth $booth)
{
    // Route model binding handles 404 automatically
    return view('booths.show', compact('booth'));
}

// DO — use abort() for authorization/not-found
abort(403, 'You are not authorized to modify this vote.');
abort(404);

// DON'T — catch exceptions silently
try {
    $service->castVote($user, $booth);
} catch (\Exception $e) {
    // Never swallow exceptions with no logging or feedback
}
```

- Let Laravel's exception handler manage 404/403/500 — don't catch `ModelNotFoundException` unless you need custom behavior
- Use `abort(403)` / `abort(404)` for authorization and not-found — not custom exception classes
- In Services: throw specific exceptions, let the controller or exception handler translate to HTTP responses
- Never catch exceptions silently — always log or re-throw
- Never log full request payloads — they may contain passwords (`Log::info($request->all())` is forbidden)
