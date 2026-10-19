import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { formatProgramYearSection } from '@/lib/utils/format';

export async function GET() {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    // 1. Event config
    const config = await prisma.eventConfig.findFirst();

    // 2. High-level card and vote counters
    const totalCards = await prisma.bingoCard.count();
    const activatedCards = await prisma.bingoCard.count({ where: { status: 'ACTIVATED' } });
    const totalVotes = await prisma.vote.count();

    // 3. Demographic breakdown by buyer category
    const demographicsRaw = await prisma.registrationTransaction.groupBy({
      by: ['buyerType'],
      _sum: { quantityBought: true },
      _count: { id: true },
    });

    const demographics = demographicsRaw.map((d) => ({
      buyerType: d.buyerType,
      cardsBought: d._sum.quantityBought ?? 0,
      transactionsCount: d._count.id,
    }));

    // 4. Awards definition list
    const awards = await prisma.award.findMany({
      orderBy: { slotNumber: 'asc' },
      include: {
        _count: { select: { votes: true } },
      },
    });

    const awardTitleMap = new Map<string, string>();
    for (const award of awards) {
      awardTitleMap.set(award.id, award.title);
    }

    // 5. Database-level aggregation to preserve memory ceiling on Heroku dynos (SEC-12)
    const [booths, voteTallies, recentTransactions] = await Promise.all([
      prisma.booth.findMany({
        select: {
          id: true,
          code: true,
          projectTitle: true,
          capstoneCategory: true,
          _count: { select: { votes: true } },
        },
        orderBy: { code: 'asc' },
      }),
      prisma.vote.groupBy({
        by: ['boothId', 'awardId'],
        _count: { id: true },
      }),
      prisma.registrationTransaction.findMany({
        take: 12,
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
        },
      }),
    ]);

    // Map aggregated tallies into booth leaderboard
    const boothAwardCountsMap = new Map<string, Record<string, number>>();
    for (const tally of voteTallies) {
      let boothCounts = boothAwardCountsMap.get(tally.boothId);
      if (!boothCounts) {
        boothCounts = {};
        boothAwardCountsMap.set(tally.boothId, boothCounts);
      }
      const awardTitle = awardTitleMap.get(tally.awardId) || 'Unknown Award';
      boothCounts[awardTitle] = tally._count.id;
    }

    const leaderboard = booths
      .map((booth) => ({
        boothId: booth.id,
        code: booth.code,
        projectTitle: booth.projectTitle,
        category: booth.capstoneCategory,
        totalVotes: booth._count.votes,
        awardCounts: boothAwardCountsMap.get(booth.id) || {},
      }))
      .sort((a, b) => b.totalVotes - a.totalVotes);

    const formattedLogs = recentTransactions.map((tx) => ({
      id: tx.id,
      buyerName: tx.buyerName,
      buyerType: tx.buyerType,
      studentNumber: tx.studentNumber,
      program: tx.program,
      yearAndSection: tx.yearAndSection,
      classFormat: formatProgramYearSection(tx.program, tx.yearAndSection),
      affiliation: tx.affiliation,
      quantityBought: tx.quantityBought,
      createdAt: tx.createdAt,
    }));

    return NextResponse.json({
      success: true,
      config: {
        eventName: config?.eventName ?? 'Itechtivity 2027',
        isAwardsLocked: config?.isAwardsLocked ?? false,
        isVotingOpen: config?.isVotingOpen ?? true,
        maxAwards: config?.maxAwards ?? 6,
      },
      counts: {
        totalCards,
        activatedCards,
        totalVotes,
      },
      demographics,
      leaderboard,
      recentRegistrations: formattedLogs,
      awards: awards.map((a) => ({
        id: a.id,
        slotNumber: a.slotNumber,
        title: a.title,
        description: a.description,
        voteCount: a._count.votes,
      })),
    });
  } catch (error) {
    console.error('Admin stats aggregation error:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_ADMIN_STATS' },
      { status: 500 }
    );
  }
}

