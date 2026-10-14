# AGENTS.md — Development Directives for Itechtivity 2027

---

## 1. Project Mission & Core Constraints

You are the lead engineering agent for **Itechtivity 2027**, a high-concurrency university capstone voting web application.
* **Stack:** Next.js 15 (App Router, TypeScript), Heroku Postgres 16 (Prisma ORM), Appwrite Cloud (Storage & Realtime WebSockets), Heroku Dynos (1 Web + 1 Worker).
* **Core Function:** Secure, fraud-proof voting for up to 6 awards using physical Bingo Cards with detachable QR stubs.

---

## 2. Mandatory Anti-Slop & Craftsmanship Directives

Code slop, bloated boilerplate, and generic "vibe-coded" patterns are strictly forbidden. Follow these hard gates:

### Gate 1: No Placeholder or Trivial Comments
* **Forbidden:**
  ```typescript
  // Initialize state
  const [data, setData] = useState();
  // Handle the error here
  catch (e) { console.log(e); }
  ```
* **Required:** Code must be self-documenting. Comments are reserved exclusively for non-obvious business logic, cryptographic invariants, and security edge cases. Never leave `TODO`, `FIXME`, or pseudo-implementation stubs.

### Gate 2: Zero Unnecessary Abstractions
* **Forbidden:** Multi-layered Abstract Factory Provider Managers, generic wrapper classes around single fetch calls, or premature micro-utilities.
* **Required:** Concrete, idiomatic, direct implementations. Write clear Next.js Server Actions and route handlers. One clear function is superior to five layers of inheritance.

### Gate 3: Strict TypeScript & Zero Type Escapes
* **Forbidden:** `any`, `unknown as any`, `@ts-ignore`, loose record types (`Record<string, any>`).
* **Required:** Fully typed interfaces, strict Zod schemas for all client-to-server payloads, and generated Prisma types. If a type error occurs, fix the root type definition.

### Gate 4: Intentional UI/UX (No Generic AI Aesthetics)
* **Forbidden:** Generic dark-mode card grids with purple/cyan glowing neon borders and cookie-cutter layouts.
* **Required:** Clean, high-contrast, tactile UI optimized for fast mobile booth scanning in dim university hall lighting. Large tap targets (minimum 44x44px), instant visual/audio feedback, and explicit error states.

---

## 3. Architecture & Execution Protocols

### 3.1 Next.js 15 App Router Discipline
* **Default to Server Components:** Every component is a Server Component unless it strictly requires client-side hooks (`useState`, `useEffect`) or browser hardware APIs (`navigator.mediaDevices`, `Audio`).
* **Boundary Hygiene:** Never import server-only database code into `'use client'` files.
* **Async Request APIs:** In Next.js 15, `params` and `searchParams` in page/layout components must be awaited.
* **Server Actions for Mutations:** Use Server Actions with Zod validation for form submissions and counter operations.

### 3.2 Single-Redemption & Idempotency Rules
* **Atomic State Machine:** Tickets only transition `INACTIVE -> ACTIVATED -> REDEEMED`.
* **Database Concurrency:** All vote redemptions must execute via atomic conditional updates:
  ```sql
  UPDATE "TICKET_STUB"
  SET "status" = 'REDEEMED', "updated_at" = NOW()
  WHERE "stub_serial" = :stub_serial AND "status" = 'ACTIVATED'
  RETURNING *;
  ```
* **Unique Constraints:** The database must enforce `UNIQUE(ticket_stub_id)` on the `VOTE` table.
* **Idempotency Keys:** Every vote scan endpoint must accept and validate an `Idempotency-Key` header (`<booth_id>:<stub_serial>:<nonce>`). Network retries must return the original success response without incrementing the tally.

### 3.3 Cryptography & Token Standards
* **Algorithm:** Use **HMAC-SHA256** with the server-side `EVENT_HMAC_SECRET`.
* **Payload Structure:** Compact URL-safe binary/base64url encoding ($\approx 16-22$ characters). No long URLs in QR codes.
* **Verification First:** Check HMAC signature math in memory *before* making any database queries.

### 3.4 Heroku & Appwrite Operational Discipline
* **Memory Ceiling:** Never exceed 512MB RAM on web dynos. Set `--max-old-space-size=384`.
* **Ephemeral Disk Rule:** Never write files or PDFs to the local dyno disk.
* **Appwrite Storage:** Stream all batch-generated PDFs directly to the Appwrite `bingo-cards-pdf` bucket using `node-appwrite`.
* **Appwrite Realtime:** Broadcast live vote updates via Appwrite WebSocket channels. Do not run custom persistent WebSocket servers on Heroku.
* **Postgres Connections:** Connect through PgBouncer in transaction mode (`&pgbouncer=true&connection_limit=5&statement_cache_size=0`).
