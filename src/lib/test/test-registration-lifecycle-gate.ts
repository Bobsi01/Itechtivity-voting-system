import 'dotenv/config';
import assert from 'node:assert';
import prisma from '@/lib/db/prisma';
import { signSession } from '@/lib/auth/session';
import { encodeStubPayload, getVerifiedHmacSecret } from '@/lib/crypto/stub-tokens';
import { CardStatus, StubStatus, type Role } from '@prisma/client';
import { POST as postAdminConfig } from '@/app/api/admin/config/route';
import { POST as postRegistrationBind } from '@/app/api/registration/bind/route';
import { POST as postVote } from '@/app/api/vote/route';
import { POST as postBatchCards } from '@/app/api/admin/cards/batch/route';

interface MockUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  boothId: string | null;
}

interface StandardErrorResponse {
  success: boolean;
  error: string;
  message?: string;
}

interface ConfigSuccessResponse {
  success: boolean;
  config: {
    id: string;
    isRegistrationOpen: boolean;
    isVotingOpen: boolean;
    isAwardsLocked: boolean;
  };
}

interface BindSuccessResponse {
  success: boolean;
  message: string;
  transactionId: string;
  cardsActivatedCount: number;
  stubsActivatedCount: number;
}

interface VoteSuccessResponse {
  success: boolean;
  message: string;
  voteId: string;
  stubSerial: string;
  awardTitle: string;
  slotNumber: number;
  boothCode: string;
  totalVotesForAward: number;
}

// Intercept cookies from next/headers to supply tamper-proof signed session tokens during automated tests
let currentSessionToken: string | null = null;
const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({
  get: (name: string) =>
    name === 'itech2027_session' && currentSessionToken
      ? { value: currentSessionToken }
      : undefined,
  set: () => {},
  delete: () => {},
});

function setMockSession(user: MockUser): void {

  currentSessionToken = signSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    boothId: user.boothId,
  });
}

async function runRegistrationLifecycleGateVerification(): Promise<void> {

  console.log('=== Starting Registration Lifecycle Gate & Exclusive POS Activation E2E Test Suite ===\n');

  const secretKey = getVerifiedHmacSecret();
  const runId = Math.floor(1000 + Math.random() * 8000).toString();
  const card1Serial = `B27-T01-${runId}`;
  const card2Serial = `B27-T02-${runId}`;

  // 1. Resolve seed actors: Administrator, Registration Officer, and Exhibitor Booth
  const adminRecord = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(adminRecord, 'Prerequisite failed: Admin user must exist in the database');
  const adminUser: MockUser = {
    id: adminRecord.id,
    email: adminRecord.email,
    fullName: adminRecord.fullName,
    role: adminRecord.role,
    boothId: adminRecord.boothId,
  };

  const regRecord = await prisma.user.findFirst({ where: { role: 'REGISTRATION' } });
  const regUser: MockUser = regRecord
    ? {
        id: regRecord.id,
        email: regRecord.email,
        fullName: regRecord.fullName,
        role: regRecord.role,
        boothId: regRecord.boothId,
      }
    : adminUser;

  const boothRecord = await prisma.booth.findFirst({ where: { code: 'CS-01' } });
  assert(boothRecord, 'Prerequisite failed: Booth CS-01 must exist in the database');

  const exhibitorRecord = await prisma.user.findFirst({
    where: { boothId: boothRecord.id, role: 'EXHIBITOR' },
  });
  const exhibitorUser: MockUser = exhibitorRecord
    ? {
        id: exhibitorRecord.id,
        email: exhibitorRecord.email,
        fullName: exhibitorRecord.fullName,
        role: exhibitorRecord.role,
        boothId: exhibitorRecord.boothId,
      }
    : {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        role: 'ADMIN',
        boothId: boothRecord.id,
      };

  // 2. Capture initial EventConfig to safely restore during teardown, and record test start time
  const initialConfig = await prisma.eventConfig.findFirst();
  assert(initialConfig, 'Prerequisite failed: EventConfig record must exist in PostgreSQL');
  const initialRegistrationOpen = initialConfig.isRegistrationOpen;
  const testStartTime = new Date();

  // Guarantee baseline starts with isRegistrationOpen: true so Vector 1 is a genuine state transition
  if (!initialConfig.isRegistrationOpen) {
    await prisma.eventConfig.update({
      where: { id: initialConfig.id },
      data: { isRegistrationOpen: true },
    });
  }

  // 3. Create isolated test PDF batch with 2 cards and 12 inactive stubs
  const awards = await prisma.award.findMany({
    where: { isActive: true },
    orderBy: { slotNumber: 'asc' },
    take: 6,
  });
  assert(awards.length === 6, 'Prerequisite failed: Exactly 6 active awards must be configured');

  const testBatch = await prisma.pdfBatch.create({
    data: {
      batchNumber: 8880 + Number(runId) % 100,
      fileName: `test-gate-batch-${runId}.pdf`,
      totalCards: 2,
      totalSheets: 1,
      status: 'COMPLETED',
    },
  });

  const card1 = await prisma.bingoCard.create({
    data: {
      cardSerial: card1Serial,
      masterQrHash: `MASTER:${card1Serial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.GENERATED,
    },
  });

  const card2 = await prisma.bingoCard.create({
    data: {
      cardSerial: card2Serial,
      masterQrHash: `MASTER:${card2Serial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.GENERATED,
    },
  });

  for (const award of awards) {
    await prisma.ticketStub.create({
      data: {
        bingoCardId: card1.id,
        slotNumber: award.slotNumber,
        awardId: award.id,
        stubSerial: `${card1Serial}-S${award.slotNumber}`,
        signatureHash: 'test-hash-sig',
        status: StubStatus.INACTIVE,
      },
    });

    await prisma.ticketStub.create({
      data: {
        bingoCardId: card2.id,
        slotNumber: award.slotNumber,
        awardId: award.id,
        stubSerial: `${card2Serial}-S${award.slotNumber}`,
        signatureHash: 'test-hash-sig',
        status: StubStatus.INACTIVE,
      },
    });
  }

  console.log(`[SETUP] Initialized test batch ${testBatch.id} with Cards [${card1Serial}, ${card2Serial}] in GENERATED status.\n`);

  try {
    // -----------------------------------------------------------------------------------
    // Vector 1: Admin config toggles isRegistrationOpen: false via POST /api/admin/config
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 1: Admin config toggles isRegistrationOpen: false via POST /api/admin/config ---');
    setMockSession(adminUser);

    const pauseReq = new Request('http://localhost/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRegistrationOpen: false }),
    });

    const pauseRes = await postAdminConfig(pauseReq);
    assert.strictEqual(pauseRes.status, 200, 'Vector 1: Expected HTTP 200 from POST /api/admin/config');
    const pauseBody = (await pauseRes.json()) as ConfigSuccessResponse;
    assert.strictEqual(pauseBody.success, true, 'Vector 1: Response success must be true');
    assert.strictEqual(pauseBody.config.isRegistrationOpen, false, 'Vector 1: config.isRegistrationOpen must be false');
    console.log('[PASS] Vector 1: Successfully paused registration via Admin API with HTTP 200.\n');

    // -----------------------------------------------------------------------------------
    // Vector 2: Direct database persistence in Supabase PostgreSQL EventConfig table
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 2: Direct database persistence in EventConfig table ---');
    const dbConfigPaused = await prisma.eventConfig.findFirst();
    assert(dbConfigPaused, 'Vector 2: EventConfig must be present in database');
    assert.strictEqual(dbConfigPaused.isRegistrationOpen, false, 'Vector 2: PostgreSQL column isRegistrationOpen must be false');
    console.log('[PASS] Vector 2: Direct database query verified isRegistrationOpen === false in EventConfig.\n');

    // -----------------------------------------------------------------------------------
    // Vector 3: Audit log creation with action ADMIN_PAUSE_REGISTRATION
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 3: Audit log creation for ADMIN_PAUSE_REGISTRATION ---');
    const pauseAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_PAUSE_REGISTRATION',
        resource: 'SYSTEM_CONFIG',
        createdAt: { gte: testStartTime },
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(pauseAudit, 'Vector 3: AuditLog row with action ADMIN_PAUSE_REGISTRATION must exist');
    assert.strictEqual(pauseAudit.actorRole, 'ADMIN', 'Vector 3: AuditLog actorRole must be ADMIN');
    console.log(`[PASS] Vector 3: Audit log entry verified: "${pauseAudit.summary}".\n`);

    // -----------------------------------------------------------------------------------
    // Vector 4: Defensive POS Gating with isRegistrationOpen: false
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 4: Defensive POS Gating (Closed Desk Rejection) ---');
    setMockSession(regUser);

    const bindGatedReq = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-gate-pause-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Gated Test Purchaser',
        studentNumber: '2023-CS-0001',
        program: 'BSCS',
        yearAndSection: '3A',
        cardSerials: [card1Serial],
      }),
    });

    const bindGatedRes = await postRegistrationBind(bindGatedReq);
    assert.strictEqual(bindGatedRes.status, 403, 'Vector 4: Expected HTTP 403 Forbidden when registration is closed');
    const bindGatedBody = (await bindGatedRes.json()) as StandardErrorResponse;
    assert.strictEqual(bindGatedBody.success, false, 'Vector 4: Response success must be false');
    assert.strictEqual(bindGatedBody.error, 'REGISTRATION_CLOSED', 'Vector 4: Error code must be REGISTRATION_CLOSED');

    // Verify card and stubs remain strictly unmodified in PostgreSQL
    const card1AfterGate = await prisma.bingoCard.findUnique({
      where: { cardSerial: card1Serial },
      include: { stubs: true },
    });
    assert(card1AfterGate, 'Vector 4: Card 1 must exist');
    assert.strictEqual(card1AfterGate.status, CardStatus.GENERATED, 'Vector 4: Card 1 status must remain GENERATED');
    assert(
      card1AfterGate.stubs.every((s) => s.status === StubStatus.INACTIVE),
      'Vector 4: All 6 stubs of Card 1 must remain INACTIVE'
    );

    const abortedTxCount = await prisma.registrationTransaction.count({
      where: { buyerName: 'Gated Test Purchaser' },
    });
    assert.strictEqual(abortedTxCount, 0, 'Vector 4: Zero registration transactions must be created');
    console.log('[PASS] Vector 4: POS rejected bind request with HTTP 403 REGISTRATION_CLOSED; cards and stubs untouched.\n');

    // -----------------------------------------------------------------------------------
    // Vector 5: Admin config toggles isRegistrationOpen: true via POST /api/admin/config
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 5: Admin config toggles isRegistrationOpen: true via POST /api/admin/config ---');
    setMockSession(adminUser);

    const openReq = new Request('http://localhost/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRegistrationOpen: true }),
    });

    const openRes = await postAdminConfig(openReq);
    assert.strictEqual(openRes.status, 200, 'Vector 5: Expected HTTP 200 from POST /api/admin/config');
    const openBody = (await openRes.json()) as ConfigSuccessResponse;
    assert.strictEqual(openBody.success, true, 'Vector 5: Response success must be true');
    assert.strictEqual(openBody.config.isRegistrationOpen, true, 'Vector 5: config.isRegistrationOpen must be true');

    const dbConfigReopened = await prisma.eventConfig.findFirst();
    assert(dbConfigReopened, 'Vector 5: EventConfig must be present in database');
    assert.strictEqual(dbConfigReopened.isRegistrationOpen, true, 'Vector 5: PostgreSQL column isRegistrationOpen must be true');

    const openAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_OPEN_REGISTRATION',
        resource: 'SYSTEM_CONFIG',
        createdAt: { gte: testStartTime },
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(openAudit, 'Vector 5: AuditLog row with action ADMIN_OPEN_REGISTRATION must exist');
    assert.strictEqual(openAudit.actorRole, 'ADMIN', 'Vector 5: AuditLog actorRole must be ADMIN');
    console.log('[PASS] Vector 5: Admin re-opened registration, verified DB persistence and ADMIN_OPEN_REGISTRATION audit.\n');

    // -----------------------------------------------------------------------------------
    // Vector 6: Exclusive POS Activation via POST /api/registration/bind
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 6: Exclusive POS Activation (Open Desk Binding) ---');
    setMockSession(regUser);

    const bindOpenReq = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-gate-open-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Legitimate Registered Purchaser',
        studentNumber: '2023-CS-0002',
        program: 'BSCS',
        yearAndSection: '4A',
        cardSerials: [card1Serial],
      }),
    });

    const bindOpenRes = await postRegistrationBind(bindOpenReq);
    assert.strictEqual(bindOpenRes.status, 200, 'Vector 6: Expected HTTP 200 on valid registration bind');
    const bindOpenBody = (await bindOpenRes.json()) as BindSuccessResponse;
    assert.strictEqual(bindOpenBody.success, true, 'Vector 6: Response success must be true');
    assert.strictEqual(bindOpenBody.cardsActivatedCount, 1, 'Vector 6: Exactly 1 card activated');
    assert.strictEqual(bindOpenBody.stubsActivatedCount, 6, 'Vector 6: Exactly 6 stubs activated');

    const card1Activated = await prisma.bingoCard.findUnique({
      where: { cardSerial: card1Serial },
      include: { stubs: true, transaction: true },
    });
    assert(card1Activated, 'Vector 6: Card 1 must exist');
    assert.strictEqual(card1Activated.status, CardStatus.ACTIVATED, 'Vector 6: Card 1 status must be ACTIVATED');
    assert.strictEqual(card1Activated.stubs.length, 6, 'Vector 6: Card 1 must have 6 stubs');
    assert(
      card1Activated.stubs.every((s) => s.status === StubStatus.ACTIVATED),
      'Vector 6: All 6 attached stubs must transition to ACTIVATED'
    );
    assert(card1Activated.transaction, 'Vector 6: Card 1 must link to RegistrationTransaction');
    assert.strictEqual(card1Activated.transaction.buyerName, 'Legitimate Registered Purchaser');
    console.log('[PASS] Vector 6: POS bind activated Card 1 and all 6 attached stubs with HTTP 200.\n');

    // -----------------------------------------------------------------------------------
    // Vector 7: Invariant Check at Voting Booth Scanner
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 7: Invariant Check at Voting Booth Scanner ---');
    setMockSession(exhibitorUser);

    // 7a: Scan unactivated/unsold card stub (Card 2 Slot 1)
    const card2Stub1 = await prisma.ticketStub.findFirst({
      where: { bingoCardId: card2.id, slotNumber: 1 },
    });
    assert(card2Stub1, 'Vector 7: Card 2 Slot 1 stub must exist');
    assert.strictEqual(card2Stub1.status, StubStatus.INACTIVE, 'Vector 7: Card 2 stub must remain INACTIVE');

    const unsoldQrPayload = encodeStubPayload(card2Stub1.stubSerial, 1, secretKey);
    const voteUnsoldReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-vote-unsold-${runId}`,
      },
      body: JSON.stringify({
        qrPayload: unsoldQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteUnsoldRes = await postVote(voteUnsoldReq);
    assert.strictEqual(voteUnsoldRes.status, 400, 'Vector 7a: Expected HTTP 400 when scanning unactivated stub');
    const voteUnsoldBody = (await voteUnsoldRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteUnsoldBody.success, false, 'Vector 7a: Response success must be false');
    assert.strictEqual(voteUnsoldBody.error, 'TICKET_NOT_ACTIVATED', 'Vector 7a: Error code must be TICKET_NOT_ACTIVATED');

    const unsoldVoteCheck = await prisma.vote.count({ where: { ticketStubId: card2Stub1.id } });
    assert.strictEqual(unsoldVoteCheck, 0, 'Vector 7a: Zero votes must be recorded for unsold stub');
    console.log('[PASS] Vector 7a: Unsold card stub scan correctly rejected with HTTP 400 TICKET_NOT_ACTIVATED.');

    // 7b: Scan newly activated card stub (Card 1 Slot 1)
    const card1Stub1 = await prisma.ticketStub.findFirst({
      where: { bingoCardId: card1.id, slotNumber: 1 },
    });
    assert(card1Stub1, 'Vector 7: Card 1 Slot 1 stub must exist');
    assert.strictEqual(card1Stub1.status, StubStatus.ACTIVATED, 'Vector 7: Card 1 stub must be ACTIVATED');

    const activatedQrPayload = encodeStubPayload(card1Stub1.stubSerial, 1, secretKey);
    const voteActivatedReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-vote-act-${runId}`,
      },
      body: JSON.stringify({
        qrPayload: activatedQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteActivatedRes = await postVote(voteActivatedReq);
    assert.strictEqual(voteActivatedRes.status, 200, 'Vector 7b: Expected HTTP 200 on authorized activated stub scan');
    const voteActivatedBody = (await voteActivatedRes.json()) as VoteSuccessResponse;
    assert.strictEqual(voteActivatedBody.success, true, 'Vector 7b: Response success must be true');
    assert.strictEqual(voteActivatedBody.stubSerial, card1Stub1.stubSerial, 'Vector 7b: stubSerial must match');

    const stubAfterVote = await prisma.ticketStub.findUnique({ where: { id: card1Stub1.id } });
    assert.strictEqual(stubAfterVote?.status, StubStatus.REDEEMED, 'Vector 7b: Stub status must transition to REDEEMED');
    const voteRecord = await prisma.vote.findUnique({ where: { ticketStubId: card1Stub1.id } });
    assert(voteRecord, 'Vector 7b: Vote record must exist in PostgreSQL');
    console.log('[PASS] Vector 7b: Activated card stub scan succeeded with HTTP 200 and transitioned stub to REDEEMED.');

    // 7c: Scan the same stub a second time (Duplicate redemption defense)
    const voteDuplicateReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-vote-dup-${runId}`,
      },
      body: JSON.stringify({
        qrPayload: activatedQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteDuplicateRes = await postVote(voteDuplicateReq);
    assert.strictEqual(voteDuplicateRes.status, 409, 'Vector 7c: Expected HTTP 409 Conflict on duplicate redemption');
    const voteDuplicateBody = (await voteDuplicateRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteDuplicateBody.success, false, 'Vector 7c: Response success must be false');
    assert.strictEqual(voteDuplicateBody.error, 'TICKET_ALREADY_REDEEMED', 'Vector 7c: Error code must be TICKET_ALREADY_REDEEMED');
    console.log('[PASS] Vector 7c: Duplicate stub scan correctly rejected with HTTP 409 TICKET_ALREADY_REDEEMED.\n');

    // -----------------------------------------------------------------------------------
    // Vector 8: Batch Activation Deprecation (HTTP 404 Not Found)
    // -----------------------------------------------------------------------------------
    console.log('--- Vector 8: Batch Activation Deprecation Verification ---');
    const batchReq = new Request('http://localhost/api/admin/cards/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: testBatch.id }),
    });

    const batchRes = await postBatchCards();
    assert.strictEqual(batchRes.status, 404, 'Vector 8: Deprecated batch activation route must return HTTP 404');
    const batchBody = (await batchRes.json()) as StandardErrorResponse;
    assert.strictEqual(batchBody.success, false, 'Vector 8: Response success must be false');
    assert.strictEqual(batchBody.error, 'NOT_FOUND', 'Vector 8: Error code must be NOT_FOUND');
    console.log('[PASS] Vector 8: POST /api/admin/cards/batch returned HTTP 404 NOT_FOUND.\n');

    console.log('===================================================================================');
    console.log('All 8 Registration Lifecycle Gate & Exclusive POS Vectors PASSED with 100% integrity!');
    console.log('===================================================================================\n');
  } finally {
    // Teardown: Restore original EventConfig setting and purge temporary test records
    console.log('[TEARDOWN] Restoring initial EventConfig and cleaning up test artifacts...');

    if (initialConfig) {
      await prisma.eventConfig.update({
        where: { id: initialConfig.id },
        data: { isRegistrationOpen: initialRegistrationOpen },
      });
    }

    const testCardIds = [card1.id, card2.id];
    const testStubs = await prisma.ticketStub.findMany({
      where: { bingoCardId: { in: testCardIds } },
      select: { id: true },
    });
    const testStubIds = testStubs.map((s) => s.id);

    await prisma.vote.deleteMany({
      where: { ticketStubId: { in: testStubIds } },
    });

    await prisma.ticketStub.deleteMany({
      where: { id: { in: testStubIds } },
    });

    await prisma.bingoCard.deleteMany({
      where: { id: { in: testCardIds } },
    });

    await prisma.registrationTransaction.deleteMany({
      where: {
        buyerName: {
          in: ['Gated Test Purchaser', 'Legitimate Registered Purchaser'],
        },
      },
    });

    await prisma.pdfBatch.deleteMany({
      where: { id: testBatch.id },
    });

    await prisma.idempotencyLog.deleteMany({
      where: {
        OR: [
          { idempotencyKey: { contains: `test-gate-pause-${runId}` } },
          { idempotencyKey: { contains: `test-gate-open-${runId}` } },
          { idempotencyKey: { contains: `test-vote-unsold-${runId}` } },
          { idempotencyKey: { contains: `test-vote-act-${runId}` } },
          { idempotencyKey: { contains: `test-vote-dup-${runId}` } },
        ],
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        resource: 'SYSTEM_CONFIG',
        action: { in: ['ADMIN_PAUSE_REGISTRATION', 'ADMIN_OPEN_REGISTRATION'] },
        createdAt: { gte: testStartTime },
      },
    });

    console.log('[TEARDOWN] Cleanup completed successfully.\n');
  }
}

runRegistrationLifecycleGateVerification()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Registration lifecycle gate verification failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
