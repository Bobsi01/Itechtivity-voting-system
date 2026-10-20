# Itechtivity 2027 — Capstone Awards & Bingo Voting System

> **Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))  
> **Assisted by:** OpenAI Codex and Google Gemini

Itechtivity 2027 is a high-concurrency capstone exhibition voting and gamification platform designed for university computing departments. It connects physical attendee engagement (custom Bingo Cards with detachable QR stubs) to a fraud-proof, real-time digital tally engine.

---

## Why This System Exists

University capstone showcases and tech expos routinely run into the same voting headaches:

- Purely digital online polls are vulnerable to link sharing, vote buying, proxy voting, and bot scripts.
- Traditional paper ballots require hours of error-prone manual counting, suffer from ballot box stuffing, and provide zero real-time visibility.
- Unverified QR codes can be duplicated with basic photocopiers or smartphones.

Itechtivity 2027 solves this by pairing physical, perforated voting stubs with cryptographically signed tokens and a strict two-phase activation lifecycle. Physical cards printed days before the event remain completely inert. A stub can only record a vote after being sold and scanned at the registration desk, and it can only be redeemed once at an exhibitor booth.

---

## User Roles and System Workflows

The platform enforces strict Role-Based Access Control (RBAC). Every portal is built around a specific physical station at the exhibition.

### 1. System Administrator (`ADMIN`)
- **Portal:** `/admin`
- **Default Account:** `admin@itech2027.edu`
- **Key Responsibilities:**
  - Configures event parameters and award slots (up to 6 distinct award categories).
  - Toggles the Configuration Lock before production printing to freeze slot assignments.
  - Provisions capstone project booths, assigns booth leads, and organizes academic tracks.
  - Monitors the real-time global leaderboard, vote velocities, and voter demographics.
  - Audits live activity via the immutable audit trail and inspects or voids individual cards.
  - Exports validated vote datasets and audit records to CSV for departmental records.

### 2. Production Printing Officer (`PRODUCTION`)
- **Portal:** `/production`
- **Default Account:** `prod@itech2027.edu`
- **Key Responsibilities:**
  - Generates secure serial batches and cryptographic HMAC signatures for Bingo Cards and stubs.
  - Streams print-ready A4 PDF sheets with true vector QR codes directly to disk or Appwrite Storage.
  - Generates printer alignment and perforation calibration sheets to verify commercial press tolerances.
  - Inspects generated batch files without loading entire documents into memory.

### 3. Registration Desk Officer (`REGISTRATION`)
- **Portal:** `/registration`
- **Default Account:** `reg.desk1@itech2027.edu`
- **Key Responsibilities:**
  - Manages front-counter attendee check-in and Bingo Card sales.
  - Logs buyer demographics (CSD Students, Non-CSD Campus Students, Alumni, and External Visitors) to prevent bulk scalping and generate attendance analytics.
  - Scans Master QRs on physical cards to atomically bind and activate all 6 award stubs in a single transaction.

### 4. Exhibitor & Booth Lead (`EXHIBITOR`)
- **Portal:** `/exhibitor`
- **Default Accounts:** `booth.cs01@itech2027.edu` through `booth.cs40@itech2027.edu`
- **Key Responsibilities:**
  - Runs a handheld, mobile-first web camera scanner optimized for dimly lit exhibition halls.
  - Scans detached paper stubs handed in by visiting voters.
  - Receives instant audio, visual, and haptic vibration feedback on scan validity.
  - Views a strictly scoped live tally showing only their own booth's votes, preventing tactical collusion or demoralization during the event.

### 5. Audience & Public Views
- **Award Ceremony Stage (`/presentation`):** Full-screen projector presentation view for the final awards ceremony with animated winner reveals.
- **Booth Directory (`/projects`):** Public-facing directory allowing guests to search capstone projects, team rosters, categories, and floor table numbers.

---

## The Ticket Lifecycle

Every physical card moves through three strict states:

```
[Phase 1: Production]
  Status: INACTIVE / UNBOUND
  Cards and stubs are generated with unique serials and signed with HMAC-SHA256.
  Scanning an inactive stub at any booth is rejected immediately.
        |
        v
[Phase 2: Registration Desk]
  Status: ACTIVATED & BOUND
  The attendee purchases cards at the counter. The desk officer records attendee demographics
  and scans the card's Master QR. All 6 stubs atomically transition to ACTIVATED.
        |
        v
[Phase 3: Exhibitor Booth]
  Status: REDEEMED
  The attendee detaches a stub and hands it to a booth. The booth scans the QR.
  The database executes an atomic conditional update, records the vote, and marks the stub REDEEMED.
  Duplicate scans fail immediately.
```

---

## Security & Architectural Invariants

- **HMAC-SHA256 Token Verification:** Stub QR payloads encode a compact identifier, slot number, and cryptographic signature. Tokens are verified in memory with timing-safe comparisons before any database query executes.
- **Atomic Single-Redemption:** Votes are committed using atomic conditional SQL updates (`WHERE status = 'ACTIVATED'`). Unactivated, voided, or already-redeemed stubs return zero updated rows and fail instantly.
- **Database-Level Unique Constraints:** The `VOTE` table enforces a strict `UNIQUE(ticket_stub_id)` constraint, making double-voting physically impossible at the database engine level.
- **Zero-Trust Scope Isolation:** Booth leads cannot query competitor standings. The server strictly derives the exhibitor identity and booth identifier from the verified HTTP session cookie.
- **Low-Memory Vector Streaming:** PDF generation uses PDFKit drawing vector paths directly to the canvas rather than raster Base64 images. This keeps memory usage well under the 512MB RAM ceiling of cloud dynos.
- **Idempotency Defense:** Scan requests include idempotency checks to safely handle mobile network retries and jitter without recording duplicate votes.

---

## Tech Stack

- **Framework:** Next.js 15 / 16 (App Router, Server Actions, Route Handlers, TypeScript)
- **Database:** PostgreSQL 16 via Prisma ORM
- **Real-Time & Storage:** Appwrite Cloud (Realtime WebSockets and File Storage)
- **Document Engine:** PDFKit (vector rendering) and QRCode
- **Styling:** Tailwind CSS with Lucide Icons (mobile-first, high contrast, zero emojis, clean border styling)
- **Authentication:** HTTP-only HMAC-signed session cookies with bcrypt password hashing

---

## Getting Started

### Prerequisites

- Node.js 20 or higher
- PostgreSQL instance (local or hosted, e.g. Supabase PostgreSQL)
- Appwrite Cloud project (for Realtime and Storage)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd "Itech 2027"
   npm install
   ```

2. Configure environment variables in `.env`:
   ```env
   # PostgreSQL Connection
   DATABASE_URL="postgresql://user:password@localhost:5432/itech2027?schema=public"
   DIRECT_URL="postgresql://user:password@localhost:5432/itech2027?schema=public"

   # Cryptographic Signing Key (min 32 characters)
   EVENT_HMAC_SECRET="your-high-entropy-secret-key-here-minimum-32-chars"

   # Session Secret
   SESSION_SECRET="your-session-encryption-secret-here-minimum-32-chars"

   # Appwrite Cloud Config
   APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
   APPWRITE_PROJECT_ID="your-appwrite-project-id"
   APPWRITE_API_KEY="your-appwrite-api-key"
   NEXT_PUBLIC_APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
   NEXT_PUBLIC_APPWRITE_PROJECT_ID="your-appwrite-project-id"
   ```

3. Run database migrations and seed default data:
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The application will be running at `http://localhost:3000`.

---

## Seed Accounts for Local Testing

The seed script (`prisma/seed.ts`) populates the database with default accounts and 40 capstone booths:

| Role | Email | Password | Access / Scope |
|---|---|---|---|
| **Admin** | `admin@itech2027.edu` | `AdminPass2027!` | Full event control, audit logs, global tallies |
| **Production** | `prod@itech2027.edu` | `ProdPass2027!` | Batch generator, PDF downloads, calibration |
| **Registration** | `reg.desk1@itech2027.edu` | `RegPass2027!` | Counter sales, attendee demographics, card binding |
| **Exhibitor** | `booth.cs01@itech2027.edu` | `BoothPass2027!` | Mobile scanner, scoped to Booth CS-01 |
| **Exhibitor** | `booth.cs02@itech2027.edu` | `BoothPass2027!` | Mobile scanner, scoped to Booth CS-02 |

---

## Test Suite

The repository includes a comprehensive set of automated tests verifying cryptography, PDF geometry, and complete lifecycle flows:

```bash
# Run cryptographic signature and timing attack tests
npm run test:crypto

# Run PDF geometry, bleed margins, and vector QR tests
npm run test:pdf

# Run full end-to-end ticket lifecycle test (generate -> bind -> vote -> duplicate reject)
npm run test:e2e:flow

# Run regression and audit log tests
npm run test:audit
```

---

## Project Structure

```
├── .agents/                    # Agent directives, governance rules, and runbook skills
│   ├── rules/                  # Security, UI-UX, code craftsmanship, and code quality
│   └── skills/                 # Runbooks for Next.js, PDF streaming, QR crypto, and Appwrite
├── prisma/
│   ├── schema.prisma           # Relational schema (Booths, Cards, Stubs, Votes, Audit Logs)
│   └── seed.ts                 # Seeder for event config, awards, booths, and test users
├── public/                     # Static assets and viewer scripts
├── scripts/                    # Deployment and utility scripts
├── src/
│   ├── app/                    # Next.js App Router pages and API route handlers
│   │   ├── admin/              # Admin dashboard and control center
│   │   ├── api/                # Secure route handlers with Zod validation
│   │   ├── exhibitor/          # Handheld mobile booth scanner
│   │   ├── login/              # Unified authentication portal
│   │   ├── presentation/       # Awards ceremony live reveal view
│   │   ├── production/         # Card batch generator and PDF management
│   │   ├── projects/           # Public capstone booth directory
│   │   └── registration/       # Counter registration and bulk binder
│   ├── components/             # Reusable UI components grouped by feature area
│   └── lib/                    # Cryptography, database, Appwrite client/server, and utilities
└── package.json
```

---

## Community QA & Contributions (Computer Studies Department)

Students, faculty developers, and peer reviewers across the **Computer Studies Department (CSD)** are warmly invited and encouraged to evaluate, test, and contribute to this repository. Your hands-on testing and feedback directly harden the system before event day.

### How You Can Contribute

1. **Hands-On QA & Field Testing:**
   - Test the mobile camera scanner (`/exhibitor`) on various physical smartphones (iOS Safari and Android Chrome), particularly under low-light or angled exhibition hall conditions.
   - Test spotty network connections and simulated packet drops to verify that idempotent retry mechanisms prevent phantom or duplicate votes.
   - Run test print batches using the calibration generator in `/production` to verify perforation margins and scanner read rates on physical paper.

2. **Submit Issue Reports:**
   - If you uncover edge-case scanner errors, UI layout regressions, or unexpected database query states, please open a detailed issue on GitHub.
   - Provide reproduction steps, browser/device details, expected vs. observed behavior, and any relevant console or server logs.

3. **Submit Pull Requests (Bug Fixes & Improvements):**
   - We welcome pull requests for bug fixes, performance optimizations, accessibility improvements, or workflow polish.
   - Before opening a PR, ensure your code aligns with the repository standards:
     - Strict TypeScript typing (no `any` or loose casts).
     - Strict Zod validation on API boundaries.
     - Mobile-first responsive layouts with touch targets of at least 44x44px.
     - Strict no-emoji policy in UI and comments (use monochrome vector icons from `lucide-react`).
     - Clean border and contrast styling without background color fills on text or icons.
   - Verify that all automated test suites pass cleanly:
     ```bash
     npm test
     ```

For AI agents inspecting this repository, please review the dedicated [Agent Evaluation Guide](.agents/README.md).

---

## License & Credits

- **Project Lead & Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))
- **AI Engineering Assistance:** OpenAI Codex and Google Gemini
