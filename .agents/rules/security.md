# Security & Anti-Fraud Governance Rules

## 1. Cryptographic Invariants
* **HMAC-SHA256 Token Verification:** All QR stub payloads must be verified in memory using the server-side `EVENT_HMAC_SECRET` *before* initiating any database operations.
* **Buffer Length Guard on `timingSafeEqual`:** Never call `crypto.timingSafeEqual` without first verifying `expectedBuf.byteLength === signatureBuf.byteLength`. Failing to check buffer length causes a fatal Node.js runtime `TypeError` on mismatched input.
* **High Entropy & Zero Sequential Predictability:** Never use sequential IDs (e.g. `1, 2, 3`) for cards or stubs. All serials must use cryptographically secure random identifiers (`nanoid`).

## 2. Single-Redemption & Atomic Concurrency
* **Two-Phase Commit:** A ticket stub can only be redeemed if its status is strictly `ACTIVATED`. Unactivated stubs must be rejected immediately.
* **Atomic State Transition:** All vote mutations must execute via a single conditional update with row-level locking:
  ```sql
  UPDATE "TICKET_STUB"
  SET "status" = 'REDEEMED', "updated_at" = NOW()
  WHERE "stub_serial" = :stub_serial AND "status" = 'ACTIVATED'
  RETURNING *;
  ```
  If zero rows are returned, the transaction must fail immediately.
* **Database Unique Constraint:** Enforce `UNIQUE(ticket_stub_id)` on the `VOTE` table as an unbreachable hardware-level defense against race conditions.

## 3. Idempotency & Network Retry Safety
* Every vote endpoint must accept an `Idempotency-Key` header (`<booth_id>:<stub_serial>:<nonce>`).
* Verify idempotency against the PostgreSQL `IDEMPOTENCY_LOG` table. Network retries must return the original HTTP 200 response without incrementing vote tallies or creating duplicate records.

## 4. Role-Based Access Control (RBAC) & Boundary Isolation
* Protect all routes and Server Actions with strict role validation:
  - `/admin/*` requires `ADMIN` role.
  - `/production/*` requires `PRODUCTION` role.
  - `/registration/*` requires `REGISTRATION` role.
  - `/exhibitor/*` requires `EXHIBITOR` role.
* Exhibitors are strictly scoped: an exhibitor account can **only** record votes and view tallies for its assigned `booth_id`.
* Never return password hashes, secret keys, or internal signature salts in API responses or Server Component props.
