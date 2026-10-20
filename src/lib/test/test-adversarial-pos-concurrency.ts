import 'dotenv/config';
import assert from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import prisma from '@/lib/db/prisma';
import { signSession, getSessionSecret } from '@/lib/auth/session';
import { CardStatus, StubStatus, type Role } from '@prisma/client';
import { POST as postAdminConfig } from '@/app/api/admin/config/route';
import { POST as postRegistrationBind } from '@/app/api/registration/bind/route';
import { rateLimiter } from '@/lib/security/rate-limiter';

interface MockUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  boothId: string | null;
}

interface StandardResponse {
  success: boolean;
  error?: string;
  message?: string;
  transactionId?: string;
  cardsActivatedCount?: number;
  stubsActivatedCount?: number;
}

interface ConfigResponse {
  success: boolean;
  config: {
    id: string;
    isRegistrationOpen: boolean;
    isVotingOpen: boolean;
    isAwardsLocked: boolean;
  };
}

// Thread-isolated session context for concurrent multi-actor simulation
const sessionContext = new AsyncLocalStorage<string | null>();
let globalFallbackToken: string | null = null;

const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({
  get: (name: string) => {
    if (name !== 'itech2027_session') return undefined;
    const token = sessionContext.getStore() ?? globalFallbackToken;
    return token ? { value: token } : undefined;
  },
  set: () => {},
  delete: () => {},
});

function createSessionToken(user: MockUser): string {

  return signSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    boothId: user.boothId,
  });
}

function setGlobalSession(user: MockUser): void {

  globalFallbackToken = createSessionToken(user);
}

let totalAssertions = 0;
let passedAssertions = 0;

function assertCheck(condition: boolean, description: string): void {

  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description}`);
    assert.fail(`Assertion failed: ${description}`);
  }
}

async function runAdversarialPosConcurrencySuite(): Promise<void> {

  console.log('================================================================================');
  console.log('Starting Adversarial POS Gating & Concurrency Stress Test Suite');
  console.log('================================================================================\n');

  const runId = Math.floor(10000 + Math.random() * 89999).toString();
  const testStartTime = new Date();

  // 1. Fetch seed users: Administrator, Registration Clerks, Exhibitor, Production
  const adminRecord = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(adminRecord, 'Prerequisite: Admin user must exist');
  const adminUser: MockUser = {
    id: adminRecord.id,
    email: adminRecord.email,
    fullName: adminRecord.fullName,
    role: adminRecord.role,
    boothId: adminRecord.boothId,
  };

  const regRecords = await prisma.user.findMany({ where: { role: 'REGISTRATION' }, take: 2 });
  const clerk1: MockUser = regRecords[0]
    ? {
        id: regRecords[0].id,
        email: regRecords[0].email,
        fullName: regRecords[0].fullName,
        role: regRecords[0].role,
        boothId: regRecords[0].boothId,
      }
    : adminUser;

  let temporaryClerk2Created = false;
  let clerk2: MockUser;
  if (regRecords.length > 1) {
    clerk2 = {
      id: regRecords[1].id,
      email: regRecords[1].email,
      fullName: regRecords[1].fullName,
      role: regRecords[1].role,
      boothId: regRecords[1].boothId,
    };
  } else {
    const createdUser = await prisma.user.create({
      data: {
        email: `clerk2-${runId}@itechtivity.local`,
        passwordHash: 'test-hash-clerk2',
        fullName: 'Clerk Two Mock',
        role: 'REGISTRATION',
      },
    });
    temporaryClerk2Created = true;
    clerk2 = {
      id: createdUser.id,
      email: createdUser.email,
      fullName: createdUser.fullName,
      role: createdUser.role,
      boothId: createdUser.boothId,
    };
  }

  const exhibitorRecord = await prisma.user.findFirst({ where: { role: 'EXHIBITOR' } });
  const exhibitorUser: MockUser = exhibitorRecord
    ? {
        id: exhibitorRecord.id,
        email: exhibitorRecord.email,
        fullName: exhibitorRecord.fullName,
        role: exhibitorRecord.role,
        boothId: exhibitorRecord.boothId,
      }
    : {
        id: `exhibitor-mock-${runId}`,
        email: `exhibitor-${runId}@itechtivity.local`,
        fullName: 'Exhibitor Mock',
        role: 'EXHIBITOR',
        boothId: null,
      };

  const productionRecord = await prisma.user.findFirst({ where: { role: 'PRODUCTION' } });
  const productionUser: MockUser = productionRecord
    ? {
        id: productionRecord.id,
        email: productionRecord.email,
        fullName: productionRecord.fullName,
        role: productionRecord.role,
        boothId: productionRecord.boothId,
      }
    : {
        id: `prod-mock-${runId}`,
        email: `production-${runId}@itechtivity.local`,
        fullName: 'Production Mock',
        role: 'PRODUCTION',
        boothId: null,
      };

  // 2. Capture and normalize initial EventConfig
  const initialConfig = await prisma.eventConfig.findFirst();
  assert(initialConfig, 'Prerequisite: EventConfig record must exist');
  const initialRegistrationOpen = initialConfig.isRegistrationOpen;

  // 3. Resolve active awards (slot 1 to 6)
  const activeAwards = await prisma.award.findMany({
    where: { isActive: true },
    orderBy: { slotNumber: 'asc' },
    take: 6,
  });
  assert(activeAwards.length === 6, 'Prerequisite: 6 active awards must be configured');

  // 4. Create dedicated adversarial test batch
  const batchNumber = 9000 + (Number(runId) % 900);
  const testBatch = await prisma.pdfBatch.create({
    data: {
      batchNumber,
      fileName: `adversarial-pos-batch-${runId}.pdf`,
      totalCards: 50,
      totalSheets: 25,
      status: 'COMPLETED',
    },
  });

  // Helper: batch card creator with 6 inactive stubs per card
  async function createTestCards(serials: string[]): Promise<string[]> {

    const createdIds: string[] = [];

    for (const serial of serials) {
      const card = await prisma.bingoCard.create({
        data: {
          cardSerial: serial,
          masterQrHash: `MASTER:${serial}`,
          pdfBatchId: testBatch.id,
          status: CardStatus.GENERATED,
        },
      });
      createdIds.push(card.id);

      for (const award of activeAwards) {
        await prisma.ticketStub.create({
          data: {
            bingoCardId: card.id,
            slotNumber: award.slotNumber,
            awardId: award.id,
            stubSerial: `${serial}-S${award.slotNumber}`,
            signatureHash: `sig-${serial}-s${award.slotNumber}`,
            status: StubStatus.INACTIVE,
          },
        });
      }
    }

    return createdIds;
  }

  const allCreatedCardIds: string[] = [];

  try {
    // =================================================================================
    // SUITE 1: Rapid Registration State Flapping Concurrency Stress
    // =================================================================================
    console.log('\n--- SUITE 1: Rapid Registration State Flapping Concurrency Stress ---');

    // Create 12 distinct cards for the flapping test
    const flappingSerials = Array.from({ length: 12 }, (_, i) => `ADV-FLAP-${runId}-${String(i + 1).padStart(2, '0')}`);
    const flapCardIds = await createTestCards(flappingSerials);
    allCreatedCardIds.push(...flapCardIds);

    // Reset rate limiter for clerk1 to ensure full burst allowance
    rateLimiter.reset(`reg:${clerk1.id}`);

    // Asynchronous state flapper toggling registration open -> pause -> open -> pause -> open
    let flapperRunning = true;
    const adminToken = createSessionToken(adminUser);

    const flapperPromise = (async () => {
      let state = false;
      while (flapperRunning) {
        await sessionContext.run(adminToken, async () => {
          await postAdminConfig(
            new Request('http://localhost/api/admin/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isRegistrationOpen: state }),
            })
          );
        });
        state = !state;
        await new Promise((r) => setTimeout(r, 15));
      }
    })();

    // Fire 12 simultaneous bind requests during active flapping
    const clerkToken = createSessionToken(clerk1);
    const flapRequests = flappingSerials.map((serial, idx) => {
      const req = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `flap-idemp-${runId}-${idx}`,
        },
        body: JSON.stringify({
          buyerType: 'CSD_STUDENT',
          buyerName: `Flap Buyer ${idx + 1}`,
          studentNumber: `2024-FLAP-${String(idx + 1).padStart(4, '0')}`,
          program: 'BSIT',
          yearAndSection: '3B',
          cardSerials: [serial],
        }),
      });

      return sessionContext.run(clerkToken, async () => {
        const res = await postRegistrationBind(req);
        const status = res.status;
        const body = (await res.json()) as StandardResponse;
        return { serial, status, body };
      });
    });

    const flapResults = await Promise.all(flapRequests);
    flapperRunning = false;
    await flapperPromise;

    // Verify all 12 requests conformed to strict binary invariant: HTTP 200 or HTTP 403
    let activatedCount = 0;
    let rejectedCount = 0;

    for (const res of flapResults) {
      if (res.status === 200) {
        activatedCount++;
        assertCheck(res.body.success === true, `Suite 1: Successful response for ${res.serial} has success: true`);
        assertCheck(res.body.cardsActivatedCount === 1, `Suite 1: Activated count for ${res.serial} is exactly 1`);
        assertCheck(res.body.stubsActivatedCount === 6, `Suite 1: Stubs activated count for ${res.serial} is exactly 6`);
      } else if (res.status === 403) {
        rejectedCount++;
        assertCheck(res.body.success === false, `Suite 1: Rejected response for ${res.serial} has success: false`);
        assertCheck(res.body.error === 'REGISTRATION_CLOSED', `Suite 1: Rejected response error code is REGISTRATION_CLOSED`);
      } else {
        assertCheck(false, `Suite 1: Unexpected response status ${res.status} for ${res.serial}: ${JSON.stringify(res.body)}`);
      }
    }

    assertCheck(
      activatedCount + rejectedCount === 12,
      `Suite 1: All 12 requests resolved cleanly to either HTTP 200 or HTTP 403 (200: ${activatedCount}, 403: ${rejectedCount})`
    );

    // Deep database consistency inspection for all 12 cards and 72 stubs
    for (const res of flapResults) {
      const cardInDb = await prisma.bingoCard.findUnique({
        where: { cardSerial: res.serial },
        include: { stubs: true, transaction: true },
      });
      assert(cardInDb, `Suite 1: Card ${res.serial} must exist in PostgreSQL`);

      if (res.status === 200) {
        assertCheck(cardInDb.status === CardStatus.ACTIVATED, `Suite 1: Card ${res.serial} status is ACTIVATED in DB`);
        assertCheck(cardInDb.stubs.length === 6, `Suite 1: Card ${res.serial} has 6 stubs`);
        assertCheck(
          cardInDb.stubs.every((s) => s.status === StubStatus.ACTIVATED),
          `Suite 1: All 6 stubs for ${res.serial} transitioned to ACTIVATED`
        );
        assertCheck(cardInDb.transaction !== null, `Suite 1: Card ${res.serial} links to RegistrationTransaction`);
      } else {
        assertCheck(cardInDb.status === CardStatus.GENERATED, `Suite 1: Gated card ${res.serial} remains GENERATED`);
        assertCheck(
          cardInDb.stubs.every((s) => s.status === StubStatus.INACTIVE),
          `Suite 1: All 6 stubs for gated card ${res.serial} remain INACTIVE`
        );
        assertCheck(cardInDb.transaction === null, `Suite 1: Gated card ${res.serial} has NO transaction linked`);
      }
    }

    console.log('[PASS] Suite 1: Rapid registration state flapping concurrency passed with zero corruption.\n');

    // Restore registration to OPEN before proceeding to next suites
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: true }),
        })
      );
    });

    // =================================================================================
    // SUITE 2: Concurrent Double-Spend / Collision Attack on the Same Card
    // =================================================================================
    console.log('--- SUITE 2: Concurrent Double-Spend / Collision Attack on Same Card ---');

    const collisionSerial = `ADV-COLLIDE-${runId}-01`;
    const collisionCardIds = await createTestCards([collisionSerial]);
    allCreatedCardIds.push(...collisionCardIds);

    rateLimiter.reset(`reg:${clerk1.id}`);

    // 10 concurrent requests simultaneously attempting to bind the exact same card serial
    const collisionRequests = Array.from({ length: 10 }, (_, i) => {
      const req = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `collision-key-${runId}-${i}`,
        },
        body: JSON.stringify({
          buyerType: 'CSD_STUDENT',
          buyerName: `Colliding Buyer ${i + 1}`,
          studentNumber: `2024-COL-${String(i + 1).padStart(4, '0')}`,
          program: 'BSCS',
          yearAndSection: '4B',
          cardSerials: [collisionSerial],
        }),
      });

      return sessionContext.run(clerkToken, async () => {
        const res = await postRegistrationBind(req);
        const status = res.status;
        const body = (await res.json()) as StandardResponse;
        return { index: i, status, body };
      });
    });

    const collisionResults = await Promise.all(collisionRequests);

    const winningResponses = collisionResults.filter((r) => r.status === 200);
    const conflictResponses = collisionResults.filter((r) => r.status === 400);

    assertCheck(
      winningResponses.length === 1,
      `Suite 2: Exactly ONE request won the race condition (200 count: ${winningResponses.length})`
    );
    assertCheck(
      conflictResponses.length === 9,
      `Suite 2: Exactly 9 competing requests rejected with HTTP 400 (400 count: ${conflictResponses.length})`
    );

    for (const rejected of conflictResponses) {
      assertCheck(
        Boolean(rejected.body.error?.startsWith('CONCURRENCY_CONFLICT:') || rejected.body.error?.startsWith('ALREADY_ACTIVE:')),
        `Suite 2: Rejected request ${rejected.index} received atomic conflict error (${rejected.body.error})`
      );
    }

    // Direct database validation: exactly 1 transaction created, card status ACTIVATED
    const transactionsForCard = await prisma.registrationTransaction.count({
      where: {
        cards: {
          some: { cardSerial: collisionSerial },
        },
      },
    });
    assertCheck(transactionsForCard === 1, 'Suite 2: Exactly 1 RegistrationTransaction exists in DB for colliding card');

    const cardAfterCollision = await prisma.bingoCard.findUnique({
      where: { cardSerial: collisionSerial },
      include: { stubs: true },
    });
    assert(cardAfterCollision, 'Suite 2: Colliding card must exist');
    assertCheck(cardAfterCollision.status === CardStatus.ACTIVATED, 'Suite 2: Card status is ACTIVATED');
    assertCheck(
      cardAfterCollision.stubs.every((s) => s.status === StubStatus.ACTIVATED),
      'Suite 2: All 6 stubs of colliding card are ACTIVATED'
    );

    console.log('[PASS] Suite 2: Concurrent double-spend race defeated by atomic database transaction.\n');

    // =================================================================================
    // SUITE 3: Replay Attacks and Idempotency-Key Lifecycle
    // =================================================================================
    console.log('--- SUITE 3: Replay Attacks & Idempotency-Key Lifecycle Across State Boundaries ---');

    // Scenario 3A: Idempotency Key Reuse on Closed Registration
    const serial3A = `ADV-IDEMP-3A-${runId}`;
    const cardIds3A = await createTestCards([serial3A]);
    allCreatedCardIds.push(...cardIds3A);

    // Pause registration
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: false }),
        })
      );
    });

    const pausedKey = `idemp-paused-${runId}-01`;
    rateLimiter.reset(`reg:${clerk1.id}`);

    // Request while paused
    const req3APaused = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': pausedKey,
      },
      body: JSON.stringify({
        buyerType: 'VISITOR',
        buyerName: 'Professor X',
        affiliation: 'Tech Faculty',
        cardSerials: [serial3A],
      }),
    });

    const res3APaused = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req3APaused);
      const body = (await res.json()) as StandardResponse;
      return { status: res.status, body };
    });

    assertCheck(res3APaused.status === 403, 'Suite 3A: Request while paused rejected with HTTP 403');
    assertCheck(res3APaused.body.error === 'REGISTRATION_CLOSED', 'Suite 3A: Error code is REGISTRATION_CLOSED');

    // Verify NO idempotencyLog created for failed/paused request
    const scopedKey3A = `reg:${clerk1.id}:${pausedKey}`;
    const logDuringPause = await prisma.idempotencyLog.findUnique({
      where: { idempotencyKey: scopedKey3A },
    });
    assertCheck(logDuringPause === null, 'Suite 3A: Zero IdempotencyLog persisted for rejected gated request');

    // Re-open registration
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: true }),
        })
      );
    });

    // Resubmit using the EXACT SAME Idempotency-Key
    const req3AReopen = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': pausedKey,
      },
      body: JSON.stringify({
        buyerType: 'VISITOR',
        buyerName: 'Professor X',
        affiliation: 'Tech Faculty',
        cardSerials: [serial3A],
      }),
    });

    const res3AReopen = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req3AReopen);
      const body = (await res.json()) as StandardResponse;
      return { status: res.status, body };
    });

    assertCheck(res3AReopen.status === 200, 'Suite 3A: Re-submitted request with same key succeeded with HTTP 200 upon reopening');
    assertCheck(res3AReopen.body.success === true, 'Suite 3A: Success is true');
    const firstTransactionId = res3AReopen.body.transactionId;

    // Verify IdempotencyLog now exists
    const logAfterOpen = await prisma.idempotencyLog.findUnique({
      where: { idempotencyKey: scopedKey3A },
    });
    assertCheck(logAfterOpen !== null, 'Suite 3A: IdempotencyLog successfully stored after valid commitment');

    // Replay of the same key now that card is already active
    const req3AReplay = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': pausedKey,
      },
      body: JSON.stringify({
        buyerType: 'VISITOR',
        buyerName: 'Professor X',
        affiliation: 'Tech Faculty',
        cardSerials: [serial3A],
      }),
    });

    const res3AReplay = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req3AReplay);
      const body = (await res.json()) as StandardResponse;
      return { status: res.status, body };
    });

    assertCheck(res3AReplay.status === 200, 'Suite 3A: Idempotent replay returned HTTP 200 cached response');
    assertCheck(res3AReplay.body.transactionId === firstTransactionId, 'Suite 3A: Cached transactionId matches first run exactly');

    // Scenario 3B: Replay of Succeeded Request While Registration is Later Paused
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: false }),
        })
      );
    });

    const req3BWhilePaused = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': pausedKey,
      },
      body: JSON.stringify({
        buyerType: 'VISITOR',
        buyerName: 'Professor X',
        affiliation: 'Tech Faculty',
        cardSerials: [serial3A],
      }),
    });

    const res3BWhilePaused = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req3BWhilePaused);
      const body = (await res.json()) as StandardResponse;
      return { status: res.status, body };
    });

    assertCheck(
      res3BWhilePaused.status === 200 && res3BWhilePaused.body.transactionId === firstTransactionId,
      'Suite 3B: Prior committed transaction safely returned from idempotency cache even when registration is currently paused'
    );

    // Re-open registration
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: true }),
        })
      );
    });

    // Scenario 3C: Simultaneous Concurrent Race with Exact Same Idempotency Key
    const serial3C = `ADV-IDEMP-3C-${runId}`;
    const cardIds3C = await createTestCards([serial3C]);
    allCreatedCardIds.push(...cardIds3C);

    const sameKey = `concurrent-same-key-${runId}`;
    rateLimiter.reset(`reg:${clerk1.id}`);

    const sameKeyRequests = Array.from({ length: 6 }, () => {
      const req = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': sameKey,
        },
        body: JSON.stringify({
          buyerType: 'ALUMNI',
          buyerName: 'Alumni Networker',
          cardSerials: [serial3C],
        }),
      });

      return sessionContext.run(clerkToken, async () => {
        const res = await postRegistrationBind(req);
        const status = res.status;
        const body = (await res.json()) as StandardResponse;
        return { status, body };
      });
    });

    const sameKeyResults = await Promise.all(sameKeyRequests);
    assertCheck(
      sameKeyResults.every((r) => r.status === 200),
      'Suite 3C: All 6 concurrent requests with identical Idempotency-Key returned HTTP 200'
    );

    const firstTxId = sameKeyResults[0].body.transactionId;
    assertCheck(
      sameKeyResults.every((r) => r.body.transactionId === firstTxId),
      'Suite 3C: All 6 concurrent requests returned the identical transactionId without divergence'
    );

    const countTx3C = await prisma.registrationTransaction.count({
      where: { cards: { some: { cardSerial: serial3C } } },
    });
    assertCheck(countTx3C === 1, 'Suite 3C: Exactly 1 RegistrationTransaction created in DB despite 6 simultaneous requests');

    // Scenario 3D: Clerk Idempotency Isolation (User-Scoped Idempotency)
    const serial3D_A = `ADV-IDEMP-3DA-${runId}`;
    const serial3D_B = `ADV-IDEMP-3DB-${runId}`;
    const cardIds3D = await createTestCards([serial3D_A, serial3D_B]);
    allCreatedCardIds.push(...cardIds3D);

    const sharedKeyBetweenClerks = `shared-clerk-key-${runId}`;
    const clerk1Token = createSessionToken(clerk1);
    const clerk2Token = createSessionToken(clerk2);

    rateLimiter.reset(`reg:${clerk1.id}`);
    rateLimiter.reset(`reg:${clerk2.id}`);

    // Clerk 1 uses shared key
    const reqClerk1 = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': sharedKeyBetweenClerks,
      },
      body: JSON.stringify({
        buyerType: 'ALUMNI',
        buyerName: 'Clerk 1 Alumni',
        cardSerials: [serial3D_A],
      }),
    });

    const resClerk1 = await sessionContext.run(clerk1Token, async () => {
      const res = await postRegistrationBind(reqClerk1);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });
    assertCheck(resClerk1.status === 200, 'Suite 3D: Clerk 1 bind succeeded with HTTP 200');

    // Clerk 2 uses the SAME shared key for a different card
    const reqClerk2 = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': sharedKeyBetweenClerks,
      },
      body: JSON.stringify({
        buyerType: 'ALUMNI',
        buyerName: 'Clerk 2 Alumni',
        cardSerials: [serial3D_B],
      }),
    });

    const resClerk2 = await sessionContext.run(clerk2Token, async () => {
      const res = await postRegistrationBind(reqClerk2);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(resClerk2.status === 200, 'Suite 3D: Clerk 2 bind succeeded independently with HTTP 200');
    assertCheck(
      resClerk1.body.transactionId !== resClerk2.body.transactionId,
      'Suite 3D: Clerk 1 and Clerk 2 received distinct transactions due to scoped userId idempotency'
    );

    // Scenario 3E: Malformed Idempotency Keys
    const malformedKeys = [
      { key: 'short', desc: 'Too short (< 8 chars)' },
      { key: 'a'.repeat(129), desc: 'Too long (> 128 chars)' },
      { key: 'key with spaces', desc: 'Contains spaces' },
      { key: 'key<script>alert(1)</script>', desc: 'Contains HTML script characters' },
      { key: 'key"quote', desc: 'Contains quote characters' },
    ];

    for (const testItem of malformedKeys) {
      const badKeyReq = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': testItem.key,
        },
        body: JSON.stringify({
          buyerType: 'ALUMNI',
          buyerName: 'Test Malformed Key',
          cardSerials: [serial3A],
        }),
      });

      const badKeyRes = await sessionContext.run(clerk1Token, async () => {
        const res = await postRegistrationBind(badKeyReq);
        return { status: res.status, body: (await res.json()) as StandardResponse };
      });

      assertCheck(
        badKeyRes.status === 400 && badKeyRes.body.error === 'MISSING_IDEMPOTENCY_KEY',
        `Suite 3E: Malformed idempotency key [${testItem.desc}] rejected with HTTP 400 MISSING_IDEMPOTENCY_KEY`
      );
    }

    console.log('[PASS] Suite 3: Replay attacks and idempotency-key lifecycle verified completely.\n');

    // =================================================================================
    // SUITE 4: Forged, Tampered, and Unauthenticated Payloads
    // =================================================================================
    console.log('--- SUITE 4: Forged, Tampered, and Unauthenticated Payloads ---');

    const serial4 = `ADV-FORGE-${runId}`;
    const cardIds4 = await createTestCards([serial4]);
    allCreatedCardIds.push(...cardIds4);

    const validBindPayload = {
      buyerType: 'CSD_STUDENT',
      buyerName: 'Security Audit Student',
      studentNumber: '2024-SEC-0001',
      program: 'BSCS',
      yearAndSection: '3A',
      cardSerials: [serial4],
    };

    // Scenario 4A: Missing session (unauthenticated)
    const reqNoAuth = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `noauth-key-${runId}`,
      },
      body: JSON.stringify(validBindPayload),
    });

    const resNoAuth = await sessionContext.run(null, async () => {
      globalFallbackToken = null;
      const res = await postRegistrationBind(reqNoAuth);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(
      resNoAuth.status === 403 && resNoAuth.body.error === 'UNAUTHORIZED_REGISTRATION_ACTION',
      'Suite 4A: Unauthenticated request rejected with HTTP 403 UNAUTHORIZED_REGISTRATION_ACTION'
    );

    // Scenario 4B: Tampered session token
    const legitToken = createSessionToken(clerk1);
    const tamperedToken = legitToken.slice(0, -6) + 'abcdef';

    const reqTampered = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `tamper-key-${runId}`,
      },
      body: JSON.stringify(validBindPayload),
    });

    const resTampered = await sessionContext.run(tamperedToken, async () => {
      const res = await postRegistrationBind(reqTampered);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(
      resTampered.status === 403 && resTampered.body.error === 'UNAUTHORIZED_REGISTRATION_ACTION',
      'Suite 4B: Tampered session HMAC signature rejected with HTTP 403 UNAUTHORIZED_REGISTRATION_ACTION'
    );

    // Scenario 4C: Unauthorized Role - EXHIBITOR
    const exhibitorToken = createSessionToken(exhibitorUser);
    const reqExhibitor = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `exhibitor-reg-key-${runId}`,
      },
      body: JSON.stringify(validBindPayload),
    });

    const resExhibitor = await sessionContext.run(exhibitorToken, async () => {
      const res = await postRegistrationBind(reqExhibitor);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(
      resExhibitor.status === 403 && resExhibitor.body.error === 'UNAUTHORIZED_REGISTRATION_ACTION',
      'Suite 4C: Role EXHIBITOR attempting card registration rejected with HTTP 403'
    );

    // Scenario 4D: Unauthorized Role - PRODUCTION
    const productionToken = createSessionToken(productionUser);
    const reqProduction = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `prod-reg-key-${runId}`,
      },
      body: JSON.stringify(validBindPayload),
    });

    const resProduction = await sessionContext.run(productionToken, async () => {
      const res = await postRegistrationBind(reqProduction);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(
      resProduction.status === 403 && resProduction.body.error === 'UNAUTHORIZED_REGISTRATION_ACTION',
      'Suite 4D: Role PRODUCTION attempting card registration rejected with HTTP 403'
    );

    // Scenario 4E: Malformed Demographics Payloads
    rateLimiter.reset(`reg:${clerk1.id}`);
    const malformedPayloads = [
      { payload: { ...validBindPayload, buyerName: '' }, desc: 'Empty buyerName' },
      { payload: { ...validBindPayload, buyerType: 'INVALID_TYPE' }, desc: 'Invalid buyerType enum' },
      { payload: { ...validBindPayload, cardSerials: [] }, desc: 'Empty cardSerials array' },
      { payload: { ...validBindPayload, cardSerials: 'not-an-array' }, desc: 'String cardSerials instead of array' },
      { payload: { ...validBindPayload, program: 'P'.repeat(151) }, desc: 'Exceedingly long program string (>150 chars)' },
    ];

    for (const testCase of malformedPayloads) {
      const badReq = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `bad-demog-${runId}-${Math.random().toString(36).slice(2, 8)}`,
        },
        body: JSON.stringify(testCase.payload),
      });

      const badRes = await sessionContext.run(clerkToken, async () => {
        const res = await postRegistrationBind(badReq);
        return { status: res.status, body: (await res.json()) as StandardResponse };
      });

      assertCheck(
        badRes.status === 400 && badRes.body.error === 'VALIDATION_FAILED',
        `Suite 4E: Malformed demographics [${testCase.desc}] rejected with HTTP 400 VALIDATION_FAILED`
      );
    }

    // Scenario 4F: Forged Non-Existent Card Serial
    const fakeSerialReq = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `fake-serial-${runId}`,
      },
      body: JSON.stringify({
        ...validBindPayload,
        cardSerials: [`GHOST-CARD-${runId}`],
      }),
    });

    const fakeSerialRes = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(fakeSerialReq);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(
      Boolean(fakeSerialRes.status === 400 && fakeSerialRes.body.error?.startsWith('MISSING_CARDS:')),
      `Suite 4F: Forged card serial rejected with HTTP 400 MISSING_CARDS (${fakeSerialRes.body.error})`
    );

    console.log('[PASS] Suite 4: Forged and unauthenticated attack vectors properly blocked.\n');

    // =================================================================================
    // SUITE 5: Partial Activation Defense and Atomicity Rollback Under Injected Faults
    // =================================================================================
    console.log('--- SUITE 5: Partial Activation Defense & Atomicity Rollback Under Fault Injections ---');

    // Scenario 5A: Multi-Card Batch submitted while Registration is Paused
    const pausedBatchSerials = [`ADV-PAUSE-5A1-${runId}`, `ADV-PAUSE-5A2-${runId}`, `ADV-PAUSE-5A3-${runId}`];
    const cardIds5A = await createTestCards(pausedBatchSerials);
    allCreatedCardIds.push(...cardIds5A);

    // Pause registration
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: false }),
        })
      );
    });

    rateLimiter.reset(`reg:${clerk1.id}`);

    const req5APausedBatch = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `batch-paused-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Gated Multi-Card Buyer',
        cardSerials: pausedBatchSerials,
      }),
    });

    const res5APausedBatch = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req5APausedBatch);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(res5APausedBatch.status === 403, 'Suite 5A: Multi-card batch when paused rejected with HTTP 403');
    assertCheck(res5APausedBatch.body.error === 'REGISTRATION_CLOSED', 'Suite 5A: Error code is REGISTRATION_CLOSED');

    // Verify 100% of all 3 cards and all 18 stubs remain GENERATED and INACTIVE
    const cards5AInDb = await prisma.bingoCard.findMany({
      where: { cardSerial: { in: pausedBatchSerials } },
      include: { stubs: true },
    });

    assertCheck(cards5AInDb.length === 3, 'Suite 5A: All 3 cards present in DB');
    assertCheck(
      cards5AInDb.every((c) => c.status === CardStatus.GENERATED),
      'Suite 5A: 100% of cards in paused batch remain GENERATED'
    );
    assertCheck(
      cards5AInDb.every((c) => c.stubs.every((s) => s.status === StubStatus.INACTIVE)),
      'Suite 5A: 100% of stubs (18 of 18) remain INACTIVE'
    );

    // Re-open registration
    await sessionContext.run(adminToken, async () => {
      await postAdminConfig(
        new Request('http://localhost/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRegistrationOpen: true }),
        })
      );
    });

    // Scenario 5B: Poison Pill in Mixed Multi-Card Batch (1 Valid, 1 Ghost Card)
    const validCard5B = `ADV-POISON-VALID-${runId}`;
    const cardIds5B = await createTestCards([validCard5B]);
    allCreatedCardIds.push(...cardIds5B);

    const ghostCard5B = `ADV-POISON-GHOST-${runId}`;

    rateLimiter.reset(`reg:${clerk1.id}`);

    const req5BMixed = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `poison-mixed-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Poison Pill Tester',
        cardSerials: [validCard5B, ghostCard5B],
      }),
    });

    const res5BMixed = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req5BMixed);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(res5BMixed.status === 400, 'Suite 5B: Mixed batch with ghost card rejected with HTTP 400');
    assertCheck(
      Boolean(res5BMixed.body.error?.startsWith('MISSING_CARDS:')),
      `Suite 5B: Error identifies missing cards: ${res5BMixed.body.error}`
    );

    // Ensure validCard5B was NOT partially activated
    const card5BInDb = await prisma.bingoCard.findUnique({
      where: { cardSerial: validCard5B },
      include: { stubs: true },
    });
    assert(card5BInDb, 'Suite 5B: Valid card must exist');
    assertCheck(
      card5BInDb.status === CardStatus.GENERATED,
      'Suite 5B: Valid card rolled back cleanly and remains GENERATED'
    );
    assertCheck(
      card5BInDb.stubs.every((s) => s.status === StubStatus.INACTIVE),
      'Suite 5B: All 6 stubs for valid card rolled back and remain INACTIVE'
    );

    // Scenario 5C: Poison Pill with Already Active Card in Batch
    // First, activate one legitimate card
    const legitCard5C = `ADV-ALREADY-ACTIVE-BASE-${runId}`;
    const freshCard5C = `ADV-FRESH-CARD-${runId}`;
    const cardIds5C = await createTestCards([legitCard5C, freshCard5C]);
    allCreatedCardIds.push(...cardIds5C);

    const reqActivateBase = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `base-act-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Base Card Holder',
        cardSerials: [legitCard5C],
      }),
    });

    const resActivateBase = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(reqActivateBase);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });
    assertCheck(resActivateBase.status === 200, 'Suite 5C: Base card activated successfully');

    // Now attempt to bind freshCard5C along with the already-activated legitCard5C
    const req5CConflict = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `conflict-batch-${runId}`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Conflict Batch Buyer',
        cardSerials: [freshCard5C, legitCard5C],
      }),
    });

    const res5CConflict = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(req5CConflict);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(res5CConflict.status === 400, 'Suite 5C: Mixed batch with already-active card rejected with HTTP 400');
    assertCheck(
      Boolean(res5CConflict.body.error?.startsWith('ALREADY_ACTIVE:')),
      `Suite 5C: Error identifies already active cards: ${res5CConflict.body.error}`
    );

    // Verify freshCard5C was completely rolled back and remains GENERATED/INACTIVE
    const freshCard5CInDb = await prisma.bingoCard.findUnique({
      where: { cardSerial: freshCard5C },
      include: { stubs: true },
    });
    assert(freshCard5CInDb, 'Suite 5C: Fresh card must exist in DB');
    assertCheck(
      freshCard5CInDb.status === CardStatus.GENERATED,
      'Suite 5C: Fresh card was NOT partially activated and remains GENERATED'
    );
    assertCheck(
      freshCard5CInDb.stubs.every((s) => s.status === StubStatus.INACTIVE),
      'Suite 5C: All stubs of fresh card remain INACTIVE'
    );

    console.log('[PASS] Suite 5: Partial activation strictly prevented; database atomicity verified.\n');

    // =================================================================================
    // SUITE 6: Rate Limiting and Resource Exhaustion Defense
    // =================================================================================
    console.log('--- SUITE 6: Rate Limiting and Resource Exhaustion Defense ---');

    // Create 35 test cards
    const burstSerials = Array.from({ length: 35 }, (_, i) => `ADV-BURST-${runId}-${String(i + 1).padStart(2, '0')}`);
    const burstCardIds = await createTestCards(burstSerials);
    allCreatedCardIds.push(...burstCardIds);

    // Fresh clerk rate limiter reset
    rateLimiter.reset(`reg:${clerk1.id}`);

    const burstResults: { index: number; status: number; retryAfter?: string | null }[] = [];

    // Send 35 rapid requests in sequence from clerk 1 with 40ms pacing for PgBouncer pooler stability
    for (let i = 0; i < 35; i++) {
      const req = new Request('http://localhost/api/registration/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `burst-seq-key-${runId}-${i}`,
        },
        body: JSON.stringify({
          buyerType: 'CSD_STUDENT',
          buyerName: `Burst Buyer ${i + 1}`,
          cardSerials: [burstSerials[i]],
        }),
      });

      const res = await sessionContext.run(clerkToken, async () => {
        return await postRegistrationBind(req);
      });

      burstResults.push({
        index: i,
        status: res.status,
        retryAfter: res.headers.get('Retry-After'),
      });

      if (i < 34) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }

    const successfulBurstCount = burstResults.filter((r) => r.status === 200).length;
    const rateLimitedCount = burstResults.filter((r) => r.status === 429).length;

    assertCheck(
      successfulBurstCount === 30,
      `Suite 6: Exactly 30 requests permitted within the 1-minute window (observed: ${successfulBurstCount})`
    );
    assertCheck(
      rateLimitedCount === 5,
      `Suite 6: Exactly 5 requests throttled with HTTP 429 RATE_LIMIT_EXCEEDED (observed: ${rateLimitedCount})`
    );

    const firstThrottled = burstResults.find((r) => r.status === 429);
    assertCheck(
      Boolean(firstThrottled && firstThrottled.retryAfter && Number(firstThrottled.retryAfter) > 0),
      `Suite 6: HTTP 429 response includes valid Retry-After header (${firstThrottled?.retryAfter}s)`
    );

    // Verify rateLimiter.reset restores immediate availability
    rateLimiter.reset(`reg:${clerk1.id}`);
    const reqAfterReset = new Request('http://localhost/api/registration/bind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `burst-seq-key-${runId}-30`,
      },
      body: JSON.stringify({
        buyerType: 'CSD_STUDENT',
        buyerName: 'Burst Buyer 31 Restored',
        cardSerials: [burstSerials[30]],
      }),
    });

    const resAfterReset = await sessionContext.run(clerkToken, async () => {
      const res = await postRegistrationBind(reqAfterReset);
      return { status: res.status, body: (await res.json()) as StandardResponse };
    });

    assertCheck(resAfterReset.status === 200, 'Suite 6: Request immediately permitted after rate limiter reset');

    console.log('[PASS] Suite 6: Sliding window rate limiting successfully throttles bursts and protects resources.\n');

    console.log('================================================================================');
    console.log(`Adversarial Verification Complete: ${passedAssertions}/${totalAssertions} assertions PASSED`);
    console.log('Zero vulnerabilities, zero partial activations, zero race condition double-spends!');
    console.log('================================================================================\n');

  } finally {
    console.log('[TEARDOWN] Purging temporary test data and restoring initial event configuration...');

    // Restore EventConfig
    if (initialConfig) {
      await prisma.eventConfig.update({
        where: { id: initialConfig.id },
        data: { isRegistrationOpen: initialRegistrationOpen },
      });
    }

    // Teardown created cards and stubs
    if (allCreatedCardIds.length > 0) {
      const stubs = await prisma.ticketStub.findMany({
        where: { bingoCardId: { in: allCreatedCardIds } },
        select: { id: true },
      });
      const stubIds = stubs.map((s) => s.id);

      await prisma.vote.deleteMany({
        where: { ticketStubId: { in: stubIds } },
      });

      await prisma.ticketStub.deleteMany({
        where: { id: { in: stubIds } },
      });

      await prisma.bingoCard.deleteMany({
        where: { id: { in: allCreatedCardIds } },
      });
    }

    // Teardown transactions
    await prisma.registrationTransaction.deleteMany({
      where: {
        buyerName: {
          contains: runId,
        },
      },
    });

    await prisma.registrationTransaction.deleteMany({
      where: {
        buyerName: {
          in: [
            'Professor X',
            'Alumni Networker',
            'Clerk 1 Guest',
            'Clerk 2 Guest',
            'Clerk 1 Alumni',
            'Clerk 2 Alumni',
            'Security Audit Student',
            'Gated Multi-Card Buyer',
            'Poison Pill Tester',
            'Base Card Holder',
            'Burst Buyer 31 Restored',
          ],
        },
      },
    });

    // Teardown test batch
    await prisma.pdfBatch.deleteMany({
      where: { id: testBatch.id },
    });

    // Teardown idempotency logs
    await prisma.idempotencyLog.deleteMany({
      where: {
        idempotencyKey: {
          contains: runId,
        },
      },
    });

    // Teardown audit logs generated during this test run
    await prisma.auditLog.deleteMany({
      where: {
        createdAt: { gte: testStartTime },
        OR: [
          { resource: 'SYSTEM_CONFIG', action: { in: ['ADMIN_PAUSE_REGISTRATION', 'ADMIN_OPEN_REGISTRATION'] } },
          { resource: 'REGISTRATION', action: 'REGISTRATION_BIND' },
        ],
      },
    });

    // Teardown temporary clerk2 user if created
    if (temporaryClerk2Created && clerk2) {
      await prisma.user.deleteMany({
        where: { id: clerk2.id },
      });
    }

    console.log('[TEARDOWN] Teardown complete.\n');
  }
}

runAdversarialPosConcurrencySuite()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Adversarial POS concurrency stress test failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
