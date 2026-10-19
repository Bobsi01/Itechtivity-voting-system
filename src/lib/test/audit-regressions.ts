import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { getBoothCode } from '../pdf/booth-grid';
import { generateA4BingoPdfBuffer } from '../pdf/a4-sheet-renderer';
import { getLoginDestination } from '../auth/redirect';
import { RegistrationBindSchema } from '../registration/demographics';

async function main() {

  const codes: string[] = [];
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 7; column++) {
      const code = getBoothCode(row, column);
      if (code) codes.push(code);
    }
  }
  assert.deepEqual(codes, Array.from({ length: 40 }, (_, index) => `CS-${String(index + 1).padStart(2, '0')}`));
  assert.equal(getLoginDestination('PRODUCTION', '/production'), '/production');
  assert.equal(getLoginDestination('REGISTRATION', '/exhibitor'), '/registration');
  for (const destination of ['https://example.com', '//example.com', '/\\example.com', '/production-other', '/login', '/%2fexample.com', '/production/../admin', '/production/%2e%2e/admin']) {
    assert.equal(getLoginDestination('PRODUCTION', destination), '/production');
  }
  assert.equal(getLoginDestination('ADMIN', '/admin?section=cards'), '/admin?section=cards');

  for (const buyerType of ['CSD_STUDENT', 'NON_CSD_STUDENT', 'VISITOR', 'ALUMNI'] as const) {
    const data = RegistrationBindSchema.parse({
      buyerType, buyerName: '  QA Test Attendee  ', cardSerials: ['QA-CARD'],
      studentNumber: 'old-student', program: 'old-program', yearAndSection: '4 A', affiliation: 'old-organization',
    });
    assert.equal(data.buyerName, 'QA Test Attendee');
    assert.equal(data.affiliation, buyerType === 'VISITOR' ? 'old-organization' : null);
    assert.equal(data.studentNumber, buyerType.endsWith('STUDENT') ? 'old-student' : null);
    assert.equal(data.program, buyerType.endsWith('STUDENT') ? 'old-program' : null);
  }
  assert.equal(RegistrationBindSchema.safeParse({ buyerType: 'VISITOR', buyerName: '  ', cardSerials: ['QA-CARD'] }).success, false);

  const result = await generateA4BingoPdfBuffer({
    batchNumber: 9999, startCardNumber: 1, totalCards: 4,
    awardsList: Array.from({ length: 6 }, (_, index) => ({ slotNumber: index + 1, title: `QA Award ${index + 1}` })),
    secretKey: 'audit-regression-only-signing-key-not-for-production',
  });
  await mkdir('storage/audit-fix-verification', { recursive: true });
  await writeFile('storage/audit-fix-verification/corrected-grid.pdf', result.buffer);
  assert.equal(result.totalSheets, 1);
  console.log('PASS: 40 unique booth labels, safe role redirects, all four demographic contracts, whitespace validation, and real PDF generation.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
