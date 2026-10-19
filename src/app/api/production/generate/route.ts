import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { generateCardBatch } from '@/lib/pdf/local-generator';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';

const GenerateBatchSchema = z.object({
  totalCards: z.number().int().min(4).max(200).multipleOf(4),
});

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || (session.role !== 'PRODUCTION' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_PRODUCTION_ACTION' },
      { status: 403 }
    );
  }

  // Rate limit batch PDF generation to 5 batches per minute per user or IP to protect the 512MB dyno ceiling
  const clientIp = getClientIp(request);
  const rateLimitKey = `prod-gen:${session.userId || clientIp}`;
  const rateCheck = rateLimiter.check(rateLimitKey, 5, 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many batch generation requests. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = GenerateBatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CARD_COUNT', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { totalCards } = parsed.data;

    // Execute full batch PDF rendering and database persistence
    const result = await generateCardBatch({ totalCards });

    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'PRODUCTION_GENERATE_BATCH',
      resource: 'PRODUCTION',
      summary: createHumanReadableSummary('PRODUCTION_GENERATE_BATCH', {
        actorName: session.fullName,
        actorRole: session.role,
        batchNumber: result.batchNumber,
        totalCards: result.totalCards,
        totalSheets: result.totalSheets,
      }),
      details: {
        batchId: result.batchId,
        batchNumber: result.batchNumber,
        totalCards: result.totalCards,
        totalSheets: result.totalSheets,
        fileName: result.fileName,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      batch: result,
    });
  } catch (error) {
    console.error('Batch PDF generation failed:', error);
    return NextResponse.json(
      { success: false, error: 'BATCH_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
