import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJson, RequestBodyError } from '@/lib/security/request-body';
import { lockAndReadIdempotency, fingerprintRequest, encodeIdempotencyResponse, IdempotencyConflictError } from '@/lib/security/idempotency';
import prisma from '@/lib/db/prisma';
import { getCurrentUser, getVerifiedSessionClaims } from '@/lib/auth/session';
import { verifyStubPayload, getVerifiedHmacSecret } from '@/lib/crypto/stub-tokens';
import { broadcastVoteEvent, triggerLeaderboardSnapshot, broadcastAuditEvent } from '@/lib/appwrite/server';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { createHumanReadableSummary } from '@/lib/audit/log';

const VoteRequestSchema = z.object({
  qrPayload: z.string().min(5).max(512),
  boothId: z.string().uuid(),
});

const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9:._-]+$/);

const VoteResponseSchema = z.object({
  success: z.literal(true), message: z.string(), voteId: z.string(), stubSerial: z.string(),
  awardTitle: z.string(), slotNumber: z.number(), boothCode: z.string(), projectTitle: z.string(),
  totalVotesForAward: z.number(), scannedAt: z.string(),
});

interface UpdatedStubRow {
  id: string;
  awardId: string | null;
  bingoCardId: string;
  slotNumber: number;
}

export async function POST(request: Request) {

  // Step 1: Enforce authentication and strict role boundary (EXHIBITOR or ADMIN only)
  const session = await getVerifiedSessionClaims();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  if (session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'FORBIDDEN_ROLE' },
      { status: 403 }
    );
  }

  // An old session may spend only its own revision's input budget before revalidation.
  const clientIp = getClientIp(request);
  const rateLimitKey = `vote-input:${session.userId}:${session.accountVersion}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 90, 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many scan submissions. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) },
      }
    );
  }

  // Enforce mandatory and bounded Idempotency-Key header for network retry safety
  const rawIdempotencyHeader = request.headers.get('idempotency-key');
  const parsedIdempotencyKey = IdempotencyKeySchema.safeParse(rawIdempotencyHeader);
  if (!parsedIdempotencyKey.success) {
    return NextResponse.json(
      { success: false, error: 'MISSING_IDEMPOTENCY_KEY' },
      { status: 400 }
    );
  }
  const rawIdempotencyKey = parsedIdempotencyKey.data;

  try {
    const body = await readBoundedJson(request);
    const parsed = VoteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'INVALID_PAYLOAD_FORMAT' },
        { status: 400 }
      );
    }

    const { qrPayload, boothId } = parsed.data;

    // Exhibitors can only submit votes for their assigned booth
    if (session.role === 'EXHIBITOR' && session.boothId !== boothId) {
      return NextResponse.json(
        { success: false, error: 'FORBIDDEN_BOOTH_MISMATCH' },
        { status: 403 }
      );
    }

    // Step 2: Cryptographic HMAC token verification in memory BEFORE any database interaction
    const secretKey = getVerifiedHmacSecret();
    const cleanPayload = qrPayload.trim();
    const cryptoCheck = verifyStubPayload(cleanPayload, secretKey);

    if (!cryptoCheck.isValid || !cryptoCheck.data) {
      return NextResponse.json(
        { success: false, error: 'TAMPERED_OR_INVALID_QR_CODE' },
        { status: 400 }
      );
    }

    const { stubSerial, slotNumber } = cryptoCheck.data;

    // Both signatures are checked before the account or ticket database is touched.
    // Fresh account state still determines whether these claims retain authorization.
    if (!await getCurrentUser()) {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const boothRateCheck = rateLimiter.check(`vote:${session.boothId || clientIp}`, 45, 60 * 1000);
    if (!boothRateCheck.allowed) {
      return NextResponse.json({ success: false, error: 'RATE_LIMIT_EXCEEDED' }, {
        status: 429,
        headers: { 'Retry-After': String(boothRateCheck.retryAfterSeconds || 60) },
      });
    }

    // Scope idempotency key to boothId to prevent cross-booth key replay
    const scopedIdempotencyKey = rawIdempotencyKey.startsWith(`${boothId}:`)
      ? rawIdempotencyKey
      : `${boothId}:${rawIdempotencyKey}`;

    const requestFingerprint = fingerprintRequest({ boothId, stubSerial, slotNumber });

    // Step 3: Execute stub redemption, award lookup, vote recording, and idempotency log atomically
    const transactionResult = await prisma.$transaction(async (tx) => {

      const cached = await lockAndReadIdempotency(tx, scopedIdempotencyKey, requestFingerprint, VoteResponseSchema);
      if (cached) return { cachedPayload: cached.body, httpCode: cached.status };

      const configs = await tx.$queryRaw<Array<{ isVotingOpen: boolean }>>`
        SELECT "isVotingOpen" FROM "EventConfig" LIMIT 1 FOR SHARE
      `;
      if (!configs[0]?.isVotingOpen) return { errorStatus: 'VOTING_IS_CLOSED', httpCode: 403 };

      // 1. Atomic conditional update: only succeeds if currently ACTIVATED and parent BingoCard is ACTIVATED
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
          select: {
            status: true,
            bingoCard: {
              select: { status: true },
            },
          },
        });

        if (!existingStub) {
          return { errorStatus: 'TICKET_NOT_FOUND', httpCode: 404 };
        }

        if (existingStub.status === 'REDEEMED') {
          return { errorStatus: 'TICKET_ALREADY_REDEEMED', httpCode: 409 };
        }

        return {
          errorStatus: 'TICKET_NOT_ACTIVATED',
          message: 'Ticket stub has not been activated at the registration desk.',
          httpCode: 400,
        };
      }

      const stub = updatedRows[0];

      // 2. Resolve target award definition
      let award = stub.awardId
        ? await tx.award.findUnique({ where: { id: stub.awardId } })
        : await tx.award.findUnique({ where: { slotNumber: stub.slotNumber } });

      if (!award) {
        award = await tx.award.findUnique({ where: { slotNumber } });
      }

      if (!award || !award.isActive) {
        throw new Error('AWARD_SLOT_NOT_CONFIGURED');
      }

      // 3. Insert vote record protected by database UNIQUE(ticketStubId)
      const voteRecord = await tx.vote.create({
        data: {
          ticketStubId: stub.id,
          boothId: boothId,
          awardId: award.id,
          scannedByUserId: session.userId,
        },
        include: {
          booth: true,
          award: true,
          ticketStub: true,
        },
      });

      const totalVotesForAward = await tx.vote.count({
        where: {
          boothId,
          awardId: award.id,
        },
      });

      const payload = {
        success: true,
        message: 'VOTE_ACCEPTED',
        voteId: voteRecord.id,
        stubSerial: stubSerial,
        awardTitle: voteRecord.award.title,
        slotNumber: voteRecord.award.slotNumber,
        boothCode: voteRecord.booth.code,
        projectTitle: voteRecord.booth.projectTitle,
        totalVotesForAward,
        scannedAt: voteRecord.scannedAt.toISOString(),
      };

      // 4. Persist idempotency log atomically inside the same transaction
      await tx.idempotencyLog.create({
        data: {
          idempotencyKey: scopedIdempotencyKey,
          responseStatus: 200,
          responseBody: encodeIdempotencyResponse(requestFingerprint, payload),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          actorName: session.fullName,
          actorEmail: session.email,
          actorRole: session.role,
          action: 'VOTE_CAST',
          resource: 'VOTING',
          summary: createHumanReadableSummary('VOTE_CAST', {
            boothCode: voteRecord.booth.code,
            projectTitle: voteRecord.booth.projectTitle,
            stubSerial: voteRecord.ticketStub.stubSerial,
            awardTitle: voteRecord.award.title,
            slotNumber: voteRecord.award.slotNumber,
          }),
          details: JSON.stringify({
            voteId: voteRecord.id,
            ticketStubId: voteRecord.ticketStubId,
            stubSerial: voteRecord.ticketStub.stubSerial,
            boothId: voteRecord.boothId,
            boothCode: voteRecord.booth.code,
            awardId: voteRecord.awardId,
            awardTitle: voteRecord.award.title,
            slotNumber: voteRecord.award.slotNumber,
            totalVotesForAward,
          }),
          ipAddress: clientIp,
        },
      });

      return {
        vote: voteRecord,
        totalVotesForAward,
        responsePayload: payload,
      };
    });

    if ('cachedPayload' in transactionResult) {
      return NextResponse.json(transactionResult.cachedPayload, {
        status: transactionResult.httpCode || 200,
      });
    }

    if ('errorStatus' in transactionResult) {
      const errorPayload: { success: boolean; error: string; message?: string } = {
        success: false,
        error: transactionResult.errorStatus || "TRANSACTION_FAILED",
      };

      if ('message' in transactionResult && typeof transactionResult.message === 'string') {
        errorPayload.message = transactionResult.message;
      }

      return NextResponse.json(errorPayload, { status: transactionResult.httpCode });
    }

    const { vote, totalVotesForAward, responsePayload } = transactionResult;

    void broadcastAuditEvent({ eventType: 'AUDIT_EVENT', action: 'VOTE_CAST', resource: 'VOTING', timestamp: responsePayload.scannedAt });

    // Step 4: Dispatch live WebSocket event to Appwrite Realtime and refresh leaderboard snapshot
    await broadcastVoteEvent({
      boothId,
      boothCode: vote.booth.code,
      awardId: vote.award.id,
      awardTitle: vote.award.title,
      slotNumber: vote.award.slotNumber,
      totalVotesForAward,
      timestamp: responsePayload.scannedAt,
    });

    void triggerLeaderboardSnapshot();

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ success: false, error: 'IDEMPOTENCY_KEY_CONFLICT' }, { status: 409 });
    }
    console.error('Vote processing error:', error);
    return NextResponse.json(
      { success: false, error: 'VOTE_PROCESSING_ERROR' },
      { status: 500 }
    );
  }
}
