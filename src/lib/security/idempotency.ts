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

  // Transaction-level locks survive pooler connection reuse and serialize even disjoint payloads.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  const existing = await tx.idempotencyLog.findUnique({ where: { idempotencyKey: key } });
  if (!existing) return null;

  let stored: unknown;
  try {
    stored = JSON.parse(existing.responseBody);
  } catch {
    throw new IdempotencyConflictError();
  }

  const envelope = CachedEnvelopeSchema.safeParse(stored);
  // Legacy records cannot prove which request produced their receipt.
  if (!envelope.success || envelope.data.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError();
  }
  const response = responseSchema.safeParse(envelope.data.body);
  if (!response.success) throw new IdempotencyConflictError();
  return { body: response.data, status: existing.responseStatus };
}
