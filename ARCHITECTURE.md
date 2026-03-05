# Itechtivity Voting System — Implementation Plan

## Context
Itechtivity is a 4th-year student event where thesis/booth groups are showcased and fellow students vote for their favorites. The system must be secure (cross-checked registration), transparent (live vote counts), fully audited, and highly mobile-optimized. Built on Laravel + Tailwind CSS + PostgreSQL.

---

## 1. Database Schema

### `student_references` (pre-imported master list)
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| student_number | varchar(20) | unique, required |
| email | varchar(255) | unique, required |
| first_name | varchar(100) | |
| last_name | varchar(100) | |
| course | varchar(100) | |
| year_level | tinyint | |
| is_claimed | boolean | default false — set true once account created |
| created_at / updated_at | timestamps | |

### `users`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| student_reference_id | bigint FK → student_references | nullable for admin |
| student_number | varchar(20) | unique |
| email | varchar(255) | unique |
| first_name | varchar(100) | |
| last_name | varchar(100) | |
| password | varchar(255) | bcrypt hashed |
| role | enum('student','admin') | default 'student' |
| votes_remaining | tinyint | default 0 — admin grants this |
| email_verified_at | timestamp | nullable |
| is_active | boolean | default true |
| created_at / updated_at | timestamps | |

### `booths`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| name | varchar(255) | thesis/project name |
| description | text | |
| banner_image | varchar(255) | file path |
| category | varchar(100) | |
| is_active | boolean | default true |
| created_at / updated_at | timestamps | |

### `booth_members`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| booth_id | bigint FK → booths | |
| name | varchar(255) | |
| role | varchar(100) | e.g. Developer, Designer |
| position | varchar(100) | e.g. Project Lead |
| photo | varchar(255) | nullable |

### `votes`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | bigint FK → users | voter |
| booth_id | bigint FK → booths | |
| cast_at | timestamp | |
| ip_address | varchar(45) | |
| user_agent | text | |

### `vote_tallies` (materialized cache for live display)
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| booth_id | bigint FK → booths | unique |
| total_votes | int | default 0 |
| updated_at | timestamp | |

### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| user_id | bigint FK → users | who performed action |
| action | varchar(100) | e.g. 'vote.modify', 'vote.grant', 'booth.update' |
| target_type | varchar(100) | morphable model |
| target_id | bigint | |
| old_value | jsonb | nullable |
| new_value | jsonb | nullable |
| justification | text | required for vote modifications |
| ip_address | varchar(45) | |
| created_at | timestamp | |

### `vote_grants` (log of admin granting vote counts)
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| admin_id | bigint FK → users | |
| student_id | bigint FK → users | |
| votes_granted | tinyint | |
| note | text | nullable |
| created_at | timestamp | |

### `import_batches`
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| admin_id | bigint FK → users | |
| filename | varchar(255) | |
| total_rows | int | |
| imported_rows | int | |
| failed_rows | int | |
| status | enum('pending','processing','done','failed') | |
| created_at / updated_at | timestamps | |

---

## 2. Cross-Check Registration Algorithm

This is the core anti-spam mechanism. Steps executed when a student submits the registration form:

### Input Fields (registration form)
- Student Number
- Email Address
- First Name
- Last Name
- Password (+ confirm)

### Algorithm (Step-by-Step)

```
STEP 1 — Exact lookup by student_number
  ref = student_references.find_by(student_number: input.student_number)
  if NOT found → REJECT with: "Student number not found in our records."

STEP 2 — Email cross-check
  if ref.email != normalize(input.email) → REJECT with:
    "Email does not match our records for this student number."
  (normalize = lowercase, trim whitespace)

STEP 3 — Name soft validation (warn, not hard block)
  similarity_score = jaro_winkler(ref.first_name, input.first_name)
                   + jaro_winkler(ref.last_name,  input.last_name)
  if score < 0.70 → flag for admin review (account created but marked pending_review)
  if score >= 0.70 → proceed normally

STEP 4 — Duplicate account check
  if users.exists(student_number: input.student_number) → REJECT:
    "An account already exists for this student number."
  if student_references.find(student_number).is_claimed = true → REJECT same message

STEP 5 — Rate limiting
  Max 5 registration attempts per IP per 15 minutes (Laravel RateLimiter)
  Max 3 failed attempts per student_number per hour

STEP 6 — Create account
  BEGIN TRANSACTION
    Create users record (link student_reference_id)
    Set student_references.is_claimed = true
    Log audit: action='user.register', new_value={student_number, email}
  COMMIT

STEP 7 — Email verification (optional but recommended)
  Send verification email to ref.email (not user-supplied — use the one on record)
```

### Edge Cases Handled
| Scenario | Handling |
|---|---|
| Student typos their name | Jaro-Winkler soft check — flagged for admin review, not hard blocked |
| Student uses alias email | Hard reject — must use institutional email on record |
| Student tries to register twice | is_claimed flag + duplicate student_number check |
| Non-student tries to guess student numbers | Rate limiting per IP + per student_number |
| Admin manually creates a student account | Bypass cross-check, directly set is_claimed = true |
| Student email changed since import | Admin can update student_reference before student registers |

---

## 3. Voting System Algorithm

```
CAST VOTE (student submits vote form):
  STEP 1 — Auth check: user must be logged in + role = student
  STEP 2 — votes_remaining check: user.votes_remaining >= 1 → else REJECT
  STEP 3 — Booth validation: booth must be active
  STEP 4 — Duplicate vote guard: votes.exists(user_id, booth_id) → REJECT
  STEP 5 — Voting window check: current time within admin-configured open/close window
  STEP 6 — BEGIN TRANSACTION
    Insert votes row
    Decrement users.votes_remaining by 1
    Increment vote_tallies.total_votes for booth
    Log audit: action='vote.cast'
  COMMIT
  STEP 7 — Broadcast VoteCast event (triggers live update)
```

---

## 4. Project Structure (Laravel)

```
app/
  Http/
    Controllers/
      Auth/
        RegisterController.php      # cross-check logic
        LoginController.php
      Admin/
        DashboardController.php
        StudentController.php       # manage students, grant votes
        BoothController.php
        VoteController.php          # modify/override votes with justification
        AuditController.php
        ImportController.php        # CSV/Excel import
        ExportController.php        # PDF export
      Student/
        DashboardController.php
        VoteController.php          # cast votes
        BoothController.php         # view booths
    Middleware/
      AdminMiddleware.php
      ActiveUserMiddleware.php
  Models/
    User.php
    StudentReference.php
    Booth.php
    BoothMember.php
    Vote.php
    VoteTally.php
    AuditLog.php
    VoteGrant.php
    ImportBatch.php
  Services/
    CrossCheckService.php           # registration cross-check logic
    VoteService.php                 # vote casting logic
    AuditService.php                # audit logging helper
    ImportService.php               # CSV/Excel parsing + import
    PdfExportService.php            # PDF generation
  Events/
    VoteCast.php                    # broadcast event
  Listeners/
    UpdateVoteTally.php
  Jobs/
    ProcessStudentImport.php        # queued import job

resources/
  views/
    layouts/
      app.blade.php                 # main layout (mobile-first)
      admin.blade.php
    auth/
      login.blade.php
      register.blade.php
    student/
      dashboard.blade.php
      vote.blade.php
      booths/index.blade.php
      booths/show.blade.php
    admin/
      dashboard.blade.php
      students/index.blade.php
      booths/index.blade.php
      booths/create.blade.php
      votes/index.blade.php
      audit/index.blade.php
      import/index.blade.php
    transparency/
      index.blade.php               # public live vote page
  js/
    live-votes.js                   # websocket listener for live count

routes/
  web.php
  channels.php                      # broadcast channel auth

database/
  migrations/
    001_create_student_references_table.php
    002_create_users_table.php
    003_create_booths_table.php
    004_create_booth_members_table.php
    005_create_votes_table.php
    006_create_vote_tallies_table.php
    007_create_audit_logs_table.php
    008_create_vote_grants_table.php
    009_create_import_batches_table.php
  seeders/
    AdminSeeder.php
```

---

## 5. Routes (web.php)

```php
// Public
Route::get('/transparency', [TransparencyController::class, 'index']);
Route::get('/booths', [BoothController::class, 'index']);
Route::get('/booths/{booth}', [BoothController::class, 'show']);

// Auth
Route::get('/register', [RegisterController::class, 'show']);
Route::post('/register', [RegisterController::class, 'store']);
Route::get('/login', [LoginController::class, 'show']);
Route::post('/login', [LoginController::class, 'store']);
Route::post('/logout', [LoginController::class, 'destroy']);

// Student (auth + active)
Route::middleware(['auth', 'active'])->prefix('student')->group(function () {
    Route::get('/dashboard', [Student\DashboardController::class, 'index']);
    Route::get('/vote', [Student\VoteController::class, 'index']);
    Route::post('/vote', [Student\VoteController::class, 'store']);
    Route::get('/history', [Student\VoteController::class, 'history']);
});

// Admin
Route::middleware(['auth', 'admin'])->prefix('admin')->group(function () {
    Route::get('/dashboard', [Admin\DashboardController::class, 'index']);
    Route::resource('/students', Admin\StudentController::class);
    Route::post('/students/{user}/grant-votes', [Admin\StudentController::class, 'grantVotes']);
    Route::resource('/booths', Admin\BoothController::class);
    Route::get('/votes', [Admin\VoteController::class, 'index']);
    Route::patch('/votes/{vote}', [Admin\VoteController::class, 'update']); // requires justification
    Route::delete('/votes/{vote}', [Admin\VoteController::class, 'destroy']); // requires justification
    Route::get('/audit', [Admin\AuditController::class, 'index']);
    Route::get('/import', [Admin\ImportController::class, 'index']);
    Route::post('/import', [Admin\ImportController::class, 'store']);
    Route::get('/export/pdf', [Admin\ExportController::class, 'pdf']);
});
```

---

## 6. Real-Time Live Vote Count

**Approach: Laravel Broadcasting + Pusher (or Laravel Reverb for self-hosted)**

1. When a vote is cast → fire `VoteCast` event
2. `VoteCast` broadcasts on public channel `votes`
3. Transparency page JS listens via Echo → updates DOM counter without page reload
4. Fallback: polling every 5s if websocket unavailable (graceful degradation)

```js
// live-votes.js
Echo.channel('votes')
  .listen('VoteCast', (e) => {
    document.querySelector(`#booth-${e.booth_id}-count`).textContent = e.total_votes;
    // animate the counter
  });
```

---

## 7. PDF Export

**Package: `barryvdh/laravel-dompdf`**

- Admin triggers export via `/admin/export/pdf`
- Generates: ranked booth list with vote counts, timestamp, admin signature
- Includes: total participants, total votes cast, per-booth breakdown
- Blade view rendered to PDF: `resources/views/exports/results.blade.php`

---

## 8. CSV/Excel Import

**Package: `maatwebsite/laravel-excel`**

- Admin uploads CSV/XLSX file
- Columns expected: `student_number, email, first_name, last_name, course, year_level`
- Validation: student_number unique, email valid format
- Queued job `ProcessStudentImport` handles large files asynchronously
- Admin sees real-time import status via batch tracking (`import_batches` table)
- Duplicate rows (by student_number) are skipped and reported

---

## 9. Admin Audit System

Every admin action goes through `AuditService::log()`:

```php
AuditService::log(
  action: 'vote.modify',
  target: $vote,
  oldValue: $vote->getOriginal(),
  newValue: $request->validated(),
  justification: $request->justification  // required for vote changes
);
```

- Vote modifications require a non-empty `justification` field (enforced at controller + validation layer)
- Audit log is read-only — no admin can delete it
- Admin audit index page: filterable by action, date range, admin user

---

## 10. Mobile-First UI Guidelines

- Tailwind breakpoints: design for `sm` (375px) first, scale up
- Bottom navigation bar for students (Dashboard, Vote, History)
- Large tap targets (minimum 44px height for buttons)
- Sticky header with hamburger menu for admin panel
- Vote form: full-width cards with booth image, swipeable on mobile
- Transparency page: animated vote bars, auto-refreshing, readable on small screens
- Admin tables: horizontal scroll with frozen first column on mobile

---

## 11. Key Packages

```json
// composer.json additions
"barryvdh/laravel-dompdf": "^2.0",
"maatwebsite/laravel-excel": "^3.1",
"pusher/pusher-php-server": "^7.0",   // or use Laravel Reverb (free, self-hosted)
"laravel/sanctum": "^3.0"
```

```json
// package.json additions
"laravel-echo": "^1.15",
"pusher-js": "^8.0"
```

---

## 12. Deployment Plan

### DigitalOcean (Recommended over Heroku — no cold starts, PostgreSQL first-class)
1. Create Droplet (Ubuntu 22.04, $12/mo minimum)
2. Install: Nginx, PHP 8.2, Composer, Node.js, PostgreSQL
3. Configure Nginx vhost → point to Laravel `public/`
4. Set up `.env` with DB credentials, Pusher/Reverb keys, mail config
5. Run: `php artisan migrate --force`, `php artisan db:seed --class=AdminSeeder`
6. Set up queue worker: `php artisan queue:work` as a systemd service
7. SSL: Let's Encrypt via Certbot
8. Connect domain from Name.com → DigitalOcean nameservers

### Heroku (Alternative)
1. `heroku create itechtivity-voting`
2. Add Postgres addon: `heroku addons:create heroku-postgresql`
3. Set buildpacks: heroku/php + heroku/nodejs
4. Push code → auto-deploy on git push
5. Configure Procfile: `web: vendor/bin/heroku-php-nginx public/`
6. Add Pusher addon or use external Pusher account

---

## 13. Repo Documentation File

The plan document is committed to the repo as **`ARCHITECTURE.md`** at the repo root.

- Path: `/home/user/Itechtivity-voting-system/ARCHITECTURE.md`
- This file serves as the single source of truth for DB schema, algorithms, routes, security, and deployment
- Committed in Phase 1 alongside the initial Laravel scaffold
- Updated as the system evolves

---

## 13a. Implementation Order (Phases)

| Phase | Tasks |
|---|---|
| 1 | Commit `ARCHITECTURE.md` to repo root; Laravel scaffold, DB migrations, models, seeders |
| 2 | Auth system + CrossCheckService (registration + login) |
| 3 | Admin: student import (CSV), booth management |
| 4 | Voting system: grant votes, cast votes, history |
| 5 | Live vote count (broadcasting + transparency page) |
| 6 | Audit log system |
| 7 | PDF export |
| 8 | Mobile UI polish (Tailwind, all views) |
| 9 | Deployment + DNS setup |
| 10 | UAT + security review |

---

## 14. Security Implementation

### 14.1 Authentication Security

#### Password Policy
- Minimum 8 characters, must contain uppercase, lowercase, number
- Enforced via Laravel `Password::min(8)->mixedCase()->numbers()` rule
- Passwords hashed with `bcrypt` (cost factor 12)
- No plaintext passwords ever logged or stored

#### Session Security
```php
// config/session.php
'secure'    => true,       // HTTPS-only cookies
'http_only' => true,       // JS cannot access session cookie
'same_site' => 'strict',   // CSRF protection layer
'lifetime'  => 120,        // 2-hour session timeout
```

#### Login Brute-Force Protection
```
Per-account lockout:
  - 5 failed login attempts → account locked for 15 minutes
  - Track via Laravel RateLimiter keyed by: sha256(email + ip)
  - After lockout: send unlock email to registered address

Per-IP throttle:
  - 20 login attempts per IP per 10 minutes → 429 Too Many Requests
  - Implemented in LoginController using ThrottleRequests middleware
```

#### Account Status Checks on Login
```
STEP 1 — Credentials valid?
STEP 2 — is_active = true? (admin can deactivate accounts)
STEP 3 — email_verified_at NOT null? (if email verification is enabled)
STEP 4 — Account not locked by brute-force?
STEP 5 — Regenerate session ID after login (session fixation prevention)
```

---

### 14.2 CSRF Protection
- Laravel's built-in `VerifyCsrfToken` middleware applied to ALL POST/PATCH/DELETE routes
- Every form includes `@csrf` Blade directive
- AJAX requests must send `X-CSRF-TOKEN` header (set automatically via `meta[name=csrf-token]`)
- Transparency page (public, read-only) exempt from CSRF

---

### 14.3 SQL Injection Prevention
- **All** DB queries use Eloquent ORM or Query Builder with parameter binding
- Zero raw SQL with user input — no `DB::statement("... $userInput ...")`
- If raw queries ever needed: use `DB::select('... WHERE col = ?', [$value])`
- PostgreSQL prepared statements enforced at the driver level

---

### 14.4 XSS Prevention
- Blade's `{{ }}` syntax auto-escapes all output
- `{!! !!}` (unescaped) used ONLY for admin-controlled rich text (booth descriptions)
- Admin-entered HTML sanitized with `HTMLPurifier` before storing to DB
- Content-Security-Policy header set via middleware:
```
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
```

---

### 14.5 Authorization — Role & Policy Layer

#### Middleware Stack
```
web routes      → web middleware group (session, CSRF)
student routes  → auth + active (ActiveUserMiddleware)
admin routes    → auth + admin (AdminMiddleware)
```

#### AdminMiddleware.php
```php
if (auth()->user()->role !== 'admin') {
    abort(403, 'Unauthorized.');
}
```

#### Laravel Policies (fine-grained)
| Policy | Rules |
|---|---|
| `VotePolicy@cast` | user.role = student, votes_remaining > 0, booth active, within voting window |
| `VotePolicy@modify` | user.role = admin only, justification required |
| `BoothPolicy@manage` | admin only |
| `StudentPolicy@grantVotes` | admin only, max grant cap enforced |

#### Voting Window Enforcement
```php
// system_settings table (key-value)
// voting_open_at  → datetime
// voting_close_at → datetime

// In VoteService::cast():
$open  = SystemSetting::get('voting_open_at');
$close = SystemSetting::get('voting_close_at');
if (now()->notBetween($open, $close)) {
    throw new VotingClosedException();
}
```

---

### 14.6 Vote Integrity Safeguards

#### Database-Level Constraints
```sql
-- Prevent same user voting for same booth twice (DB enforced, not just app-level)
ALTER TABLE votes ADD CONSTRAINT uq_user_booth UNIQUE (user_id, booth_id);

-- votes_remaining cannot go negative
ALTER TABLE users ADD CONSTRAINT chk_votes_remaining CHECK (votes_remaining >= 0);
```

#### Atomic Vote Transaction with Pessimistic Locking
```php
DB::transaction(function () use ($user, $booth) {
    // Lock the user row to prevent race conditions (two simultaneous votes)
    $user = User::lockForUpdate()->find($user->id);

    if ($user->votes_remaining < 1) {
        throw new InsufficientVotesException();
    }

    Vote::create([...]);
    $user->decrement('votes_remaining');
    VoteTally::where('booth_id', $booth->id)->increment('total_votes');
    AuditService::log('vote.cast', $booth, null, ['user_id' => $user->id]);
});
```

This prevents **race condition attacks** where a student rapidly double-submits to cast more votes than granted.

#### Vote Tampering Detection
- `vote_tallies.total_votes` must always equal `COUNT(*) FROM votes WHERE booth_id = ?`
- Scheduled command `php artisan votes:reconcile` runs every 5 minutes to verify tally integrity
- Any mismatch triggers an alert email to admin and an audit log entry

---

### 14.7 File Upload Security (Import + Booth Images)

#### CSV/Excel Import
```php
// Validation rules
$request->validate([
    'file' => [
        'required',
        'file',
        'mimes:csv,xlsx',
        'max:10240',  // 10MB max
    ]
]);

// Processing
// - Files saved to storage/app/private/imports/ (not publicly accessible)
// - Processed in a queued job — never parsed in the HTTP request cycle
// - Virus scan hook (optional): integrate ClamAV via Laravel job
```

#### Booth Banner Images
```php
$request->validate([
    'banner_image' => [
        'required',
        'image',                    // must be actual image (checks MIME, not extension)
        'mimes:jpeg,png,webp',
        'max:5120',                 // 5MB max
        'dimensions:min_width=400,min_height=200',
    ]
]);

// Stored in storage/app/public/booths/ — served via symlink, not direct web path
// Filename: UUID-based (not user-supplied) to prevent path traversal
$filename = Str::uuid() . '.' . $file->extension();
```

---

### 14.8 HTTP Security Headers

Set via `SecurityHeaders` middleware applied globally:

```php
$response->headers->set('X-Frame-Options', 'DENY');
$response->headers->set('X-Content-Type-Options', 'nosniff');
$response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
$response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
$response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

---

### 14.9 Environment & Secrets Management

```
# .env (never committed to git — in .gitignore)
APP_ENV=production
APP_DEBUG=false          # CRITICAL: false in production
APP_KEY=base64:...       # Generated with php artisan key:generate

DB_CONNECTION=pgsql
DB_PASSWORD=...          # Strong random password

PUSHER_APP_SECRET=...
MAIL_PASSWORD=...

# Secrets rotation plan:
# - APP_KEY: rotate yearly or after suspected compromise
# - DB passwords: rotate per deployment environment
```

- `.env` added to `.gitignore`
- `.env.example` committed with placeholder values only
- Production secrets stored in DigitalOcean environment variables (not in repo)

---

### 14.10 Logging & Intrusion Detection

#### Application Logs
```php
// Log suspicious activity to Laravel's log channel
Log::channel('security')->warning('Suspicious registration attempt', [
    'ip'             => $request->ip(),
    'student_number' => $request->student_number,
    'reason'         => 'student_number not found',
]);
```

#### Security Log Channel (config/logging.php)
```php
'security' => [
    'driver' => 'daily',
    'path'   => storage_path('logs/security.log'),
    'days'   => 90,
    'level'  => 'warning',
],
```

#### Events Logged to Security Log
| Event | Severity |
|---|---|
| Failed login (wrong password) | warning |
| Account locked (brute force) | critical |
| Registration cross-check failure | warning |
| Vote cast outside voting window | warning |
| Vote tally mismatch detected | critical |
| Admin action without justification attempt | error |
| File upload rejected (wrong type) | warning |
| Rate limit exceeded | warning |

---

### 14.11 additional Database Security

```sql
-- Create a restricted DB user for the application (principle of least privilege)
-- Application user cannot DROP tables, ALTER schema, or access pg_catalog
CREATE USER itechtivity_app WITH PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itechtivity_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itechtivity_app;
-- Admin seeder runs as a separate privileged user (migrations only)
```

---

### 14.12 Security Checklist for Go-Live

- [ ] `APP_DEBUG=false` in production `.env`
- [ ] All routes return 404 (not 500) for invalid IDs (use `findOrFail` + exception handler)
- [ ] HTTPS enforced — Certbot SSL installed, HTTP redirects to HTTPS
- [ ] Database not publicly accessible (firewall: only allow app server IP)
- [ ] File upload directory not web-accessible (`storage/app/private/`)
- [ ] `php artisan config:cache` and `route:cache` run in production
- [ ] Security headers verified via securityheaders.com
- [ ] Rate limiting tested: confirm 429 on 6th attempt
- [ ] Vote race condition tested: concurrent submissions only produce 1 vote
- [ ] Audit log verified: every admin action has a corresponding log entry
- [ ] Passwords never appear in logs (no `$request->all()` logging)
- [ ] Old/test admin accounts deactivated before event day

---

## 15. Verification / Testing Checklist

- [ ] Register with valid student_number + email → account created, is_claimed set true
- [ ] Register with wrong email for a student_number → rejected with correct message
- [ ] Register same student_number twice → rejected
- [ ] 6th registration attempt from same IP → rate limited (429)
- [ ] Admin imports CSV → students appear in student_references
- [ ] Admin grants 3 votes to a student → votes_remaining = 3
- [ ] Student casts 3 votes for 3 different booths → votes_remaining = 0
- [ ] Student tries 4th vote → rejected
- [ ] Transparency page updates live when vote is cast (< 1s)
- [ ] Admin modifies vote without justification → validation error
- [ ] Admin modifies vote with justification → audit log entry created
- [ ] PDF export generates correct ranked results
- [ ] All pages render correctly on 375px mobile screen
- [ ] Admin audit log shows all admin actions in chronological order
