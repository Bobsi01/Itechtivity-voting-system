# Itechtivity 2027 — Comprehensive Technical Stack Specification

---

## 1. Architecture Overview

The system is architected as a **unified full-stack Web Application** built with **Next.js 15 (App Router)** and **TypeScript**, backed by **Heroku Postgres 16** via **Prisma ORM**, and deployed onto **Heroku Dynos**.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  Mobile Safari / Android Chrome (PWA-Ready)  |  Desktop Admin / Registration UI   |
|  - html5-qrcode (Camera stream)              |  - shadcn/ui + Radix UI + Recharts |
|  - Appwrite Client SDK (WebSocket Live Feed) |  - Instant audio & haptic feedback |
+-----------------------------------------------------------------------------------+
                                    │                ▲ WebSockets
                        HTTPS / API │                │ (Appwrite Realtime)
                                    ▼                │
+----------------------------------------------------+------------------------------+
|                        APPLICATION LAYER (HEROKU DYNOS)                           |
|  1x Web Dyno: Next.js 15 App Router (Node.js 20 LTS Runtime)                      |
|  ├── Idempotency Engine (`Idempotency-Key` validation)                            |
|  ├── Server Actions & Atomic Scan Routes (`/api/vote`)                            |
|  ├── Crypto Engine (HMAC-SHA256 Token Signer / Verifier)                          |
|  └── Appwrite Server SDK (`node-appwrite` event trigger)                          |
|                                                                                   |
|  1x Worker Dyno (Free/Basic Tier): Advance Card Batch Processor                   |
|  ├── `pg-boss` Job Consumer (Advance ticket generation)                           |
|  ├── Streaming PDFKit Engine (Vector QR generation)                               |
|  └── Uploads completed print PDFs directly to Appwrite Storage                     |
+-----------------------------------------------------------------------------------+
             │ Direct TLS Pool                               │ Storage & Events
             ▼                                               ▼
+----------------------------------------+   +--------------------------------------+
|       DATA LAYER (HEROKU POSTGRES)     |   |          APPWRITE CLOUD              |
|  PostgreSQL 16 (Essential/Standard)    |   |  - Storage: `bingo-cards-pdf` bucket |
|  - PgBouncer in Transaction Mode       |   |  - Realtime: WebSocket Live Channels |
|  - Atomic row locks (`FOR UPDATE`)     |   |    (Live Tally for Admin & Booths)   |
|  - `UNIQUE(ticket_stub_id)` constraint |   +--------------------------------------+
+----------------------------------------+
```

---

## 2. Core Runtime, Language & Framework

* **Node.js (`v20.x LTS` / `v22.x LTS`):** Recommended LTS version for Heroku deployments with long-term stability and native crypto support.
* **TypeScript (`v5.x`):** End-to-end static typing across frontend forms, backend actions, and database entities to eliminate runtime casting errors.
* **Next.js (`v15.x` App Router):** Full-stack server-rendered framework with React Server Components (RSC), fast Server Actions for low-latency scanning, and built-in edge/node route handlers.
* **Package Manager (`npm` / `pnpm`):** Standard dependency manager, fully supported by the Heroku Node.js buildpack.

---

## 3. Frontend Layer & UI Design System

* **CSS Framework (`tailwindcss ^3.4` / `^4.0`):** Utility-first styling for fast responsive development, mobile-first scanner layouts, and print stylesheet rules.
* **Component Primitives (`@radix-ui/*` primitives):** Accessible, unstyled, composable UI primitives for modals, dropdowns, tabs, dialogs, and alert boxes.
* **UI Design System (`shadcn/ui`):** Copy-and-paste Tailwind components that are fully customizable, lightweight, and have zero vendor lock-in.
* **Icons (`lucide-react`):** Clean, lightweight icon suite for scanner status, navigation bars, and print indicators.
* **Form Handling (`react-hook-form`):** High-performance, uncontrolled form management for high-speed counter data entry at Registration.
* **Schema Validation (`zod`):** Declarative type-safe validation for buyer forms, PINs, card IDs, and API request payloads.
* **Data Visualization (`recharts`):** Responsive SVG charts for the Admin live leaderboard, vote velocity, and buyer demographic breakdowns.
* **Toast Notifications (`sonner`):** Highly responsive toast engine for instant visual and audio-style feedback on ticket scan success or rejection.
* **Animation (`framer-motion`):** Smooth transition animations for booth score increments and live leaderboard ranking changes.

---

## 4. Mobile QR Scanner Engine & Camera Integration

* **Scanner Engine (`html5-qrcode ^2.3.8`):**
  * Cross-platform browser camera access (iOS Safari & Android Chrome).
  * Automatic back/environment camera selection (`facingMode: "environment"`).
  * Native torch/flashlight toggle support for dark venue lighting.
  * Fallback to file/image scanning and manual serial entry.
* **Sound Feedback (`use-sound` / Web Audio API):** Instant auditory feedback: pleasant beep on vote accepted, warning buzzer on duplicate or invalid stub.
* **Vibration Feedback (`navigator.vibrate()` HTML5):** Haptic vibration on mobile devices to confirm scan without looking directly at screen.

---

## 5. PDF Generation & Ticket Printing Engine

Printing 1,000+ high-resolution Bingo Cards with 7 vector QR codes each (1 Master + 6 Stubs) requires careful memory and performance management.

* **PDF Engine (`pdfkit ^0.15.0` + `qrcode ^1.5.4` — Recommended):**
  * Uses pure JavaScript without headless browser overhead.
  * Generates documents in under 25MB RAM.
  * Streams binary PDF chunks directly to client HTTP response without writing to Heroku's ephemeral disk.
* **Alternative Considered (`@react-pdf/renderer`):** Great JSX syntax, but can consume higher memory when rendering large batches. Can be used for single-card / preview exports.
* **Rejected Solution (`puppeteer` / headless Chrome):** Avoid on Heroku Standard-1X. Consumes 400MB+ RAM, requires bulky Chrome buildpacks, and causes `H13` / `R14` (Memory Exceeded) crashes.
* **Batch Chunking:** Server-side chunking (e.g., 50 cards per PDF download) bypasses Heroku's 30-second request timeout (`H12`) by generating cards in manageable chunks (e.g., Cards 1–50, 51–100, etc.).

---

## 6. Database & Persistence Layer (Heroku Postgres)

* **Database Engine (PostgreSQL 16):** Robust relational database supporting ACID transactions and row-level locks.
* **Hosting Add-on (Heroku Postgres):** Essential or Standard-0 dyno tier with SSL encryption (`sslmode=require`).
* **ORM (Prisma ORM `@prisma/client`, `prisma`):** Auto-generated TypeScript types, schema migrations, and declarative relation handling.
* **Connection Pooling (`pg-pool` / Heroku PgBouncer):** Heroku Postgres has strict connection limits (e.g., 20 connections on Essential tier). Prisma connection pooling or PgBouncer prevents `too many clients` connection errors during voting surges.
* **Atomic Concurrency (Prisma `$transaction` with raw SQL `FOR UPDATE`):** Ensures two exhibitors scanning the same stub within milliseconds cannot double-spend a vote.

---

## 7. Authentication, Security & Cryptography

* **User Authentication (NextAuth.js v5 / Auth.js):** Email + Password credentials provider with stateless encrypted JWT cookies (resilient to Heroku dyno restarts).
* **Password Hashing (`bcryptjs` / `@node-rs/bcrypt`):** Salted SHA-512 / bcrypt hashing with 12 salt rounds for administrative and exhibitor passwords.
* **Role-Based Guards (Next.js Edge Middleware `middleware.ts`):** Strict URL isolation:
  * `/admin/*` -> Role: `ADMIN`
  * `/production/*` -> Role: `PRODUCTION`
  * `/registration/*` -> Role: `REGISTRATION`
  * `/exhibitor/*` -> Role: `EXHIBITOR`
* **QR Code Cryptography (Native Node.js `crypto` HMAC-SHA256):** Each stub QR contains a signed cryptographic hash preventing visitor forgery.
* **ID Generation (`nanoid ^5.0.0`):** Cryptographically secure, URL-safe random identifiers (avoids predictable sequential integer IDs).
* **Security Headers (Next.js Security Config):** Enforces `HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and strict `Permissions-Policy: camera=(self)` for webcam security.

### 7.1 Idempotency & Single-Redemption Guarantee Protocol

To guarantee that tickets are strictly **single-use** and resilient to network retries, the system implements a 3-layer protection protocol:

```
[Mobile Scanner]
       │ Scans Stub (Generates client-side UUID nonce)
       │ Dispatches POST /api/vote with Header:
       │ `Idempotency-Key: booth_cs01:B27-0104-S3:9f8e7d6c`
       ▼
[Next.js Server: /api/vote]
       │
       ├── Step 1: Crypto Check (HMAC-SHA256)
       │   Recomputes hash in 0.005ms. If invalid, throws 400 Bad Request immediately.
       │
       ├── Step 2: Idempotency Cache Check
       │   If this exact `Idempotency-Key` was already successfully processed:
       │   --> Returns previous 200 OK result without incrementing any counts!
       │
       └── Step 3: Atomic Conditional Database Execution
           ```sql
           UPDATE "TICKET_STUB"
           SET "status" = 'REDEEMED', "updated_at" = NOW()
           WHERE "id" = :stub_id AND "status" = 'ACTIVATED'
           RETURNING *;
           ```
           - If rows updated == 0: Ticket was already redeemed or never activated.
             Returns 409 Conflict: "Ticket already redeemed or inactive".
           - If rows updated == 1: Atomically inserts vote record:
             `INSERT INTO "VOTE" (ticket_stub_id, booth_id, award_id) ...`
             Protected by database-level `UNIQUE("ticket_stub_id")`.
           - Emits WebSocket event to Appwrite Realtime.
           - Returns 200 OK: "Vote Accepted".
```

---

## 8. Cloud Storage & Real-Time WebSockets (Appwrite Integration)

* **Object Storage (Appwrite Cloud Storage `node-appwrite`):**
  * Storage bucket: `bingo-cards-pdf`.
  * Advance card batch exports are uploaded directly from the worker dyno.
  * Generates time-limited download URLs for the production team to print.
  * Completely solves Heroku's ephemeral filesystem constraint with zero disk pollution.
* **Real-time WebSockets (Appwrite Realtime `appwrite` client SDK):**
  * Native WebSocket subscriptions on `databases.[id].collections.[votes].documents` or dedicated channel.
  * Offloads hundreds of persistent mobile WebSocket connections from the Heroku dyno to Appwrite's global network.
  * Admin live leaderboard updates within <100ms when a vote is verified.
  * Exhibitors receive instant real-time increments on their own booth score.
* **Server Event Dispatch (Server SDK `node-appwrite ^14.0.0`):** Dispatches real-time broadcast events when Next.js completes an atomic vote transaction.

---

## 9. Heroku Deployment & 1-Worker Dyno Configuration

```
                               HEROKU CONFIGURATION
===================================================================================
Web Dyno:              1x Standard-1X (or Eco) — Handles HTTP API & Next.js Server Actions
Worker Dyno:           1x Worker Dyno — Consumes pg-boss queue for advance batch PDF generation
Node Buildpack:        heroku/nodejs
Postgres Add-on:       heroku-postgresql:essential-0 (with PgBouncer transaction pooling)
SSL / HTTPS:           Heroku Automated Certificate Management (ACM) - Required for Camera
Procfile:              web: npm run start
                       worker: npm run worker
                       release: npx prisma migrate deploy
===================================================================================
```

### Key Heroku Configuration Environment Variables
```env
# Application
NODE_ENV=production
NEXTAUTH_URL=https://itechtivity2027.herokuapp.com
NEXTAUTH_SECRET=super_secret_jwt_key_min_32_chars
EVENT_HMAC_SECRET=super_secret_cryptographic_signing_key

# Heroku Postgres
DATABASE_URL=postgres://user:password@host:5432/dbname?pgbouncer=true&connection_limit=5&statement_cache_size=0
DIRECT_URL=postgres://user:password@host:5432/dbname?sslmode=require

# Appwrite Cloud (Storage & WebSockets)
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=itechtivity-2027
APPWRITE_API_KEY=standard_appwrite_server_secret_key
APPWRITE_STORAGE_BUCKET_ID=bingo-cards-pdf

# App Settings
MAX_AWARDS=6
CARDS_PER_PDF_CHUNK=50
```

---

## 10. Proposed `package.json` Dependency Manifest

```json
{
  "name": "itech-2027-voting",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.0",
    "@prisma/client": "^6.0.0",
    "@radix-ui/react-alert-dialog": "^1.1.2",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.1",
    "bcryptjs": "^2.4.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "framer-motion": "^11.11.0",
    "html5-qrcode": "^2.3.8",
    "lucide-react": "^0.460.0",
    "nanoid": "^5.0.8",
    "next": "^15.0.0",
    "next-auth": "^5.0.0-beta.25",
    "pdfkit": "^0.15.0",
    "qrcode": "^1.5.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.53.0",
    "recharts": "^2.13.0",
    "pg-boss": "^10.1.2",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.5.4",
    "tailwindcss-animate": "^1.0.7",
    "appwrite": "^16.0.0",
    "node-appwrite": "^14.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.0.0",
    "@types/pdfkit": "^0.13.5",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "postcss": "^8.4.47",
    "prisma": "^6.0.0",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```
