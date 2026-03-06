# Itechtivity Voting System

A secure, real-time online voting system built for the Itechtivity 4th-year student event. Students vote for their favorite thesis and project booths. Vote counts update live on a public transparency page as each vote is cast.

---

## What It Does

- Students register using their student number and institutional email — the system cross-checks their identity against a pre-imported master list before allowing account creation
- Admins control how many votes each student gets by granting vote allocations
- Students browse active booths and cast their votes during the configured voting window
- A public transparency page shows live vote counts updating in real time via WebSocket
- Admins can manage booths, review the full audit trail, modify votes (with a required justification), and export final results as a PDF

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 11 (PHP 8.3) |
| Frontend | Blade templates + Tailwind CSS |
| Database | PostgreSQL 16 |
| Real-time | Laravel Reverb (self-hosted WebSocket server) |
| Queue | Laravel Queue (database driver) |
| PDF export | barryvdh/laravel-dompdf |
| CSV import | maatwebsite/laravel-excel |

---

## Key Features

### Secure Registration (Cross-Check)
Registration is not open to anyone. Students must provide their student number and email, which are verified against a pre-imported reference list. The system checks:
1. Student number exists in the reference list
2. Email matches the record exactly (case-insensitive)
3. No account has already been created for that student number
4. Name similarity check (Jaro-Winkler) — soft flag for admin review if names differ significantly

### Atomic Vote Casting
Each vote is cast inside a database transaction with a pessimistic row lock (`SELECT FOR UPDATE`) on the voter's record. This prevents race conditions where two simultaneous requests could both pass the `votes_remaining` check. A unique database constraint on `(user_id, booth_id)` also ensures no duplicate votes, even if the application layer fails.

### Live Vote Counts
Every time a vote is cast, a `VoteCast` event is broadcast via Laravel Reverb to all connected browsers on the public transparency page. If the WebSocket connection fails, the page automatically falls back to polling `/api/vote-tallies` every 5 seconds.

### Full Audit Trail
Every admin action — vote modifications, vote grants, booth changes — is logged to the `audit_logs` table via `AuditService`. The log is append-only. Vote modifications require a non-empty justification field before they are accepted.

### Vote Tally Reconciliation
A scheduled command (`votes:reconcile`) runs every 5 minutes to compare the cached `vote_tallies` table against the actual count in the `votes` table. Any mismatch triggers an admin alert email and an audit log entry.

---

## User Roles

| Role | What they can do |
|---|---|
| **Public** | Browse booths, view the live transparency page |
| **Student** | Register, log in, cast votes, view vote history |
| **Admin** | Import students, manage booths, grant votes, modify votes (with justification), export results, view audit log |

---

## Getting Started

### Requirements
- PHP 8.3+
- Composer
- Node.js 20+
- PostgreSQL 16

### Setup

```bash
# 1. Install dependencies
composer install
npm install

# 2. Configure environment
cp .env.example .env
php artisan key:generate

# 3. Set your database credentials in .env, then run migrations
php artisan migrate

# 4. Seed the admin account
php artisan db:seed --class=AdminSeeder
```

### Running Locally

Start these four processes — each in its own terminal:

```bash
php artisan serve          # Laravel web server
npm run dev                # Vite asset compiler
php artisan reverb:start   # WebSocket server
php artisan queue:work     # Queue worker (for CSV imports)
```

---

## Project Structure

```
app/
  Http/
    Controllers/
      Auth/           — Registration (cross-check) and login
      Admin/          — Student management, booths, votes, import, export, audit
      Student/        — Vote casting, booth browsing, vote history
      Api/            — /api/vote-tallies (WebSocket fallback polling)
    Middleware/
      AdminMiddleware.php           — Restricts routes to admin role
      ActiveUserMiddleware.php      — Blocks deactivated accounts
      SecurityHeadersMiddleware.php — Adds X-Frame-Options, CSP, HSTS, etc.
  Models/             — Eloquent models for all 10 database tables
  Services/
    CrossCheckService.php   — Registration verification logic
    VoteService.php         — Atomic vote casting with transaction lock
    AuditService.php        — Appends to audit_logs
    ImportService.php       — Parses and validates CSV/XLSX files
    PdfExportService.php    — Generates the results PDF
  Events/
    VoteCast.php            — Broadcast event fired after each vote
  Jobs/
    ProcessStudentImport.php — Queued job for large CSV imports

resources/views/
  auth/               — Login and registration pages
  student/            — Dashboard, vote page, booth views
  admin/              — All admin pages
  transparency/       — Public live vote count page
  exports/            — PDF results template
```

---

## Pages & Routes

| URL | Who can access | Description |
|---|---|---|
| `/` | Public | Home / booth listing |
| `/booths/{booth}` | Public | Individual booth detail |
| `/transparency` | Public | Live vote count page |
| `/register` | Public | Student registration |
| `/login` | Public | Login |
| `/student/dashboard` | Student | Voting dashboard |
| `/student/vote` | Student | Cast votes |
| `/student/history` | Student | Vote history |
| `/admin/dashboard` | Admin | Admin overview |
| `/admin/students` | Admin | Manage students, grant votes |
| `/admin/booths` | Admin | Manage booths |
| `/admin/votes` | Admin | Review and modify votes |
| `/admin/import` | Admin | Upload student CSV/XLSX |
| `/admin/audit` | Admin | Full audit log |
| `/admin/export/pdf` | Admin | Download results PDF |

---

## Capacity

Designed for up to **1,000 concurrent users** at an in-person student event:

- ~200 votes per hour (3–4 per minute, bursty)
- 1,000 open WebSocket connections to Reverb
- ~55 WebSocket frames/second pushed to all subscribers during peak voting
- Runs comfortably on a $24/month DigitalOcean droplet (2 vCPU, 4GB RAM)

---

## Security Highlights

- Student identity cross-checked at registration — no open sign-up
- Passwords hashed with bcrypt, sessions HTTP-only with `SameSite=Strict`
- All forms protected with CSRF tokens
- All queries use Eloquent ORM with parameter binding — no raw SQL with user input
- Vote race conditions prevented with `SELECT FOR UPDATE` inside transactions
- File uploads stored outside the web root (`storage/app/private/`) with UUID filenames
- Security headers on all responses: `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `CSP`
- Rate limiting on registration (5/IP/15 min) and login (5 failed attempts → 15 min lockout)
- Full audit log for every admin action — append-only, non-deletable

---

## For Detailed Documentation

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full database schema, algorithm walkthroughs, WebSocket configuration, deployment plan, and security implementation details.
