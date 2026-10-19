---
name: qr-crypto-idempotency
description: >-
  Procedures for generating and verifying HMAC-SHA256 signed QR codes, enforcing single-use
  redemption, and handling idempotent mobile scan retries in PostgreSQL. Use when implementing
  or testing ticket generation, ticket scanning, cryptographic signatures, or anti-double-spend logic.
  Do not use for UI styling, client-side camera scanning components, or Appwrite Storage uploads.
author: Daniel Bobis (GitHub: @ItsMeYourNightmare)
assisted_by:
  - OpenAI Codex
  - Google Gemini
---

# QR Cryptography & Idempotent Redemption Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Cryptographic Token Generation (HMAC-SHA256)

Use native Node.js `crypto` with zero third-party dependencies:

```typescript
import crypto from 'node:crypto';

const SECRET_KEY = process.env.EVENT_HMAC_SECRET!;

export function generateStubSignature(stubSerial: string, slotNumber: number): string {
  const data = `${stubSerial}:${slotNumber}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(data);
  // Return truncated 8-byte base64url string (exactly 12 chars)
  return hmac.digest('base64url').substring(0, 12);
}

export function verifyStubSignature(stubSerial: string, slotNumber: number, signature: string): boolean {
  const expected = generateStubSignature(stubSerial, slotNumber);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  // Guard: timingSafeEqual throws a fatal TypeError if buffer lengths differ
  if (expectedBuf.byteLength !== signatureBuf.byteLength) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
```

## 2. Compact QR Code Payload
* Do not put URLs inside the QR code.
* Format: `<stubSerial>.<slotNumber>.<signature>` (e.g. `B27-0104-S3.3.k7X9pL2a1Bq0`)
* Total length: $\approx 28$ characters. Renders a crisp Version 2 QR with high error correction (`Level Q`).

## 3. Atomic Single-Use Database Execution

Never do a check-then-act. Execute an atomic single-statement update with row-level locking:

```typescript
import { Prisma } from '@prisma/client';

export async function redeemTicketStub(
  tx: Prisma.TransactionClient,
  stubSerial: string,
  boothId: string,
  userId: string
) {
  // 1. Atomic state transition: ACTIVATED -> REDEEMED
  const updated = await tx.$queryRaw<Array<{ id: string; award_id: string }>>`
    UPDATE "TICKET_STUB"
    SET "status" = 'REDEEMED', "updated_at" = NOW()
    WHERE "stub_serial" = ${stubSerial}
      AND "status" = 'ACTIVATED'
    RETURNING "id", "award_id";
  `;

  if (!updated || updated.length === 0) {
    throw new Error('STUB_ALREADY_USED_OR_INACTIVE');
  }

  // 2. Insert vote with UNIQUE constraint protection
  return tx.vote.create({
    data: {
      ticketStubId: updated[0].id,
      boothId,
      awardId: updated[0].award_id,
      scannedByUserId: userId,
    },
  });
}
```

## 4. PostgreSQL Idempotency Key Protocol

To survive dyno restarts and support multiple web dynos without Redis, store idempotency keys in PostgreSQL:

### Schema
```sql
CREATE TABLE "IDEMPOTENCY_LOG" (
  "key" VARCHAR(128) PRIMARY KEY,
  "booth_id" UUID NOT NULL,
  "response_payload" JSONB NOT NULL,
  "status_code" INT NOT NULL DEFAULT 200,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Handler Pattern
```typescript
export async function withIdempotency(
  tx: Prisma.TransactionClient,
  idempotencyKey: string,
  boothId: string,
  operation: () => Promise<{ statusCode: number; payload: Record<string, unknown> }>
) {
  // Check if already processed
  const existing = await tx.$queryRaw<Array<{ status_code: number; response_payload: Record<string, unknown> }>>`
    SELECT "status_code", "response_payload"
    FROM "IDEMPOTENCY_LOG"
    WHERE "key" = ${idempotencyKey} AND "booth_id" = ${boothId}::uuid
    LIMIT 1;
  `;

  if (existing && existing.length > 0) {
    return {
      isRetry: true,
      statusCode: existing[0].status_code,
      payload: existing[0].response_payload,
    };
  }

  // Execute operation
  const result = await operation();

  // Record key atomically
  await tx.$executeRaw`
    INSERT INTO "IDEMPOTENCY_LOG" ("key", "booth_id", "status_code", "response_payload")
    VALUES (${idempotencyKey}, ${boothId}::uuid, ${result.statusCode}, ${JSON.stringify(result.payload)}::jsonb)
    ON CONFLICT ("key") DO NOTHING;
  `;

  return { isRetry: false, ...result };
}
```
