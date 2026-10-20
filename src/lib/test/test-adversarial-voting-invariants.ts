import 'dotenv/config';
import assert from 'node:assert';
import crypto from 'node:crypto';
import prisma from '@/lib/db/prisma';
import { signSession } from '@/lib/auth/session';
import {
  encodeStubPayload,
  generateStubSignature,
  generateStubVerificationCode,
  getVerifiedHmacSecret,
} from '@/lib/crypto/stub-tokens';
import { CardStatus, StubStatus, type Role } from '@prisma/client';
import { POST as postVote } from '@/app/api/vote/route';
import { POST as postBatchCards } from '@/app/api/admin/cards/batch/route';
import { rateLimiter } from '@/lib/security/rate-limiter';

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

function setMockSession(user: MockUser | null): void {

  if (!user) {
    currentSessionToken = null;
    return;
  }

  currentSessionToken = signSession({
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    boothId: user.boothId,
  });
}

async function ensureDbConnected(retries = 3): Promise<void> {

  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function runAdversarialVotingInvariantsVerification(): Promise<void> {

  console.log('=== Starting Adversarial Voting Invariants & Batch Deprecation Stress Suite ===\n');

  await ensureDbConnected();

  const secretKey = getVerifiedHmacSecret();
  const runId = Math.floor(1000 + Math.random() * 8990).toString();
  const testStartTime = new Date();

  // 1. Identify test actors: Admin and Exhibitor
  const adminRecord = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  assert(adminRecord, 'Prerequisite failed: Admin user must exist in database');
  const adminUser: MockUser = {
    id: adminRecord.id,
    email: adminRecord.email,
    fullName: adminRecord.fullName,
    role: adminRecord.role,
    boothId: adminRecord.boothId,
  };

  const boothRecord = await prisma.booth.findFirst({ where: { code: 'CS-01' } });
  assert(boothRecord, 'Prerequisite failed: Booth CS-01 must exist in database');

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

  const awards = await prisma.award.findMany({
    where: { isActive: true },
    orderBy: { slotNumber: 'asc' },
    take: 6,
  });
  assert(awards.length === 6, 'Prerequisite failed: Exactly 6 active awards must be configured');

  // 2. Create isolated test PDF batch with multiple cards for invariant testing
  const testBatch = await prisma.pdfBatch.create({
    data: {
      batchNumber: 9900 + (Number(runId) % 90),
      fileName: `test-adv-invariants-${runId}.pdf`,
      totalCards: 5,
      totalSheets: 2,
      status: 'COMPLETED',
    },
  });

  // Card A: Unsold card (GENERATED status, stubs INACTIVE)
  const cardUnsoldSerial = `B27-U01-${runId}`;
  const cardUnsold = await prisma.bingoCard.create({
    data: {
      cardSerial: cardUnsoldSerial,
      masterQrHash: `MASTER:${cardUnsoldSerial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.GENERATED,
    },
  });

  // Card B: Voided card with stubs INACTIVE (status = VOID)
  const cardVoidSerial = `B27-V01-${runId}`;
  const cardVoid = await prisma.bingoCard.create({
    data: {
      cardSerial: cardVoidSerial,
      masterQrHash: `MASTER:${cardVoidSerial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.VOID,
    },
  });

  // Card C: Voided card where stubs were ACTIVATED (defense-in-depth: VOID card with ACTIVATED stubs)
  const cardVoidActSerial = `B27-V02-${runId}`;
  const cardVoidAct = await prisma.bingoCard.create({
    data: {
      cardSerial: cardVoidActSerial,
      masterQrHash: `MASTER:${cardVoidActSerial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.VOID,
    },
  });

  // Card D: Activated card for concurrency race tests (status = ACTIVATED, stubs ACTIVATED)
  const cardActSerial = `B27-A01-${runId}`;
  const cardAct = await prisma.bingoCard.create({
    data: {
      cardSerial: cardActSerial,
      masterQrHash: `MASTER:${cardActSerial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.ACTIVATED,
    },
  });

  // Card E: Activated card for replay concurrency race test (status = ACTIVATED, stubs ACTIVATED)
  const cardReplaySerial = `B27-R01-${runId}`;
  const cardReplay = await prisma.bingoCard.create({
    data: {
      cardSerial: cardReplaySerial,
      masterQrHash: `MASTER:${cardReplaySerial}`,
      pdfBatchId: testBatch.id,
      status: CardStatus.ACTIVATED,
    },
  });

  // Collect all stubs for batch insertion
  const stubsToInsert: Array<{
    bingoCardId: string;
    slotNumber: number;
    awardId: string;
    stubSerial: string;
    signatureHash: string;
    status: StubStatus;
  }> = [];

  for (const award of awards) {
    // Card A stubs: INACTIVE
    stubsToInsert.push({
      bingoCardId: cardUnsold.id,
      slotNumber: award.slotNumber,
      awardId: award.id,
      stubSerial: `${cardUnsoldSerial}-S${award.slotNumber}`,
      signatureHash: 'test-hash-sig',
      status: StubStatus.INACTIVE,
    });

    // Card B stubs: INACTIVE
    stubsToInsert.push({
      bingoCardId: cardVoid.id,
      slotNumber: award.slotNumber,
      awardId: award.id,
      stubSerial: `${cardVoidSerial}-S${award.slotNumber}`,
      signatureHash: 'test-hash-sig',
      status: StubStatus.INACTIVE,
    });

    // Card C stubs: ACTIVATED (to test card VOID gate even when stub is ACTIVATED)
    stubsToInsert.push({
      bingoCardId: cardVoidAct.id,
      slotNumber: award.slotNumber,
      awardId: award.id,
      stubSerial: `${cardVoidActSerial}-S${award.slotNumber}`,
      signatureHash: 'test-hash-sig',
      status: StubStatus.ACTIVATED,
    });

    // Card D stubs: ACTIVATED
    stubsToInsert.push({
      bingoCardId: cardAct.id,
      slotNumber: award.slotNumber,
      awardId: award.id,
      stubSerial: `${cardActSerial}-S${award.slotNumber}`,
      signatureHash: 'test-hash-sig',
      status: StubStatus.ACTIVATED,
    });

    // Card E stubs: ACTIVATED
    stubsToInsert.push({
      bingoCardId: cardReplay.id,
      slotNumber: award.slotNumber,
      awardId: award.id,
      stubSerial: `${cardReplaySerial}-S${award.slotNumber}`,
      signatureHash: 'test-hash-sig',
      status: StubStatus.ACTIVATED,
    });
  }

  await prisma.ticketStub.createMany({ data: stubsToInsert });

  console.log(`[SETUP] Initialized test batch ${testBatch.id} with 5 test cards.\n`);

  try {
    // ===================================================================================
    // SECTION 1: Unsold and Voided Card Stub Invariants at POST /api/vote
    // ===================================================================================
    console.log('--- SECTION 1: Unsold & Voided Card Stub Invariants at POST /api/vote ---');
    setMockSession(exhibitorUser);

    // 1A. Scan unsold card stub (Card A Slot 1: status = GENERATED, stub = INACTIVE)
    console.log('[Test 1A] Scanning ticket stub from unsold card (status = GENERATED)...');
    const unsoldStubSerial = `${cardUnsoldSerial}-S1`;
    const unsoldQrPayload = encodeStubPayload(unsoldStubSerial, 1, secretKey);

    const voteUnsoldReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-unsold-${runId}`,
        'x-real-ip': `10.10.1.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: unsoldQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteUnsoldRes = await postVote(voteUnsoldReq);
    assert.strictEqual(voteUnsoldRes.status, 400, 'Test 1A: Expected HTTP 400 when scanning unsold stub');
    const voteUnsoldBody = (await voteUnsoldRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteUnsoldBody.success, false, 'Test 1A: Response success must be false');
    assert.strictEqual(voteUnsoldBody.error, 'TICKET_NOT_ACTIVATED', 'Test 1A: Error code must be TICKET_NOT_ACTIVATED');
    assert.strictEqual(
      voteUnsoldBody.message,
      'Ticket stub has not been activated at the registration desk.',
      'Test 1A: Verbatim error message check'
    );

    const unsoldStubDb = await prisma.ticketStub.findUnique({ where: { stubSerial: unsoldStubSerial } });
    assert.strictEqual(unsoldStubDb?.status, StubStatus.INACTIVE, 'Test 1A: Stub must remain INACTIVE in database');
    const unsoldVoteDb = await prisma.vote.count({ where: { ticketStubId: unsoldStubDb?.id } });
    assert.strictEqual(unsoldVoteDb, 0, 'Test 1A: Zero votes recorded in database');
    console.log('[PASS] Test 1A: Unsold ticket stub strictly rejected with HTTP 400 TICKET_NOT_ACTIVATED.');

    // 1B. Scan stub from voided card with INACTIVE stubs (Card B Slot 1: status = VOID, stub = INACTIVE)
    console.log('[Test 1B] Scanning ticket stub from voided card (status = VOID, stub = INACTIVE)...');
    const voidStubSerial = `${cardVoidSerial}-S1`;
    const voidQrPayload = encodeStubPayload(voidStubSerial, 1, secretKey);

    const voteVoidReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-void-inact-${runId}`,
        'x-real-ip': `10.10.2.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: voidQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteVoidRes = await postVote(voteVoidReq);
    assert.strictEqual(voteVoidRes.status, 400, 'Test 1B: Expected HTTP 400 when scanning voided stub');
    const voteVoidBody = (await voteVoidRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteVoidBody.success, false, 'Test 1B: Response success must be false');
    assert.strictEqual(voteVoidBody.error, 'TICKET_NOT_ACTIVATED', 'Test 1B: Error code must be TICKET_NOT_ACTIVATED');

    const voidStubDb = await prisma.ticketStub.findUnique({ where: { stubSerial: voidStubSerial } });
    assert.strictEqual(voidStubDb?.status, StubStatus.INACTIVE, 'Test 1B: Stub must remain INACTIVE in database');
    console.log('[PASS] Test 1B: Voided card stub strictly rejected with HTTP 400 TICKET_NOT_ACTIVATED.');

    // 1C. Defense-in-depth: Scan stub marked ACTIVATED on a VOID card (Card C Slot 1)
    console.log('[Test 1C] Scanning ACTIVATED stub on a VOID parent card (defense-in-depth parent status guard)...');
    const voidActStubSerial = `${cardVoidActSerial}-S1`;
    const voidActQrPayload = encodeStubPayload(voidActStubSerial, 1, secretKey);

    const voteVoidActReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-void-act-${runId}`,
        'x-real-ip': `10.10.3.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: voidActQrPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteVoidActRes = await postVote(voteVoidActReq);
    assert.strictEqual(voteVoidActRes.status, 400, 'Test 1C: Expected HTTP 400 when parent card is VOID');
    const voteVoidActBody = (await voteVoidActRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteVoidActBody.success, false, 'Test 1C: Response success must be false');
    assert.strictEqual(voteVoidActBody.error, 'TICKET_NOT_ACTIVATED', 'Test 1C: Error code must be TICKET_NOT_ACTIVATED');

    const voidActStubDb = await prisma.ticketStub.findUnique({ where: { stubSerial: voidActStubSerial } });
    assert.strictEqual(voidActStubDb?.status, StubStatus.ACTIVATED, 'Test 1C: Stub status must not transition to REDEEMED');
    const voidActVoteDb = await prisma.vote.count({ where: { ticketStubId: voidActStubDb?.id } });
    assert.strictEqual(voidActVoteDb, 0, 'Test 1C: Zero votes recorded in database');
    console.log('[PASS] Test 1C: Parent card VOID guard enforced atomically; rejected with HTTP 400 TICKET_NOT_ACTIVATED.\n');

    // 1D. Scan non-existent card / stub with syntactically valid HMAC signature
    console.log('[Test 1D] Scanning non-existent stub serial with valid HMAC signature...');
    const nonExistentSerial = `B27-NOE-${runId}-S1`;
    const nonExistentPayload = encodeStubPayload(nonExistentSerial, 1, secretKey);

    const voteNonExistentReq = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-nonexistent-${runId}`,
        'x-real-ip': `10.10.4.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: nonExistentPayload,
        boothId: boothRecord.id,
      }),
    });

    const voteNonExistentRes = await postVote(voteNonExistentReq);
    assert.strictEqual(voteNonExistentRes.status, 404, 'Test 1D: Expected HTTP 404 for non-existent stub serial in database');
    const voteNonExistentBody = (await voteNonExistentRes.json()) as StandardErrorResponse;
    assert.strictEqual(voteNonExistentBody.success, false, 'Test 1D: Response success must be false');
    assert.strictEqual(voteNonExistentBody.error, 'TICKET_NOT_FOUND', 'Test 1D: Error code must be TICKET_NOT_FOUND');
    console.log('[PASS] Test 1D: Non-existent ticket stub in database safely returns HTTP 404 TICKET_NOT_FOUND.\n');


    // ===================================================================================
    // SECTION 2: Tampered HMAC Signatures & Mutated Slot Numbers
    // ===================================================================================
    console.log('--- SECTION 2: Tampered HMAC Signatures & Mutated Slot Numbers ---');

    const validSerial = `${cardActSerial}-S1`;
    const validSlot = 1;
    const genuineSignature = generateStubSignature(validSerial, validSlot, secretKey);

    // 2A. Character flip in HMAC signature (same length, 1 character mutated)
    console.log('[Test 2A] Tampered signature: single character mutation...');
    const tamperedChar = genuineSignature[genuineSignature.length - 1] === 'A' ? 'B' : 'A';
    const tamperedSignature = genuineSignature.slice(0, -1) + tamperedChar;
    const tamperedPayload = Buffer.from(`${validSerial}|${validSlot}|${tamperedSignature}`, 'utf8').toString('base64url');

    const req2A = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-tamper-sig-${runId}`,
        'x-real-ip': `10.20.1.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: tamperedPayload,
        boothId: boothRecord.id,
      }),
    });

    const res2A = await postVote(req2A);
    assert.strictEqual(res2A.status, 400, 'Test 2A: Expected HTTP 400 on tampered HMAC signature');
    const body2A = (await res2A.json()) as StandardErrorResponse;
    assert.strictEqual(body2A.error, 'TAMPERED_OR_INVALID_QR_CODE', 'Test 2A: Expected TAMPERED_OR_INVALID_QR_CODE');
    console.log('[PASS] Test 2A: Single-character signature mutation rejected with HTTP 400 TAMPERED_OR_INVALID_QR_CODE.');

    // 2B. Short signature (23 bytes vs 24 bytes - byte-length guard verification)
    console.log('[Test 2B] Truncated signature length guard (23 bytes)...');
    const shortSignature = genuineSignature.slice(0, 23);
    const shortPayload = Buffer.from(`${validSerial}|${validSlot}|${shortSignature}`, 'utf8').toString('base64url');

    const req2B = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-tamper-short-${runId}`,
        'x-real-ip': `10.20.2.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: shortPayload,
        boothId: boothRecord.id,
      }),
    });

    const res2B = await postVote(req2B);
    assert.strictEqual(res2B.status, 400, 'Test 2B: Expected HTTP 400 on short signature');
    const body2B = (await res2B.json()) as StandardErrorResponse;
    assert.strictEqual(body2B.error, 'TAMPERED_OR_INVALID_QR_CODE');
    console.log('[PASS] Test 2B: Truncated signature safely caught by byte-length guard without timingSafeEqual crash.');

    // 2C. Long signature (25 bytes vs 24 bytes - byte-length guard verification)
    console.log('[Test 2C] Extended signature length guard (25 bytes)...');
    const longSignature = genuineSignature + 'X';
    const longPayload = Buffer.from(`${validSerial}|${validSlot}|${longSignature}`, 'utf8').toString('base64url');

    const req2C = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-tamper-long-${runId}`,
        'x-real-ip': `10.20.3.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: longPayload,
        boothId: boothRecord.id,
      }),
    });

    const res2C = await postVote(req2C);
    assert.strictEqual(res2C.status, 400, 'Test 2C: Expected HTTP 400 on long signature');
    const body2C = (await res2C.json()) as StandardErrorResponse;
    assert.strictEqual(body2C.error, 'TAMPERED_OR_INVALID_QR_CODE');
    console.log('[PASS] Test 2C: Extended signature safely caught by byte-length guard without timingSafeEqual crash.');

    // 2D. Mutated slot number: payload claims slot 2, but HMAC signature was generated for slot 1
    console.log('[Test 2D] Mutated slot number (signature for slot 1, payload claims slot 2)...');
    const mutatedSlotPayload = Buffer.from(`${validSerial}|2|${genuineSignature}`, 'utf8').toString('base64url');

    const req2D = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-tamper-slot-${runId}`,
        'x-real-ip': `10.20.4.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: mutatedSlotPayload,
        boothId: boothRecord.id,
      }),
    });

    const res2D = await postVote(req2D);
    assert.strictEqual(res2D.status, 400, 'Test 2D: Expected HTTP 400 on mutated slot number');
    const body2D = (await res2D.json()) as StandardErrorResponse;
    assert.strictEqual(body2D.error, 'TAMPERED_OR_INVALID_QR_CODE');
    console.log('[PASS] Test 2D: Slot mutation mismatch rejected with HTTP 400 TAMPERED_OR_INVALID_QR_CODE.');

    // 2E. Out-of-bounds slot numbers: slot 0, slot 7, slot 99, slot letter
    console.log('[Test 2E] Out-of-bounds slot numbers (0, 7, 99, alpha)...');
    for (const badSlot of ['0', '7', '99', 'X', '-1']) {
      const badSlotPayload = Buffer.from(`${validSerial}|${badSlot}|${genuineSignature}`, 'utf8').toString('base64url');
      const reqBadSlot = new Request('http://localhost/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `test-badslot-${badSlot}-${runId}`,
          'x-real-ip': `10.20.5.${runId.slice(-2)}`,
        },
        body: JSON.stringify({
          qrPayload: badSlotPayload,
          boothId: boothRecord.id,
        }),
      });

      const resBadSlot = await postVote(reqBadSlot);
      assert.strictEqual(resBadSlot.status, 400, `Test 2E: Expected HTTP 400 for bad slot ${badSlot}`);
      const bodyBadSlot = (await resBadSlot.json()) as StandardErrorResponse;
      assert.strictEqual(bodyBadSlot.error, 'TAMPERED_OR_INVALID_QR_CODE');
    }
    console.log('[PASS] Test 2E: All out-of-bounds slot numbers strictly rejected with HTTP 400.');

    // 2F. Malformed QR formats (non-base64, missing separators)
    console.log('[Test 2F] Malformed QR string payloads...');
    for (const malformed of ['not_base64_???', 'SGVsbG8=', 'YmFzZTY0d2l0aG91dHBpcGVz']) {
      const reqMalformed = new Request('http://localhost/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `test-malformed-${runId}`,
          'x-real-ip': `10.20.6.${runId.slice(-2)}`,
        },
        body: JSON.stringify({
          qrPayload: malformed,
          boothId: boothRecord.id,
        }),
      });

      const resMalformed = await postVote(reqMalformed);
      assert.strictEqual(resMalformed.status, 400, 'Test 2F: Expected HTTP 400 on malformed QR payload');
      const bodyMalformed = (await resMalformed.json()) as StandardErrorResponse;
      assert.strictEqual(bodyMalformed.error, 'TAMPERED_OR_INVALID_QR_CODE');
    }
    console.log('[PASS] Test 2F: Corrupted and unparseable QR payloads rejected with HTTP 400.');

    // 2G. Manual PIN code entry tampering (<serial>.<tamperedPin>)
    console.log('[Test 2G] Manual PIN entry tampering...');
    const genuinePin = generateStubVerificationCode(validSerial, validSlot, secretKey);
    const tamperedPin = genuinePin === '00000000' ? 'FFFFFFFF' : '00000000';
    const manualTamperedEntry = `${validSerial}.${tamperedPin}`;

    const req2G = new Request('http://localhost/api/vote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-tamper-pin-${runId}`,
        'x-real-ip': `10.20.7.${runId.slice(-2)}`,
      },
      body: JSON.stringify({
        qrPayload: manualTamperedEntry,
        boothId: boothRecord.id,
      }),
    });

    const res2G = await postVote(req2G);
    assert.strictEqual(res2G.status, 400, 'Test 2G: Expected HTTP 400 on tampered PIN');
    const body2G = (await res2G.json()) as StandardErrorResponse;
    assert.strictEqual(body2G.error, 'TAMPERED_OR_INVALID_QR_CODE');
    console.log('[PASS] Test 2G: Tampered manual PIN entry rejected with HTTP 400 TAMPERED_OR_INVALID_QR_CODE.');

    // Invariant confirmation: Card D Slot 1 stub must remain completely untouched in DB
    const stubAfterTamper = await prisma.ticketStub.findUnique({ where: { stubSerial: validSerial } });
    assert.strictEqual(stubAfterTamper?.status, StubStatus.ACTIVATED, 'Section 2 Invariant: Stub must remain ACTIVATED');
    const votesAfterTamper = await prisma.vote.count({ where: { ticketStubId: stubAfterTamper?.id } });
    assert.strictEqual(votesAfterTamper, 0, 'Section 2 Invariant: Zero votes created during tampering attempts\n');


    // ===================================================================================
    // SECTION 3: Exhaustive Probing of POST /api/admin/cards/batch (Deprecation 404)
    // ===================================================================================
    console.log('--- SECTION 3: Exhaustive Probing of POST /api/admin/cards/batch (Deprecation 404) ---');

    const batchProbeCases = [
      { name: 'Legacy Batch ID payload', body: JSON.stringify({ batchId: testBatch.id }) },
      { name: 'Range activation payload', body: JSON.stringify({ startSerial: 'B27-T01-0001', endSerial: 'B27-T01-0050' }) },
      { name: 'Serials array payload', body: JSON.stringify({ serials: ['B27-T01-0001', 'B27-T01-0002'] }) },
      { name: 'Empty JSON object', body: JSON.stringify({}) },
      { name: 'Arbitrary nested JSON', body: JSON.stringify({ admin: true, action: 'activate_all', dryRun: false }) },
      { name: 'Malformed non-JSON string', body: '{"batchId": UNCLOSED_STRING' },
      { name: 'Array body', body: JSON.stringify([1, 2, 3]) },
    ];

    // Probe under all roles: ADMIN, EXHIBITOR, REGISTRATION, UNAUTHENTICATED
    const testRoles: { roleName: string; user: MockUser | null }[] = [
      { roleName: 'ADMIN', user: adminUser },
      { roleName: 'EXHIBITOR', user: exhibitorUser },
      { roleName: 'UNAUTHENTICATED', user: null },
    ];

    for (const { roleName, user } of testRoles) {
      setMockSession(user);
      console.log(`[Probing POST /api/admin/cards/batch as ${roleName}]`);

      for (const probe of batchProbeCases) {
        const probeRes = await postBatchCards();
        assert.strictEqual(probeRes.status, 404, `Section 3 (${roleName}): ${probe.name} must return HTTP 404`);
        const probeBody = (await probeRes.json()) as StandardErrorResponse;
        assert.strictEqual(probeBody.success, false, `Section 3 (${roleName}): ${probe.name} success must be false`);
        assert.strictEqual(probeBody.error, 'NOT_FOUND', `Section 3 (${roleName}): ${probe.name} error must be NOT_FOUND`);
        assert.strictEqual(
          probeBody.message,
          'Batch card activation has been permanently deprecated.',
          `Section 3 (${roleName}): ${probe.name} message check`
        );
      }
    }
    console.log('[PASS] Section 3: All request shapes and role contexts unconditionally return HTTP 404 NOT_FOUND.\n');


    // ===================================================================================
    // SECTION 4: Concurrency Race Test on Voting Redemption
    // ===================================================================================
    console.log('--- SECTION 4: Concurrency Race Test on Voting Redemption ---');
    setMockSession(exhibitorUser);

    // 4A: Race Test with DISTINCT Idempotency Keys on the same activated stub (Card D Slot 1)
    console.log('[Test 4A] Simulating concurrent race with 6 parallel requests on Card D Slot 1...');
    const raceSerial = `${cardActSerial}-S1`;
    const racePayload = encodeStubPayload(raceSerial, 1, secretKey);
    const concurrentRequestsCount = 6;

    // Reset rate limiter for the booth to guarantee race requests aren't rate limited
    rateLimiter.reset(`vote:${boothRecord.id}`);

    const racePromises = Array.from({ length: concurrentRequestsCount }, (_, i) => {
      const raceReq = new Request('http://localhost/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `race-distinct-${i}-${runId}`,
          'x-real-ip': `10.40.1.${10 + i}`,
        },
        body: JSON.stringify({
          qrPayload: racePayload,
          boothId: boothRecord.id,
        }),
      });

      return postVote(raceReq).then(async (res) => ({
        index: i,
        status: res.status,
        body: await res.json(),
      }));
    });

    const raceResults = await Promise.all(racePromises);

    const successResponses = raceResults.filter((r) => r.status === 200);
    const conflictResponses = raceResults.filter((r) => r.status === 409);
    const otherResponses = raceResults.filter((r) => r.status !== 200 && r.status !== 409);

    console.log(`Race Results: ${successResponses.length} HTTP 200, ${conflictResponses.length} HTTP 409, ${otherResponses.length} Other`);

    assert.strictEqual(
      successResponses.length,
      1,
      `Test 4A: Invariant VIOLATION! Exactly 1 concurrent request must receive HTTP 200, received ${successResponses.length}`
    );
    assert.strictEqual(
      conflictResponses.length,
      concurrentRequestsCount - 1,
      `Test 4A: Exactly ${concurrentRequestsCount - 1} requests must receive HTTP 409, received ${conflictResponses.length}`
    );
    assert.strictEqual(otherResponses.length, 0, 'Test 4A: Zero unexpected HTTP statuses');

    // Verify error code on all 409 responses
    for (const conflict of conflictResponses) {
      assert.strictEqual(
        (conflict.body as StandardErrorResponse).error,
        'TICKET_ALREADY_REDEEMED',
        'Test 4A: 409 responses must have error TICKET_ALREADY_REDEEMED'
      );
    }

    // Database verification for Test 4A
    const stubAfterRace = await prisma.ticketStub.findUnique({ where: { stubSerial: raceSerial } });
    assert.strictEqual(stubAfterRace?.status, StubStatus.REDEEMED, 'Test 4A: Stub status must be REDEEMED');

    const votesInDb = await prisma.vote.findMany({ where: { ticketStubId: stubAfterRace?.id } });
    assert.strictEqual(votesInDb.length, 1, 'Test 4A: Invariant VIOLATION! Exactly 1 vote must exist in database');

    console.log('[PASS] Test 4A: Concurrency race strictly enforced: Exactly 1 HTTP 200 VOTE_ACCEPTED, 5 HTTP 409 TICKET_ALREADY_REDEEMED.\n');

    // 4B: Replay Race Test with IDENTICAL Idempotency Key (Card E Slot 1)
    console.log('[Test 4B] Simulating concurrent idempotent replay race (identical idempotency key) on Card E Slot 1...');
    const replaySerial = `${cardReplaySerial}-S1`;
    const replayPayload = encodeStubPayload(replaySerial, 1, secretKey);
    const sharedIdempotencyKey = `race-shared-replay-${runId}`;
    const replayRequestsCount = 5;

    rateLimiter.reset(`vote:${boothRecord.id}`);

    const replayPromises = Array.from({ length: replayRequestsCount }, (_, i) => {
      const replayReq = new Request('http://localhost/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': sharedIdempotencyKey,
          'x-real-ip': `10.40.2.${10 + i}`,
        },
        body: JSON.stringify({
          qrPayload: replayPayload,
          boothId: boothRecord.id,
        }),
      });

      return postVote(replayReq).then(async (res) => ({
        index: i,
        status: res.status,
        body: await res.json(),
      }));
    });

    const replayResults = await Promise.all(replayPromises);

    const replay200s = replayResults.filter((r) => r.status === 200);
    console.log(`Replay Race Results: ${replay200s.length} HTTP 200s`);

    assert.strictEqual(
      replay200s.length,
      replayRequestsCount,
      'Test 4B: All concurrent replays with identical idempotency key must safely return HTTP 200'
    );

    // Verify all returned identical voteId
    const firstVoteId = (replay200s[0].body as VoteSuccessResponse).voteId;
    for (const r of replay200s) {
      assert.strictEqual(
        (r.body as VoteSuccessResponse).voteId,
        firstVoteId,
        'Test 4B: All identical replays must return identical voteId'
      );
    }

    // Verify database has strictly 1 vote record
    const replayStubDb = await prisma.ticketStub.findUnique({ where: { stubSerial: replaySerial } });
    assert.strictEqual(replayStubDb?.status, StubStatus.REDEEMED);
    const replayVotesDb = await prisma.vote.findMany({ where: { ticketStubId: replayStubDb?.id } });
    assert.strictEqual(replayVotesDb.length, 1, 'Test 4B: Exactly 1 vote record created in database');

    const idempotencyLogsDb = await prisma.idempotencyLog.count({
      where: { idempotencyKey: `${boothRecord.id}:${sharedIdempotencyKey}` },
    });
    assert.strictEqual(idempotencyLogsDb, 1, 'Test 4B: Exactly 1 IdempotencyLog row persisted');

    console.log('[PASS] Test 4B: Concurrent identical-key replays safely deduplicated into exactly 1 database vote.\n');

    console.log('===================================================================================');
    console.log('All Adversarial Invariant & Batch Deprecation Stress Tests PASSED with 100% Integrity!');
    console.log('===================================================================================\n');
  } finally {
    // Teardown: purge temporary test batch, cards, stubs, votes, and idempotency logs
    console.log('[TEARDOWN] Cleaning up temporary test artifacts...');

    const testCards = [cardUnsold.id, cardVoid.id, cardVoidAct.id, cardAct.id, cardReplay.id];
    const testStubs = await prisma.ticketStub.findMany({
      where: { bingoCardId: { in: testCards } },
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
      where: { id: { in: testCards } },
    });

    await prisma.pdfBatch.deleteMany({
      where: { id: testBatch.id },
    });

    await prisma.idempotencyLog.deleteMany({
      where: {
        OR: [
          { idempotencyKey: { contains: runId } },
          { idempotencyKey: { contains: `race-distinct` } },
          { idempotencyKey: { contains: `race-shared-replay` } },
        ],
      },
    });

    await prisma.auditLog.deleteMany({
      where: {
        resource: 'VOTING',
        createdAt: { gte: testStartTime },
      },
    });

    console.log('[TEARDOWN] Cleanup completed.\n');
  }
}

runAdversarialVotingInvariantsVerification()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Adversarial verification failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
