import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { verifyStubPayload, getVerifiedHmacSecret } from '@/lib/crypto/stub-tokens';
import { broadcastVoteEvent, triggerLeaderboardSnapshot } from '@/lib/appwrite/server';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';

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

interface UpdatedStubRow {
  id: string;
  awardId: string | null;
  bingoCardId: string;
  slotNumber: number;
}

export async function POST(request: Request) {

  // Step 1: Enforce authentication and strict role boundary (EXHIBITOR or ADMIN only)
  const session = await getCurrentUser();
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

  // Rate limit booth scanning to 45 scans per minute per client IP or booth
  const clientIp = getClientIp(request);
  const rateLimitKey = `vote:${session.boothId || clientIp}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 45, 60 * 1000);

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
    const body = await request.json();
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

    // Scope idempotency key to boothId to prevent cross-booth key replay
    const scopedIdempotencyKey = rawIdempotencyKey.startsWith(`${boothId}:`)
      ? rawIdempotencyKey
      : `${boothId}:${rawIdempotencyKey}`;

    const existingLog = await prisma.idempotencyLog.findUnique({
      where: { idempotencyKey: scopedIdempotencyKey },
    });

    if (existingLog) {
      return NextResponse.json(
        JSON.parse(existingLog.responseBody),
        { status: existingLog.responseStatus }
      );
    }

    // Check system configuration to verify voting is currently open
    const eventConfig = await prisma.eventConfig.findFirst({
      select: { isVotingOpen: true },
    });

    if (eventConfig && !eventConfig.isVotingOpen) {
      return NextResponse.json(
        { success: false, error: 'VOTING_IS_CLOSED' },
        { status: 403 }
      );
    }


    // Step 3: Execute stub redemption, award lookup, vote recording, and idempotency log atomically
    const transactionResult = await prisma.$transaction(async (tx) => {

      // 1. Atomic conditional update: only succeeds if currently ACTIVATED
      const updatedRows = await tx.$queryRaw<UpdatedStubRow[]>`
        UPDATE "TicketStub"
        SET "status" = 'REDEEMED', "updatedAt" = NOW()
        WHERE "stubSerial" = ${stubSerial}
          AND "status" = 'ACTIVATED'
        RETURNING "id", "awardId", "bingoCardId", "slotNumber";
      `;

      if (!updatedRows || updatedRows.length === 0) {
        const existingStub = await tx.ticketStub.findUnique({
          where: { stubSerial },
          select: { status: true },
        });

        if (!existingStub) {
          return { errorStatus: 'TICKET_NOT_FOUND', httpCode: 404 };
        }

        if (existingStub.status === 'REDEEMED') {
          // SEC-02: Check if a concurrent request with this idempotency key already completed successfully
          const concurrentLog = await tx.idempotencyLog.findUnique({
            where: { idempotencyKey: scopedIdempotencyKey },
          });

          if (concurrentLog) {
            return {
              cachedPayload: JSON.parse(concurrentLog.responseBody),
              httpCode: concurrentLog.responseStatus,
            };
          }

          return { errorStatus: 'TICKET_ALREADY_REDEEMED', httpCode: 409 };
        }

        return { errorStatus: 'TICKET_NOT_ACTIVATED', httpCode: 400 };
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
      await tx.idempotencyLog.upsert({
        where: { idempotencyKey: scopedIdempotencyKey },
        update: {},
        create: {
          idempotencyKey: scopedIdempotencyKey,
          responseStatus: 200,
          responseBody: JSON.stringify(payload),
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
      return NextResponse.json(
        { success: false, error: transactionResult.errorStatus },
        { status: transactionResult.httpCode }
      );
    }

    const { vote, totalVotesForAward, responsePayload } = transactionResult;

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

    // Step 5: Record human-readable audit trail log
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'VOTE_CAST',
      resource: 'VOTING',
      summary: createHumanReadableSummary('VOTE_CAST', {
        boothCode: vote.booth.code,
        projectTitle: vote.booth.projectTitle,
        stubSerial: vote.ticketStub.stubSerial,
        awardTitle: vote.award.title,
        slotNumber: vote.award.slotNumber,
      }),
      details: {
        voteId: vote.id,
        ticketStubId: vote.ticketStubId,
        stubSerial: vote.ticketStub.stubSerial,
        boothId: vote.boothId,
        boothCode: vote.booth.code,
        awardId: vote.awardId,
        awardTitle: vote.award.title,
        slotNumber: vote.award.slotNumber,
        totalVotesForAward,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('Vote processing error:', error);
    return NextResponse.json(
      { success: false, error: 'VOTE_PROCESSING_ERROR' },
      { status: 500 }
    );
  }
}
