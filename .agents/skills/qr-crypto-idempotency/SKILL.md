---
name: qr-crypto-idempotency
description: >-
  Procedures for generating and verifying HMAC-SHA256 signed QR codes, enforcing single-use
  redemption, and handling idempotent mobile scan retries in PostgreSQL. Use when implementing
  or testing ticket generation, ticket scanning, cryptographic signatures, or anti-double-spend logic.
---

# QR Cryptography & Idempotent Redemption Skill

## 1. Cryptographic Token Generation (HMAC-SHA256)

Use native Node.js `crypto` with zero third-party dependencies:

```typescript
import crypto from 'node:crypto';

const SECRET_KEY = process.env.EVENT_HMAC_SECRET!;

export function generateStubSignature(stubSerial: string, slotNumber: number): string {
  const data = `${stubSerial}:${slotNumber}`;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(data);
  // Return truncated 8-byte base64url string (11-12 chars)
  return hmac.digest('base64url').substring(0, 12);
}

export function verifyStubSignature(stubSerial: string, slotNumber: number, signature: string): boolean {
  const expected = generateStubSignature(stubSerial, slotNumber);
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

## 2. Compact QR Code Payload
* Do not put URLs inside the QR code.
* Format: `<stubSerial>.<slotNumber>.<signature>` (e.g. `B27-0104-S3.3.k7X9pL2a1Bq0`)
* Total length: $\approx 28$ characters. Renders a crisp Version 2 QR with high error correction (`Level Q`).

## 3. Atomic Single-Use Database Execution

Never do a check-then-act. Execute an atomic single-statement update with row-level locking:

```typescript
export async function redeemTicketStub(
  tx: PrismaTransaction,
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

## 4. Idempotency Key Handling
* Check request header: `Idempotency-Key: <boothId>:<stubSerial>:<nonce>`.
* If key exists in cache/table: return stored response (status 200) without incrementing counters.
* If key is new: process transaction and store key for 24 hours.
