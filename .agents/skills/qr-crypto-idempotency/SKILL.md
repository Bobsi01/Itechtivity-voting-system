---
name: qr-crypto-idempotency
description: >-
  Procedures for generating and verifying HMAC-SHA256 signed QR codes, enforcing single-use
  redemption, and handling idempotent mobile scan retries in PostgreSQL. Use when implementing
  or testing ticket generation, ticket scanning, cryptographic signatures, or anti-double-spend logic.
  Do not use for UI styling, client-side camera scanning components, or Appwrite Storage uploads.
---

# QR Cryptography & Idempotent Redemption Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Cryptographic Token Generation & Verification (`src/lib/crypto/stub-tokens.ts`)

Use native Node.js `node:crypto` with zero third-party cryptographic dependencies, and require `EVENT_HMAC_SECRET` to be at least 32 characters via `getVerifiedHmacSecret()`:

```typescript
import crypto from 'node:crypto';

export interface StubTokenData {
  stubSerial: string;
  slotNumber: number;
}

const SERIAL_REGEX = /^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}-S[1-6]$/;

export function getVerifiedHmacSecret(): string {

  const secret = process.env.EVENT_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('CRITICAL: EVENT_HMAC_SECRET environment variable is missing or shorter than 32 characters.');
  }

  return secret;
}

export function generateStubSignature(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}`);

  // Truncate HMAC-SHA256 to a URL-safe 24-character base64url token
  return hmac.digest('base64url').slice(0, 24);
}

export function generateStubVerificationCode(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}:PIN`);

  // 8-character uppercase hex PIN printed on physical stubs for manual fallback
  return hmac.digest('hex').slice(0, 8).toUpperCase();
}

function timingSafeEqualString(expected: string, provided: string): boolean {

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  // Guard byte length before timingSafeEqual to avoid fatal TypeError on mismatched inputs
  if (expectedBuffer.byteLength !== providedBuffer.byteLength) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function encodeStubPayload(
  stubSerial: string,
  slotNumber: number,
  secretKey: string
): string {

  const signature = generateStubSignature(stubSerial, slotNumber, secretKey);
  const rawString = `${stubSerial}|${slotNumber}|${signature}`;

  return Buffer.from(rawString, 'utf8').toString('base64url');
}

export function verifyStubPayload(
  payloadInput: string,
  secretKey: string
): { isValid: boolean; data?: StubTokenData } {

  try {
    const trimmed = payloadInput.trim();

    // Case 1: Human-entered manual token `<stubSerial>.<PIN>` or `<stubSerial>:<PIN>`
    const manualMatch = trimmed.match(/^([A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]{4}-S([1-6]))[.:]([A-Za-z0-9_-]{8,24})$/);
    if (manualMatch) {
      const normalizedSerial = manualMatch[1].toUpperCase();
      const slotNumber = Number(manualMatch[2]);
      const providedToken = manualMatch[3];

      if (!SERIAL_REGEX.test(normalizedSerial)) {
        return { isValid: false };
      }

      const expectedPin = generateStubVerificationCode(normalizedSerial, slotNumber, secretKey);
      const expectedFullSig = generateStubSignature(normalizedSerial, slotNumber, secretKey);
      const isPinMatch = timingSafeEqualString(expectedPin, providedToken.toUpperCase());
      const isFullSigMatch = timingSafeEqualString(expectedFullSig, providedToken);

      if (!isPinMatch && !isFullSigMatch) {
        return { isValid: false };
      }

      return { isValid: true, data: { stubSerial: normalizedSerial, slotNumber } };
    }

    // Case 2: Base64URL encoded QR payload (`<stubSerial>|<slotNumber>|<signature>`)
    const rawString = Buffer.from(trimmed, 'base64url').toString('utf8');
    const parts = rawString.split('|');
    if (parts.length !== 3) {
      return { isValid: false };
    }

    const [stubSerial, slotStr, providedSignature] = parts;
    if (!/^[1-6]$/.test(slotStr) || !stubSerial || !providedSignature || !SERIAL_REGEX.test(stubSerial)) {
      return { isValid: false };
    }

    const slotNumber = Number(slotStr);
    const expectedSignature = generateStubSignature(stubSerial, slotNumber, secretKey);
    if (!timingSafeEqualString(expectedSignature, providedSignature)) {
      return { isValid: false };
    }

    return { isValid: true, data: { stubSerial, slotNumber } };
  } catch {
    return { isValid: false };
  }
}
```

### In-Memory Verification Before Database Access
Always run `verifyStubPayload(payloadInput, secretKey)` in memory before touching PostgreSQL.

## 2. Compact QR Code & Manual Fallback Format
* Do not put URLs inside the QR code.
* **Encoded QR Payload:** `base64url("<stubSerial>|<slotNumber>|<24-char-sig>")` (for example, `B27-B01-0001-S3|3|<24-char-sig>` encoded via `encodeStubPayload`), rendered as a vector QR with error correction level `M` (`src/lib/pdf/vector-qr.ts`).
* **Manual Fallback Format:** `<stubSerial>.<8-char-hex-PIN>` or `<stubSerial>:<8-char-hex-PIN>` (for example, `B27-B01-0001-S1.9F4A2C8E`), matching `SERIAL_REGEX` (`^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}-S[1-6]$`).

## 3. Atomic Single-Use Database Execution (`src/app/api/vote/route.ts`)

Never use check-then-act (`SELECT` then `UPDATE`). Inside `prisma.$transaction`, verify `EventConfig.isVotingOpen`, execute a conditional `UPDATE "TicketStub"` that also verifies the parent `"BingoCard"` is `'ACTIVATED'`, map structured failure statuses (`403`, `404`, `409`, `400`) instead of crashing into HTTP `500`, resolve the active `Award` (falling back to `slotNumber` when `TicketStub.awardId` is nullable), insert the `Vote` (protected by `Vote.ticketStubId @unique`), and record `AuditLog`:

```typescript
import type { Prisma } from '@prisma/client';

interface UpdatedStubRow {
  id: string;
  awardId: string | null;
  bingoCardId: string;
  slotNumber: number;
}

type RedemptionOutcome =
  | { success: true; voteId: string; awardId: string; awardTitle: string; slotNumber: number }
  | { success: false; errorStatus: string; httpCode: number };

export async function redeemTicketStubInTx(
  tx: Prisma.TransactionClient,
  stubSerial: string,
  slotNumber: number,
  boothId: string,
  userId: string,
  clientIp: string
): Promise<RedemptionOutcome> {

  const configs = await tx.$queryRaw<Array<{ isVotingOpen: boolean }>>`
    SELECT "isVotingOpen" FROM "EventConfig" LIMIT 1 FOR SHARE
  `;
  if (!configs[0]?.isVotingOpen) {
    return { success: false, errorStatus: 'VOTING_IS_CLOSED', httpCode: 403 };
  }

  // Atomic state transition: only succeeds when both stub and parent card are ACTIVATED
  const updatedRows = await tx.$queryRaw<UpdatedStubRow[]>`
    UPDATE "TicketStub"
    SET "status" = 'REDEEMED', "updatedAt" = NOW()
    WHERE "stubSerial" = ${stubSerial}
      AND "status" = 'ACTIVATED'
      AND "bingoCardId" IN (
        SELECT "id" FROM "BingoCard" WHERE "status" = 'ACTIVATED'
      )
    RETURNING "id", "awardId", "bingoCardId", "slotNumber";
  `;

  if (!updatedRows || updatedRows.length === 0) {
    const existingStub = await tx.ticketStub.findUnique({
      where: { stubSerial },
      select: { status: true },
    });
    if (!existingStub) {
      return { success: false, errorStatus: 'TICKET_NOT_FOUND', httpCode: 404 };
    }
    if (existingStub.status === 'REDEEMED') {
      return { success: false, errorStatus: 'TICKET_ALREADY_REDEEMED', httpCode: 409 };
    }
    return { success: false, errorStatus: 'TICKET_NOT_ACTIVATED', httpCode: 400 };
  }

  const stub = updatedRows[0];

  // Resolve target award, falling back to slotNumber when awardId is null
  let award = stub.awardId
    ? await tx.award.findUnique({ where: { id: stub.awardId } })
    : await tx.award.findUnique({ where: { slotNumber: stub.slotNumber } });

  if (!award) {
    award = await tx.award.findUnique({ where: { slotNumber } });
  }

  if (!award || !award.isActive) {
    throw new Error('AWARD_SLOT_NOT_CONFIGURED');
  }

  const voteRecord = await tx.vote.create({
    data: {
      ticketStubId: stub.id,
      boothId,
      awardId: award.id,
      scannedByUserId: userId,
    },
  });

  await tx.auditLog.create({
    data: {
      userId,
      action: 'VOTE_CAST',
      resource: 'VOTING',
      details: JSON.stringify({ voteId: voteRecord.id, stubSerial, boothId, awardId: award.id }),
      ipAddress: clientIp,
    },
  });

  return {
    success: true,
    voteId: voteRecord.id,
    awardId: award.id,
    awardTitle: award.title,
    slotNumber: award.slotNumber,
  };
}
```

## 4. PostgreSQL Idempotency Key Protocol (`src/lib/security/idempotency.ts`)

To survive container restarts across multiple instances without Redis, store cached responses in the `IdempotencyLog` table (`prisma/schema.prisma`) and serialize concurrent retries with transaction-scoped PostgreSQL advisory locks.

### Schema (`prisma/schema.prisma`)
```prisma
model IdempotencyLog {
  id             String   @id @default(uuid())
  idempotencyKey String   @unique
  responseStatus Int
  responseBody   String
  createdAt      DateTime @default(now())
}
```

### Handler Pattern (`src/lib/security/idempotency.ts` & `src/app/api/vote/route.ts`)
Scope the key server-side (`${boothId}:${rawIdempotencyKey}` for voting, `reg:${session.userId}:${rawIdempotencyKey}` for registration) and verify a SHA-256 `requestFingerprint` before replaying any cached response:

```typescript
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const CachedEnvelopeSchema = z.object({
  version: z.literal(1),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  body: z.unknown(),
}).strict();

export class IdempotencyConflictError extends Error {
  constructor() {

    super('IDEMPOTENCY_KEY_CONFLICT');
    this.name = 'IdempotencyConflictError';
  }
}

export function fingerprintRequest(payload: object): string {

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function encodeIdempotencyResponse(requestFingerprint: string, body: object): string {

  return JSON.stringify({ version: 1, requestFingerprint, body });
}

export async function lockAndReadIdempotency<T>(
  tx: Prisma.TransactionClient,
  key: string,
  requestFingerprint: string,
  responseSchema: z.ZodType<T>
): Promise<{ body: T; status: number } | null> {

  // Transaction-level locks survive PgBouncer pooler reuse and serialize concurrent retries
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const existing = await tx.idempotencyLog.findUnique({ where: { idempotencyKey: key } });
  if (!existing) {
    return null;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(existing.responseBody);
  } catch {
    throw new IdempotencyConflictError();
  }

  const envelope = CachedEnvelopeSchema.safeParse(stored);
  if (!envelope.success || envelope.data.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError();
  }

  const response = responseSchema.safeParse(envelope.data.body);
  if (!response.success) {
    throw new IdempotencyConflictError();
  }

  return { body: response.data, status: existing.responseStatus };
}
```

When `lockAndReadIdempotency` returns `null`, perform the mutation inside the same `prisma.$transaction`, then insert the receipt via `tx.idempotencyLog.create` with `encodeIdempotencyResponse(requestFingerprint, responsePayload)`.
