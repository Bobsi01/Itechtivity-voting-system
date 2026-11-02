import assert from 'node:assert/strict';
import { mock } from 'node:test';
import prisma from '../db/prisma';
import { signSession } from '../auth/session';
import { encodeStubPayload } from '../crypto/stub-tokens';
import { POST } from '../../app/api/vote/route';
import { rateLimiter } from '../security/rate-limiter';

process.env.NEXTAUTH_SECRET = 'isolated-pre-db-signature-verification-secret';
process.env.EVENT_HMAC_SECRET = 'isolated-pre-db-qr-signature-verification-secret';
const headers = require('next/headers') as typeof import('next/headers');
const account = {
  id: '646a942a-55e8-4e85-8569-181574d870e9',
  email: 'pre-db@example.test', fullName: 'Pre DB Test', role: 'EXHIBITOR' as const,
  boothId: 'c96a0e8e-4215-4eaa-b129-e5613460aff2',
  updatedAt: new Date('2026-10-24T00:00:00.000Z'),
};
const token = signSession({
  userId: account.id, email: account.email, fullName: account.fullName,
  role: account.role, boothId: account.boothId, accountVersion: account.updatedAt.toISOString(),
});
let currentToken = token;
let databaseCalls = 0;
let accountResult: typeof account | null = null;

// Stub the sole pretransaction account lookup and forbid business transactions.
const originalAccountLookup = prisma.user.findUnique;
const originalTransaction = prisma.$transaction;
const accountSpy = mock.fn(async () => {

  databaseCalls++;
  return accountResult;
});
const transactionSpy = mock.fn(async () => {

  assert.fail('Business transaction must not run for rejected authentication');
});
Object.assign(prisma.user, { findUnique: accountSpy });
Object.assign(prisma, { $transaction: transactionSpy });
const cookieSpy = mock.method(headers, 'cookies', async () => ({
  get: (name: string) => name === 'itech2027_session' ? { value: currentToken } : undefined,
}));

async function submit(qrPayload: string) {

  return POST(new Request('http://localhost/api/vote', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'pre-db-auth-key' },
    body: JSON.stringify({ qrPayload, boothId: account.boothId }),
  }));
}

async function main(): Promise<void> {

  const invalidQr = await submit('invalid-qr-payload');
  assert.equal(invalidQr.status, 400);
  assert.equal(databaseCalls, 0);
  currentToken = `${token.slice(0, -3)}bad`;
  assert.equal((await submit('invalid-qr-payload')).status, 401);
  assert.equal(databaseCalls, 0);
  currentToken = token;
  const validQr = encodeStubPayload('B27-QATEST-0001-S1', 1, process.env.EVENT_HMAC_SECRET!);
  assert.equal((await submit(validQr)).status, 401);
  assert.equal(databaseCalls, 1);
  accountResult = { ...account, updatedAt: new Date('2026-10-24T00:00:01.000Z') };
  assert.equal((await submit(validQr)).status, 401);
  assert.equal(databaseCalls, 2);
  accountResult = { ...account, boothId: '45c5f5f8-e85e-422d-8d79-825e0127775c' };
  assert.equal((await submit(validQr)).status, 401);
  assert.equal(databaseCalls, 3);
  const boothRateKey = `vote:${account.boothId}`;
  rateLimiter.reset(boothRateKey);
  for (const revokedAccount of [null, { ...account, updatedAt: new Date('2026-10-24T00:00:01.000Z') }]) {
    accountResult = revokedAccount;
    for (let index = 0; index < 30; index++) {
      assert.equal((await submit(validQr)).status, 401);
    }
  }
  assert.equal(databaseCalls, 63);
  const untouchedBudget = rateLimiter.check(boothRateKey, 45, 60 * 1000);
  assert.equal(untouchedBudget.allowed, true);
  assert.equal(untouchedBudget.remaining, 44);
  for (let index = 0; index < 44; index++) {
    assert.equal(rateLimiter.check(boothRateKey, 45, 60 * 1000).allowed, true);
  }
  accountResult = account;
  assert.equal((await submit(validQr)).status, 429);
  assert.equal(databaseCalls, 64);
  assert.equal(transactionSpy.mock.callCount(), 0);
  rateLimiter.reset(boothRateKey);
  console.log('PASS 60 revoked-cookie valid QR requests preserve all 45 booth requests; current-account control reaches booth throttling without business transaction.');
  console.log('PASS invalid QR and invalid cookie perform zero database calls; valid QR reaches fresh account verification; missing, revised and reassigned accounts denied before business operations.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Pre-database authorization test failed');
  process.exitCode = 1;
}).finally(async () => {
  cookieSpy.mock.restore();
  Object.assign(prisma.user, { findUnique: originalAccountLookup });
  Object.assign(prisma, { $transaction: originalTransaction });
  await prisma.$disconnect();
});
