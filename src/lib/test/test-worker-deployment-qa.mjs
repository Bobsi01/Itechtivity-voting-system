import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const deploymentSource = fs.readFileSync(new URL('../../../scripts/deploy-appwrite-functions.mjs', import.meta.url), 'utf8');
const deploymentWithoutImports = deploymentSource.replace(/^import .*;\r?\n/gm, '');
const deploymentDefinitions = deploymentWithoutImports.slice(0, deploymentWithoutImports.lastIndexOf('main().catch'));
const environment = { DATABASE_CA_CERT: '', PRESET: 'explicit' };
const requests = [];
let existingVariables = [{ key: 'DATABASE_CA_CERT', value: 'old-ca', $id: 'ca-variable' }];
const deploymentContext = vm.createContext({
  process: { env: environment, cwd: () => '/fixture' },
  fs: { existsSync: () => true, readFileSync: () => 'DATABASE_CA_CERT="old-local-ca"\nPRESET=local\nUNSET=loaded' },
  path: { join: (...parts) => parts.join('/') },
  fetch: async (url, options = {}) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => ({ variables: existingVariables }) };
  },
});
vm.runInContext(deploymentDefinitions, deploymentContext);
vm.runInContext('loadDotEnv()', deploymentContext);
assert.equal(environment.DATABASE_CA_CERT, '');
assert.equal(environment.PRESET, 'explicit');
assert.equal(environment.UNSET, 'loaded');

await vm.runInContext("syncFunctionVariables('https://fixture.invalid', {}, 'worker', { DATABASE_CA_CERT: '', DATABASE_URL: '' })", deploymentContext);
assert.equal(requests.length, 2);
assert.equal(requests[1].method, 'PUT');
assert.deepEqual(JSON.parse(requests[1].body), { key: 'DATABASE_CA_CERT', value: '' });
requests.length = 0;
existingVariables = [];
await vm.runInContext("syncFunctionVariables('https://fixture.invalid', {}, 'worker', { DATABASE_CA_CERT: '' })", deploymentContext);
assert.equal(requests[1].method, 'POST');
assert.deepEqual(JSON.parse(requests[1].body), { key: 'DATABASE_CA_CERT', value: '' });

const workerSource = fs.readFileSync(new URL('../../../functions/generate-bingo-pdf/src/main.js', import.meta.url), 'utf8');
let generationAttempts = 0;
const workerContext = vm.createContext({
  process: { env: { EVENT_HMAC_SECRET: 'isolated-test-hmac-fixture-32-characters', DIRECT_URL: 'postgresql://fixture.invalid/db' } },
  pg: { Pool: class { constructor() { throw new Error('Unexpected database access'); } } },
  PDFDocument: class { constructor() { generationAttempts++; throw new Error('Unexpected generation'); } },
});
vm.runInContext(workerSource.replace(/^import .*;\r?\n/gm, '').replace('export default async', 'globalThis.handler = async'), workerContext);
const response = await workerContext.handler({
  req: { body: { batchId: 'isolated-batch', totalCards: 1 } },
  res: { json: (body, status) => ({ body, status }) },
  log: () => { throw new Error('Generation started before configuration validation'); },
  error: () => {},
});
assert.equal(response.status, 500);
assert.equal(response.body.error, 'MISSING_DATABASE_URL');
assert.equal(generationAttempts, 0);
console.log('Worker deployment regressions passed: explicit empty environment, stale CA clearing, empty CA creation, and fail-fast PDF persistence configuration.');
