import assert from 'node:assert';
import { POST } from '@/app/api/cards/validate/route';
import prisma from '@/lib/db/prisma';
import { rateLimiter } from '@/lib/security/rate-limiter';
import { generateStubSignature, generateStubVerificationCode } from '@/lib/crypto/stub-tokens';

interface ApiStub {
  slotNumber: number;
  awardTitle: string;
  stubSerial: string;
  status: string;
  isRedeemed: boolean;
  redeemedAt: string | null;
  votedBooth: { code: string; projectTitle: string; tableNumber: string | null } | null;
}

interface ApiCard {
  cardSerial: string;
  masterQrHash: string;
  status: string;
  activatedAt: string | null;
  batchNumber: number | null;
}

interface ApiDemographics {
  buyerName: string;
  buyerType: string;
  buyerTypeLabel: string;
  program: string | null;
  yearAndSection: string | null;
  studentNumber: string | null;
  affiliation: string | null;
  academicAffiliation: string | null;
  registeredAt: string;
  contactInfo?: unknown;
  phone?: unknown;
  email?: unknown;
}

interface ApiSuccessResponse {
  success: true;
  card: ApiCard;
  demographics: ApiDemographics | null;
  stubsSummary: {
    total: number;
    redeemed: number;
    available: number;
    void: number;
  };
  stubs: ApiStub[];
}

interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
}

async function runValidatorTests() {

  console.log('--- Testing Card Validator API & Business Logic ---');

  // Test 1: Rate Limiting Enforcement (30 req/min per IP)
  console.log('Test 1: Rate Limiting Enforcement...');
  const testIp = '192.168.100.99';
  const rateLimitKey = `validate:${testIp}`;
  rateLimiter.reset(rateLimitKey);

  // Consume 30 requests
  for (let i = 1; i <= 30; i++) {
    const check = rateLimiter.check(rateLimitKey, 30, 60000);
    assert.strictEqual(check.allowed, true, `Request ${i} should be allowed`);
  }

  // 31st request via the actual route handler with x-forwarded-for: 192.168.100.99
  const rateLimitedReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': testIp,
    },
    body: JSON.stringify({ code: 'B27-B01-0001' }),
  });
  const rateLimitedRes = await POST(rateLimitedReq);
  assert.strictEqual(rateLimitedRes.status, 429, '31st request must return HTTP 429');
  assert.strictEqual(
    rateLimitedRes.headers.get('Retry-After') !== null,
    true,
    'Must include Retry-After header'
  );
  const rateLimitedBody = (await rateLimitedRes.json()) as ApiErrorResponse;
  assert.strictEqual(rateLimitedBody.success, false);
  assert.strictEqual(rateLimitedBody.error, 'RATE_LIMIT_EXCEEDED');
  console.log('Passed: Rate limiting enforced with HTTP 429 and Retry-After.');

  // Reset rate limiter for test IP
  rateLimiter.reset(rateLimitKey);

  // Test 2: Input Validation (Empty or invalid payload)
  console.log('Test 2: Input Payload Validation...');
  const emptyReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: '   ' }),
  });
  const emptyRes = await POST(emptyReq);
  assert.strictEqual(emptyRes.status, 400, 'Empty code must return HTTP 400');
  const emptyBody = (await emptyRes.json()) as ApiErrorResponse;
  assert.strictEqual(emptyBody.success, false);
  assert.strictEqual(emptyBody.error, 'VALIDATION_ERROR');

  const invalidJsonReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: 'not-json',
  });
  const invalidJsonRes = await POST(invalidJsonReq);
  assert.strictEqual(invalidJsonRes.status, 400, 'Invalid JSON must return HTTP 400');
  console.log('Passed: Invalid payload rejected with HTTP 400.');

  // Test 3: Card Not Found
  console.log('Test 3: Non-existent Card Lookup...');
  const notFoundReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: 'NON_EXISTENT_CARD_SERIAL_99999' }),
  });
  const notFoundRes = await POST(notFoundReq);
  assert.strictEqual(notFoundRes.status, 404, 'Unknown card must return HTTP 404');
  const notFoundBody = (await notFoundRes.json()) as ApiErrorResponse;
  assert.strictEqual(notFoundBody.success, false);
  assert.strictEqual(notFoundBody.error, 'CARD_NOT_FOUND');
  console.log('Passed: Non-existent card returns HTTP 404 with CARD_NOT_FOUND.');

  // Test 4: Query Database for an existing ACTIVATED card and an existing GENERATED card
  console.log('Test 4: Real Database Resolution & Data Contracts...');
  const activatedCard = await prisma.bingoCard.findFirst({
    where: { status: 'ACTIVATED' },
    include: {
      transaction: true,
      stubs: { include: { award: true, vote: { include: { booth: true } } } },
    },
  });

  const generatedCard = await prisma.bingoCard.findFirst({
    where: { status: 'GENERATED' },
    include: {
      stubs: true,
    },
  });

  assert.ok(activatedCard, 'Must have at least one ACTIVATED card in DB for validation testing');
  assert.ok(generatedCard, 'Must have at least one GENERATED card in DB for validation testing');

  // Test 4A: Validate via Card Serial
  const cardSerialReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: activatedCard.cardSerial }),
  });
  const cardSerialRes = await POST(cardSerialReq);
  assert.strictEqual(cardSerialRes.status, 200, 'Valid card serial must return HTTP 200');
  const cardSerialData = (await cardSerialRes.json()) as ApiSuccessResponse;
  assert.strictEqual(cardSerialData.success, true);
  assert.strictEqual(cardSerialData.card.cardSerial, activatedCard.cardSerial);
  assert.strictEqual(cardSerialData.card.status, 'ACTIVATED');
  assert.strictEqual(cardSerialData.stubs.length, 6, 'Must always report exactly 6 stubs');
  assert.strictEqual(cardSerialData.stubsSummary.total, 6);

  // Demographics Sanitization Check: Strictly NO contactInfo, NO phone, NO email
  assert.ok(cardSerialData.demographics !== null, 'Activated card must have demographics');
  assert.strictEqual(typeof cardSerialData.demographics.buyerName, 'string');
  assert.strictEqual(typeof cardSerialData.demographics.buyerTypeLabel, 'string');
  assert.strictEqual('contactInfo' in cardSerialData.demographics, false, 'contactInfo must NOT leak');
  assert.strictEqual('phone' in cardSerialData.demographics, false, 'phone must NOT leak');
  assert.strictEqual('email' in cardSerialData.demographics, false, 'email must NOT leak');
  console.log('Passed: Card serial resolution and demographic PII sanitization verified.');

  // Test 4B: Validate via Master QR format: MASTER:<serial>
  const masterQrReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: `MASTER:${activatedCard.cardSerial}` }),
  });
  const masterQrRes = await POST(masterQrReq);
  assert.strictEqual(masterQrRes.status, 200, 'MASTER: prefix must resolve card');
  const masterQrData = (await masterQrRes.json()) as ApiSuccessResponse;
  assert.strictEqual(masterQrData.card.cardSerial, activatedCard.cardSerial);
  console.log('Passed: MASTER: QR string resolution verified.');

  // Test 4C: Validate via Stub Serial: <cardSerial>-S1
  const stubSerial = `${activatedCard.cardSerial}-S1`;
  const stubReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: stubSerial }),
  });
  const stubRes = await POST(stubReq);
  assert.strictEqual(stubRes.status, 200, 'Stub serial must resolve card');
  const stubData = (await stubRes.json()) as ApiSuccessResponse;
  assert.strictEqual(stubData.card.cardSerial, activatedCard.cardSerial);
  console.log('Passed: Stub serial resolution verified.');

  // Test 4D: Validate via Cryptographic Base64URL QR token
  const secretKey = process.env.EVENT_HMAC_SECRET;
  if (secretKey && secretKey.length >= 32) {
    const signature = generateStubSignature(stubSerial, 1, secretKey);
    const tokenPayload = `${stubSerial}|1|${signature}`;
    const base64UrlToken = Buffer.from(tokenPayload, 'utf8').toString('base64url');

    const qrTokenReq = new Request('http://localhost:3000/api/cards/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ code: base64UrlToken }),
    });
    const qrTokenRes = await POST(qrTokenReq);
    assert.strictEqual(qrTokenRes.status, 200, 'Base64URL QR token must resolve card');
    const qrTokenData = (await qrTokenRes.json()) as ApiSuccessResponse;
    assert.strictEqual(qrTokenData.card.cardSerial, activatedCard.cardSerial);
    console.log('Passed: Cryptographic Base64URL QR token resolution verified.');

    // Test 4E: Validate via <stubSerial>.<PIN> format
    const pin = generateStubVerificationCode(stubSerial, 1, secretKey);
    const pinPayload = `${stubSerial}.${pin}`;
    const pinReq = new Request('http://localhost:3000/api/cards/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
      body: JSON.stringify({ code: pinPayload }),
    });
    const pinRes = await POST(pinReq);
    assert.strictEqual(pinRes.status, 200, '<stubSerial>.<PIN> must resolve card');
    const pinData = (await pinRes.json()) as ApiSuccessResponse;
    assert.strictEqual(pinData.card.cardSerial, activatedCard.cardSerial);
    console.log('Passed: <stubSerial>.<PIN> token resolution verified.');
  }

  // Test 5: Validate GENERATED (Unsold) Card
  console.log('Test 5: GENERATED (Unsold) Card Status & Telemetry Invariants...');
  const genReq = new Request('http://localhost:3000/api/cards/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': testIp },
    body: JSON.stringify({ code: generatedCard.cardSerial }),
  });
  const genRes = await POST(genReq);
  assert.strictEqual(genRes.status, 200, 'Generated card must return HTTP 200');
  const genData = (await genRes.json()) as ApiSuccessResponse;
  assert.strictEqual(genData.card.status, 'GENERATED');
  assert.strictEqual(genData.demographics, null, 'Unsold card demographics must be strictly null');
  assert.strictEqual(genData.stubs.length, 6, 'Must report all 6 stubs');
  for (const stub of genData.stubs) {
    assert.strictEqual(stub.status, 'INACTIVE', 'Unsold stubs must have status INACTIVE');
    assert.strictEqual(stub.isRedeemed, false);
    assert.strictEqual(stub.redeemedAt, null);
    assert.strictEqual(stub.votedBooth, null);
  }
  assert.strictEqual(genData.stubsSummary.total, 6);
  assert.strictEqual(genData.stubsSummary.redeemed, 0);
  assert.strictEqual(genData.stubsSummary.available, 0);
  console.log('Passed: GENERATED card invariants (demographics: null, stubs: INACTIVE) verified.');

  console.log('All 5 Card Validator test suites passed successfully.');
}

runValidatorTests()
  .catch((err) => {
    console.error('Validator test failure:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
