---
name: security-audit
description: "Audit PHP, Blade, and JavaScript code for security vulnerabilities. Use when reviewing controllers, services, middleware, form requests, views, or routes for OWASP Top 10 issues: SQL injection, XSS, CSRF, broken auth, insecure file uploads, missing rate limiting, race conditions, and sensitive data exposure."
argument-hint: "File or area to audit (e.g., 'auth controllers', 'VoteService', 'all Blade views')"
---

# Security Audit

Systematically check code against ARCHITECTURE.md §15 and OWASP Top 10.

## When to Use
- Before deploying or merging any feature
- After writing authentication or authorization code
- After writing code that handles file uploads
- After writing code that displays user-generated content
- When reviewing vote casting or any financial/counting logic

## Audit Procedure

### Step 1 — Identify the attack surface

Read the code and list:
- All routes that accept user input (POST, PATCH, PUT, DELETE)
- All places user input is used (queries, views, file operations)
- All authentication/authorization checks
- All file upload handling
- All data displayed to users

### Step 2 — Check each vulnerability class

#### A. SQL Injection (ARCHITECTURE.md §15.3)
- [ ] All queries use Eloquent or Query Builder with parameter binding
- [ ] Zero instances of string interpolation in SQL: `"WHERE id = $id"`
- [ ] Zero instances of `DB::raw()` with user input
- [ ] If raw SQL needed: uses `?` placeholders with bound params

**Search for**: `DB::raw`, `DB::statement`, `DB::select` with string concatenation

#### B. Cross-Site Scripting / XSS (§15.4)
- [ ] All Blade output uses `{{ }}` (auto-escaped)
- [ ] `{!! !!}` only used for HTMLPurifier-sanitized content
- [ ] No `echo`, `print`, or `<?=` with user data
- [ ] CSP header set: `default-src 'self'`
- [ ] No inline `onclick` or `javascript:` URLs with dynamic data

**Search for**: `{!!`, `echo $`, `<?=`, `->html()`

#### C. CSRF (§15.2)
- [ ] Every `<form>` in Blade includes `@csrf`
- [ ] AJAX requests include `X-CSRF-TOKEN` from meta tag
- [ ] Only GET routes are CSRF-exempt (read-only public pages)

**Search for**: `<form` without `@csrf`, POST routes without CSRF middleware

#### D. Broken Authentication (§15.1)
- [ ] Passwords hashed with bcrypt — never stored or logged plain
- [ ] Session regenerated after login: `$request->session()->regenerate()`
- [ ] Account `is_active` checked on every authenticated request
- [ ] Brute-force protection: 5 failed logins → 15 min lockout
- [ ] Session config: `secure: true`, `http_only: true`, `same_site: strict`

**Search for**: `password` in logs or plain assignments, missing `regenerate()`

#### E. Broken Authorization (§15.5)
- [ ] Admin routes behind `AdminMiddleware`
- [ ] Student routes behind `ActiveUserMiddleware`
- [ ] IDOR check: users can only access their own resources
- [ ] Laravel Policies enforce: who can cast votes, manage booths, modify votes
- [ ] Vote modification requires `justification` field

**Search for**: Routes without middleware, `$request->user()->id` compared to resource owner

#### F. Insecure File Uploads (§15.7)
- [ ] MIME type validated server-side: `mimes:csv,xlsx` or `mimes:jpeg,png,webp`
- [ ] File size limited: `max:10240` (10MB) or `max:5120` (5MB)
- [ ] Stored in `storage/app/private/` — never `public/`
- [ ] UUID filename: `Str::uuid() . '.' . $file->extension()`
- [ ] Image dimensions validated if applicable

**Search for**: `->store(`, `->storeAs(` to verify storage paths

#### G. Race Conditions (§15.6)
- [ ] Vote casting uses `DB::transaction()` with `lockForUpdate()` on user row
- [ ] `votes_remaining` re-checked AFTER acquiring lock
- [ ] `is_claimed` set in same transaction as user creation
- [ ] Database constraint: `UNIQUE(user_id, booth_id)` on votes table
- [ ] Database constraint: `CHECK(votes_remaining >= 0)` on users table

**Search for**: `decrement(`, `increment(` outside transactions

#### H. Sensitive Data Exposure (§15.9, §15.10)
- [ ] `APP_DEBUG=false` in production `.env`
- [ ] Passwords never in logs — no `Log::info($request->all())`
- [ ] Error pages don't leak stack traces in production
- [ ] `.env` in `.gitignore`
- [ ] API responses don't include unnecessary user data

**Search for**: `Log::` with `$request`, `dd(`, `dump(`, `APP_DEBUG=true`

#### I. Rate Limiting (§15.1)
- [ ] Registration: 5 attempts/IP/15 min, 3 per student_number/hour
- [ ] Login: 5 per account, 20 per IP per 10 min
- [ ] Uses Laravel `RateLimiter` — no custom implementation

**Search for**: Registration and login routes → verify throttle middleware applied

#### J. Security Headers (§15.8)
- [ ] `SecurityHeadersMiddleware` applied to all routes
- [ ] Headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy

### Step 3 — Report findings

## Output Format

Present findings as a markdown table grouped by vulnerability class:

**SQL Injection**
| Severity | File:Line | Issue | Fix |
|---|---|---|---|
| critical | `VoteController.php:34` | Raw SQL with interpolated `$id` | Use `Vote::where('id', $id)->first()` |

**XSS**
| Severity | File:Line | Issue | Fix |
|---|---|---|---|
| (no issues found) | | | |

End with a summary table:

| Category | Status |
|---|---|
| SQL Injection | PASS |
| XSS | PASS |
| CSRF | 1 issue found |
| Authentication | PASS |
| Authorization | PASS |
| File Uploads | N/A (not present) |
| Race Conditions | PASS |
| Data Exposure | PASS |
| Rate Limiting | PASS |
| Security Headers | PASS |

**Overall: PASS / FAIL (X critical, Y high, Z medium, W low issues)**
