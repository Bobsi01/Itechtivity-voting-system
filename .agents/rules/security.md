# Security & Anti-Fraud Governance Rules

## 1. Cryptographic Invariants & Timing-Safe Verification
* **HMAC-SHA256 Token Verification:** All QR stub payloads and session tokens must be verified in memory using the server-side `EVENT_HMAC_SECRET` *before* initiating any database operations.
* **Buffer Length Guard on `timingSafeEqual`:** Never call `crypto.timingSafeEqual` without first verifying `expectedBuf.byteLength === signatureBuf.byteLength`. Failing to check buffer length causes a fatal Node.js runtime `TypeError` on mismatched input and creates denial-of-service vectors.
* **High Entropy & Zero Sequential Predictability:** Never use sequential IDs (e.g. `1, 2, 3`) for cards, stubs, or security tokens. All serials and nonces must use cryptographically secure random identifiers (`crypto.randomBytes`, `crypto.randomUUID`, or `nanoid`).

## 2. Single-Redemption & Atomic Concurrency (Anti-Race Condition)
* **Two-Phase Commit:** A ticket stub can only be redeemed if its status is strictly `ACTIVATED`. Unactivated (`INACTIVE`) or already used (`REDEEMED`) stubs must be rejected immediately.
* **Atomic State Transition:** Never use check-then-act (`SELECT` then `UPDATE`) patterns for ticket redemption. All vote mutations must execute via a single conditional update with row-level locking inside an interactive transaction:
  ```sql
  UPDATE "TICKET_STUB"
  SET "status" = 'REDEEMED', "updated_at" = NOW()
  WHERE "stub_serial" = :stub_serial AND "status" = 'ACTIVATED'
  RETURNING *;
  ```
  If zero rows are returned, the transaction must abort immediately.
* **Database Unique Constraint:** Enforce `UNIQUE(ticket_stub_id)` on the `VOTE` table as an unbreachable database-level defense against concurrent double-spend race conditions.

## 3. Idempotency & Replay Attack Defense
* Every vote and scan mutation endpoint must require and validate an `Idempotency-Key` header (`<booth_id>:<stub_serial>:<nonce>`).
* Verify idempotency atomically against the PostgreSQL `IDEMPOTENCY_LOG` table (`UNIQUE(key, booth_id)`). Network retries must return the original cached response without incrementing vote tallies or creating duplicate records.

## 4. Role-Based Access Control (RBAC) & Broken Object Level Authorization (BOLA / IDOR) Defense
* **Strict Route & Action Isolation:** Protect all routes, API handlers, and Server Actions with server-side session and role validation:
  - `/admin/*` and `/api/admin/*` require `ADMIN` role.
  - `/production/*` and `/api/print-batches/*` require `PRODUCTION` (or `ADMIN`) role.
  - `/registration/*` and `/api/registration/*` require `REGISTRATION` (or `ADMIN`) role.
  - `/exhibitor/*` and `/api/scan/*` require `EXHIBITOR` (or `ADMIN`) role.
* **Zero Trust on Client-Supplied Identifiers (BOLA Prevention):** Never trust `boothId`, `userId`, or `role` from client request bodies, query strings, or headers. Always derive identity and `boothId` strictly from the verified server-side session (`getCurrentSession()`).
* **Tenant & Award Scope Binding:** An `EXHIBITOR` account can **only** record votes and view tallies for its assigned `boothId`, and only when the scanned stub's `awardId` matches a valid award category for that booth.

## 5. Input Validation, Mass Assignment & Sink Isolation (OWASP Top 10 / API Security)
* **Trust Boundary Schema Validation:** Validate all external inputs (JSON bodies, `FormData`, URL parameters, query strings, headers, and scanned QR strings) at the entrypoint using strict Zod schemas before executing business logic.
* **Mass Assignment Prevention:** Never pass raw `req.json()` objects directly into Prisma `create` or `update` queries. Explicitly map only validated, allowed fields.
* **SQL Injection & Taint Sink Isolation:** Never use `prisma.$queryRawUnsafe` or `prisma.$executeRawUnsafe` with string concatenation or unparameterized template interpolation. Always use parameterized Prisma methods or tagged template literals (`prisma.$queryRaw` / `prisma.$executeRaw`).
* **Unrestricted Resource Consumption (Rate Limiting):** Enforce rate limiting and payload size bounds on authentication endpoints (`/api/auth/login`), batch card generation, and high-frequency scan routes to prevent brute-force and resource exhaustion under the 512MB Heroku dyno ceiling.

## 6. Session Hardening, Transport Security & Secret Isolation
* **Cookie & Session Security:** Session cookies must be signed with HMAC-SHA256, verify expiration (`exp`) on every request, and enforce `HttpOnly`, `SameSite=Lax` (or `Strict`), `Path=/`, and `Secure` (in production).
* **Authentication Enumeration Defense:** Login endpoints must use constant-time or adaptive password hashing (`bcryptjs`) and return generic failure messages on invalid credentials to prevent username enumeration.
* **HTTP Defense Headers:** Enforce security headers across application responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (allowing camera strictly for same-origin QR scanning)
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (in production)
* **Secret & Error Hygiene:** Never expose server-side secrets (`EVENT_HMAC_SECRET`, `DATABASE_URL`, `APPWRITE_API_KEY`) via `NEXT_PUBLIC_*` variables. Never return password hashes, secret keys, internal stack traces, or raw database error objects in API responses or logs.

## 7. Three-Tier Defensive Execution Protocol
* **Always Do:** Verify HMAC signatures in memory before DB calls; guard buffer lengths before `crypto.timingSafeEqual`; validate all inputs with Zod; bind queries to server-verified session context; execute state transitions atomically inside PostgreSQL transactions; log security-critical state changes to `AUDIT_LOG`.
* **Require Human Approval:** Modifying cryptographic signing algorithms, altering RBAC role permissions, dropping database constraints/tables, or introducing unauthenticated public mutation endpoints.
* **Never Do:** Trust client-supplied `boothId` or role claims; use check-then-act (`SELECT` then `UPDATE`) for ticket redemption; use sequential IDs for tickets; swallow catch blocks silently; expose secrets or raw error stacks to the client.

