import assert from 'node:assert';
import prisma from '../../lib/db/prisma';
import { CardStatus, StubStatus } from '@prisma/client';

async function runCardsAdminVerification() {

  console.log('--- Starting Cards Admin Batch Activation & Inspection Verification ---');

  // 1. Find or verify an admin user
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });
  assert(adminUser, 'Admin user must exist in database');
  console.log('[PASS] Admin user identified:', adminUser.email);

  // 2. Find a generated card batch or create a temporary one for testing
  let batch = await prisma.pdfBatch.findFirst({
    where: {
      cards: {
        some: { status: CardStatus.GENERATED },
      },
    },
    include: {
      cards: {
        where: { status: CardStatus.GENERATED },
        take: 3,
      },
    },
  });

  if (!batch || batch.cards.length === 0) {
    console.log('No unactivated cards found in existing batches, creating test batch...');
    const awards = await prisma.award.findMany({ take: 6 });
    const newBatch = await prisma.pdfBatch.create({
      data: {
        batchNumber: 999,
        fileName: 'test-batch-999.pdf',
        totalCards: 3,
        totalSheets: 1,
        status: 'COMPLETED',
      },
    });

    for (let i = 1; i <= 3; i++) {
      const cardSerial = `B27-B99-000${i}`;
      const card = await prisma.bingoCard.create({
        data: {
          cardSerial,
          masterQrHash: `MASTER:${cardSerial}`,
          pdfBatchId: newBatch.id,
          status: CardStatus.GENERATED,
        },
      });

      for (const award of awards) {
        await prisma.ticketStub.create({
          data: {
            bingoCardId: card.id,
            slotNumber: award.slotNumber,
            awardId: award.id,
            stubSerial: `${cardSerial}-S${award.slotNumber}`,
            signatureHash: 'test-signature-hash',
            status: StubStatus.INACTIVE,
          },
        });
      }
    }

    batch = await prisma.pdfBatch.findUnique({
      where: { id: newBatch.id },
      include: {
        cards: {
          where: { status: CardStatus.GENERATED },
          take: 3,
        },
      },
    });
  }

  assert(batch && batch.cards.length > 0, 'Batch with unactivated cards must be available');
  const targetCards = batch.cards.slice(0, 2);
  const targetSerials = targetCards.map((c) => c.cardSerial);
  console.log(`[PASS] Selected ${targetSerials.length} unactivated cards for batch activation:`, targetSerials);

  // 3. Perform batch activation transaction mimicking POST /api/admin/cards/batch
  const transaction = await prisma.registrationTransaction.create({
    data: {
      processedByUserId: adminUser.id,
      buyerType: 'CSD_STUDENT',
      buyerName: 'Senior Capstone Bulk Delegation',
      studentNumber: '2023-CS-9999',
      program: 'BSCS',
      yearAndSection: '4A',
      affiliation: 'College of Computer Studies',
      contactInfo: 'delegation@ucc.edu.ph',
      quantityBought: targetCards.length,
    },
  });

  const cardIds = targetCards.map((c) => c.id);
  const now = new Date();

  await prisma.bingoCard.updateMany({
    where: { id: { in: cardIds }, status: CardStatus.GENERATED },
    data: {
      status: CardStatus.ACTIVATED,
      transactionId: transaction.id,
      activatedAt: now,
    },
  });

  await prisma.ticketStub.updateMany({
    where: { bingoCardId: { in: cardIds }, status: StubStatus.INACTIVE },
    data: { status: StubStatus.ACTIVATED },
  });

  console.log('[PASS] Batch activation committed successfully.');

  // 4. Test Card Inspection on the first activated card mimicking GET /api/admin/cards?serial=...
  const inspectedSerial = targetSerials[0];
  const inspected = await prisma.bingoCard.findFirst({
    where: { cardSerial: inspectedSerial },
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
          contactInfo: true,
          createdAt: true,
          processedByUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
      },
      pdfBatch: {
        select: {
          batchNumber: true,
          fileName: true,
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
                  capstoneCategory: true,
                  tableNumber: true,
                },
              },
              scannedByUser: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  assert(inspected, 'Inspected card must exist');
  assert(inspected.status === CardStatus.ACTIVATED, 'Card status must be ACTIVATED');
  console.log('[PASS] Card status verified:', inspected.status);

  // 4a. Verify Who Bought
  assert(inspected.transaction, 'Transaction must be present');
  assert.strictEqual(inspected.transaction.buyerName, 'Senior Capstone Bulk Delegation');
  assert.strictEqual(inspected.transaction.buyerType, 'CSD_STUDENT');
  assert.strictEqual(inspected.transaction.studentNumber, '2023-CS-9999');
  assert.strictEqual(inspected.transaction.program, 'BSCS');
  assert.strictEqual(inspected.transaction.yearAndSection, '4A');
  console.log('[PASS] Who Bought verified:', {
    name: inspected.transaction.buyerName,
    type: inspected.transaction.buyerType,
    program: inspected.transaction.program,
    section: inspected.transaction.yearAndSection,
  });

  // 4b. Verify Who Sold
  assert(inspected.transaction.processedByUser, 'ProcessedByUser (seller) must be present');
  assert.strictEqual(inspected.transaction.processedByUser.id, adminUser.id);
  assert.strictEqual(inspected.transaction.processedByUser.role, 'ADMIN');
  console.log('[PASS] Who Sold verified:', {
    seller: inspected.transaction.processedByUser.fullName,
    role: inspected.transaction.processedByUser.role,
    email: inspected.transaction.processedByUser.email,
  });

  // 4c. Verify Which is Voted (simulate 1 vote redemption)
  const firstStub = inspected.stubs[0];
  const booth = await prisma.booth.findFirst();
  assert(booth, 'Booth must exist');

  await prisma.ticketStub.update({
    where: { id: firstStub.id },
    data: { status: StubStatus.REDEEMED },
  });

  await prisma.vote.create({
    data: {
      ticketStubId: firstStub.id,
      boothId: booth.id,
      awardId: firstStub.awardId!,
      scannedByUserId: adminUser.id,
    },
  });

  // Re-inspect to verify vote resolution
  const reInspected = await prisma.bingoCard.findFirst({
    where: { cardSerial: inspectedSerial },
    include: {
      stubs: {
        orderBy: { slotNumber: 'asc' },
        include: {
          award: true,
          vote: {
            include: {
              booth: true,
              scannedByUser: true,
            },
          },
        },
      },
    },
  });

  assert(reInspected, 'Re-inspected card must exist');
  const votedStub = reInspected.stubs.find((s) => s.id === firstStub.id);
  assert(votedStub, 'Voted stub must exist');
  assert.strictEqual(votedStub.status, StubStatus.REDEEMED);
  assert(votedStub.vote, 'Vote record must be linked to redeemed stub');
  assert.strictEqual(votedStub.vote.booth.code, booth.code);
  assert.strictEqual(votedStub.vote.scannedByUser.id, adminUser.id);
  console.log('[PASS] Which is Voted verified: Stub Slot', votedStub.slotNumber, 'voted for Booth', votedStub.vote.booth.code, `(${votedStub.vote.booth.projectTitle})`);

  const unvotedStub = reInspected.stubs.find((s) => s.id !== firstStub.id);
  assert(unvotedStub, 'Unvoted stub must exist');
  assert.strictEqual(unvotedStub.status, StubStatus.ACTIVATED);
  assert.strictEqual(unvotedStub.vote, null);
  console.log('[PASS] Unvoted Stub verified: Stub Slot', unvotedStub.slotNumber, 'remains ACTIVATED (not voted yet).');

  console.log('--- All Cards Admin Batch Activation & Inspection tests PASSED! ---');
}

runCardsAdminVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
