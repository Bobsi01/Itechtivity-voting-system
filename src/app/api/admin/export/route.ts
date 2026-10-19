import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';

function escapeCsvField(field: unknown): string {

  if (field === null || field === undefined) {
    return '""';
  }
  const rawStr = String(field);
  const safeStr = /^[=+\-@\t\r]/.test(rawStr) ? `'${rawStr}` : rawStr;
  const escaped = safeStr.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_ADMIN_ACTION' },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(request);
  const rateCheck = rateLimiter.check(`export:${session.userId || clientIp}`, 15, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'RATE_LIMIT_EXCEEDED' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'standings';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await recordAuditLog({
    userId: session.userId,
    actorName: session.fullName,
    actorEmail: session.email,
    actorRole: session.role,
    action: 'ADMIN_EXPORT_CSV',
    resource: 'REPORTS',
    summary: createHumanReadableSummary('ADMIN_EXPORT_CSV', {
      actorName: session.fullName,
      actorRole: session.role,
      details: `${type.toUpperCase()} data export downloaded`,
    }),
    details: { exportType: type, timestamp },
    ipAddress: clientIp,
  });

  if (type === 'standings') {
    const [booths, awards, votes] = await Promise.all([
      prisma.booth.findMany({ orderBy: { code: 'asc' } }),
      prisma.award.findMany({ orderBy: { slotNumber: 'asc' } }),
      prisma.vote.findMany({
        select: {
          boothId: true,
          awardId: true,
        },
      }),
    ]);

    // Map votes by boothId and awardId
    const boothVoteCounts = new Map<string, { total: number; awards: Map<string, number> }>();
    for (const b of booths) {
      boothVoteCounts.set(b.id, { total: 0, awards: new Map() });
    }

    for (const v of votes) {
      const bData = boothVoteCounts.get(v.boothId);
      if (bData) {
        bData.total += 1;
        const currentCount = bData.awards.get(v.awardId) || 0;
        bData.awards.set(v.awardId, currentCount + 1);
      }
    }

    const awardHeaders = awards.map((a) => `Slot ${a.slotNumber} (${a.title})`);
    const headerRow = [
      'Rank',
      'Booth Code',
      'Project Title',
      'Category',
      'Table Number',
      'Team Members',
      'Total Votes',
      ...awardHeaders,
    ];

    const sortedBooths = [...booths].sort((a, b) => {
      const totalA = boothVoteCounts.get(a.id)?.total || 0;
      const totalB = boothVoteCounts.get(b.id)?.total || 0;
      return totalB - totalA;
    });

    const rows = sortedBooths.map((booth, idx) => {
      const bData = boothVoteCounts.get(booth.id);
      const total = bData?.total || 0;
      const awardCols = awards.map((a) => bData?.awards.get(a.id) || 0);

      return [
        idx + 1,
        booth.code,
        booth.projectTitle,
        booth.capstoneCategory,
        booth.tableNumber || '',
        booth.teamMembers || '',
        total,
        ...awardCols,
      ]
        .map(escapeCsvField)
        .join(',');
    });

    const csvContent = [headerRow.map(escapeCsvField).join(','), ...rows].join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="itechtivity-2027-official-standings-${timestamp}.csv"`,
      },
    });
  }

  if (type === 'votes') {
    const votes = await prisma.vote.findMany({
      orderBy: { scannedAt: 'asc' },
      include: {
        booth: { select: { code: true, projectTitle: true } },
        award: { select: { slotNumber: true, title: true } },
        ticketStub: {
          select: {
            stubSerial: true,
            bingoCard: { select: { cardSerial: true } },
          },
        },
        scannedByUser: { select: { fullName: true, email: true } },
      },
    });

    const headerRow = [
      'Vote ID',
      'Timestamp (UTC)',
      'Stub Serial',
      'Card Serial',
      'Booth Code',
      'Project Title',
      'Award Slot',
      'Award Title',
      'Scanned By User',
    ];

    const rows = votes.map((v) =>
      [
        v.id,
        v.scannedAt.toISOString(),
        v.ticketStub.stubSerial,
        v.ticketStub.bingoCard.cardSerial,
        v.booth.code,
        v.booth.projectTitle,
        v.award.slotNumber,
        v.award.title,
        v.scannedByUser.fullName,
      ]
        .map(escapeCsvField)
        .join(',')
    );

    const csvContent = [headerRow.map(escapeCsvField).join(','), ...rows].join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="itechtivity-2027-vote-audit-trail-${timestamp}.csv"`,
      },
    });
  }

  if (type === 'registrations') {
    const transactions = await prisma.registrationTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        processedByUser: { select: { fullName: true } },
        cards: { select: { cardSerial: true } },
      },
    });

    const headerRow = [
      'Transaction ID',
      'Timestamp (UTC)',
      'Buyer Type',
      'Buyer Name',
      'Student Number',
      'Program',
      'Year & Section',
      'Affiliation',
      'Contact Info',
      'Quantity Bought',
      'Bound Card Serials',
      'Processed By Desk Officer',
    ];

    const rows = transactions.map((t) =>
      [
        t.id,
        t.createdAt.toISOString(),
        t.buyerType,
        t.buyerName,
        t.studentNumber || '',
        t.program || '',
        t.yearAndSection || '',
        t.affiliation || '',
        t.contactInfo || '',
        t.quantityBought,
        t.cards.map((c) => c.cardSerial).join('; '),
        t.processedByUser.fullName,
      ]
        .map(escapeCsvField)
        .join(',')
    );

    const csvContent = [headerRow.map(escapeCsvField).join(','), ...rows].join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="itechtivity-2027-registration-demographics-${timestamp}.csv"`,
      },
    });
  }

  return NextResponse.json(
    { success: false, error: 'INVALID_EXPORT_TYPE' },
    { status: 400 }
  );
}
