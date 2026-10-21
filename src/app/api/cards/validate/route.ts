import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { verifyStubPayload } from '@/lib/crypto/stub-tokens';
import { formatBuyerType, formatProgramYearSection } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const ValidateCardSchema = z.object({
  code: z
    .string({ required_error: 'Validation code is required' })
    .trim()
    .min(1, 'Validation code or QR string is required')
    .max(500, 'Validation code exceeds maximum length'),
});

const DEFAULT_AWARD_TITLES: Record<number, string> = {
  1: "People's Choice",
  2: "Dream Team",
  3: "Most Aesthetic Booth",
  4: "Best Interactive Demonstration",
  5: "Best Software Product",
  6: "Best Innovation",
};

interface ResolvedQuery {
  rawCode: string;
  cleanSerial: string;
  candidateCardSerial?: string;
  resolvedStubSerial?: string;
}

function resolveValidationQuery(rawInput: string): ResolvedQuery {

  const rawCode = rawInput.trim();
  const secretKey = process.env.EVENT_HMAC_SECRET;

  if (secretKey && secretKey.length >= 32) {
    try {
      const verified = verifyStubPayload(rawCode, secretKey);
      if (verified.isValid && verified.data) {
        const stubSerial = verified.data.stubSerial;
        const candidateCardSerial = stubSerial.replace(/-S[1-6]$/i, '');
        return {
          rawCode,
          cleanSerial: stubSerial,
          candidateCardSerial,
          resolvedStubSerial: stubSerial,
        };
      }
    } catch {
      // Invariant: Non-fatal decode error continues with pattern matching
    }
  }

  const manualStubMatch = rawCode.match(
    /^([A-Za-z0-9]+-[A-Za-z0-9]+-[0-9]{4}-S([1-6]))[.:]([A-Za-z0-9_-]+)$/
  );
  if (manualStubMatch) {
    const stubSerial = manualStubMatch[1].toUpperCase();
    const candidateCardSerial = stubSerial.replace(/-S[1-6]$/i, '');
    return {
      rawCode,
      cleanSerial: stubSerial,
      candidateCardSerial,
      resolvedStubSerial: stubSerial,
    };
  }

  const cleanSerial = rawCode.replace(/^(#|MASTER:|M-)/i, '').trim().toUpperCase();

  if (/^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}-S[1-6]$/i.test(cleanSerial)) {
    const candidateCardSerial = cleanSerial.replace(/-S[1-6]$/i, '');
    return {
      rawCode,
      cleanSerial,
      candidateCardSerial,
      resolvedStubSerial: cleanSerial,
    };
  }

  return {
    rawCode,
    cleanSerial,
    candidateCardSerial: cleanSerial,
  };
}

export async function POST(request: Request) {

  const clientIp = getClientIp(request);
  const rateLimitKey = `validate:${clientIp}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 30, 60 * 1000);

  if (!rateCheck.allowed) {
    const retryAfter = rateCheck.retryAfterSeconds || 60;
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many validation requests. Please retry in ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'Request payload must be valid JSON.',
      },
      { status: 400 }
    );
  }

  const parsed = ValidateCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message || 'Invalid validation code.',
      },
      { status: 400 }
    );
  }

  const { rawCode, cleanSerial, candidateCardSerial, resolvedStubSerial } =
    resolveValidationQuery(parsed.data.code);

  const orConditions: Array<Record<string, unknown>> = [
    { cardSerial: cleanSerial },
    { cardSerial: rawCode.toUpperCase() },
    { masterQrHash: rawCode },
    { masterQrHash: cleanSerial },
    { masterQrHash: `MASTER:${cleanSerial}` },
    { masterQrHash: `M-${cleanSerial}` },
    { stubs: { some: { stubSerial: cleanSerial } } },
    { stubs: { some: { stubSerial: rawCode.toUpperCase() } } },
  ];

  if (resolvedStubSerial) {
    orConditions.push({ stubs: { some: { stubSerial: resolvedStubSerial } } });
  }

  if (candidateCardSerial) {
    orConditions.push({ cardSerial: candidateCardSerial });
    orConditions.push({ masterQrHash: `MASTER:${candidateCardSerial}` });
    orConditions.push({ masterQrHash: `M-${candidateCardSerial}` });
  }

  const card = await prisma.bingoCard.findFirst({
    where: {
      OR: orConditions,
    },
    include: {
      transaction: {
        select: {
          id: true,
          buyerName: true,
          buyerType: true,
          studentNumber: true,
          program: true,
          yearAndSection: true,
          affiliation: true,
          createdAt: true,
        },
      },
      pdfBatch: {
        select: {
          batchNumber: true,
        },
      },
      stubs: {
        orderBy: { slotNumber: 'asc' },
        include: {
          award: {
            select: {
              slotNumber: true,
              title: true,
            },
          },
          vote: {
            include: {
              booth: {
                select: {
                  code: true,
                  projectTitle: true,
                  tableNumber: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!card) {
    return NextResponse.json(
      {
        success: false,
        error: 'CARD_NOT_FOUND',
        message: 'No bingo card found matching the provided serial number or QR code.',
      },
      { status: 404 }
    );
  }

  const isGenerated = card.status === 'GENERATED';

  let sanitizedDemographics: {
    buyerName: string;
    buyerType: string;
    buyerTypeLabel: string;
    program: string | null;
    yearAndSection: string | null;
    studentNumber: string | null;
    affiliation: string | null;
    academicAffiliation: string | null;
    registeredAt: string;
  } | null = null;

  if (!isGenerated && card.transaction) {
    const tx = card.transaction;
    const academicAffiliation = formatProgramYearSection(tx.program, tx.yearAndSection);

    sanitizedDemographics = {
      buyerName: tx.buyerName,
      buyerType: tx.buyerType,
      buyerTypeLabel: formatBuyerType(tx.buyerType),
      program: tx.program,
      yearAndSection: tx.yearAndSection,
      studentNumber: tx.studentNumber,
      affiliation: tx.affiliation,
      academicAffiliation:
        academicAffiliation === 'N/A' ? (tx.affiliation || null) : academicAffiliation,
      registeredAt: tx.createdAt.toISOString(),
    };
  }

  const existingStubsMap = new Map(card.stubs.map((stub) => [stub.slotNumber, stub]));

  const formattedStubs = Array.from({ length: 6 }, (_, index) => {
    const slotNumber = index + 1;
    const existingStub = existingStubsMap.get(slotNumber);

    if (isGenerated) {
      return {
        slotNumber,
        awardTitle:
          existingStub?.award?.title ||
          DEFAULT_AWARD_TITLES[slotNumber] ||
          `Award Slot ${slotNumber}`,
        stubSerial: existingStub?.stubSerial || `${card.cardSerial}-S${slotNumber}`,
        status: 'INACTIVE',
        isRedeemed: false,
        redeemedAt: null,
        votedBooth: null,
      };
    }

    if (!existingStub) {
      return {
        slotNumber,
        awardTitle: DEFAULT_AWARD_TITLES[slotNumber] || `Award Slot ${slotNumber}`,
        stubSerial: `${card.cardSerial}-S${slotNumber}`,
        status: card.status === 'VOID' ? 'VOID' : 'INACTIVE',
        isRedeemed: false,
        redeemedAt: null,
        votedBooth: null,
      };
    }

    const isRedeemed = existingStub.status === 'REDEEMED';

    return {
      slotNumber,
      awardTitle:
        existingStub.award?.title ||
        DEFAULT_AWARD_TITLES[slotNumber] ||
        `Award Slot ${slotNumber}`,
      stubSerial: existingStub.stubSerial,
      status: existingStub.status,
      isRedeemed,
      redeemedAt: existingStub.vote?.scannedAt
        ? existingStub.vote.scannedAt.toISOString()
        : null,
      votedBooth: existingStub.vote?.booth
        ? {
            code: existingStub.vote.booth.code,
            projectTitle: existingStub.vote.booth.projectTitle,
            tableNumber: existingStub.vote.booth.tableNumber,
          }
        : null,
    };
  });

  const redeemedCount = formattedStubs.filter((s) => s.status === 'REDEEMED').length;
  const availableCount = formattedStubs.filter((s) => s.status === 'ACTIVATED').length;
  const voidCount = formattedStubs.filter((s) => s.status === 'VOID').length;

  return NextResponse.json({
    success: true,
    card: {
      cardSerial: card.cardSerial,
      masterQrHash: card.masterQrHash,
      status: card.status,
      activatedAt: card.activatedAt ? card.activatedAt.toISOString() : null,
      batchNumber: card.pdfBatch?.batchNumber ?? null,
    },
    demographics: sanitizedDemographics,
    stubsSummary: {
      total: 6,
      redeemed: redeemedCount,
      available: availableCount,
      void: voidCount,
    },
    stubs: formattedStubs,
  });
}
