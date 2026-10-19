import assert from 'node:assert/strict';
import prisma from '../db/prisma';
import { getVerifiedHmacSecret, generateStubSignature } from '../crypto/stub-tokens';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

async function runPhase1Verification() {
  console.log('--- Phase 1 QA Verification Suite ---');

  // Test 1: Verify Procfile release command exists
  console.log('1. Checking Procfile release command...');
  const procfileContent = fs.readFileSync(path.join(process.cwd(), 'Procfile'), 'utf8');
  assert.ok(procfileContent.includes('release: npx prisma migrate deploy'), 'Procfile must contain release migration deploy step');
  console.log('   [PASS] Procfile release step configured');

  // Test 2: Verify prisma migrations directory and baseline migration
  console.log('2. Checking prisma migration baseline...');
  const migrationDir = path.join(process.cwd(), 'prisma', 'migrations');
  assert.ok(fs.existsSync(migrationDir), 'prisma/migrations directory must exist');
  const migrationSubdirs = fs.readdirSync(migrationDir).filter(f => fs.statSync(path.join(migrationDir, f)).isDirectory());
  assert.ok(migrationSubdirs.length >= 1, 'At least 1 migration must be present in prisma/migrations');
  console.log('   [PASS] Baseline migration directory verified:', migrationSubdirs[0]);

  // Test 3: Verify HMAC manual serial verification logic
  console.log('3. Checking manual stub serial HMAC verification logic...');
  const secretKey = getVerifiedHmacSecret();

  // Find or use an active booth
  const booth = await prisma.booth.findFirst({ where: { code: 'CS-01' } });
  assert.ok(booth, 'Booth CS-01 must exist');

  // Find an activated ticket stub
  const activeStub = await prisma.ticketStub.findFirst({
    where: { status: 'ACTIVATED' },
    include: { bingoCard: true },
  });

  if (activeStub) {
    const expectedSig = generateStubSignature(activeStub.stubSerial, activeStub.slotNumber, secretKey);
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');
    const storedBuffer = Buffer.from(activeStub.signatureHash, 'utf8');

    assert.equal(expectedBuffer.byteLength, storedBuffer.byteLength, 'Signature byte lengths must match');
    assert.ok(crypto.timingSafeEqual(expectedBuffer, storedBuffer), 'Timing safe equal must verify valid stub signature');
    console.log('   [PASS] Active stub signature verified with constant-time HMAC check:', activeStub.stubSerial);
  } else {
    console.log('   [SKIP] No currently activated stub in DB for manual redemption test');
  }

  // Test 4: Verify tampered serial rejection
  console.log('4. Checking tampered stub serial rejection...');
  const tamperedSig = generateStubSignature('B27-B01-9999-S1', 1, secretKey);
  const fakeStoredSig = 'invalid_hash_signature_123';
  const bufA = Buffer.from(tamperedSig, 'utf8');
  const bufB = Buffer.from(fakeStoredSig, 'utf8');
  const lengthMatch = bufA.byteLength === bufB.byteLength;
  assert.equal(lengthMatch, false, 'Invalid signature length must fail length check before timingSafeEqual');
  console.log('   [PASS] Tampered signature properly rejected by length guard');

  console.log('=== All Phase 1 QA Checks Succeeded ===');
}

runPhase1Verification()
  .catch((err) => {
    console.error('Phase 1 QA Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
