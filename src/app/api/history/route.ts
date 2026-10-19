import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';

  try {
    if (session.role === 'REGISTRATION') {
      // Fetch registrations processed by this clerk or all registrations
      const transactions = await prisma.registrationTransaction.findMany({
        where: {
          processedByUserId: session.userId,
          ...(search
            ? {
                OR: [
                  { buyerName: { contains: search, mode: 'insensitive' } },
                  { studentNumber: { contains: search, mode: 'insensitive' } },
                  { program: { contains: search, mode: 'insensitive' } },
                  { affiliation: { contains: search, mode: 'insensitive' } },
                  { cards: { some: { cardSerial: { contains: search, mode: 'insensitive' } } } },
                ],
              }
            : {}),
        },
        include: {
          cards: {
            select: {
              cardSerial: true,
              status: true,
              activatedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const totalCardsBound = transactions.reduce((acc, tx) => acc + tx.quantityBought, 0);
      const totalCashRevenue = totalCardsBound * 50;

      return NextResponse.json({
        success: true,
        role: 'REGISTRATION',
        history: transactions.map((tx) => ({
          id: tx.id,
          createdAt: tx.createdAt.toISOString(),
          buyerName: tx.buyerName,
          buyerType: tx.buyerType,
          studentNumber: tx.studentNumber,
          program: tx.program,
          yearAndSection: tx.yearAndSection,
          affiliation: tx.affiliation,
          quantityBought: tx.quantityBought,
          amountDue: tx.quantityBought * 50,
          cardSerials: tx.cards.map((c) => c.cardSerial),
        })),
        stats: {
          totalTransactions: transactions.length,
          totalCardsBound,
          totalCashRevenue,
        },
      });
    }

    if (session.role === 'EXHIBITOR') {
      if (!session.boothId) {
        return NextResponse.json(
          { success: false, error: 'NO_BOOTH_ASSOCIATED_WITH_ACCOUNT' },
          { status: 400 }
        );
      }

      const votes = await prisma.vote.findMany({
        where: {
          boothId: session.boothId,
          ...(search
            ? {
                OR: [
                  { ticketStub: { stubSerial: { contains: search, mode: 'insensitive' } } },
                  { award: { title: { contains: search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          award: {
            select: {
              id: true,
              title: true,
              slotNumber: true,
            },
          },
          ticketStub: {
            select: {
              stubSerial: true,
              slotNumber: true,
              bingoCard: {
                select: {
                  cardSerial: true,
                },
              },
            },
          },
        },
        orderBy: { scannedAt: 'desc' },
        take: 200,
      });

      // Award tally counts for this booth
      const awardCounts: Record<string, number> = {};
      for (const v of votes) {
        const title = v.award.title;
        awardCounts[title] = (awardCounts[title] || 0) + 1;
      }

      return NextResponse.json({
        success: true,
        role: 'EXHIBITOR',
        history: votes.map((v) => ({
          id: v.id,
          scannedAt: v.scannedAt.toISOString(),
          stubSerial: v.ticketStub.stubSerial,
          cardSerial: v.ticketStub.bingoCard.cardSerial,
          slotNumber: v.award.slotNumber,
          awardTitle: v.award.title,
        })),
        stats: {
          totalVotesScanned: votes.length,
          awardCounts,
        },
      });
    }

    if (session.role === 'PRODUCTION') {
      const batches = await prisma.pdfBatch.findMany({
        where: search
          ? {
              OR: [
                { fileName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        include: {
          cards: {
            select: { cardSerial: true },
            orderBy: { cardSerial: 'asc' },
          },
        },
        orderBy: { batchNumber: 'desc' },
        take: 100,
      });

      const totalCards = batches.reduce((acc, b) => acc + b.totalCards, 0);
      const totalSheets = batches.reduce((acc, b) => acc + b.totalSheets, 0);

      return NextResponse.json({
        success: true,
        role: 'PRODUCTION',
        history: batches.map((b) => {
          const serials = b.cards.map((c) => c.cardSerial);
          const firstSerial = serials[0] || 'N/A';
          const lastSerial = serials[serials.length - 1] || 'N/A';

          return {
            id: b.id,
            batchNumber: b.batchNumber,
            fileName: b.fileName,
            fileSize: b.fileSize,
            totalCards: b.totalCards,
            totalSheets: b.totalSheets,
            status: b.status,
            serialRange: serials.length > 0 ? `${firstSerial} — ${lastSerial}` : 'N/A',
            createdAt: b.createdAt.toISOString(),
          };
        }),
        stats: {
          totalBatches: batches.length,
          totalCards,
          totalSheets,
        },
      });
    }

    if (session.role === 'ADMIN') {
      const recentAuditLogs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return NextResponse.json({
        success: true,
        role: 'ADMIN',
        history: recentAuditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          summary: log.summary || log.action,
          actorName: log.actorName,
          actorRole: log.actorRole,
          createdAt: log.createdAt.toISOString(),
        })),
      });
    }

    return NextResponse.json(
      { success: false, error: 'FORBIDDEN_ROLE' },
      { status: 403 }
    );
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_HISTORY' },
      { status: 500 }
    );
  }
}
