# QA Architecture & DevOps Consulting Report
**Project:** Itechtivity 2027 — Capstone Awards & Bingo Voting System  
**Role:** Senior QA Architect & Principal DevOps Consultant  
**Target Environment:** Next.js 15 (App Router), Heroku Postgres 16, Heroku Dynos (Standard-1X)

---

## Executive Summary

The proposed architecture for **Itechtivity 2027** possesses strong conceptual security foundations (two-phase activation, HMAC-signed stubs, and atomic database locks). However, deploying this system on **Heroku Standard-1X Dynos** for a live, high-density capstone event introduces critical failure modes if not properly engineered:
1. **The PDF Generation Trap:** Generating 1,000+ cards (each with 1 Master QR + 6 stub QRs = 7,000 vector QRs) inside a synchronous Next.js HTTP handler will guarantee an **H12 HTTP Timeout (30s)** and trigger fatal **R14/R15 Out-of-Memory crashes** on 512MB dynos.
2. **Database Connection Starvation:** Prisma ORM running across multiple Next.js dynos will rapidly exhaust Heroku Postgres connection limits during peak voting surges unless PgBouncer is configured in Transaction Mode with prepared statement optimizations.
3. **Flaky Venue Telecommunications:** University exhibition halls suffer severe RF noise, cell tower saturation, and captive portal WiFi failures. Mobile camera scanners must be optimized for poor lighting, thermal throttling, and network disconnects.
4. **Sub-millisecond Concurrency Hazards:** Double-scanning stubs across multiple booth devices requires atomic conditional SQL execution backed by database-level unique constraints.

This report delivers an architectural deep dive, package selections, battle-tested mitigation strategies, and an exhaustive pre-event QA test harness.

---

## 1. Heroku Constraints & DevOps Architecture

### 1.1 The 30-Second HTTP Router Timeout (H12) & PDF Generation
* **The Failure Mode:** Heroku’s routing mesh abruptly terminates any HTTP request that does not emit an initial response byte within 30 seconds, returning an `H12 - Request Timeout`. Generating 1,000 sheets containing 7,000 unique QR renders and layout calculations requires 45–180 seconds of CPU-intensive computation.
* **Architecture Solution: Asynchronous Worker Pipeline:**
  1. The client requests a generation job: `POST /api/admin/cards/generate { quantity: 1000 }`.
  2. The Next.js API route validates permissions, creates a `BatchJob` record (`status: PENDING`), enqueues the job ID, and returns `202 Accepted` with `{ jobId }` within 150ms.
  3. A dedicated Heroku **Worker Dyno** (`worker: node dist/worker.js` or Next.js background processor via `pg-boss`) consumes the job.
  4. The worker renders the PDF in chunks (e.g., 50 cards per sub-batch), streams output directly to AWS S3 / Cloudflare R2, and marks `BatchJob` as `COMPLETED` with a presigned download URL.
  5. The admin UI polls `GET /api/admin/cards/status?jobId=...` (or receives a Server-Sent Event / WebSocket ping) and displays a progress bar.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin Browser
    participant Web as Next.js Web Dyno
    participant DB as Heroku Postgres
    participant Queue as Job Queue (PG-Boss)
    participant Worker as Heroku Worker Dyno
    participant Appwrite as Appwrite Storage & Realtime

    Admin->>Web: POST /api/admin/cards/generate (1000 cards)
    Web->>DB: INSERT INTO batch_jobs (PENDING)
    Web->>Queue: Enqueue Job(batch_id)
    Web-->>Admin: 202 Accepted { jobId, status: "QUEUED" }
    
    Queue->>Worker: Dequeue Job(batch_id)
    Worker->>DB: UPDATE batch_jobs SET status = 'PROCESSING'
    
    loop Stream in Chunks (50 cards/chunk)
        Worker->>Worker: Generate HMACs + Render Vector Pages
        Worker->>Appwrite: Upload PDF to `bingo-cards-pdf` bucket
        Worker->>DB: UPDATE progress (e.g. 20%, 40%...)
    end
    
    Worker->>Appwrite: Complete Upload & Retrieve File URL
    Worker->>DB: UPDATE batch_jobs SET status = 'READY', download_url = ...
    Worker->>Appwrite: Emit Realtime Event: `batch.ready`
    
    Admin->>Appwrite: WebSocket Realtime listener receives `batch.ready`
    Admin-->>Admin: Updates UI: "Batch Ready for Download"
```

### 1.2 512MB RAM Limit on Standard-1X Dynos (R14 / R15 Mitigation)
* **The Failure Mode:** Standard-1X dynos provide only 512MB of RAM. If memory exceeds 512MB, Heroku logs `R14 - Memory quota exceeded` and begins aggressive disk swapping, resulting in latency spikes. If memory hits ~1GB, Heroku issues `R15 - Memory quota drastically exceeded` and kills the process (`SIGKILL`).
* **Root Cause in Node.js:** Buffering a 1,000-page PDF in RAM requires building an in-memory DOM/tree structure of all objects, fonts, and base64/vector QRs simultaneously, consuming 800MB–1.8GB of RAM.
* **Mitigation Protocol:**
  1. **Advance Preparation Timeline:** Cards are generated and printed **weeks in advance**, ensuring dyno memory and CPU are 100% idle and dedicated to live vote processing during event day.
  2. **Strict Stream Pipeline:** Never build the entire document in memory. Use a streaming PDF engine (`pdfkit`) piped directly into the Appwrite Storage bucket via `node-appwrite`.
  3. **Page Recycling / Garbage Collection:** Evict rendered QR buffers and card references after writing them to the write-stream.
  4. **Node V8 Memory Flags:** Explicitly set `--max-old-space-size=384` in the `Procfile` (`web: node --max-old-space-size=384 .next/standalone/server.js`). This forces V8 garbage collection before the dyno reaches the 512MB physical limit.

### 1.3 Ephemeral Filesystem & Distributed Exports (Appwrite Cloud Storage)
* **The Constraint:** Heroku dynos run on ephemeral containers. Any file saved to local disk (`/tmp` or `./public/exports`) is destroyed whenever a dyno restarts, deploys, or auto-recovers.
* **Solution:** 
  - Strictly prohibit saving generated PDFs to the local dyno disk.
  - Stream directly to **Appwrite Cloud Storage** (`bingo-cards-pdf` bucket) using `node-appwrite`.
  - Issue download tokens through Appwrite, enabling the Production team to download the high-resolution vector PDFs safely.

### 1.4 Database Connection Pool Exhaustion (Heroku Postgres + Prisma)
* **The Constraint:** Heroku Postgres plans impose hard connection limits:
  - Mini / Basic: 20 connections
  - Standard-0: 60 connections
  - Standard-2: 120 connections
* **Prisma Connection Amplification:** In Next.js App Router, each dyno runs multiple worker threads/processes. If 2 web dynos each run with a default pool size of 10 connections, and a worker dyno runs with 5, plus Prisma Studio / migrations / manual psql connections, the database instantly throws:
  `FATAL: remaining connection slots are reserved for non-replication superuser connections`
* **Architectural Remedy:**
  1. **Heroku PgBouncer Buildpack / Connection Pooling:** Enable Heroku Postgres Connection Pooling (PgBouncer) in **Transaction Mode**:
     ```env
     # Direct connection for Prisma Migrations (DDL requires direct session)
     DIRECT_URL="postgres://user:pass@ec2-xxx.compute-1.amazonaws.com:5432/db"

     # Pooled connection for Next.js App Runtime
     DATABASE_URL="postgres://user:pass@ec2-xxx.compute-1.amazonaws.com:5432/db?pgbouncer=true&connection_limit=5"
     ```
  2. **Prisma Schema Configuration:**
     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```
  3. **Prepared Statements Caveat:** In PgBouncer transaction pooling mode, prepared statements are not supported across different clients. Append `&statement_cache_size=0` to the pooled connection string to prevent `prepared statement "s0" already exists` errors in Prisma.

---

## 2. Mobile Browser QR Scanning in Live Event Environments

Exhibition halls present adverse mobile web environments. The scanner must be engineered for real-world field conditions.

### 2.1 Camera Permissions & HTTPS/SSL Requirements
* **Browser Security Sandbox:** Modern mobile browsers (iOS Safari and Android Chrome) strictly block access to `navigator.mediaDevices.getUserMedia` unless running in a **Secure Context** (`window.isSecureContext === true`).
* **Event Pitfalls & Fixes:**
  - Testing over local LAN IPs (`http://192.168.1.50:3000`) during rehearsal **will silently fail** or prompt an ambiguous permission denial.
  - Production must run on a fully validated TLS/SSL domain (e.g. `https://itech2027.edu` via Heroku Automated Certificate Management or Cloudflare CDN).
  - Explicitly handle user permission rejection with visual troubleshooting prompts (e.g., "Camera access blocked. Click the 'AA' icon in Safari address bar -> Website Settings -> Camera -> Allow").

### 2.2 Venue Lighting & Optical Challenges
* **The Problem:** Exhibition halls feature dim ambient lighting, flashing booth screens, direct overhead spotlights, and shadows cast by visitors' hands holding the stubs.
* **Optical Optimizations:**
  1. **QR Code Generation Standard:**
     - Error Correction Level: Set to **Level Q (25% recovery)** or **Level H (30% recovery)**. Never use Level L.
     - Quiet Zone: Enforce a minimum **4-module white quiet zone** around all printed QR codes.
     - Cell Dimensions: Minimum module size of 1.5mm per cell on physical print to allow focus from 15cm–30cm away.
  2. **Torch / Flashlight Integration:** Modern Android Chrome and iOS Safari (16.4+) support the torch constraint. Expose a toggle button in the scanner UI.

### 2.3 Camera Refocus Latency & Device Thermal Throttling
* **The Problem:** Continuous 60 FPS scanning at 4K/1080p will heat up low-to-midrange Android devices within 10 minutes, triggering aggressive OS thermal throttling, dropped frames, and camera unresponsiveness.
* **Optimization Parameters:**
  - **Resolution Target:** Request 720p (`ideal: { width: 1280, height: 720 }`). 720p is the sweet spot: sufficient resolution for dense QR codes, but 4x lower CPU processing overhead than 1080p.
  - **Frame Throttling:** Decode once every **150ms to 200ms** (5 FPS), not on every frame. A human cannot position a ticket faster than 200ms.
  - **Audio & Haptic Feedback:** Trigger `navigator.vibrate([80])` and play an instant synthesized HTML5 Web Audio beep on successful decode.

### 2.4 Offline / Flaky Network Resilience
* **Event Reality:** 1,500 students and visitors in one hall will saturate cell towers and overwhelm local WiFi routers.
* **The Golden Rule of Anti-Fraud:** **DO NOT PERMIT OFFLINE VOTE CONFIRMATION.**
  - If Booth A is offline and accepts a stub locally, and Booth B is online and scans the same stub, the physical cardholder can double-vote without detection.
* **Resilience Strategy:**
  1. **Optimistic Scan Feedback with Pending State:** 
     - On scan, immediately display an amber indicator: *"Verifying with server..."*
     - If the network request fails due to a timeout (`AbortController` set to 4,000ms), transition to a prominent red retry card: *"Network timeout. Tap to retry."*
     - Provide a 1-tap retry button with exponential backoff.
  2. **Exhibitor PWA Caching:** Use `next-pwa` or a minimal Service Worker to cache all static UI assets, fonts, and scripts so the app shell loads instantly even if the network drops. Only API POST requests require live connectivity.

### 2.5 Manual Serial Code Fallbacks
* **Physical Damage Reality:** Physical stubs will get crinkled, creased down the middle of the QR code, soaked in beverages, or torn carelessly along the perforation line.
* **Fallback Protocol:**
  - Every printed stub must have human-readable text below the QR: e.g., `B27-0104-S3` + a 4-character checksum `[7K9P]`.
  - The scanner UI must include a prominent **"Enter Code Manually"** button.
  - The manual input modal opens a numeric/alphanumeric keypad with auto-formatting and auto-uppercase conversion.
  - The API endpoint validates the manual serial and checksum using the exact same atomic transaction pipeline as the QR payload.

---

## 3. Concurrency, Race Conditions & Anti-Fraud QA

### 3.1 Race Condition on Double-Scanning (The Split-Second Attack)
* **Attack Scenario:** A visitor takes a photo of their stub QR and sends it to an accomplice. Both stand at two different booths (or the same booth) and scan the QR at the exact same millisecond ($T=0$).
* **Production-Grade Solution:**
  1. **Database Constraint Level:** Enforce a `UNIQUE` constraint on `VOTE(ticket_stub_id)`. Even if application locks fail, the database engine guarantees that two rows referencing the same `ticket_stub_id` can never be inserted.
  2. **Atomic Single-Statement Execution:**
     ```typescript
     // High-performance single SQL statement that locks and transitions atomically:
     const updatedStub = await prisma.$queryRaw<TicketStub[]>`
       UPDATE "TICKET_STUB"
       SET "status" = 'REDEEMED', "updated_at" = NOW()
       WHERE "id" = ${stubId}::uuid
         AND "status" = 'ACTIVATED'
       RETURNING *;
     `;

     if (updatedStub.length === 0) {
       // Ticket does not exist, was never activated, or was ALREADY redeemed!
       return { success: false, error: 'STUB_ALREADY_USED_OR_INACTIVE' };
     }

     // Insert vote safely
     await prisma.vote.create({
       data: {
         ticketStubId: stubId,
         boothId: exhibitorBoothId,
         awardId: updatedStub[0].awardId,
         scannedByUserId: currentUser.id
       }
     });
     ```

### 3.2 Registration Desk Multi-Card Bulk Binding Atomicity
* **Scenario:** A buyer purchases 5 cards. The registration clerk scans 5 Master QRs sequentially.
* **Transaction Pattern:**
  - The registration counter UI buffers all scanned Master QRs into a local state array (`[QR1, QR2, QR3, QR4, QR5]`).
  - When the clerk clicks **"Confirm & Bind"**, a single atomic request is dispatched inside a Prisma `$transaction` block, ensuring either all 5 cards and their 30 stubs are activated together, or none are.

### 3.3 Cryptographic Integrity (HMAC-SHA256) & Payload Compactness
* **Payload Structure:** Stubs must not encode long URLs, which generate dense, slow-to-scan QR codes.
* **Optimized Compact Binary/Base64URL Format:**
  $$\text{Payload} = \text{base64url}(\text{CardNumber} \mathbin{\Vert} \text{Slot} \mathbin{\Vert} \text{HMAC}_{8})$$
  - `CardNumber`: 2-byte or 4-byte integer (e.g., `1` to `2000`).
  - `Slot`: 1 byte (`1` to `6`).
  - `HMAC_8`: Truncated 8-byte (64-bit) HMAC-SHA256 signature using the event secret key ($K_{\text{event}}$).
  - Total QR string length: **~16 to 22 characters** (Version 2 QR with large, easily readable modules).

### 3.4 Rate Limiting & Abuse Prevention
* **Exhibitor Scan Endpoint:** Limit to **30 scans per minute per booth user**.
* **Registration Desk Endpoint:** Limit to **60 transactions per minute per terminal**.
* **Failed Scan Penalty:** If an IP or user triggers 5 consecutive invalid or failed HMAC scans within 60 seconds, enforce an automatic 3-minute cooldown.

---

## 4. Specific NPM Packages & Architecture Evaluation

* **PDF Generation:**
  * Recommended: **`pdfkit`** + **`qrcode`** — Native streaming write, memory <80MB for 1,000 pages, zero external binaries.
  * Avoid: **`puppeteer`** / **`playwright`** — Chromium binary consumes 400MB+ RAM and crashes on Standard-1X dynos.
* **Background Jobs:**
  * Recommended: **`pg-boss`** — Job queue built directly on PostgreSQL with `SKIP LOCKED`. Zero external Redis cost.
  * Avoid: **`bullmq`** (unless Redis is already provisioned) — Requires Redis, adding $15–$30/mo extra add-on costs.
* **QR Client:**
  * Recommended: **`html5-qrcode`** — Robust mobile camera state machine, torch controls, and auto-fallback.
  * Avoid: Raw **`@zxing/library`** — Can leave camera hardware locked on iOS Safari without complex teardown code.
* **Authentication:**
  * Recommended: **Stateless JWT in `httpOnly` Cookie** — Zero DB lookups per vote scan, preserving database connection pool.
  * Avoid: **NextAuth with Database Adapter** — Executes a DB query on *every single incoming API request*, wasting 50–70% of connection pool.
* **Realtime:**
  * Recommended: **Server-Sent Events (SSE)** with 25s keep-alive — Lightweight, works over standard HTTP/1.1 without WebSocket proxy issues.
  * Avoid: **Socket.io** on standalone dynos — Complicates horizontal scaling without Redis adapter and holds open persistent connections.

---

## 5. Pre-Event Day Operational Runbook (DevOps Checklist)

### Phase 1: Two Weeks Before Event (Infrastructure Hardening)
- [ ] **Provision Heroku Postgres Standard Tier** (to ensure dedicated RAM, high IOPS, and automated snapshots).
- [ ] **Configure PgBouncer Connection Pool** in Transaction Mode (`pgbouncer=true`, `statement_cache_size=0`).
- [ ] **Set Dyno Formation:** `web: 2x Standard-1X dynos`, `worker: 1x Standard-1X dyno`.
- [ ] **Set Node.js Memory Limits:** Set `NODE_OPTIONS="--max-old-space-size=384"` in Heroku Config Vars.
- [ ] **Secure Storage Provisioning:** Set up Cloudflare R2 / AWS S3 bucket with strict CORS and 15-minute presigned URL policies.
- [ ] **SSL Verification:** Confirm production domain has valid SSL certificates (ACM active, HSTS enabled).

### Phase 2: One Week Before Event (Production & Dry Run)
- [ ] **Lock Awards Configuration:** Admin finalizes all 6 Capstone Award names and criteria; toggles `is_awards_locked = true`.
- [ ] **Batch Generation:** Generate batches of physical cards in increments of 500. Download PDFs and inspect vector QR quality.
- [ ] **Print Verification Test:** Print 10 physical sheets on event paper stock. Verify QR scans in <200ms from 20cm away under warm LED lighting.
- [ ] **Rehearsal Simulation:** Distribute 5 test cards to 5 student volunteers; perform real registration, booth scanning, and real-time leaderboard audit.

### Phase 3: Event Day (Live Operations)
- [ ] **Pre-Open Database Snapshot:** Run `heroku pg:backups:capture` at 07:00 AM before registration opens.
- [ ] **Exhibitor Onboarding:** Distribute pre-printed Booth QR badges with booth credentials (`booth.cs01`, `booth.cs02`...).
- [ ] **Live Monitoring Dashboard:** Keep Heroku CLI metrics and log stream open:
  ```bash
  heroku logs --tail --app itech2027-prod | grep -E "H12|R14|R15|FATAL|Error"
  ```
- [ ] **Physical Ballot Boxes:** Ensure every exhibitor booth has a sealed physical drop box. Every scanned physical stub must be deposited into the box immediately after green confirmation.
- [ ] **Post-Event Freeze:** At the exact voting cutoff time (e.g., 4:00 PM), Admin triggers `"Freeze All Voting"` in the dashboard, instantaneously revoking scan permissions across all endpoints before the Awards Ceremony reveal.
