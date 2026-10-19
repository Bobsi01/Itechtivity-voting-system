import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';

async function buildDetailedBoothTally(boothId: string) {

  const booth = await prisma.booth.findUnique({
    where: { id: boothId },
    include: {
      votes: {
        include: {
          award: true,
          ticketStub: {
            select: { stubSerial: true, slotNumber: true },
          },
        },
        orderBy: { scannedAt: 'desc' },
      },
    },
  });

  if (!booth) {
    return null;
  }

  const awardTallies: Record<string, { awardTitle: string; slotNumber: number; count: number }> = {};
  for (const vote of booth.votes) {
    if (!awardTallies[vote.awardId]) {
      awardTallies[vote.awardId] = {
        awardTitle: vote.award.title,
        slotNumber: vote.award.slotNumber,
        count: 0,
      };
    }
    awardTallies[vote.awardId].count++;
  }

  return {
    id: booth.id,
    code: booth.code,
    projectTitle: booth.projectTitle,
    capstoneCategory: booth.capstoneCategory,
    tableNumber: booth.tableNumber,
    totalVotes: booth.votes.length,
    awardTallies: Object.values(awardTallies).sort((a, b) => a.slotNumber - b.slotNumber),
    recentScans: booth.votes.map((v) => ({
      stubSerial: v.ticketStub?.stubSerial || 'N/A',
      slotNumber: v.award.slotNumber,
      awardTitle: v.award.title,
      scannedAt: v.scannedAt,
    })),
  };
}

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  // If Exhibitor, scope query strictly to their assigned booth only
  if (session.role === 'EXHIBITOR') {
    if (!session.boothId) {
      return NextResponse.json({ success: false, error: 'NO_BOOTH_ASSIGNED' }, { status: 400 });
    }

    const detailedBooth = await buildDetailedBoothTally(session.boothId);
    if (!detailedBooth) {
      return NextResponse.json({ success: false, error: 'BOOTH_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      scoped: true,
      booth: detailedBooth,
    });
  }

  // SEC-08: Explicit authorization guard. Restrict all-booths telemetry strictly to ADMIN and PRODUCTION.
  if (session.role !== 'ADMIN' && session.role !== 'PRODUCTION') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedBoothId = searchParams.get('boothId');

  // For Admin and Production, return all booths plus the selected/default booth detail for scanner testing
  const booths = await prisma.booth.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: { votes: true },
      },
    },
  });

  const targetBoothId = requestedBoothId || booths[0]?.id;
  const activeBoothDetail = targetBoothId ? await buildDetailedBoothTally(targetBoothId) : null;

  return NextResponse.json({
    success: true,
    scoped: false,
    booth: activeBoothDetail,
    booths: booths.map((b) => ({
      id: b.id,
      code: b.code,
      projectTitle: b.projectTitle,
      capstoneCategory: b.capstoneCategory,
      tableNumber: b.tableNumber,
      totalVotes: b._count.votes,
    })),
  });
}

