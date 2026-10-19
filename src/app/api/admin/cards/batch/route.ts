import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/audit/log';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { BuyerType, CardStatus, StubStatus } from '@prisma/client';

const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9:._-]+$/);

const BatchActivationInputSchema = z.object({
  mode: z.enum(['BY_BATCH', 'BY_RANGE', 'BY_SERIALS']),
  pdfBatchId: z.string().optional(),
  batchNumber: z.number().int().positive().optional(),
  startSerial: z.string().max(100).optional(),
  endSerial: z.string().max(100).optional(),
  serials: z.array(z.string().trim().min(3).max(100)).max(500).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  buyerName: z.string().trim().min(2, 'Recipient or Buyer name must be at least 2 characters').max(120),
  buyerType: z.enum(['CSD_STUDENT', 'NON_CSD_STUDENT', 'VISITOR', 'ALUMNI']),
  studentNumber: z.string().trim().max(40).optional().nullable(),
  program: z.string().trim().max(80).optional().nullable(),
  yearAndSection: z.string().trim().max(40).optional().nullable(),
  affiliation: z.string().trim().max(120).optional().nullable(),
  contactInfo: z.string().trim().max(120).optional().nullable(),
});

export async function GET() {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    // 1. Fetch all PDF batches with card aggregate telemetry
    const batches = await prisma.pdfBatch.findMany({
      orderBy: { batchNumber: 'desc' },
      include: {
        cards: {
          select: {
            cardSerial: true,
            status: true,
          },
        },
      },
    });

    const formattedBatches = batches.map((batch) => {
      const total = batch.cards.length;
      const generated = batch.cards.filter((c) => c.status === CardStatus.GENERATED).length;
      const activated = batch.cards.filter((c) => c.status === CardStatus.ACTIVATED).length;
      const voidCount = batch.cards.filter((c) => c.status === CardStatus.VOID).length;

      const serials = batch.cards.map((c) => c.cardSerial).sort();
      const firstSerial = serials.length > 0 ? serials[0] : null;
      const lastSerial = serials.length > 0 ? serials[serials.length - 1] : null;

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        fileName: batch.fileName,
        totalCards: batch.totalCards,
        totalSheets: batch.totalSheets,
        status: batch.status,
        createdAt: batch.createdAt,
        counts: {
          total,
          generated,
          activated,
          void: voidCount,
        },
        firstSerial,
        lastSerial,
      };
    });

    // 2. Fetch active academic programs for dropdown options
    const programs = await prisma.academicProgram.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      select: { code: true, name: true },
    });

    // 3. Overall system-wide cards summary
    const [totalCards, totalGenerated, totalActivated, totalVoid] = await Promise.all([
      prisma.bingoCard.count(),
      prisma.bingoCard.count({ where: { status: CardStatus.GENERATED } }),
      prisma.bingoCard.count({ where: { status: CardStatus.ACTIVATED } }),
      prisma.bingoCard.count({ where: { status: CardStatus.VOID } }),
    ]);

    return NextResponse.json({
      success: true,
      batches: formattedBatches,
      programs,
      summary: {
        totalCards,
        totalGenerated,
        totalActivated,
        totalVoid,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve batch activation telemetry:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_LOAD_BATCH_METRICS' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  // Rate limit batch activations to 30 requests per minute
  const clientIp = getClientIp(request);
  const rateLimitKey = `admin:batch:${session.userId || clientIp}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 30, 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many batch activation requests. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) },
      }
    );
  }

  // Validate optional or provided Idempotency-Key header for replay defense
  const rawIdempotencyHeader = request.headers.get('idempotency-key');
  let scopedIdempotencyKey: string | null = null;
  if (rawIdempotencyHeader) {
    const parsedIdempotencyKey = IdempotencyKeySchema.safeParse(rawIdempotencyHeader);
    if (!parsedIdempotencyKey.success) {
      return NextResponse.json(
        { success: false, error: 'INVALID_IDEMPOTENCY_KEY' },
        { status: 400 }
      );
    }
    scopedIdempotencyKey = `admin:batch:${session.userId}:${parsedIdempotencyKey.data}`;
    const existingLog = await prisma.idempotencyLog.findUnique({
      where: { idempotencyKey: scopedIdempotencyKey },
    });
    if (existingLog) {
      return NextResponse.json(
        JSON.parse(existingLog.responseBody),
        { status: existingLog.responseStatus }
      );
    }
  }

  try {
    const body = await request.json();
    const parsed = BatchActivationInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      mode,
      pdfBatchId,
      batchNumber,
      startSerial,
      endSerial,
      serials,
      limit,
      buyerName,
      buyerType,
      studentNumber,
      program,
      yearAndSection,
      affiliation,
      contactInfo,
    } = parsed.data;

    let targetCardSerials: string[] = [];

    if (mode === 'BY_BATCH') {
      let resolvedBatchId = pdfBatchId;
      if (!resolvedBatchId && batchNumber) {
        const found = await prisma.pdfBatch.findUnique({
          where: { batchNumber },
          select: { id: true },
        });
        resolvedBatchId = found?.id;
      }

      if (!resolvedBatchId) {
        return NextResponse.json(
          { success: false, error: 'BATCH_NOT_FOUND', message: 'Specify a valid PDF batch to activate.' },
          { status: 400 }
        );
      }

      const availableCards = await prisma.bingoCard.findMany({
        where: {
          pdfBatchId: resolvedBatchId,
          status: CardStatus.GENERATED,
        },
        orderBy: { cardSerial: 'asc' },
        take: limit && limit > 0 ? Math.min(limit, 500) : 500,
        select: { cardSerial: true },
      });

      targetCardSerials = availableCards.map((c) => c.cardSerial);
    } else if (mode === 'BY_RANGE') {
      const cleanStart = (startSerial || '').trim().toUpperCase().replace(/^(#|MASTER:|M-)/i, '');
      const cleanEnd = (endSerial || '').trim().toUpperCase().replace(/^(#|MASTER:|M-)/i, '');

      if (!cleanStart || !cleanEnd) {
        return NextResponse.json(
          { success: false, error: 'INVALID_SERIAL_RANGE', message: 'Start and end card serials are required.' },
          { status: 400 }
        );
      }

      const rangeCards = await prisma.bingoCard.findMany({
        where: {
          cardSerial: {
            gte: cleanStart,
            lte: cleanEnd,
          },
          status: CardStatus.GENERATED,
        },
        orderBy: { cardSerial: 'asc' },
        take: limit && limit > 0 ? Math.min(limit, 500) : 500,
        select: { cardSerial: true },
      });

      targetCardSerials = rangeCards.map((c) => c.cardSerial);
    } else if (mode === 'BY_SERIALS') {
      const cleanList = Array.from(
        new Set(
          (serials || [])
            .map((s) => s.trim().toUpperCase().replace(/^(#|MASTER:|M-)/i, ''))
            .filter(Boolean)
        )
      );

      if (cleanList.length === 0) {
        return NextResponse.json(
          { success: false, error: 'NO_SERIALS_PROVIDED', message: 'Enter at least one card serial to activate.' },
          { status: 400 }
        );
      }

      const existingCards = await prisma.bingoCard.findMany({
        where: {
          cardSerial: { in: cleanList },
          status: CardStatus.GENERATED,
        },
        select: { cardSerial: true },
      });

      targetCardSerials = existingCards.map((c) => c.cardSerial);
    }

    if (targetCardSerials.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_ELIGIBLE_CARDS',
          message: 'No unactivated (GENERATED) cards found matching the criteria. They may already be activated or do not exist.',
        },
        { status: 400 }
      );
    }

    // Atomically create registration transaction and activate all selected cards & stubs
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch matching cards
      const cardsToActivate = await tx.bingoCard.findMany({
        where: {
          cardSerial: { in: targetCardSerials },
          status: CardStatus.GENERATED,
        },
        select: { id: true, cardSerial: true },
      });

      if (cardsToActivate.length === 0) {
        throw new Error('NO_UNACTIVATED_CARDS');
      }

      const cardIds = cardsToActivate.map((c) => c.id);

      // 2. Create the registration transaction record attributing the sale/issuance to this Admin
      const transaction = await tx.registrationTransaction.create({
        data: {
          processedByUserId: session.userId,
          buyerType: buyerType as BuyerType,
          buyerName,
          studentNumber: studentNumber || null,
          program: program || null,
          yearAndSection: yearAndSection || null,
          affiliation: affiliation || null,
          contactInfo: contactInfo || null,
          quantityBought: cardIds.length,
        },
      });

      const now = new Date();

      // 3. Atomically transition cards to ACTIVATED with concurrency guard
      const updateResult = await tx.bingoCard.updateMany({
        where: {
          id: { in: cardIds },
          status: CardStatus.GENERATED,
        },
        data: {
          status: CardStatus.ACTIVATED,
          transactionId: transaction.id,
          activatedAt: now,
        },
      });

      if (updateResult.count !== cardIds.length) {
        throw new Error('CONCURRENCY_CONFLICT: One or more cards were concurrently modified or activated.');
      }

      // 4. Atomically transition all 6 stubs per card to ACTIVATED
      await tx.ticketStub.updateMany({
        where: {
          bingoCardId: { in: cardIds },
          status: StubStatus.INACTIVE,
        },
        data: {
          status: StubStatus.ACTIVATED,
        },
      });

      // 5. Persist idempotency log atomically inside the same transaction
      if (scopedIdempotencyKey) {
        const txPayload = {
          success: true,
          activatedCount: cardIds.length,
          transaction: {
            id: transaction.id,
            buyerName: transaction.buyerName,
            buyerType: transaction.buyerType,
            createdAt: transaction.createdAt,
          },
          activatedSerials: cardsToActivate.map((c) => c.cardSerial),
        };

        await tx.idempotencyLog.upsert({
          where: { idempotencyKey: scopedIdempotencyKey },
          update: {},
          create: {
            idempotencyKey: scopedIdempotencyKey,
            responseStatus: 200,
            responseBody: JSON.stringify(txPayload),
          },
        });
      }

      return {
        transaction,
        activatedCount: cardIds.length,
        activatedSerials: cardsToActivate.map((c) => c.cardSerial),
      };
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      action: 'BATCH_CARDS_ACTIVATED',
      resource: 'BingoCard',
      details: {
        mode,
        activatedCount: result.activatedCount,
        buyerName,
        buyerType,
        transactionId: result.transaction.id,
        firstSerial: result.activatedSerials[0],
        lastSerial: result.activatedSerials[result.activatedSerials.length - 1],
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      activatedCount: result.activatedCount,
      transaction: {
        id: result.transaction.id,
        buyerName: result.transaction.buyerName,
        buyerType: result.transaction.buyerType,
        createdAt: result.transaction.createdAt,
      },
      activatedSerials: result.activatedSerials,
    });
  } catch (error) {
    console.error('Failed to perform batch card activation:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_ACTIVATE_BATCH', message: 'Failed to complete batch activation transaction.' },
      { status: 500 }
    );
  }
}
