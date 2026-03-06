# Itechtivity Voting System — Architecture & Implementation Plan

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

### `system_settings` (key-value config)
| Column | Type | Notes |
|---|---|---|
| key | varchar(100) | PK e.g. 'voting_open_at', 'voting_close_at' |
| value | text | |
| updated_at | timestamp | |

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
  STEP 6 — BEGIN TRANSACTION (with pessimistic lock on user row)
    Lock user row: SELECT ... FOR UPDATE
    Re-check votes_remaining (race condition guard)
    Insert votes row
    Decrement users.votes_remaining by 1
    Increment vote_tallies.total_votes for booth
    Log audit: action='vote.cast'
  COMMIT
  STEP 7 — Broadcast VoteCast event → Reverb → all connected clients update live
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
      Api/
        VoteTallyController.php     # GET /api/vote-tallies (WS fallback polling)
    Middleware/
      AdminMiddleware.php
      ActiveUserMiddleware.php
      SecurityHeadersMiddleware.php
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
    SystemSetting.php
  Services/
    CrossCheckService.php           # registration cross-check logic
    VoteService.php                 # vote casting logic (atomic, locked)
    AuditService.php                # audit logging helper
    ImportService.php               # CSV/Excel parsing + import
    PdfExportService.php            # PDF generation
  Events/
    VoteCast.php                    # ShouldBroadcast — fires after each vote
  Listeners/
    UpdateVoteTally.php
  Jobs/
    ProcessStudentImport.php        # queued import job
  Console/
    Commands/
      ReconcileVoteTallies.php      # scheduled integrity check (every 5min)

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
      index.blade.php               # public live vote page (WebSocket-powered)
    exports/
      results.blade.php             # PDF template
  js/
    live-votes.js                   # Echo WebSocket listener + fallback polling

routes/
  web.php
  api.php                           # GET /api/vote-tallies — WS fallback endpoint
  channels.php                      # broadcast channel auth (public 'votes' channel)

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
    010_create_system_settings_table.php
  seeders/
    AdminSeeder.php
```

---

## 5. Routes

### web.php
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

### api.php (fallback polling)
```php
Route::get('/vote-tallies', [Api\VoteTallyController::class, 'index']);
```

---

## 6. Real-Time Live Vote Count (WebSocket — Laravel Reverb)

**Stack: Laravel Reverb (self-hosted WebSocket server) + Laravel Echo (client)**

Reverb is chosen over Pusher because:
- Free, no per-connection pricing
- Runs on the same server (no external dependency)
- Natively supported by Laravel Broadcasting since v11
- Handles 1,000 concurrent connections on a $24/mo DigitalOcean droplet comfortably

### Server-Side Event

```php
// app/Events/VoteCast.php
class VoteCast implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $booth_id,
        public int $total_votes,
        public string $booth_name,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel('votes')];  // public channel — no auth required
    }

    public function broadcastAs(): string
    {
        return 'VoteCast';
    }

    // Only send what the client needs — never expose user data
    public function broadcastWith(): array
    {
        return [
            'booth_id'    => $this->booth_id,
            'total_votes' => $this->total_votes,
            'booth_name'  => $this->booth_name,
        ];
    }
}
```

### Reverb Server Configuration

```php
// config/reverb.php (key settings)
'servers' => [
    'reverb' => [
        'host' => env('REVERB_SERVER_HOST', '0.0.0.0'),
        'port' => env('REVERB_SERVER_PORT', 8080),
        'max_connections'  => 1100,     // headroom above 1,000 target
        'max_request_size' => 10_000,   // 10KB per message — votes are tiny
    ]
],
```

### Reverb as a systemd Service (production)

```ini
# /etc/systemd/system/reverb.service
[Unit]
Description=Laravel Reverb WebSocket Server
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/itechtivity
ExecStart=php artisan reverb:start --host=0.0.0.0 --port=8080
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Nginx WebSocket Proxy

```nginx
# /etc/nginx/sites-available/itechtivity
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # HTTP Laravel app
    location / {
        root /var/www/itechtivity/public;
        try_files $uri $uri/ /index.php?$query_string;
    }

    # WebSocket upgrade — proxy to Reverb on port 8080
    location /app/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 60s;
    }
}
```

### Client-Side (Laravel Echo)

```js
// resources/js/live-votes.js
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';   // Echo uses Pusher protocol even with Reverb

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key:         import.meta.env.VITE_REVERB_APP_KEY,
    wsHost:      import.meta.env.VITE_REVERB_HOST,
    wsPort:      import.meta.env.VITE_REVERB_PORT ?? 8080,
    wssPort:     import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS:    true,
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
});

// Subscribe to the public votes channel
Echo.channel('votes')
    .listen('.VoteCast', (e) => {
        const counter = document.querySelector(`#booth-${e.booth_id}-count`);
        if (counter) {
            counter.textContent = e.total_votes;
            counter.classList.add('vote-bump');           // CSS animation trigger
            setTimeout(() => counter.classList.remove('vote-bump'), 600);
        }
    });
```

### Fallback Polling (graceful degradation)

```js
// If Reverb connection fails, fall back to polling every 5s
Echo.connector.pusher.connection.bind('failed', () => {
    console.warn('WebSocket unavailable — switching to polling');
    setInterval(() => {
        fetch('/api/vote-tallies')
            .then(r => r.json())
            .then(data => data.forEach(booth => {
                const el = document.querySelector(`#booth-${booth.id}-count`);
                if (el) el.textContent = booth.total_votes;
            }));
    }, 5000);
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
- Transparency page: animated vote bars, WebSocket-powered live counters, readable on small screens
- Admin tables: horizontal scroll with frozen first column on mobile

---

## 11. Key Packages

```json
// composer.json additions
"barryvdh/laravel-dompdf": "^2.0",
"maatwebsite/laravel-excel": "^3.1",
"laravel/reverb": "^1.0",
"laravel/sanctum": "^3.0"
```

```json
// package.json additions
"laravel-echo": "^1.15",
"pusher-js": "^8.0"
```

> Note: `pusher-js` is still required on the client — Laravel Echo uses the Pusher protocol even when connecting to Reverb. No Pusher account or API key is needed.

---

## 12. Capacity Planning — 1,000 Users / 200 Votes per Hour

### Load Profile
| Metric | Value | Notes |
|---|---|---|
| Peak concurrent users | ~1,000 | All students online during event |
| Votes per hour | ~200 | ~3.3 votes/minute, bursty not steady |
| WebSocket connections | ~1,000 | Each browser holds 1 persistent connection to Reverb |
| Vote events/min broadcast | ~4 | Each pushed to all 1,000 subscribers |
| DB writes per vote | 3 | `votes`, `users.votes_remaining`, `vote_tallies` |
| DB reads per page load | ~5–10 | Booth list, tally cache, user state |

This is a **light load** for a $24/mo DigitalOcean droplet. The primary resource consumer is Reverb holding 1,000 open connections — handled efficiently via ReactPHP's async I/O (no thread-per-connection).

### Server Sizing

**DigitalOcean Droplet: 2 vCPU / 4GB RAM ($24/mo)**
- Nginx: HTTP app traffic
- PHP-FPM: 50 workers — far exceeds the ~4 concurrent vote requests/min
- Laravel Reverb: 1,000 WebSocket connections ≈ ~150–250MB RAM at peak
- PostgreSQL: local, < 10 queries/second at peak burst = trivial
- Queue worker (database driver): 1 worker sufficient for async import jobs

### Broadcast Fan-Out Calculation
```
200 votes/hour = 3.3 events/minute
Each event broadcasts to 1,000 subscribers
= 3,300 WebSocket frames/minute = 55 frames/second
Each frame ≈ 200 bytes (JSON payload)
= ~11 KB/s outbound from Reverb → negligible
```

### DB Connection Pooling
```
PHP-FPM workers: 50
Each worker holds 1 DB connection when active
Peak concurrent DB connections at 200 votes/hr: ~5–10
PostgreSQL max_connections: 100 (default) → sufficient with room to spare
```

### Caching Strategy
- `vote_tallies` table = materialized cache — live counts served from here, not `COUNT(*)` queries
- `booths` list: file/Redis cache for 60s (avoids repeated reads during heavy page loads)
- Session driver: `database` (avoid `file` driver under concurrent load)

### Scalability Headroom
If the event ever grows beyond 1,000 users:
- Move PostgreSQL to DigitalOcean Managed Postgres ($15/mo) — zero code changes
- Add Redis for sessions + queue ($15/mo) — change env vars only
- Scale Reverb horizontally: multiple Reverb nodes + Redis pub/sub backend — config only

---

## 13. Deployment Plan

### DigitalOcean (Recommended — 2 vCPU / 4GB, $24/mo)
1. Create Droplet (Ubuntu 22.04)
2. Install: Nginx, PHP 8.3-fpm, Composer, Node.js 20, PostgreSQL 16
3. Configure PHP-FPM pool: `pm = dynamic`, `pm.max_children = 50`
4. Configure Nginx vhost with WebSocket proxy block for Reverb (see §6)
5. Set up `.env`: `BROADCAST_CONNECTION=reverb`, DB credentials, mail config
6. Run: `php artisan migrate --force`, `php artisan db:seed --class=AdminSeeder`
7. Install systemd services:
   - `laravel-queue.service` → `php artisan queue:work --tries=3`
   - `reverb.service` → `php artisan reverb:start --host=0.0.0.0 --port=8080`
8. SSL: `certbot --nginx` (Let's Encrypt)
9. Connect domain from registrar → DigitalOcean nameservers

### Heroku (Alternative — limited WebSocket support)
> Reverb requires a persistent process — use a Standard-2X dyno minimum. Free dynos sleep and cannot run Reverb.
```
# Procfile
web:    vendor/bin/heroku-php-nginx public/
worker: php artisan queue:work
reverb: php artisan reverb:start
```

---

## 14. Implementation Phases

| Phase | Tasks | Status |
|---|---|---|
| **1** | **Write and commit `ARCHITECTURE.md` to repo root** | ✅ Done |
| 2 | Laravel scaffold, DB migrations, models, seeders, `.env.example` | pending |
| 3 | Auth system + CrossCheckService (registration + login) | pending |
| 4 | Admin: student import (CSV), booth management | pending |
| 5 | Voting system: grant votes, cast votes, history | pending |
| 6 | WebSocket live vote count (Laravel Reverb + Echo + transparency page) | pending |
| 7 | Audit log system | pending |
| 8 | PDF export | pending |
| 9 | Mobile UI polish (Tailwind, all views) | pending |
| 10 | Deployment + Reverb systemd service + Nginx WS proxy + DNS | pending |
| 11 | UAT + security review + load test (simulate 1,000 connections) | pending |

---

## 15. Security Implementation

### 15.1 Authentication Security

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
  - Implemented via ThrottleRequests middleware on login route
```

#### Account Status Checks on Login
```
STEP 1 — Credentials valid?
STEP 2 — is_active = true? (admin can deactivate accounts)
STEP 3 — email_verified_at NOT null? (if email verification enabled)
STEP 4 — Account not locked by brute-force?
STEP 5 — Regenerate session ID after login (session fixation prevention)
```

---

### 15.2 CSRF Protection
- Laravel's built-in `VerifyCsrfToken` middleware on ALL POST/PATCH/DELETE routes
- Every form includes `@csrf` Blade directive
- AJAX requests must send `X-CSRF-TOKEN` header (auto-set via `meta[name=csrf-token]`)
- Transparency page (public, read-only) exempt from CSRF

---

### 15.3 SQL Injection Prevention
- **All** DB queries use Eloquent ORM or Query Builder with parameter binding
- Zero raw SQL with user input — no `DB::statement("... $userInput ...")`
- If raw queries ever needed: `DB::select('... WHERE col = ?', [$value])`
- PostgreSQL prepared statements enforced at the driver level

---

### 15.4 XSS Prevention
- Blade's `{{ }}` auto-escapes all output
- `{!! !!}` (unescaped) used ONLY for admin-controlled booth descriptions
- Admin-entered HTML sanitized with `HTMLPurifier` before storing
- Content-Security-Policy header:
```
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
```

---

### 15.5 Authorization — Role & Policy Layer

#### Middleware Stack
```
web routes      → web (session, CSRF, security headers)
student routes  → auth + active (ActiveUserMiddleware)
admin routes    → auth + admin (AdminMiddleware)
```

#### AdminMiddleware.php
```php
if (auth()->user()->role !== 'admin') {
    abort(403, 'Unauthorized.');
}
```

#### Laravel Policies
| Policy | Rules |
|---|---|
| `VotePolicy@cast` | role=student, votes_remaining > 0, booth active, within voting window |
| `VotePolicy@modify` | admin only, justification required |
| `BoothPolicy@manage` | admin only |
| `StudentPolicy@grantVotes` | admin only, max grant cap enforced |

#### Voting Window Enforcement
```php
// In VoteService::cast():
$open  = SystemSetting::get('voting_open_at');
$close = SystemSetting::get('voting_close_at');
if (now()->notBetween($open, $close)) {
    throw new VotingClosedException();
}
```

---

### 15.6 Vote Integrity Safeguards

#### Database-Level Constraints
```sql
-- Prevent same user voting for same booth twice (DB enforced)
ALTER TABLE votes ADD CONSTRAINT uq_user_booth UNIQUE (user_id, booth_id);

-- votes_remaining cannot go negative
ALTER TABLE users ADD CONSTRAINT chk_votes_remaining CHECK (votes_remaining >= 0);
```

#### Atomic Transaction with Pessimistic Locking
```php
DB::transaction(function () use ($user, $booth) {
    $user = User::lockForUpdate()->find($user->id);  // prevent race conditions

    if ($user->votes_remaining < 1) {
        throw new InsufficientVotesException();
    }

    Vote::create([...]);
    $user->decrement('votes_remaining');
    VoteTally::where('booth_id', $booth->id)->increment('total_votes');
    AuditService::log('vote.cast', $booth, null, ['user_id' => $user->id]);
});
```

#### Vote Tally Reconciliation
- Scheduled command `votes:reconcile` runs every 5 minutes
- Compares `vote_tallies.total_votes` against `COUNT(*) FROM votes WHERE booth_id = ?`
- Mismatch → admin alert email + audit log entry

---

### 15.7 File Upload Security

#### CSV/Excel Import
```php
$request->validate([
    'file' => ['required', 'file', 'mimes:csv,xlsx', 'max:10240']
]);
// Saved to storage/app/private/imports/ (not web-accessible)
// Processed in queued job — never in the HTTP request cycle
```

#### Booth Banner Images
```php
$request->validate([
    'banner_image' => [
        'required', 'image', 'mimes:jpeg,png,webp',
        'max:5120', 'dimensions:min_width=400,min_height=200',
    ]
]);
// UUID filename — prevents path traversal
$filename = Str::uuid() . '.' . $file->extension();
```

---

### 15.8 HTTP Security Headers

Applied globally via `SecurityHeadersMiddleware`:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

### 15.9 Environment & Secrets Management

```
# .env — never committed to git
APP_ENV=production
APP_DEBUG=false          # CRITICAL: false in production
APP_KEY=base64:...

DB_CONNECTION=pgsql
DB_PASSWORD=...

REVERB_APP_ID=...
REVERB_APP_KEY=...
REVERB_APP_SECRET=...
REVERB_HOST=yourdomain.com
REVERB_PORT=443
REVERB_SCHEME=https

MAIL_PASSWORD=...
```

- `.env` in `.gitignore`; `.env.example` committed with placeholders only
- Production secrets stored as DigitalOcean environment variables

---

### 15.10 Security Logging

```php
// config/logging.php — dedicated security channel
'security' => [
    'driver' => 'daily',
    'path'   => storage_path('logs/security.log'),
    'days'   => 90,
    'level'  => 'warning',
],
```

| Event | Severity |
|---|---|
| Failed login | warning |
| Account locked (brute force) | critical |
| Registration cross-check failure | warning |
| Vote cast outside voting window | warning |
| Vote tally mismatch detected | critical |
| Admin action without justification | error |
| File upload rejected (wrong type) | warning |
| Rate limit exceeded | warning |

---

### 15.11 Database Least-Privilege

```sql
CREATE USER itechtivity_app WITH PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itechtivity_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itechtivity_app;
-- App user cannot DROP, ALTER, or access system catalogs
-- Migrations run under a separate privileged user
```

---

### 15.12 Security Go-Live Checklist

- [ ] `APP_DEBUG=false` in production `.env`
- [ ] All routes return 404 for invalid IDs (`findOrFail` + exception handler)
- [ ] HTTPS enforced — Certbot SSL, HTTP → HTTPS redirect
- [ ] Database not publicly accessible (firewall: app server IP only)
- [ ] File upload directory not web-accessible (`storage/app/private/`)
- [ ] `php artisan config:cache` and `route:cache` run in production
- [ ] Security headers verified via securityheaders.com
- [ ] Rate limiting tested: 429 on 6th registration attempt
- [ ] Vote race condition tested: concurrent submissions produce only 1 vote
- [ ] Reverb tested: 1,000 simulated concurrent connections hold stable
- [ ] Audit log verified: every admin action has a log entry
- [ ] Passwords never appear in logs (no `$request->all()` logging)
- [ ] Old/test admin accounts deactivated before event day

---

## 16. Verification / Testing Checklist

- [ ] Register with valid student_number + email → account created, is_claimed set true
- [ ] Register with wrong email for a student_number → rejected with correct message
- [ ] Register same student_number twice → rejected
- [ ] 6th registration attempt from same IP → rate limited (429)
- [ ] Admin imports CSV → students appear in student_references
- [ ] Admin grants 3 votes to a student → votes_remaining = 3
- [ ] Student casts 3 votes for 3 different booths → votes_remaining = 0
- [ ] Student tries 4th vote → rejected
- [ ] Transparency page updates live via WebSocket when vote is cast (< 1s)
- [ ] WebSocket fallback: disable Reverb → transparency page switches to polling every 5s
- [ ] Admin modifies vote without justification → validation error
- [ ] Admin modifies vote with justification → audit log entry created
- [ ] PDF export generates correct ranked results
- [ ] All pages render correctly on 375px mobile screen
- [ ] Admin audit log shows all admin actions in chronological order
- [ ] 1,000 simulated WebSocket connections hold stable under vote broadcast events
