import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    const eqIdx = trimmed.indexOf('=');
    if (!trimmed || trimmed.startsWith('#') || eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const BASE_URL = process.env.BASE_URL?.trim() || 'https://itech2027-voting.appwrite.network';
const SMOKE_ONLY = process.env.SMOKE_ONLY === 'true';

let passed = 0;
let failed = 0;

function check(condition, name, detail = '') {

  if (condition) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name} ${detail}`);
  }
}

function encodeStubQrPayload(stubSerial, slotNumber, secretKey) {

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${stubSerial}:${slotNumber}`)
    .digest('base64url')
    .slice(0, 24);
  const rawString = `${stubSerial}|${slotNumber}|${signature}`;

  return Buffer.from(rawString, 'utf8').toString('base64url');
}

async function login(email, password) {

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

  return { status: res.status, body, cookie };
}

async function runSmokeChecks() {

  // Independent requests run in parallel to keep the post-deploy gate fast.
  const [home, loginPage, anon, wrongPassword] = await Promise.all([
    fetch(`${BASE_URL}/`),
    fetch(`${BASE_URL}/login`),
    fetch(`${BASE_URL}/api/production/files`),
    login('prod@itech2027.edu', 'wrong-password'),
  ]);

  check(home.status === 200, 'GET / returns 200', `got ${home.status}`);
  check(loginPage.status === 200, 'GET /login returns 200', `got ${loginPage.status}`);
  check(anon.status === 401 || anon.status === 403, 'Anonymous production API is rejected', `got ${anon.status}`);
  check(wrongPassword.status === 401 || wrongPassword.status === 400, 'Wrong password is rejected', `got ${wrongPassword.status}`);

  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
  if (adminPassword) {
    const admin = await login('admin@itech2027.edu', adminPassword);
    check(admin.status === 200 && admin.cookie.length > 0, 'Admin login reaches Supabase', `got ${admin.status}`);
  }
}

async function runFullChecks() {

  const prod = await login('prod@itech2027.edu', 'ProdPass2027!');
  check(prod.status === 200 && prod.cookie.length > 0, 'Production login succeeds against Supabase', `got ${prod.status} ${JSON.stringify(prod.body)}`);
  if (!prod.cookie) return;

  const prodHeaders = { Cookie: prod.cookie, 'Content-Type': 'application/json' };

  const before = await (await fetch(`${BASE_URL}/api/production/files`, { headers: prodHeaders })).json();
  check(before.success === true, 'Production file list loads from Supabase');

  console.log('\nTriggering async PDF batch (4 cards) via deployed site...');
  const startedAt = Date.now();
  const gen = await fetch(`${BASE_URL}/api/production/generate`, {
    method: 'POST',
    headers: prodHeaders,
    body: JSON.stringify({ totalCards: 4 }),
  });
  const genBody = await gen.json();
  check(gen.status === 200 && genBody.success, 'Generate endpoint accepted batch', JSON.stringify(genBody));
  check(Boolean(genBody.batch?.executionId || genBody.batch?.batchId), 'Batch generation was successfully initiated', JSON.stringify(genBody.batch));
  console.log(`Generate responded in ${Date.now() - startedAt} ms`);
  if (!genBody.success) return;

  const batchId = genBody.batch.batchId;
  let batchFile = null;

  for (let attempt = 0; attempt < 20 && !batchFile; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const list = await (await fetch(`${BASE_URL}/api/production/files`, { headers: prodHeaders })).json();
    const candidate = list.files?.find((f) => f.id === batchId);
    if (candidate && candidate.fileSizeBytes > 0) batchFile = candidate;
  }
  check(Boolean(batchFile), 'Batch appears in explorer with a file size');
  if (!batchFile) return;

  const pdfRes = await fetch(`${BASE_URL}${batchFile.downloadUrl}`, { headers: { Cookie: prod.cookie } });
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  check(pdfRes.status === 200, 'PDF download returns 200', `got ${pdfRes.status}`);
  check(pdfBytes.subarray(0, 5).toString() === '%PDF-', 'Downloaded file is a valid PDF');
  check(pdfBytes.length > 20000, `PDF has real content (${pdfBytes.length} bytes)`);

  // Authenticate Admin, Registration, and Exhibitor roles in parallel
  const [admin, reg, booth] = await Promise.all([
    login('admin@itech2027.edu', 'AdminPass2027!'),
    login('reg.desk1@itech2027.edu', 'RegPass2027!'),
    login('booth.cs01@itech2027.edu', 'BoothPass2027!'),
  ]);

  check(admin.status === 200, 'Admin login succeeds', `got ${admin.status}`);
  check(reg.status === 200, 'Registration login succeeds', `got ${reg.status}`);
  check(booth.status === 200, 'Exhibitor login succeeds', `got ${booth.status}`);

  const exhibitorOnProduction = await fetch(`${BASE_URL}/api/production/files`, { headers: { Cookie: booth.cookie } });
  check(exhibitorOnProduction.status === 403 || exhibitorOnProduction.status === 401, 'Exhibitor cannot access production API (RBAC)', `got ${exhibitorOnProduction.status}`);

  // Fetch newly created batch card serials via Admin API
  const adminHeaders = { Cookie: admin.cookie, 'Content-Type': 'application/json' };
  const batchesRes = await (await fetch(`${BASE_URL}/api/admin/cards/batch`, { headers: adminHeaders })).json();
  const targetBatchMeta = batchesRes.batches?.find((b) => b.id === batchId);
  check(Boolean(targetBatchMeta?.firstSerial && targetBatchMeta?.lastSerial), 'Admin batch telemetry resolves generated card serials', JSON.stringify(targetBatchMeta));
  if (!targetBatchMeta?.firstSerial || !targetBatchMeta?.lastSerial) return;

  const activeSerial = targetBatchMeta.firstSerial;
  const unactivatedSerial = targetBatchMeta.lastSerial;

  // Bind and activate the first card via Registration Desk API with Idempotency-Key
  const regIdempotencyKey = crypto.randomUUID();
  const regHeaders = {
    Cookie: reg.cookie,
    'Content-Type': 'application/json',
    'Idempotency-Key': regIdempotencyKey,
  };
  const bindPayload = {
    buyerType: 'CSD_STUDENT',
    buyerName: 'Production E2E Verification',
    studentNumber: '2027-9999-CS',
    program: 'BSCS',
    yearAndSection: '4A',
    cardSerials: [activeSerial],
  };

  const bindRes = await fetch(`${BASE_URL}/api/registration/bind`, {
    method: 'POST',
    headers: regHeaders,
    body: JSON.stringify(bindPayload),
  });
  const bindBody = await bindRes.json();
  check(bindRes.status === 200 && bindBody.success && bindBody.stubsActivatedCount === 6, `Registration Desk activates card ${activeSerial} and 6 stubs`, JSON.stringify(bindBody));

  // Verify Registration Idempotency-Key replay returns identical transactionId
  const bindReplayRes = await fetch(`${BASE_URL}/api/registration/bind`, {
    method: 'POST',
    headers: regHeaders,
    body: JSON.stringify(bindPayload),
  });
  const bindReplayBody = await bindReplayRes.json();
  check(bindReplayRes.status === 200 && bindReplayBody.transactionId === bindBody.transactionId, 'Registration Idempotency-Key replay returns cached transaction');

  // Inspect both cards via Admin API to get stub serials
  const [activeCardRes, unactivatedCardRes, boothMeRes] = await Promise.all([
    fetch(`${BASE_URL}/api/admin/cards?serial=${encodeURIComponent(activeSerial)}`, { headers: adminHeaders }),
    fetch(`${BASE_URL}/api/admin/cards?serial=${encodeURIComponent(unactivatedSerial)}`, { headers: adminHeaders }),
    fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: booth.cookie } }),
  ]);
  const activeCardData = await activeCardRes.json();
  const unactivatedCardData = await unactivatedCardRes.json();
  const boothMeData = await boothMeRes.json();

  const activeStub = activeCardData.card?.stubs?.[0];
  const unactivatedStub = unactivatedCardData.card?.stubs?.[0];
  const boothId = boothMeData.user?.boothId;

  check(Boolean(activeStub && unactivatedStub && boothId), 'Resolved active stub, unactivated stub, and exhibitor boothId');
  if (!activeStub || !unactivatedStub || !boothId) return;

  const hmacSecret = process.env.EVENT_HMAC_SECRET;
  const validQrPayload = hmacSecret
    ? encodeStubQrPayload(activeStub.stubSerial, activeStub.slotNumber, hmacSecret)
    : activeStub.stubSerial;
  const unactivatedQrPayload = hmacSecret
    ? encodeStubQrPayload(unactivatedStub.stubSerial, unactivatedStub.slotNumber, hmacSecret)
    : unactivatedStub.stubSerial;
  const tamperedQrPayload = Buffer.from(
    `${activeStub.stubSerial}|${activeStub.slotNumber}|000000000000000000000000`,
    'utf8'
  ).toString('base64url');

  // 1. Reject tampered QR signature before DB mutation
  const tamperedRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: {
      Cookie: booth.cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ qrPayload: tamperedQrPayload, boothId }),
  });
  check(tamperedRes.status === 400, 'Tampered QR signature is rejected (400)', `got ${tamperedRes.status}`);

  // 2. Reject unactivated card stub
  const unactVoteRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: {
      Cookie: booth.cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ qrPayload: unactivatedQrPayload, boothId }),
  });
  const unactVoteBody = await unactVoteRes.json();
  check(unactVoteRes.status === 400 && unactVoteBody.error === 'TICKET_NOT_ACTIVATED', 'Unactivated card stub is rejected (400 TICKET_NOT_ACTIVATED)', JSON.stringify(unactVoteBody));

  // 3. Accept valid activated stub scan
  const voteIdempotencyKey = crypto.randomUUID();
  const voteRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: {
      Cookie: booth.cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': voteIdempotencyKey,
    },
    body: JSON.stringify({ qrPayload: validQrPayload, boothId }),
  });
  const voteBody = await voteRes.json();
  check(voteRes.status === 200 && voteBody.success && voteBody.message === 'VOTE_ACCEPTED', `Exhibitor vote scan accepted (${activeStub.stubSerial})`, JSON.stringify(voteBody));

  // 4. Verify Idempotency-Key retry returns identical 200 payload
  const voteRetryRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: {
      Cookie: booth.cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': voteIdempotencyKey,
    },
    body: JSON.stringify({ qrPayload: validQrPayload, boothId }),
  });
  const voteRetryBody = await voteRetryRes.json();
  check(voteRetryRes.status === 200 && voteRetryBody.voteId === voteBody.voteId, 'Exhibitor scan Idempotency-Key retry returns identical voteId');

  // 5. Verify Anti-Double-Spend rejects second scan with a new Idempotency-Key
  const doubleSpendRes = await fetch(`${BASE_URL}/api/vote`, {
    method: 'POST',
    headers: {
      Cookie: booth.cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ qrPayload: validQrPayload, boothId }),
  });
  const doubleSpendBody = await doubleSpendRes.json();
  check(doubleSpendRes.status === 409 && doubleSpendBody.error === 'TICKET_ALREADY_REDEEMED', 'Anti-Double-Spend blocks duplicate stub redemption (409)', JSON.stringify(doubleSpendBody));

  // 6. Verify Appwrite Cloud Realtime collections contain live broadcast documents
  const appwriteEndpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
  const appwriteProject = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
  const appwriteKey = process.env.APPWRITE_API_KEY;

  if (appwriteKey) {
    const awHeaders = {
      'X-Appwrite-Project': appwriteProject,
      'X-Appwrite-Key': appwriteKey,
    };
    const [batchesDocsRes, votesDocsRes] = await Promise.all([
      fetch(`${appwriteEndpoint}/databases/itech2027-db/collections/pdf_batches/documents`, { headers: awHeaders }),
      fetch(`${appwriteEndpoint}/databases/itech2027-db/collections/votes/documents`, { headers: awHeaders }),
    ]);
    const batchesDocs = await batchesDocsRes.json();
    const votesDocs = await votesDocsRes.json();

    check((batchesDocs.total || 0) >= 1, `Appwrite Realtime pdf_batches collection has live documents (${batchesDocs.total})`);
    check((votesDocs.total || 0) >= 1, `Appwrite Realtime votes collection has live broadcast documents (${votesDocs.total})`);
  }
}

async function main() {

  console.log(`Testing deployed site: ${BASE_URL} (${SMOKE_ONLY ? 'smoke only' : 'full production E2E'})\n`);

  await runSmokeChecks();
  if (!SMOKE_ONLY) {
    await runFullChecks();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Live test crashed:', err);
  process.exit(1);
});
