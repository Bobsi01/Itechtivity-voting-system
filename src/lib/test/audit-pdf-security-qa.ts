import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

async function main() {

  const database = 'itech_audit_20261024_f7ac5223';
  const password = /POSTGRES_PASSWORD:\s*(\S+)/.exec(readFileSync('docker-compose.yml', 'utf8'))?.[1];
  assert(password);
  process.env.DATABASE_URL = `postgresql://itech_admin:${encodeURIComponent(password)}@127.0.0.1:5433/${database}`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  const target = new URL(process.env.DATABASE_URL);
  assert.equal(target.hostname, '127.0.0.1');
  assert.equal(target.port, '5433');
  assert.equal(target.pathname, `/${database}`);
  process.env.EVENT_HMAC_SECRET = 'audit-hmac-539bfe825ee34e0dae4b1400a6f48ec0';
  process.env.APPWRITE_ENDPOINT = 'http://localhost:8080/v1';
  process.env.APPWRITE_API_KEY = 'local_appwrite_server_key';
  Object.assign(process.env, { NODE_ENV: 'test' });
  const { default: prisma } = await import('../db/prisma');
  const { generateCardBatch } = await import('../pdf/local-generator');
  const { loadPrintableBoothLogos } = await import('../pdf/booth-logos');
  const { downloadBoothLogoFromAppwrite } = await import('../appwrite/server');
  try {
    const originalTransaction = prisma.$transaction;
    let transactions = 0;
    prisma.$transaction = (() => { transactions++; throw new Error('Unexpected DB access'); }) as typeof prisma.$transaction;
    for (const count of [0, -4, 1, 201, 204, 4.5, NaN, Infinity]) {
      await assert.rejects(generateCardBatch({ totalCards: count }), /INVALID_BATCH_SIZE/);
    }
    assert.equal(transactions, 0);
    prisma.$transaction = originalTransaction;
    console.log('PASS invalid batch counts rejected before DB access');

    Object.assign(process.env, { NODE_ENV: 'development' });
    const batches = await Promise.all([generateCardBatch({ totalCards: 4 }), generateCardBatch({ totalCards: 4 })]);
    assert.notEqual(batches[0].batchNumber, batches[1].batchNumber);
    for (const batch of batches) {
      const stored = await prisma.pdfBatch.findUniqueOrThrow({ where: { id: batch.batchId }, include: { _count: { select: { cards: true } } } });
      assert.equal(stored.status, 'COMPLETED');
      assert.equal(stored._count.cards, 4);
      assert(batch.fileSizeBytes > 1000);
    }
    console.log('PASS concurrent batches have distinct numbers and four committed cards each');
    Object.assign(process.env, { NODE_ENV: 'production' });
    const latest = await prisma.pdfBatch.findFirstOrThrow({ orderBy: { batchNumber: 'desc' } });
    await assert.rejects(generateCardBatch({ totalCards: 4 }), /PDF_STORAGE_FAILED/);
    const failed = await prisma.pdfBatch.findFirstOrThrow({ where: { batchNumber: { gt: latest.batchNumber } }, include: { _count: { select: { cards: true } } } });
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed._count.cards, 0);
    console.log(`PASS storage failure creates FAILED batch with zero inventory: ${failed.fileName}`);

    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('Unexpected fetch'); };
    process.env.APPWRITE_ENDPOINT = 'https://managed.example.test/v1';
    process.env.APPWRITE_API_KEY = 'audit-mocked-key';
    const prefix = 'https://managed.example.test/v1/storage/buckets/booth-logos/files/logo/view';
    const forbidden = ['http://127.0.0.1/secrets', 'http://169.254.169.254/latest/meta-data', `${prefix}?project=other`, `${prefix}?project=itechtivity-2027&redirect=http://127.0.0.1`, 'https://managed.example.test/v1/storage/buckets/other/files/logo/view?project=itechtivity-2027', '/uploads/booths/../../secret.png', '/uploads/booths/%2e%2e/secret.png', `${prefix}/../private?project=itechtivity-2027`];
    assert.deepEqual(await loadPrintableBoothLogos(forbidden.map((logoUrl, index) => ({ code: `QA${index}`, logoUrl }))), {});
    assert.equal(calls, 0);
    console.log('PASS forbidden network, project, query, bucket and traversal URLs never fetch');
    let cancelled = false;
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.equal(init?.redirect, 'error');
      assert(init.signal instanceof AbortSignal);
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); controller.enqueue(new Uint8Array(1)); },
        cancel() { cancelled = true; },
      }));
    };
    assert.equal(await downloadBoothLogoFromAppwrite('logo'), null);
    assert(cancelled);
    console.log('PASS managed streaming reader cancels payload exceeding three MiB; redirect:error and abort signal set');
    globalThis.fetch = realFetch;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
