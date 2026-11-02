import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SlidingWindowRateLimiter } from '../security/rate-limiter';
import { readBoundedJson, RequestBodyError } from '../security/request-body';
import { signSession, verifySession } from '../auth/session';

function testRateLimits(): void {

  let now = 1000000;
  const limiter = new SlidingWindowRateLimiter(10, () => now);
  assert.equal(limiter.check('login', 1, 300000).allowed, true);
  now += 121000;
  assert.equal(limiter.check('scan', 45, 60000).allowed, true);
  assert.equal(limiter.check('login', 1, 300000).allowed, false);
  now += 180000;
  assert.equal(limiter.check('login', 1, 300000).allowed, true);

  const cappedLimiter = new SlidingWindowRateLimiter(2, () => now);
  assert.equal(cappedLimiter.check('first', 2, 60000).allowed, true);
  assert.equal(cappedLimiter.check('second', 2, 300000).allowed, true);
  assert.equal(cappedLimiter.check('overflow', 2, 60000).allowed, false);
  assert.equal(cappedLimiter.check('first', 2, 60000).allowed, true);
  assert.equal(cappedLimiter.check('first', 2, 60000).allowed, false);
  now += 60000;
  assert.equal(cappedLimiter.check('replacement', 2, 60000).allowed, true);
  assert.equal(cappedLimiter.check('second', 1, 300000).allowed, false);
}

function createJsonRequest(body: string): Request {

  return new Request('http://localhost/api/test', { method: 'POST', body });
}

async function testBoundedBodies(): Promise<void> {

  assert.deepEqual(await readBoundedJson(createJsonRequest('{"ok":true}'), 32), { ok: true });
  await assert.rejects(
    readBoundedJson(createJsonRequest('{broken'), 32),
    (error: Error) => error instanceof RequestBodyError && error.status === 400
  );
  await assert.rejects(
    readBoundedJson(new Request('http://localhost/api/test', {
      method: 'POST', body: '{}', headers: { 'content-length': '999' },
    }), 32),
    (error: Error) => error instanceof RequestBodyError && error.status === 413
  );

  let cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {

      controller.enqueue(encoder.encode('{"data":"'));
      controller.enqueue(encoder.encode('x'.repeat(64)));
    },
    cancel() {

      cancelled = true;
    },
  });
  const streamOptions: RequestInit & { duplex: 'half' } = {
    method: 'POST', body: stream, duplex: 'half',
  };
  const streamingRequest = new Request('http://localhost/api/test', streamOptions);
  assert.equal(streamingRequest.headers.has('content-length'), false);
  await assert.rejects(
    readBoundedJson(streamingRequest, 32),
    (error: Error) => error instanceof RequestBodyError && error.status === 413
  );
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
}

function testSessionPayloads(): void {

  const previousSecret = process.env.NEXTAUTH_SECRET;
  const testSecret = 'test-only-session-secret-not-for-deployment-2026';
  process.env.NEXTAUTH_SECRET = testSecret;

  function signRawPayload(payload: unknown): string {

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', testSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  try {
    const payload = {
      userId: '2f450e57-ec84-4b44-8ac0-eae72260a3cf',
      email: 'test@example.test',
      fullName: 'Session Test',
      role: 'EXHIBITOR' as const,
      boothId: 'ce5b0b65-cd1b-484c-bc87-435604e151a5',
      accountVersion: '2026-10-24T00:00:00.000Z',
    };
    const validToken = signSession(payload);
    assert.equal(verifySession(validToken)?.userId, payload.userId);
    const futurePayload = { ...payload, expiresAt: Date.now() + 60000 };
    for (const invalidPayload of [
      { ...futurePayload, role: 'SUPERADMIN' },
      { ...futurePayload, userId: 'invalid' },
      { ...futurePayload, boothId: 'invalid' },
      { ...futurePayload, email: 'invalid' },
      { ...futurePayload, expiresAt: 'tomorrow' },
      { ...futurePayload, expiresAt: null },
      { ...futurePayload, expiresAt: Date.now() - 1 },
      { ...futurePayload, accountVersion: undefined },
      { ...futurePayload, accountVersion: 'invalid' },
      { ...futurePayload, unexpectedPermission: 'ADMIN' },
    ]) {
      assert.equal(verifySession(signRawPayload(invalidPayload)), null);
    }
    const [encoded, signature] = validToken.split('.');
    assert.equal(verifySession(`${encoded}.${signature.slice(1)}`), null);
    assert.equal(verifySession('invalid'), null);
    assert.equal(verifySession('x'.repeat(4097)), null);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = previousSecret;
    }
  }
}

async function main(): Promise<void> {

  testRateLimits();
  await testBoundedBodies();
  testSessionPayloads();
  console.log('Security primitive regressions passed: rate limits, bounded JSON, signed session validation.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Security primitive regressions failed.');
  process.exitCode = 1;
});
