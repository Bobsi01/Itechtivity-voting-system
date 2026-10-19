import prisma from '@/lib/db/prisma';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';

interface QAResult {
  testName: string;
  passed: boolean;
  detail: string;
}

const results: QAResult[] = [];

function assert(condition: boolean, testName: string, detail: string) {

  results.push({
    testName,
    passed: condition,
    detail,
  });
  if (!condition) {
    console.error(`FAIL: ${testName} - ${detail}`);
  } else {
    console.log(`PASS: ${testName}`);
  }
}

async function runAuditHistoryQA() {

  console.log('--- Starting Account History & Audit Trail QA Verification ---');

  // Test 1: Human-readable narrative generation
  const bindNarrative = createHumanReadableSummary('REGISTRATION_BIND', {
    actorName: 'Maria Santos',
    actorRole: 'REGISTRATION',
    cardCount: 2,
    buyerName: 'Juan Dela Cruz',
    programSection: 'BSCS 4 A',
    serials: ['B27-B01-0001', 'B27-B01-0002'],
    paymentMethod: 'CASH',
    amount: 100,
  });

  assert(
    bindNarrative.includes('Maria Santos') &&
    bindNarrative.includes('Juan Dela Cruz') &&
    bindNarrative.includes('BSCS 4 A') &&
    bindNarrative.includes('B27-B01-0001') &&
    bindNarrative.includes('₱100'),
    'Registration Bind Narrative Formatting',
    `Generated summary: "${bindNarrative}"`
  );

  const voteNarrative = createHumanReadableSummary('VOTE_CAST', {
    boothCode: 'CSD-01',
    projectTitle: 'Smart Campus IoT',
    stubSerial: 'B27-B01-0001-S1',
    awardTitle: 'Best Innovation Award',
    slotNumber: 1,
  });

  assert(
    voteNarrative.includes('CSD-01') &&
    voteNarrative.includes('Smart Campus IoT') &&
    voteNarrative.includes('B27-B01-0001-S1') &&
    voteNarrative.includes('Best Innovation Award'),
    'Vote Cast Narrative Formatting',
    `Generated summary: "${voteNarrative}"`
  );

  // Test 2: Audit Log DB Insertion with Actor Metadata
  const testAction = `QA_TEST_EVENT_${Date.now()}`;
  await recordAuditLog({
    userId: null,
    actorName: 'System Administrator',
    actorEmail: 'admin@ucc-csd.edu.ph',
    actorRole: 'ADMIN',
    action: testAction,
    resource: 'SYSTEM_CONFIG',
    summary: 'System Administrator performed a QA test event check.',
    details: { environment: 'local', test: true },
    ipAddress: '127.0.0.1',
  });

  const insertedLog = await prisma.auditLog.findFirst({
    where: { action: testAction },
  });

  assert(
    insertedLog !== null &&
    insertedLog.actorRole === 'ADMIN' &&
    insertedLog.actorName === 'System Administrator' &&
    Boolean(insertedLog.summary?.includes('QA test event check')),
    'Audit Log DB Persistence & Summary Field',
    `Found record: ${insertedLog?.id}, summary: "${insertedLog?.summary}"`
  );

  // Clean up test log
  if (insertedLog) {
    await prisma.auditLog.delete({ where: { id: insertedLog.id } });
  }

  // Test 3: Audit Log Filtering & Search Simulation
  const totalAuditLogs = await prisma.auditLog.count();
  assert(
    totalAuditLogs > 0,
    'Audit Logs Populated in Database',
    `Total records count: ${totalAuditLogs}`
  );

  const votingLogs = await prisma.auditLog.findMany({
    where: { resource: 'VOTING' },
    take: 5,
  });
  assert(
    votingLogs.length > 0,
    'Audit Resource Filtering (VOTING)',
    `Found ${votingLogs.length} voting audit logs`
  );

  // Test 4: Registration History Data Integrity
  const regCount = await prisma.registrationTransaction.count();
  assert(
    regCount > 0,
    'Registration History Records Exist',
    `Total registration transactions: ${regCount}`
  );

  const regSample = await prisma.registrationTransaction.findFirst({
    include: { cards: true },
  });
  assert(
    regSample !== null && regSample.cards.length > 0,
    'Registration Transaction has Associated Cards',
    `Transaction ID: ${regSample?.id}, buyer: "${regSample?.buyerName}", cards count: ${regSample?.cards.length}`
  );

  // Test 5: Production Batch History with Card Serial Ranges
  const batchSample = await prisma.pdfBatch.findFirst({
    include: {
      cards: {
        select: { cardSerial: true },
        orderBy: { cardSerial: 'asc' },
      },
    },
  });

  assert(
    batchSample !== null && batchSample.cards.length > 0,
    'Production Batch with Serial Range',
    `Batch #${batchSample?.batchNumber}, first serial: ${batchSample?.cards[0]?.cardSerial}, last: ${batchSample?.cards[batchSample.cards.length - 1]?.cardSerial}`
  );

  // Test 6: Exhibitor Scan History
  const boothSample = await prisma.booth.findFirst({
    include: {
      votes: {
        include: {
          award: true,
          ticketStub: true,
        },
      },
    },
  });

  assert(
    boothSample !== null,
    'Exhibitor Booth Exists',
    `Booth: ${boothSample?.code} - ${boothSample?.projectTitle}, votes count: ${boothSample?.votes.length}`
  );

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nQA Summary: ${passedCount} of ${results.length} tests passed.`);

  if (passedCount < results.length) {
    process.exit(1);
  }
}

runAuditHistoryQA().catch((err) => {
  console.error('Fatal error during QA verification:', err);
  process.exit(1);
});
