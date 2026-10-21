import prisma from '@/lib/db/prisma';
import bcrypt from 'bcryptjs';
import { signSession } from '@/lib/auth/session';
import { PATCH as updateBoothPatch, GET as getBoothGet } from '@/app/api/exhibitor/booth/route';
import { GET as getMembersGet, POST as createMemberPost } from '@/app/api/exhibitor/members/route';

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

async function runExhibitorM3TestSuite() {

  console.log('--- STARTING EXHIBITOR M3 VERIFICATION TEST SUITE ---');

  // Step 1: Find two distinct booths in database for testing
  const booths = await prisma.booth.findMany({
    take: 2,
    orderBy: { code: 'asc' },
  });

  if (booths.length < 2) {
    throw new Error('Test requires at least 2 booths in database.');
  }

  const boothA = booths[0];
  const boothB = booths[1];
  console.log(`Test Booth A: ${boothA.code} (${boothA.id})`);
  console.log(`Test Booth B: ${boothB.code} (${boothB.id})`);

  // Sign session token for Booth A's exhibitor
  currentSessionToken = signSession({
    userId: 'test-user-booth-a',
    email: 'lead.bootha@itech2027.edu',
    fullName: 'Booth A Lead',
    role: 'EXHIBITOR',
    boothId: boothA.id,
  });

  // -------------------------------------------------------------------------
  // TEST 1: GET /api/exhibitor/booth
  // -------------------------------------------------------------------------
  console.log('\n[TEST 1] GET /api/exhibitor/booth returns scoped booth');
  const getBoothRes = await getBoothGet();
  const getBoothJson = await getBoothRes.json();
  if (!getBoothJson.success || getBoothJson.booth.id !== boothA.id) {
    throw new Error(`TEST 1 FAILED: Expected booth ${boothA.id}, got ${JSON.stringify(getBoothJson)}`);
  }
  console.log('PASS: GET returned correct booth matching session.boothId.');

  // -------------------------------------------------------------------------
  // TEST 2: PATCH /api/exhibitor/booth Zero-Trust BOLA & Discard Read-Only Fields
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] PATCH /api/exhibitor/booth BOLA Defense & Read-Only Invariants');
  const attackPayload = {
    boothId: boothB.id, // Attacker attempts to target Booth B
    code: 'ATTACK-CODE', // Attacker attempts to overwrite code
    tableNumber: 'TABLE-999', // Attacker attempts to overwrite tableNumber
    mapSlot: 'BOX-40', // Attacker attempts to overwrite mapSlot
    capstoneCategory: 'HACKED-CATEGORY', // Attacker attempts to overwrite category
    programCode: 'BSIT',
    projectTitle: 'Legitimate Updated Title For Booth A',
    description: 'Updated description synopsis for testing.',
    websiteUrl: 'https://example.com/demo-a',
    teamMembers: 'Alice, Bob, Charlie',
  };

  const patchReq = new Request('http://localhost:3000/api/exhibitor/booth', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attackPayload),
  });

  const patchRes = await updateBoothPatch(patchReq);
  const patchJson = await patchRes.json();

  if (!patchRes.ok || !patchJson.success) {
    throw new Error(`TEST 2 FAILED: PATCH returned error: ${JSON.stringify(patchJson)}`);
  }

  // Verify Booth B was NOT modified
  const reloadedBoothB = await prisma.booth.findUnique({ where: { id: boothB.id } });
  if (reloadedBoothB?.projectTitle === attackPayload.projectTitle) {
    throw new Error('CRITICAL BOLA FAILURE: Booth B was modified by Booth A exhibitor!');
  }

  // Verify Booth A was modified for allowed fields ONLY
  const reloadedBoothA = await prisma.booth.findUnique({ where: { id: boothA.id } });
  if (reloadedBoothA?.projectTitle !== 'Legitimate Updated Title For Booth A') {
    throw new Error('TEST 2 FAILED: Booth A projectTitle was not updated.');
  }
  if (reloadedBoothA?.code === 'ATTACK-CODE') {
    throw new Error('CRITICAL IMMUTABILITY FAILURE: Booth A code was overwritten!');
  }
  if (reloadedBoothA?.tableNumber === 'TABLE-999') {
    throw new Error('CRITICAL IMMUTABILITY FAILURE: Booth A tableNumber was overwritten!');
  }
  if (reloadedBoothA?.mapSlot === 'BOX-40' && boothA.mapSlot !== 'BOX-40') {
    throw new Error('CRITICAL IMMUTABILITY FAILURE: Booth A mapSlot was overwritten!');
  }
  console.log('PASS: BOLA attack defended. Read-only fields preserved. Editable fields updated.');

  // -------------------------------------------------------------------------
  // TEST 3: Audit Log emitted for EXHIBITOR_BOOTH_UPDATE
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Audit Log Emission for EXHIBITOR_BOOTH_UPDATE');
  const boothUpdateLog = await prisma.auditLog.findFirst({
    where: {
      action: 'EXHIBITOR_BOOTH_UPDATE',
      userId: 'test-user-booth-a',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!boothUpdateLog) {
    throw new Error('TEST 3 FAILED: No audit log found for EXHIBITOR_BOOTH_UPDATE.');
  }
  console.log(`PASS: Found audit log: "${boothUpdateLog.summary}"`);

  // -------------------------------------------------------------------------
  // TEST 4: POST /api/exhibitor/members Co-Exhibitor Creation & Password Hashing
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] POST /api/exhibitor/members');
  const testMemberEmail = `coexhibitor.test.${Date.now()}@itech2027.edu`;
  const testPassword = 'SecurePassword123!';

  const createMemberReq = new Request('http://localhost:3000/api/exhibitor/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testMemberEmail,
      fullName: 'Jane Co-Exhibitor',
      password: testPassword,
      boothId: boothB.id, // Attacker attempts to bind to Booth B
    }),
  });

  const createMemberRes = await createMemberPost(createMemberReq);
  const createMemberJson = await createMemberRes.json();

  if (createMemberRes.status !== 201 || !createMemberJson.success) {
    throw new Error(`TEST 4 FAILED: POST /api/exhibitor/members failed: ${JSON.stringify(createMemberJson)}`);
  }

  const createdUserId = createMemberJson.member.id;

  // Verify DB user record
  const dbUser = await prisma.user.findUnique({
    where: { id: createdUserId },
  });

  if (!dbUser) {
    throw new Error('TEST 4 FAILED: Created user not found in database.');
  }
  if (dbUser.boothId !== boothA.id) {
    throw new Error(`CRITICAL BOLA FAILURE: Member was bound to ${dbUser.boothId} instead of session booth ${boothA.id}!`);
  }
  if (dbUser.role !== 'EXHIBITOR') {
    throw new Error(`TEST 4 FAILED: Expected role EXHIBITOR, got ${dbUser.role}`);
  }

  // Verify bcrypt password hashing
  const passwordMatches = await bcrypt.compare(testPassword, dbUser.passwordHash);
  if (!passwordMatches) {
    throw new Error('CRITICAL AUTH FAILURE: Password hash in database does not match original password!');
  }
  console.log('PASS: Member created with role EXHIBITOR, bound strictly to session.boothId, and hashed with bcrypt.');

  // -------------------------------------------------------------------------
  // TEST 5: Duplicate email rejection (409 Conflict)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Duplicate Email Collision Defense');
  const duplicateReq = new Request('http://localhost:3000/api/exhibitor/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testMemberEmail,
      fullName: 'Duplicate Jane',
      password: 'AnotherPassword123!',
    }),
  });

  const duplicateRes = await createMemberPost(duplicateReq);
  if (duplicateRes.status !== 409) {
    throw new Error(`TEST 5 FAILED: Expected status 409, got ${duplicateRes.status}`);
  }
  console.log('PASS: Duplicate email correctly rejected with status 409.');

  // -------------------------------------------------------------------------
  // TEST 6: GET /api/exhibitor/members lists members and omits passwordHash
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] GET /api/exhibitor/members Scoped & Password Omission');
  const getMembersRes = await getMembersGet();
  const getMembersJson = await getMembersRes.json();

  if (!getMembersJson.success || !Array.isArray(getMembersJson.members)) {
    throw new Error(`TEST 6 FAILED: Failed to list members: ${JSON.stringify(getMembersJson)}`);
  }

  const foundMember = getMembersJson.members.find((m: { id: string }) => m.id === createdUserId);
  if (!foundMember) {
    throw new Error('TEST 6 FAILED: Created member not found in members list.');
  }
  if ('passwordHash' in foundMember) {
    throw new Error('CRITICAL SECURITY VIOLATION: passwordHash leaked in GET /api/exhibitor/members response!');
  }
  console.log('PASS: GET members lists scoped team members with passwordHash strictly omitted.');

  // -------------------------------------------------------------------------
  // TEST 7: Audit Log emitted for EXHIBITOR_COEXHIBITOR_CREATE
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Audit Log Emission for EXHIBITOR_COEXHIBITOR_CREATE');
  const memberCreateLog = await prisma.auditLog.findFirst({
    where: {
      action: 'EXHIBITOR_COEXHIBITOR_CREATE',
      userId: 'test-user-booth-a',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!memberCreateLog) {
    throw new Error('TEST 7 FAILED: No audit log found for EXHIBITOR_COEXHIBITOR_CREATE.');
  }
  console.log(`PASS: Found audit log: "${memberCreateLog.summary}"`);

  // Clean up created test user and restore Booth A
  await prisma.user.delete({ where: { id: createdUserId } });
  await prisma.booth.update({
    where: { id: boothA.id },
    data: {
      projectTitle: boothA.projectTitle,
      description: boothA.description,
      websiteUrl: boothA.websiteUrl,
      teamMembers: boothA.teamMembers,
    },
  });

  console.log('\n--- ALL EXHIBITOR M3 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
}

runExhibitorM3TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
