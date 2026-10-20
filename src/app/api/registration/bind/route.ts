import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RegistrationBindSchema } from '@/lib/registration/demographics';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { BuyerType, CardStatus, StubStatus } from '@prisma/client';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { broadcastRegistrationEvent } from '@/lib/appwrite/server';

const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9:._-]+$/);

export async function POST(request: Request) {

  // Enforce Registration or Admin authorization
  const session = await getCurrentUser();
  if (!session || (session.role !== 'REGISTRATION' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_REGISTRATION_ACTION' },
      { status: 403 }
    );
  }

  // Rate limit registration binds to 30 requests per minute per clerk or client IP
  const clientIp = getClientIp(request);
  const rateLimitKey = `reg:${session.userId || clientIp}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 30, 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many registration requests. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
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

  const scopedIdempotencyKey = `reg:${session.userId}:${parsedIdempotencyKey.data}`;
  const existingLog = await prisma.idempotencyLog.findUnique({
    where: { idempotencyKey: scopedIdempotencyKey },
  });
  if (existingLog) {
    return NextResponse.json(
      JSON.parse(existingLog.responseBody),
      { status: existingLog.responseStatus }
    );
  }

  // Gate: verify that registration is currently open in event configuration before processing
  const eventConfig = await prisma.eventConfig.findFirst({
    select: { isRegistrationOpen: true },
  });

  if (!eventConfig || !eventConfig.isRegistrationOpen) {
    return NextResponse.json(
      {
        success: false,
        error: 'REGISTRATION_CLOSED',
        message: 'Registration is currently paused by the event administrator.',
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = RegistrationBindSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      buyerType,
      buyerName,
      studentNumber,
      program,
      yearAndSection,
      affiliation,
      contactInfo,
      cardSerials,
    } = parsed.data;

    // Normalize serial numbers (strips whitespace, #, MASTER:, or M- prefixes) and deduplicate
    const normalizedSerials = Array.from(
      new Set(
        cardSerials.map((s) =>
          s
            .trim()
            .toUpperCase()
            .replace(/^(#|MASTER:|M-)/i, '')
            .trim()
        )
      )
    );

    // Execute atomic transaction: bind purchaser record, activate all cards/stubs, and persist idempotency log
    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify all cards exist and are currently unactivated
      const existingCards = await tx.bingoCard.findMany({
        where: {
          cardSerial: { in: normalizedSerials },
        },
        include: {
          stubs: true,
        },
      });

      if (existingCards.length !== normalizedSerials.length) {
        const foundSerials = new Set(existingCards.map((c) => c.cardSerial));
        const missing = normalizedSerials.filter((s) => !foundSerials.has(s));
        throw new Error(`MISSING_CARDS: Cards not found: ${missing.join(', ')}`);
      }

      const alreadyActive = existingCards.filter((c) => c.status !== CardStatus.GENERATED);
      if (alreadyActive.length > 0) {
        throw new Error(
          `ALREADY_ACTIVE: Cards already bound: ${alreadyActive.map((c) => c.cardSerial).join(', ')}`
        );
      }

      // 2. Create the demographic registration record
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
          quantityBought: normalizedSerials.length,
        },
      });

      const now = new Date();
      const cardIds = existingCards.map((c) => c.id);

      // 3. Atomically transition cards to ACTIVATED with concurrency guard (SEC-05)
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

      // 4. Atomically transition all stubs across these cards to ACTIVATED
      const stubsUpdate = await tx.ticketStub.updateMany({
        where: {
          bingoCardId: { in: cardIds },
          status: StubStatus.INACTIVE,
        },
        data: {
          status: StubStatus.ACTIVATED,
        },
      });

      const expectedStubsCount = existingCards.reduce((acc, c) => acc + c.stubs.length, 0);
      if (stubsUpdate.count !== expectedStubsCount) {
        throw new Error('CONCURRENCY_CONFLICT: Incomplete stub activation count.');
      }

      const txPayload = {
        success: true,
        message: 'CARDS_BOUND_AND_ACTIVATED',
        transactionId: transaction.id,
        cardsActivatedCount: existingCards.length,
        stubsActivatedCount: stubsUpdate.count,
      };

      // 5. Persist idempotency log atomically inside the same transaction
      await tx.idempotencyLog.upsert({
        where: { idempotencyKey: scopedIdempotencyKey },
        update: {},
        create: {
          idempotencyKey: scopedIdempotencyKey,
          responseStatus: 200,
          responseBody: JSON.stringify(txPayload),
        },
      });

      return txPayload;
    });

    const responsePayload = result;

    const paymentMethod = typeof body === 'object' && body && 'paymentMethod' in body && typeof body.paymentMethod === 'string'
      ? body.paymentMethod
      : 'CASH';

    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'REGISTRATION_BIND',
      resource: 'REGISTRATION',
      summary: createHumanReadableSummary('REGISTRATION_BIND', {
        actorName: session.fullName,
        actorRole: session.role,
        buyerName,
        studentNumber: studentNumber || null,
        programSection: [program, yearAndSection].filter(Boolean).join(' ') || null,
        cardCount: normalizedSerials.length,
        serials: normalizedSerials,
        paymentMethod,
        amount: paymentMethod === 'COMPLIMENTARY' ? 0 : normalizedSerials.length * 50,
      }),
      details: {
        transactionId: result.transactionId,
        buyerType,
        buyerName,
        studentNumber,
        program,
        yearAndSection,
        affiliation,
        contactInfo,
        quantity: normalizedSerials.length,
        serials: normalizedSerials,
        paymentMethod,
        amountPaid: paymentMethod === 'COMPLIMENTARY' ? 0 : normalizedSerials.length * 50,
        stubsActivatedCount: result.stubsActivatedCount,
      },
      ipAddress: clientIp,
    });

    // Broadcast sanitized registration event signal to sync concurrent cashier counters in real time
    await broadcastRegistrationEvent({
      eventType: 'REGISTRATION_EVENT',
      transactionId: result.transactionId,
      quantity: result.cardsActivatedCount,
      timestamp: new Date().toISOString(),
      processedByRole: session.role as 'REGISTRATION' | 'ADMIN',
    });

    return NextResponse.json(responsePayload);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    console.error('Registration bind transaction error:', error);

    // Check if a concurrent request with the same idempotency key succeeded while this transaction was running
    if (scopedIdempotencyKey) {
      try {
        const concurrentLog = await prisma.idempotencyLog.findUnique({
          where: { idempotencyKey: scopedIdempotencyKey },
        });

        if (concurrentLog) {
          return NextResponse.json(
            JSON.parse(concurrentLog.responseBody),
            { status: concurrentLog.responseStatus }
          );
        }
      } catch (logLookupErr) {
        console.error('Failed to check concurrent idempotency log:', logLookupErr);
      }
    }

    // SEC-11: Sanitize errors to prevent leaking internal database stack traces or SQL state
    if (
      rawMessage.startsWith('MISSING_CARDS:') ||
      rawMessage.startsWith('ALREADY_ACTIVE:') ||
      rawMessage.startsWith('CONCURRENCY_CONFLICT:')
    ) {
      return NextResponse.json(
        { success: false, error: rawMessage },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'REGISTRATION_TRANSACTION_FAILED' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session || (session.role !== 'REGISTRATION' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_REGISTRATION_ACTION' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const searchQuery = searchParams.get('q')?.trim().slice(0, 100);

  try {
    // SEC-01: Enforce strict role boundary scoping for REGISTRATION clerks regardless of query parameters
    const scopeFilter =
      session.role === 'REGISTRATION'
        ? { processedByUserId: session.userId }
        : {};

    const whereClause =
      searchQuery && searchQuery.length >= 2
        ? {
            ...scopeFilter,
            OR: [
              { buyerName: { contains: searchQuery, mode: 'insensitive' as const } },
              { studentNumber: { contains: searchQuery, mode: 'insensitive' as const } },
              { cards: { some: { cardSerial: { contains: searchQuery.toUpperCase() } } } },
            ],
          }
        : scopeFilter;

    const [eventConfig, transactions] = await Promise.all([
      prisma.eventConfig.findFirst({
        select: { isRegistrationOpen: true },
      }),
      prisma.registrationTransaction.findMany({
        where: whereClause,
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          buyerName: true,
          buyerType: true,
          studentNumber: true,
          program: true,
          yearAndSection: true,
          affiliation: true,
          quantityBought: true,
          createdAt: true,
          cards: {
            select: { cardSerial: true },
          },
        },
      }),
    ]);

    const isRegistrationOpen = eventConfig?.isRegistrationOpen ?? true;

    return NextResponse.json({
      success: true,
      isRegistrationOpen,
      transactions,
    });
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_TRANSACTIONS' },
      { status: 500 }
    );
  }
}

