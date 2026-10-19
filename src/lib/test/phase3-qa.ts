import prisma from '@/lib/db/prisma';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { recordAuditLog } from '@/lib/audit/log';
import { generateCalibrationPdfBuffer } from '@/lib/pdf/calibration-sheet';

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

async function runPhase3QA() {

  console.log('--- Starting Phase 3 QA Automated Verification ---');

  // Test 1: Sliding Window Rate Limiter
  const testKey = `qa-test-ip-${Date.now()}`;
  const r1 = rateLimiter.check(testKey, 3, 2000);
  const r2 = rateLimiter.check(testKey, 3, 2000);
  const r3 = rateLimiter.check(testKey, 3, 2000);
  const r4 = rateLimiter.check(testKey, 3, 2000);

  assert(
    r1.allowed && r2.allowed && r3.allowed && !r4.allowed,
    'Rate Limiter Sliding Window',
    `Expected 3 allowed and 4th blocked. Actual: [${r1.allowed}, ${r2.allowed}, ${r3.allowed}, ${r4.allowed}], retryAfter: ${r4.retryAfterSeconds}s`
  );

  rateLimiter.reset(testKey);
  const r5 = rateLimiter.check(testKey, 3, 2000);
  assert(
    r5.allowed,
    'Rate Limiter Reset',
    `Expected allowed after reset. Actual: ${r5.allowed}`
  );

  // Test 2: Audit Logging Persistence in PostgreSQL
  const auditAction = `QA_TEST_ACTION_${Date.now()}`;
  await recordAuditLog({
    userId: null,
    action: auditAction,
    resource: 'QATestResource',
    details: { test: true, timestamp: Date.now() },
    ipAddress: '127.0.0.1',
  });

  const savedLog = await prisma.auditLog.findFirst({
    where: { action: auditAction },
  });

  assert(
    Boolean(savedLog && savedLog.resource === 'QATestResource'),
    'Audit Log Database Persistence',
    savedLog ? `Saved audit record ID: ${savedLog.id}` : 'Failed to query saved audit record'
  );

  if (savedLog) {
    await prisma.auditLog.delete({ where: { id: savedLog.id } });
  }

  // Test 3: Calibration Sheet PDF Generation
  const pdfBuffer = await generateCalibrationPdfBuffer();
  const pdfHeader = pdfBuffer.subarray(0, 5).toString('utf8');

  assert(
    pdfHeader === '%PDF-',
    'Calibration Sheet PDF Header',
    `Expected '%PDF-', got '${pdfHeader}', size: ${pdfBuffer.length} bytes`
  );

  assert(
    pdfBuffer.length > 3000,
    'Calibration Sheet PDF File Size',
    `Buffer length: ${pdfBuffer.length} bytes (expected > 3000 bytes)`
  );

  console.log('--- Phase 3 QA Automated Verification Completed ---');

  const allPassed = results.every((r) => r.passed);
  console.log(`Summary: ${results.filter((r) => r.passed).length}/${results.length} tests passed.`);

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase3QA()
  .catch((err) => {
    console.error('Phase 3 QA Runner Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
