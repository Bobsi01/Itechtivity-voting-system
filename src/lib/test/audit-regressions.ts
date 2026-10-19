import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getBoothCode } from '../pdf/booth-grid';
import { generateA4BingoPdfBuffer } from '../pdf/a4-sheet-renderer';
import { getLoginDestination } from '../auth/redirect';
import { RegistrationBindSchema } from '../registration/demographics';
import { getAllReleases } from '../version/releases';
import { config as middlewareConfig } from '../../middleware';

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

  // Verify SEC-FIND-01: No hardcoded plaintext passwords in client login bundle
  const loginSource = await readFile('src/app/login/page.tsx', 'utf8');
  assert.equal(loginSource.includes('AdminPass2027!'), false, 'Login page must not contain hardcoded passwords');
  assert.equal(loginSource.includes('testAccounts'), false, 'Login page must not embed testAccounts array');

  // Verify SEC-FIND-03: Middleware matcher explicitly covers root portal paths
  for (const requiredRoute of ['/admin', '/production', '/registration', '/exhibitor', '/presentation']) {
    assert.equal(
      middlewareConfig.matcher.includes(requiredRoute),
      true,
      `Middleware matcher must include ${requiredRoute}`
    );
  }

  // Verify VER-01 & VER-03: Versioning manifest invariants
  const releases = getAllReleases();
  assert.equal(releases.length > 0, true, 'At least one release must be defined');
  for (const release of releases) {
    assert.match(release.version, /^V\d+\.\d+\.\d+$/, `Invalid version format: ${release.version}`);
    for (const change of release.minorChanges) {
      assert.equal(change.points >= 1 && change.points <= 5, true, `Invalid point allocation: ${change.points}`);
    }
    for (const contrib of release.contributors) {
      assert.equal(contrib.githubUsername.startsWith('@'), false, `GitHub username must not start with @: ${contrib.githubUsername}`);
    }
  }

  const result = await generateA4BingoPdfBuffer({
    batchNumber: 9999, startCardNumber: 1, totalCards: 4,
    awardsList: Array.from({ length: 6 }, (_, index) => ({ slotNumber: index + 1, title: `QA Award ${index + 1}` })),
    secretKey: 'audit-regression-only-signing-key-not-for-production',
  });
  await mkdir('storage/audit-fix-verification', { recursive: true });
  await writeFile('storage/audit-fix-verification/corrected-grid.pdf', result.buffer);
  assert.equal(result.totalSheets, 1);
  console.log('PASS: 40 unique booth labels, safe role redirects, all four demographic contracts, whitespace validation, security invariants, versioning manifest checks, and real PDF generation.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
