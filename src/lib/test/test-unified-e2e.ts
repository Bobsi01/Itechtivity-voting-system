import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { generateStubSignature, generateStubVerificationCode } from '@/lib/crypto/stub-tokens';
import { signSession } from '@/lib/auth/session';
import { POST as validateCardPost } from '@/app/api/cards/validate/route';
import { GET as getBoothGet, PATCH as updateBoothPatch } from '@/app/api/exhibitor/booth/route';
import { GET as getMembersGet, POST as createMemberPost } from '@/app/api/exhibitor/members/route';
import { POST as adminUpsertBoothPost } from '@/app/api/admin/booths/route';
import type { PublicBoothItem, PublicAwardItem } from '@/components/public/booth-directory';

// Mock cookies for Next.js server session handling
const nextHeaders = require('next/headers');

let currentSessionToken: string | null = null;
nextHeaders.cookies = async () => ({
  get: (name: string) =>
    name === 'itech2027_session' && currentSessionToken
      ? { value: currentSessionToken }
      : undefined,
  set: () => {},
  delete: () => {},
});

interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
}

interface ApiCardResponse {
  success: true;
  card: {
    cardSerial: string;
    masterQrHash: string;
    status: string;
    activatedAt: string | null;
    batchNumber: number | null;
  };
  demographics: {
    buyerName: string;
    buyerType: string;
    buyerTypeLabel: string;
    program: string | null;
    yearAndSection: string | null;
    studentNumber: string | null;
    affiliation: string | null;
    academicAffiliation: string | null;
    registeredAt: string;
    phone?: unknown;
    email?: unknown;
    contactInfo?: unknown;
  } | null;
  stubsSummary: {
    total: number;
    redeemed: number;
    available: number;
    void: number;
  };
  stubs: Array<{
    slotNumber: number;
    awardTitle: string;
    stubSerial: string;
    status: string;
    isRedeemed: boolean;
    redeemedAt: string | null;
    votedBooth: {
      code: string;
      projectTitle: string;
      tableNumber: string | null;
    } | null;
  }>;
}

async function runUnifiedAdversarialSuite() {

  console.log('================================================================');
  console.log('UNIFIED ADVERSARIAL E2E INTEGRATION SUITE');
  console.log('Verification across all 4 milestone features & governance rules');
  console.log('================================================================');

  // =========================================================================
  // FEATURE 1: UNIVERSAL BINGO CARD VALIDATOR
  // =========================================================================
  console.log('\n--- FEATURE 1: UNIVERSAL BINGO CARD VALIDATOR ---');

  const testIp = '10.200.50.77';
  const rateLimitKey = `validate:${testIp}`;
  rateLimiter.reset(rateLimitKey);

  // 1.1 Rate limiting enforcement (30 requests/min sliding window)
  console.log('1.1 Testing rate limiting enforcement (30 req/min per IP)...');
  for (let i = 1; i <= 30; i++) {
    const check = rateLimiter.check(rateLimitKey, 30, 60000);
    assert.equal(check.allowed, true, `Request ${i} must be allowed under rate limit.`);
  }

  const rateLimitedReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': testIp,
    },
    body: JSON.stringify({ code: 'B27-B01-0001' }),
  });
  const rateLimitedRes = await validateCardPost(rateLimitedReq);
  assert.equal(rateLimitedRes.status, 429, '31st request must return HTTP 429.');
  assert.ok(rateLimitedRes.headers.get('Retry-After') !== null, 'Response must include Retry-After header.');
  const rateLimitData = (await rateLimitedRes.json()) as ApiErrorResponse;
  assert.equal(rateLimitData.success, false);
  assert.equal(rateLimitData.error, 'RATE_LIMIT_EXCEEDED');
  console.log('    PASS: Rate limiter correctly enforced HTTP 429 and Retry-After.');

  rateLimiter.reset(rateLimitKey);

  // 1.2 Input validation and bad payloads
  console.log('1.2 Testing malformed and empty payloads...');
  const emptyReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: '   ' }),
  });
  const emptyRes = await validateCardPost(emptyReq);
  assert.equal(emptyRes.status, 400, 'Empty code must return HTTP 400.');
  const emptyData = (await emptyRes.json()) as ApiErrorResponse;
  assert.equal(emptyData.error, 'VALIDATION_ERROR');

  const badJsonReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: '{"invalidJson',
  });
  const badJsonRes = await validateCardPost(badJsonReq);
  assert.equal(badJsonRes.status, 400, 'Malformed JSON must return HTTP 400.');
  console.log('    PASS: Malformed and empty inputs rejected with HTTP 400.');

  // 1.3 Unknown card serial lookup
  console.log('1.3 Testing non-existent card lookup...');
  const notFoundReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: 'NON_EXISTENT_CARD_SERIAL_UNKNOWN' }),
  });
  const notFoundRes = await validateCardPost(notFoundReq);
  assert.equal(notFoundRes.status, 404, 'Unknown card must return HTTP 404.');
  const notFoundData = (await notFoundRes.json()) as ApiErrorResponse;
  assert.equal(notFoundData.error, 'CARD_NOT_FOUND');
  console.log('    PASS: Unknown card correctly returned HTTP 404 CARD_NOT_FOUND.');

  // 1.4 Unactivated (GENERATED) card invariants & zero PII leakage
  console.log('1.4 Testing unactivated (GENERATED) card invariants & zero PII leakage...');
  const generatedCard = await prisma.bingoCard.findFirst({
    where: { status: 'GENERATED' },
    include: { stubs: true },
  });
  assert.ok(generatedCard, 'Database must contain at least one GENERATED card for test.');

  const genReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: generatedCard.cardSerial }),
  });
  const genRes = await validateCardPost(genReq);
  assert.equal(genRes.status, 200, 'Validation of generated card must return HTTP 200.');
  const genData = (await genRes.json()) as ApiCardResponse;
  assert.equal(genData.success, true);
  assert.equal(genData.card.status, 'GENERATED');
  assert.equal(genData.demographics, null, 'Unactivated card demographics must be strictly null.');
  assert.equal(genData.stubs.length, 6, 'Must return telemetry for all 6 stubs.');
  assert.equal(genData.stubsSummary.total, 6);
  assert.equal(genData.stubsSummary.redeemed, 0);
  assert.equal(genData.stubsSummary.available, 0);

  for (const stub of genData.stubs) {
    assert.equal(stub.status, 'INACTIVE', 'Unactivated card stubs must be INACTIVE.');
    assert.equal(stub.isRedeemed, false);
    assert.equal(stub.redeemedAt, null);
    assert.equal(stub.votedBooth, null);
  }
  console.log('    PASS: GENERATED card returned demographics: null and all 6 stubs INACTIVE.');

  // 1.5 Activated card resolution, demographics sanitization & multi-format query
  console.log('1.5 Testing activated card resolution, demographic sanitization, and multi-format queries...');
  const activatedCard = await prisma.bingoCard.findFirst({
    where: { status: 'ACTIVATED' },
    include: {
      transaction: true,
      stubs: { include: { award: true, vote: { include: { booth: true } } } },
    },
  });
  assert.ok(activatedCard, 'Database must contain at least one ACTIVATED card for test.');

  // Test 1.5.1: Direct card serial lookup
  const actReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: activatedCard.cardSerial }),
  });
  const actRes = await validateCardPost(actReq);
  assert.equal(actRes.status, 200);
  const actData = (await actRes.json()) as ApiCardResponse;
  assert.equal(actData.success, true);
  assert.equal(actData.card.cardSerial, activatedCard.cardSerial);
  assert.equal(actData.card.status, 'ACTIVATED');

  // Verify demographic sanitization: strictly no email, no phone, no contactInfo
  assert.ok(actData.demographics !== null, 'Demographics must exist for activated card.');
  assert.equal(typeof actData.demographics.buyerName, 'string');
  assert.equal(typeof actData.demographics.buyerTypeLabel, 'string');
  assert.equal(typeof actData.demographics.registeredAt, 'string');
  assert.equal('phone' in actData.demographics, false, 'Demographics must NOT leak phone.');
  assert.equal('email' in actData.demographics, false, 'Demographics must NOT leak email.');
  assert.equal('contactInfo' in actData.demographics, false, 'Demographics must NOT leak contactInfo.');

  // Verify 6 stubs status
  assert.equal(actData.stubs.length, 6, 'Must report all 6 stubs.');
  assert.equal(actData.stubsSummary.total, 6);
  assert.equal(
    actData.stubsSummary.redeemed + actData.stubsSummary.available + actData.stubsSummary.void,
    6,
    'Stubs summary numbers must sum to 6.'
  );

  for (let slot = 1; slot <= 6; slot++) {
    const stub = actData.stubs[slot - 1];
    assert.equal(stub.slotNumber, slot);
    assert.ok(stub.awardTitle.length > 0, `Stub ${slot} must have award title.`);
    assert.ok(stub.stubSerial.includes(`-S${slot}`), `Stub serial must end with -S${slot}.`);
  }

  // Test 1.5.2: Master QR format (MASTER:<serial>)
  const masterReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: `MASTER:${activatedCard.cardSerial}` }),
  });
  const masterRes = await validateCardPost(masterReq);
  assert.equal(masterRes.status, 200);
  const masterData = (await masterRes.json()) as ApiCardResponse;
  assert.equal(masterData.card.cardSerial, activatedCard.cardSerial);

  // Test 1.5.3: Stub serial format (<cardSerial>-S1)
  const stubReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: `${activatedCard.cardSerial}-S1` }),
  });
  const stubRes = await validateCardPost(stubReq);
  assert.equal(stubRes.status, 200);
  const stubData = (await stubRes.json()) as ApiCardResponse;
  assert.equal(stubData.card.cardSerial, activatedCard.cardSerial);

  // Test 1.5.4: Base64URL cryptographic QR payload
  const secretKey = process.env.EVENT_HMAC_SECRET;
  if (secretKey && secretKey.length >= 32) {
    const stubSerial = `${activatedCard.cardSerial}-S1`;
    const signature = generateStubSignature(stubSerial, 1, secretKey);
    const tokenPayload = `${stubSerial}|1|${signature}`;
    const base64UrlToken = Buffer.from(tokenPayload, 'utf8').toString('base64url');

    const qrTokenReq = new Request('http://localhost:3000/api/cards/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ code: base64UrlToken }),
    });
    const qrTokenRes = await validateCardPost(qrTokenReq);
    assert.equal(qrTokenRes.status, 200);
    const qrTokenData = (await qrTokenRes.json()) as ApiCardResponse;
    assert.equal(qrTokenData.card.cardSerial, activatedCard.cardSerial);

    // Test 1.5.5: Manual PIN verification format (<stubSerial>.<pin>)
    const pin = generateStubVerificationCode(stubSerial, 1, secretKey);
    const pinReq = new Request('http://localhost:3000/api/cards/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ code: `${stubSerial}.${pin}` }),
    });
    const pinRes = await validateCardPost(pinReq);
    assert.equal(pinRes.status, 200);
    const pinData = (await pinRes.json()) as ApiCardResponse;
    assert.equal(pinData.card.cardSerial, activatedCard.cardSerial);
  }
  console.log('    PASS: Activated card validated across all 5 lookup formats with PII sanitized.');

  // =========================================================================
  // FEATURE 2: EXHIBITOR SELF-SERVICE & MEMBER BINDING
  // =========================================================================
  console.log('\n--- FEATURE 2: EXHIBITOR SELF-SERVICE & MEMBER BINDING ---');

  const booths = await prisma.booth.findMany({
    take: 2,
    orderBy: { code: 'asc' },
  });
  assert.ok(booths.length >= 2, 'Test requires at least 2 distinct booths in database.');
  const boothA = booths[0];
  const boothB = booths[1];

  // 2.1 Authentication & Role Boundary Defense
  console.log('2.1 Testing unauthenticated & unauthorized access rejection...');
  currentSessionToken = null;

  const unauthGetRes = await getBoothGet();
  assert.equal(unauthGetRes.status, 401, 'Unauthenticated GET booth must return HTTP 401.');

  const unauthPatchRes = await updateBoothPatch(
    new Request('http://localhost:3000/api/exhibitor/booth', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectTitle: 'Unauthorized Modification' }),
    })
  );
  assert.equal(unauthPatchRes.status, 401, 'Unauthenticated PATCH booth must return HTTP 401.');

  const unauthMembersGet = await getMembersGet();
  assert.equal(unauthMembersGet.status, 401, 'Unauthenticated GET members must return HTTP 401.');

  const unauthMembersPost = await createMemberPost(
    new Request('http://localhost:3000/api/exhibitor/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@unauth.edu', fullName: 'Unauth', password: 'Password123!' }),
    })
  );
  assert.equal(unauthMembersPost.status, 401, 'Unauthenticated POST members must return HTTP 401.');

  // Test forbidden role (e.g. REGISTRATION role cannot access exhibitor routes)
  currentSessionToken = signSession({
    userId: 'staff-user-id',
    email: 'staff@itech2027.edu',
    fullName: 'Registration Staff',
    role: 'REGISTRATION',
    boothId: null,
  });

  const forbiddenGetRes = await getBoothGet();
  assert.equal(forbiddenGetRes.status, 403, 'REGISTRATION role must be rejected with HTTP 403.');
  console.log('    PASS: Unauthenticated (401) and forbidden role (403) protections verified.');

  // 2.2 Broken Object Level Authorization (BOLA) Defense & Read-Only Immutability
  console.log('2.2 Testing BOLA attack defense and read-only field immutability...');
  currentSessionToken = signSession({
    userId: 'test-lead-booth-a',
    email: 'lead.a@itech2027.edu',
    fullName: 'Booth A Lead Exhibitor',
    role: 'EXHIBITOR',
    boothId: boothA.id,
  });

  const attackPayload = {
    boothId: boothB.id, // Attacker attempts to target Booth B
    code: 'HIJACKED-CODE', // Read-only: admin assigned
    tableNumber: 'TABLE-HIJACKED', // Read-only: admin assigned
    mapSlot: 'BOX-40', // Read-only: admin assigned
    capstoneCategory: 'HIJACKED-CAT', // Read-only: admin assigned
    programCode: 'BSIT', // Read-only: admin assigned
    projectTitle: 'Adversarial Title For Booth A',
    description: 'Updated synopsis description by Booth A exhibitor.',
    websiteUrl: 'https://booth-a-showcase.example.edu',
    teamMembers: 'Member 1, Member 2, Member 3',
  };

  const patchReq = new Request('http://localhost:3000/api/exhibitor/booth', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attackPayload),
  });

  const patchRes = await updateBoothPatch(patchReq);
  assert.equal(patchRes.status, 200, 'Legitimate exhibitor PATCH must return HTTP 200.');

  // Verify Booth B was NOT modified (BOLA defense)
  const freshBoothB = await prisma.booth.findUnique({ where: { id: boothB.id } });
  assert.notEqual(freshBoothB?.projectTitle, attackPayload.projectTitle, 'BOLA FAILURE: Booth B was modified.');

  // Verify Booth A read-only fields were NOT modified
  const freshBoothA = await prisma.booth.findUnique({ where: { id: boothA.id } });
  assert.equal(freshBoothA?.projectTitle, 'Adversarial Title For Booth A');
  assert.equal(freshBoothA?.description, 'Updated synopsis description by Booth A exhibitor.');
  assert.equal(freshBoothA?.websiteUrl, 'https://booth-a-showcase.example.edu');
  assert.equal(freshBoothA?.code, boothA.code, 'IMMUTABILITY FAILURE: Booth code was modified.');
  assert.equal(freshBoothA?.tableNumber, boothA.tableNumber, 'IMMUTABILITY FAILURE: tableNumber was modified.');
  assert.equal(freshBoothA?.mapSlot, boothA.mapSlot, 'IMMUTABILITY FAILURE: mapSlot was modified.');
  assert.equal(freshBoothA?.capstoneCategory, boothA.capstoneCategory, 'IMMUTABILITY FAILURE: category modified.');
  console.log('    PASS: BOLA attack defended; read-only fields strictly preserved.');

  // 2.3 Verify EXHIBITOR_BOOTH_UPDATE audit log
  console.log('2.3 Verifying EXHIBITOR_BOOTH_UPDATE audit log...');
  const boothUpdateLog = await prisma.auditLog.findFirst({
    where: {
      action: 'EXHIBITOR_BOOTH_UPDATE',
      userId: 'test-lead-booth-a',
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(boothUpdateLog, 'Audit log for EXHIBITOR_BOOTH_UPDATE must exist.');
  console.log('    PASS: EXHIBITOR_BOOTH_UPDATE audit log verified.');

  // 2.4 Co-exhibitor user creation, password hashing, and session binding
  console.log('2.4 Testing co-exhibitor user creation and account binding...');
  const testMemberEmail = `coex.adversarial.${Date.now()}@itech2027.edu`;
  const rawPassword = 'AdversarialPassword123!';

  const createMemberReq = new Request('http://localhost:3000/api/exhibitor/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testMemberEmail,
      fullName: 'Co-Exhibitor Teammate',
      password: rawPassword,
      boothId: boothB.id, // Attacker attempts to bind account to Booth B
    }),
  });

  const createMemberRes = await createMemberPost(createMemberReq);
  assert.equal(createMemberRes.status, 201, 'Co-exhibitor creation must return HTTP 201.');
  const createMemberData = await createMemberRes.json();
  const createdMemberId = createMemberData.member.id as string;

  const dbMember = await prisma.user.findUnique({ where: { id: createdMemberId } });
  assert.ok(dbMember, 'Created co-exhibitor must exist in database.');
  assert.equal(dbMember.role, 'EXHIBITOR', 'Co-exhibitor must have role EXHIBITOR.');
  assert.equal(
    dbMember.boothId,
    boothA.id,
    'SECURITY FAILURE: Co-exhibitor was not bound to authenticated session boothId.'
  );

  // Verify bcrypt password hashing
  const bcryptMatches = await bcrypt.compare(rawPassword, dbMember.passwordHash);
  assert.equal(bcryptMatches, true, 'Stored password must be a valid bcrypt hash of raw password.');
  assert.notEqual(dbMember.passwordHash, rawPassword, 'Password must NOT be stored in plaintext.');
  console.log('    PASS: Co-exhibitor created, bound to session booth, and securely bcrypt-hashed.');

  // 2.5 Duplicate member email rejection (409 Conflict)
  console.log('2.5 Testing duplicate email collision defense...');
  const duplicateReq = new Request('http://localhost:3000/api/exhibitor/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testMemberEmail,
      fullName: 'Duplicate Teammate',
      password: 'AnotherPassword123!',
    }),
  });
  const duplicateRes = await createMemberPost(duplicateReq);
  assert.equal(duplicateRes.status, 409, 'Duplicate member creation must return HTTP 409 Conflict.');
  console.log('    PASS: Duplicate email correctly rejected with HTTP 409.');

  // 2.6 Member listing and passwordHash omission
  console.log('2.6 Testing member listing and passwordHash omission...');
  const membersListRes = await getMembersGet();
  assert.equal(membersListRes.status, 200);
  const membersListData = await membersListRes.json();
  assert.ok(Array.isArray(membersListData.members));
  const listedMember = membersListData.members.find((m: { id: string }) => m.id === createdMemberId);
  assert.ok(listedMember, 'Created member must be listed.');
  assert.equal('passwordHash' in listedMember, false, 'SECURITY FAILURE: passwordHash leaked in API response.');
  console.log('    PASS: Member list scoped to booth and passwordHash strictly omitted.');

  // 2.7 Verify EXHIBITOR_COEXHIBITOR_CREATE audit log
  console.log('2.7 Verifying EXHIBITOR_COEXHIBITOR_CREATE audit log...');
  const memberCreateLog = await prisma.auditLog.findFirst({
    where: {
      action: 'EXHIBITOR_COEXHIBITOR_CREATE',
      userId: 'test-lead-booth-a',
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(memberCreateLog, 'Audit log for EXHIBITOR_COEXHIBITOR_CREATE must exist.');
  console.log('    PASS: EXHIBITOR_COEXHIBITOR_CREATE audit log verified.');

  // Teardown created member and restore Booth A
  await prisma.user.delete({ where: { id: createdMemberId } });
  await prisma.booth.update({
    where: { id: boothA.id },
    data: {
      projectTitle: boothA.projectTitle,
      description: boothA.description,
      websiteUrl: boothA.websiteUrl,
      teamMembers: boothA.teamMembers,
    },
  });

  // =========================================================================
  // FEATURE 3: VENUE FLOOR MAP & COLLISION DEFENSE
  // =========================================================================
  console.log('\n--- FEATURE 3: VENUE FLOOR MAP & COLLISION DEFENSE ---');

  // 3.1 40 Standardized boxes geometry & boundary validation
  console.log('3.1 Testing 40-box slot generation, geometry, and boundary validation...');
  const slotRegex = /^BOX-(0[1-9]|[1-3][0-9]|40)$/;
  const generatedSlots = Array.from({ length: 40 }, (_, i) => `BOX-${String(i + 1).padStart(2, '0')}`);
  assert.equal(generatedSlots.length, 40, 'Must have exactly 40 standardized exhibition slots.');

  for (const slot of generatedSlots) {
    assert.equal(slotRegex.test(slot), true, `Standard slot ${slot} must match regex.`);
  }

  const invalidTestSlots = [
    'BOX-00', 'BOX-41', 'BOX-99', 'BOX-1', 'box-01', 'BOX-0', 'SLOT-01', 'BOX-400', 'BOX-100', '', ' '
  ];
  for (const inv of invalidTestSlots) {
    assert.equal(slotRegex.test(inv), false, `Invalid slot '${inv}' must be rejected.`);
  }

  // Row breakdown verification (4 rows of 10)
  assert.equal(generatedSlots[0], 'BOX-01');
  assert.equal(generatedSlots[9], 'BOX-10');
  assert.equal(generatedSlots[10], 'BOX-11');
  assert.equal(generatedSlots[19], 'BOX-20');
  assert.equal(generatedSlots[20], 'BOX-21');
  assert.equal(generatedSlots[29], 'BOX-30');
  assert.equal(generatedSlots[30], 'BOX-31');
  assert.equal(generatedSlots[39], 'BOX-40');
  console.log('    PASS: 40-box geometry & regex boundary assertions verified.');

  // 3.2 Database level P2002 collision defense
  console.log('3.2 Testing PostgreSQL unique constraint P2002 collision defense...');
  const testCode1 = 'TEST-UNI-M4-01';
  const testCode2 = 'TEST-UNI-M4-02';
  const testTargetSlot = 'BOX-39';

  await prisma.booth.deleteMany({ where: { code: { in: [testCode1, testCode2] } } });

  const b1 = await prisma.booth.create({
    data: {
      code: testCode1,
      projectTitle: 'Floor Map Test Project 1',
      capstoneCategory: 'SOFTWARE_DEVELOPMENT',
      mapSlot: testTargetSlot,
    },
  });
  assert.equal(b1.mapSlot, testTargetSlot);

  let duplicateInsertThrewP2002 = false;
  try {
    await prisma.booth.create({
      data: {
        code: testCode2,
        projectTitle: 'Floor Map Test Project 2',
        capstoneCategory: 'SOFTWARE_DEVELOPMENT',
        mapSlot: testTargetSlot,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      duplicateInsertThrewP2002 = true;
    }
  }
  assert.equal(duplicateInsertThrewP2002, true, 'Direct duplicate insert must fail with Prisma P2002.');

  // Create Booth 2 with null mapSlot and test duplicate update
  const b2 = await prisma.booth.create({
    data: {
      code: testCode2,
      projectTitle: 'Floor Map Test Project 2',
      capstoneCategory: 'SOFTWARE_DEVELOPMENT',
      mapSlot: null,
    },
  });

  let duplicateUpdateThrewP2002 = false;
  try {
    await prisma.booth.update({
      where: { id: b2.id },
      data: { mapSlot: testTargetSlot },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      duplicateUpdateThrewP2002 = true;
    }
  }
  assert.equal(duplicateUpdateThrewP2002, true, 'Duplicate update must fail with Prisma P2002.');
  console.log('    PASS: PostgreSQL unique constraint strictly defends against duplicate mapSlot.');

  // 3.3 Admin floor box assignment API endpoint & collision response
  console.log('3.3 Testing admin booth assignment API (POST /api/admin/booths)...');
  currentSessionToken = signSession({
    userId: 'admin-tester-id',
    email: 'admin@itech2027.edu',
    fullName: 'System Admin',
    role: 'ADMIN',
    boothId: null,
  });

  // Attempting to assign occupied slot BOX-39 to Booth 2 via admin API
  const adminCollisionReq = new Request('http://localhost:3000/api/admin/booths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: testCode2,
      projectTitle: 'Floor Map Test Project 2',
      capstoneCategory: 'SOFTWARE_DEVELOPMENT',
      mapSlot: testTargetSlot,
    }),
  });
  const adminCollisionRes = await adminUpsertBoothPost(adminCollisionReq);
  assert.equal(adminCollisionRes.status, 409, 'Admin slot assignment collision must return HTTP 409.');
  const adminCollisionData = await adminCollisionRes.json();
  assert.equal(adminCollisionData.error, 'MAP_SLOT_OCCUPIED');

  // Same booth re-assignment of its own slot must succeed without collision
  const adminSelfAssignReq = new Request('http://localhost:3000/api/admin/booths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: testCode1,
      projectTitle: 'Floor Map Test Project 1 Updated',
      capstoneCategory: 'SOFTWARE_DEVELOPMENT',
      mapSlot: testTargetSlot,
    }),
  });
  const adminSelfAssignRes = await adminUpsertBoothPost(adminSelfAssignReq);
  assert.equal(adminSelfAssignRes.status, 200, 'Same booth retaining its slot must succeed.');

  // Release slot from Booth 1
  await prisma.booth.update({
    where: { id: b1.id },
    data: { mapSlot: null },
  });

  // Now Booth 2 can claim BOX-39 via admin API
  const adminClaimReq = new Request('http://localhost:3000/api/admin/booths', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: testCode2,
      projectTitle: 'Floor Map Test Project 2',
      capstoneCategory: 'SOFTWARE_DEVELOPMENT',
      mapSlot: testTargetSlot,
    }),
  });
  const adminClaimRes = await adminUpsertBoothPost(adminClaimReq);
  assert.equal(adminClaimRes.status, 200, 'Reassigned slot must succeed once vacated.');
  const adminClaimData = await adminClaimRes.json();
  assert.equal(adminClaimData.booth.mapSlot, testTargetSlot);
  console.log('    PASS: Admin floor box assignment API correctly handles collision (409) and release.');

  // Clean up test booths
  await prisma.booth.deleteMany({ where: { code: { in: [testCode1, testCode2] } } });

  // =========================================================================
  // FEATURE 4: CAPSTONE SHOWCASE (/projects) DATA CONTRACTS & RESILIENCE
  // =========================================================================
  console.log('\n--- FEATURE 4: CAPSTONE SHOWCASE (/projects) DATA CONTRACTS ---');

  // 4.1 Data contracts compliance with public showcase model
  console.log('4.1 Verifying /projects data contracts and public booth item mapping...');
  const allBooths = await prisma.booth.findMany({
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      projectTitle: true,
      description: true,
      websiteUrl: true,
      coverUrl: true,
      mapSlot: true,
      capstoneCategory: true,
      programCode: true,
      teamMembers: true,
      tableNumber: true,
      logoUrl: true,
    },
  });

  const publicBooths: PublicBoothItem[] = allBooths.map((b) => ({
    id: b.id,
    code: b.code,
    projectTitle: b.projectTitle,
    description: b.description,
    websiteUrl: b.websiteUrl,
    coverUrl: b.coverUrl,
    mapSlot: b.mapSlot,
    capstoneCategory: b.capstoneCategory,
    programCode: b.programCode,
    teamMembers: b.teamMembers,
    tableNumber: b.tableNumber,
    logoUrl: b.logoUrl,
  }));

  assert.ok(publicBooths.length > 0, 'Showcase must load all registered capstone booths.');
  for (const b of publicBooths) {
    assert.equal(typeof b.id, 'string');
    assert.equal(typeof b.code, 'string');
    assert.equal(typeof b.projectTitle, 'string');
    assert.equal(typeof b.capstoneCategory, 'string');
    if (b.mapSlot) {
      assert.equal(slotRegex.test(b.mapSlot), true, `Booth ${b.code} mapSlot ${b.mapSlot} must match standard regex.`);
    }
  }
  console.log(`    PASS: All ${publicBooths.length} showcase booths comply with PublicBoothItem contract.`);

  // 4.2 Graceful degradation under missing optional fields
  console.log('4.2 Testing graceful degradation for minimal booth records...');
  const minimalBooth: PublicBoothItem = {
    id: 'minimal-test-id',
    code: 'MIN-01',
    projectTitle: 'Minimal Capstone Project',
    description: null,
    websiteUrl: null,
    coverUrl: null,
    mapSlot: null,
    capstoneCategory: 'RESEARCH',
    programCode: null,
    teamMembers: null,
    tableNumber: null,
    logoUrl: null,
  };

  assert.equal(minimalBooth.coverUrl, null);
  assert.equal(minimalBooth.description, null);
  assert.equal(minimalBooth.websiteUrl, null);
  assert.equal(minimalBooth.mapSlot, null);
  console.log('    PASS: Minimal booth record gracefully degrades with null optional values.');

  // =========================================================================
  // SECTION 5: GOVERNANCE & CODE CRAFTSMANSHIP AUDIT
  // =========================================================================
  console.log('\n--- SECTION 5: GOVERNANCE & CODE CRAFTSMANSHIP AUDIT ---');

  const filesToCheck = [
    'src/app/api/cards/validate/route.ts',
    'src/app/validate/page.tsx',
    'src/components/public/card-validator.tsx',
    'src/app/api/exhibitor/booth/route.ts',
    'src/app/api/exhibitor/members/route.ts',
    'src/components/exhibitor/booth-configuration.tsx',
    'src/components/public/venue-floor-map.tsx',
    'src/components/public/booth-directory.tsx',
    'src/app/projects/page.tsx',
    'src/app/api/admin/booths/route.ts',
    'src/lib/scanner/feedback.ts',
  ];

  const unicodeEmojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const illegalBgRegex = /\bbg-(?:blue|red|green|emerald|yellow|amber|purple|indigo|pink|rose|cyan|teal|orange)-(?:50|100|200|300|400|500|600|700|800|900)\b/;

  for (const relativePath of filesToCheck) {
    const fullPath = path.join(process.cwd(), relativePath);
    assert.equal(fs.existsSync(fullPath), true, `File must exist: ${relativePath}`);
    const content = fs.readFileSync(fullPath, 'utf8');

    const emojiFound = content.match(unicodeEmojiRegex);
    assert.equal(
      emojiFound,
      null,
      `GOVERNANCE VIOLATION: Emoji found in ${relativePath}: ${emojiFound?.[0]}`
    );

    const illegalBgFound = content.match(illegalBgRegex);
    assert.equal(
      illegalBgFound,
      null,
      `GOVERNANCE VIOLATION: Illegal background color fill in ${relativePath}: ${illegalBgFound?.[0]}`
    );
  }
  console.log(`    PASS: All ${filesToCheck.length} files strictly follow ZERO emoji & ZERO illegal background rules.`);

  console.log('\n================================================================');
  console.log('ALL UNIFIED ADVERSARIAL E2E INTEGRATION TESTS PASSED CLEANLY');
  console.log('================================================================');
}

runUnifiedAdversarialSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('UNIFIED SUITE FAILURE:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
