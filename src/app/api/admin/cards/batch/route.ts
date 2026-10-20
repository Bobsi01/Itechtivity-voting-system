import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { CardStatus } from '@prisma/client';

export async function GET() {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    // 1. Fetch all PDF batches with card aggregate telemetry and card directory items
    const batches = await prisma.pdfBatch.findMany({
      orderBy: { batchNumber: 'desc' },
      include: {
        cards: {
          orderBy: { cardSerial: 'asc' },
          select: {
            id: true,
            cardSerial: true,
            status: true,
            activatedAt: true,
            transaction: {
              select: {
                buyerName: true,
                buyerType: true,
                program: true,
                yearAndSection: true,
              },
            },
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
        cards: batch.cards.map((c) => ({
          id: c.id,
          cardSerial: c.cardSerial,
          status: c.status,
          activatedAt: c.activatedAt,
          buyerName: c.transaction?.buyerName || null,
          buyerType: c.transaction?.buyerType || null,
          program: c.transaction?.program || null,
          yearAndSection: c.transaction?.yearAndSection || null,
        })),
      };
    });

    // 2. Fetch active academic programs and award slots for card preview template
    const [programs, awards] = await Promise.all([
      prisma.academicProgram.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        select: { code: true, name: true },
      }),
      prisma.award.findMany({
        orderBy: { slotNumber: 'asc' },
        take: 6,
        select: { slotNumber: true, title: true },
      }),
    ]);

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
      awards,
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

export async function POST() {

  return NextResponse.json(
    {
      success: false,
      error: 'NOT_FOUND',
      message: 'Batch card activation has been permanently deprecated.',
    },
    { status: 404 }
  );
}
