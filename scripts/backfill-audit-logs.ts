import prisma from '@/lib/db/prisma';
import { createHumanReadableSummary } from '@/lib/audit/log';

async function backfillAuditLogs() {

  console.log('--- Starting Audit Logs Backfill & Synthesis ---');

  // 1. Backfill Registration Transactions
  const transactions = await prisma.registrationTransaction.findMany({
    include: {
      processedByUser: true,
      cards: { select: { cardSerial: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${transactions.length} registration transactions...`);
  let regCount = 0;

  for (const tx of transactions) {
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        action: 'REGISTRATION_BIND',
        details: { contains: tx.id },
      },
    });

    if (!existingLog) {
      const serials = tx.cards.map((c) => c.cardSerial);
      const summary = createHumanReadableSummary('REGISTRATION_BIND', {
        actorName: tx.processedByUser.fullName,
        actorRole: tx.processedByUser.role,
        buyerName: tx.buyerName,
        studentNumber: tx.studentNumber,
        programSection: [tx.program, tx.yearAndSection].filter(Boolean).join(' ') || null,
        cardCount: tx.quantityBought,
        serials,
        paymentMethod: 'CASH',
        amount: tx.quantityBought * 50,
      });

      await prisma.auditLog.create({
        data: {
          userId: tx.processedByUserId,
          actorName: tx.processedByUser.fullName,
          actorEmail: tx.processedByUser.email,
          actorRole: tx.processedByUser.role,
          action: 'REGISTRATION_BIND',
          resource: 'REGISTRATION',
          summary,
          details: JSON.stringify({
            transactionId: tx.id,
            buyerType: tx.buyerType,
            buyerName: tx.buyerName,
            studentNumber: tx.studentNumber,
            program: tx.program,
            yearAndSection: tx.yearAndSection,
            affiliation: tx.affiliation,
            quantity: tx.quantityBought,
            serials,
            paymentMethod: 'CASH',
            amountPaid: tx.quantityBought * 50,
          }),
          ipAddress: '127.0.0.1',
          createdAt: tx.createdAt,
        },
      });
      regCount += 1;
    }
  }
  console.log(`Created ${regCount} registration audit log entries.`);

  // 2. Backfill Votes
  const votes = await prisma.vote.findMany({
    include: {
      booth: true,
      award: true,
      ticketStub: true,
      scannedByUser: true,
    },
    orderBy: { scannedAt: 'asc' },
  });

  console.log(`Found ${votes.length} votes...`);
  let voteCount = 0;

  for (const v of votes) {
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        action: 'VOTE_CAST',
        details: { contains: v.id },
      },
    });

    if (!existingLog) {
      const summary = createHumanReadableSummary('VOTE_CAST', {
        boothCode: v.booth.code,
        projectTitle: v.booth.projectTitle,
        stubSerial: v.ticketStub.stubSerial,
        awardTitle: v.award.title,
        slotNumber: v.award.slotNumber,
      });

      await prisma.auditLog.create({
        data: {
          userId: v.scannedByUserId,
          actorName: v.scannedByUser?.fullName || `${v.booth.code} Staff`,
          actorEmail: v.scannedByUser?.email || `booth.${v.booth.code.toLowerCase()}@itech2027.edu`,
          actorRole: 'EXHIBITOR',
          action: 'VOTE_CAST',
          resource: 'VOTING',
          summary,
          details: JSON.stringify({
            voteId: v.id,
            ticketStubId: v.ticketStubId,
            stubSerial: v.ticketStub.stubSerial,
            boothId: v.boothId,
            boothCode: v.booth.code,
            awardId: v.awardId,
            awardTitle: v.award.title,
            slotNumber: v.award.slotNumber,
          }),
          ipAddress: '127.0.0.1',
          createdAt: v.scannedAt,
        },
      });
      voteCount += 1;
    }
  }
  console.log(`Created ${voteCount} vote audit log entries.`);

  // 3. Backfill PDF Batches
  const batches = await prisma.pdfBatch.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${batches.length} PDF batches...`);
  let batchCount = 0;

  for (const b of batches) {
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        action: 'PRODUCTION_GENERATE_BATCH',
        details: { contains: b.id },
      },
    });

    if (!existingLog) {
      const summary = createHumanReadableSummary('PRODUCTION_GENERATE_BATCH', {
        actorName: 'Production Team',
        actorRole: 'PRODUCTION',
        batchNumber: b.batchNumber,
        totalCards: b.totalCards,
        totalSheets: b.totalSheets,
      });

      await prisma.auditLog.create({
        data: {
          actorName: 'Production Staff',
          actorEmail: 'prod@itech2027.edu',
          actorRole: 'PRODUCTION',
          action: 'PRODUCTION_GENERATE_BATCH',
          resource: 'PRODUCTION',
          summary,
          details: JSON.stringify({
            batchId: b.id,
            batchNumber: b.batchNumber,
            totalCards: b.totalCards,
            totalSheets: b.totalSheets,
            fileName: b.fileName,
          }),
          ipAddress: '127.0.0.1',
          createdAt: b.createdAt,
        },
      });
      batchCount += 1;
    }
  }
  console.log(`Created ${batchCount} production batch audit log entries.`);

  console.log('--- Audit Logs Backfill Completed Successfully ---');
}

backfillAuditLogs()
  .catch((err) => {
    console.error('Audit log backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
