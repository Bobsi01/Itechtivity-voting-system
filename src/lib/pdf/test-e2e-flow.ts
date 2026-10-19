import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/db/prisma';
import { generateCardBatch } from './local-generator';
import { encodeStubPayload, verifyStubPayload } from '@/lib/crypto/stub-tokens';
import { BuyerType, CardStatus, StubStatus } from '@prisma/client';

async function runEndToEndVerification() {
  console.log('--- Starting Itechtivity 2027 Full E2E Verification ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const secretKey = process.env.EVENT_HMAC_SECRET;
  if (!secretKey || secretKey.length < 32) {
    throw new Error('EVENT_HMAC_SECRET must be set and >= 32 characters for tests.');
  }

  // --- Step 1: Batch PDF Generation (20 Cards = 5 A4 Sheets) ---
  console.log('\nStep 1: Generating 20 Cards (5 A4 sheets)...');
  const batchResult = await generateCardBatch({ totalCards: 20 });

  assert(batchResult.totalCards === 20, 'Batch reports 20 total cards');
  assert(batchResult.totalSheets === 5, 'Batch reports exactly 5 A4 sheets (4 cards/sheet)');

  const generatedFilePath = path.join(process.cwd(), 'storage', 'private-pdfs', batchResult.fileName);
  assert(fs.existsSync(generatedFilePath), `Generated PDF exists on disk: ${batchResult.fileName}`);

  const fileSize = fs.statSync(generatedFilePath).size;
  assert(fileSize > 10000, `Generated PDF has valid binary content (${(fileSize / 1024).toFixed(1)} KB)`);

  // Verify PostgreSQL records
  const dbBatch = await prisma.pdfBatch.findUnique({
    where: { id: batchResult.batchId },
    include: { cards: { include: { stubs: true } } },
  });

  assert(dbBatch !== null, 'PdfBatch recorded in PostgreSQL');
  assert(dbBatch?.cards.length === 20, '20 BingoCard records created in PostgreSQL');
  assert(dbBatch?.cards[0].stubs.length === 6, 'Each BingoCard has exactly 6 TicketStub records');
  assert(dbBatch?.cards[0].status === CardStatus.GENERATED, 'Card initial status is GENERATED');
  assert(dbBatch?.cards[0].stubs[0].status === StubStatus.INACTIVE, 'Stub initial status is INACTIVE');

  // --- Step 2: Registration Desk Binding (2 Cards) ---
  console.log('\nStep 2: Testing Registration Desk Card Binding...');
  const card1 = dbBatch!.cards[0];
  const card2 = dbBatch!.cards[1];

  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(adminUser !== null, 'Admin user available for processing');

  const regTx = await prisma.registrationTransaction.create({
    data: {
      processedByUserId: adminUser!.id,
      buyerType: BuyerType.CSD_STUDENT,
      buyerName: 'Maria Santos',
      studentNumber: '2023-0888-CS',
      program: 'BSCS',
      yearAndSection: '4A',
      quantityBought: 2,
    },
  });

  const now = new Date();
  await prisma.bingoCard.updateMany({
    where: { id: { in: [card1.id, card2.id] } },
    data: {
      status: CardStatus.ACTIVATED,
      transactionId: regTx.id,
      activatedAt: now,
    },
  });

  await prisma.ticketStub.updateMany({
    where: { bingoCardId: { in: [card1.id, card2.id] } },
    data: { status: StubStatus.ACTIVATED },
  });

  const activeCard1 = await prisma.bingoCard.findUnique({
    where: { id: card1.id },
    include: { stubs: true },
  });

  assert(activeCard1?.status === CardStatus.ACTIVATED, 'Card 1 successfully transitioned to ACTIVATED');
  assert(activeCard1?.stubs[0].status === StubStatus.ACTIVATED, 'Card 1 stubs transitioned to ACTIVATED');

  // --- Step 3: Exhibitor Booth Vote (Card 1, Stub 1) ---
  console.log('\nStep 3: Testing Exhibitor Single-Redemption Scan...');
  const targetStub = activeCard1!.stubs[0]; // Slot 1 stub
  const booth1 = await prisma.booth.findFirst({ where: { code: 'CS-01' } });
  assert(booth1 !== null, 'Booth CS-01 exists');

  // Generate payload matching physical printed QR
  const stubQrPayload = encodeStubPayload(targetStub.stubSerial, targetStub.slotNumber, secretKey);
  const cryptoVerify = verifyStubPayload(stubQrPayload, secretKey);
  assert(cryptoVerify.isValid === true, 'Stub QR payload verified with HMAC secret');

  // Execute atomic conditional update
  const updatedStub = await prisma.$queryRaw<Array<{ id: string; awardId: string | null; slotNumber: number }>>`
    UPDATE "TicketStub"
    SET "status" = 'REDEEMED', "updatedAt" = NOW()
    WHERE "stubSerial" = ${targetStub.stubSerial}
      AND "status" = 'ACTIVATED'
    RETURNING "id", "awardId", "slotNumber";
  `;

  assert(updatedStub.length === 1, 'Atomic conditional update successfully redeemed stub');

  const award = await prisma.award.findUnique({ where: { slotNumber: targetStub.slotNumber } });
  assert(award !== null, 'Award slot definition resolved');

  const voteRecord = await prisma.vote.create({
    data: {
      ticketStubId: targetStub.id,
      boothId: booth1!.id,
      awardId: award!.id,
      scannedByUserId: adminUser!.id,
    },
  });

  assert(voteRecord.id !== undefined, 'Vote inserted with hardware UNIQUE(ticketStubId) guard');

  // --- Step 4: Anti-Double-Spend & Concurrency Defense ---
  console.log('\nStep 4: Testing Anti-Double-Spend & Duplicate Scan Rejection...');
  const duplicateAttempt = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "TicketStub"
    SET "status" = 'REDEEMED', "updatedAt" = NOW()
    WHERE "stubSerial" = ${targetStub.stubSerial}
      AND "status" = 'ACTIVATED'
    RETURNING "id";
  `;

  assert(duplicateAttempt.length === 0, 'Duplicate scan rejected: 0 rows returned by conditional update');

  // Check unique constraint violation if direct insert is attempted
  let threwUniqueError = false;
  try {
    await prisma.vote.create({
      data: {
        ticketStubId: targetStub.id,
        boothId: booth1!.id,
        awardId: award!.id,
        scannedByUserId: adminUser!.id,
      },
    });
  } catch (err) {
    threwUniqueError = true;
  }
  assert(threwUniqueError === true, 'Database unique constraint prevents duplicate vote record');

  // --- Step 5: Unactivated Card Rejection ---
  console.log('\nStep 5: Testing Unactivated Card Rejection...');
  const unactivatedStub = dbBatch!.cards[10].stubs[0]; // Card 11 was never activated
  const unactivatedAttempt = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "TicketStub"
    SET "status" = 'REDEEMED', "updatedAt" = NOW()
    WHERE "stubSerial" = ${unactivatedStub.stubSerial}
      AND "status" = 'ACTIVATED'
    RETURNING "id";
  `;

  assert(unactivatedAttempt.length === 0, 'Unactivated stub is rejected immediately');

  // --- Step 6: Booth Tally Aggregation ---
  console.log('\nStep 6: Testing Booth Tally Aggregation...');
  const boothVotesCount = await prisma.vote.count({ where: { boothId: booth1!.id } });
  assert(boothVotesCount >= 1, `Booth CS-01 tally correctly reflects vote (${boothVotesCount})`);

  console.log(`\n======================================================`);
  console.log(`All E2E Verification Tests Completed: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndVerification()
  .catch((e) => {
    console.error('E2E Verification threw exception:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
