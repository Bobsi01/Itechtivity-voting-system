import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

function loadDotEnv() {

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function syncFunctionVariables(endpoint, headers, functionId, envMap) {

  const existingRes = await fetch(`${endpoint}/functions/${functionId}/variables`, { headers });
  if (!existingRes.ok) {
    throw new Error(`Failed to list variables for ${functionId}: ${await existingRes.text()}`);
  }
  const existingList = await existingRes.json();
  const existingByKey = new Map((existingList.variables || []).map((v) => [v.key, v]));

  const entries = Object.entries(envMap).filter(([, value]) => Boolean(value));
  await Promise.all(
    entries.map(async ([key, value]) => {
      const existing = existingByKey.get(key);
      if (existing) {
        if (existing.value === value) return;
        const updateRes = await fetch(`${endpoint}/functions/${functionId}/variables/${existing.$id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!updateRes.ok) {
          throw new Error(`Failed to update variable ${key} for ${functionId}: ${await updateRes.text()}`);
        }
      } else {
        const createRes = await fetch(`${endpoint}/functions/${functionId}/variables`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!createRes.ok) {
          throw new Error(`Failed to create variable ${key} for ${functionId}: ${await createRes.text()}`);
        }
      }
    })
  );
}

async function deployFunction(functionDef, envMap, endpoint, headers) {

  const { id, dir, entrypoint, commands, runtime = 'node-26' } = functionDef;

  const getRes = await fetch(`${endpoint}/functions/${id}`, { headers });
  if (!getRes.ok) {
    throw new Error(`Failed to get function ${id}: ${await getRes.text()}`);
  }
  const currentFn = await getRes.json();

  if (currentFn.runtime !== runtime) {
    console.log(`[Appwrite Deploy] Updating ${id} runtime from ${currentFn.runtime} to ${runtime}...`);
    const updateRes = await fetch(`${endpoint}/functions/${id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: currentFn.name,
        runtime,
        execute: currentFn.execute,
        events: currentFn.events,
        timeout: currentFn.timeout,
        enabled: currentFn.enabled,
        logging: currentFn.logging,
        entrypoint,
        commands,
        scopes: currentFn.scopes,
        buildSpecification: currentFn.buildSpecification || 's-2vcpu-2gb',
      }),
    });
    if (!updateRes.ok) {
      throw new Error(`Failed to update runtime for ${id}: ${await updateRes.text()}`);
    }
  }

  console.log(`[Appwrite Deploy] Syncing variables for ${id}...`);
  await syncFunctionVariables(endpoint, headers, id, envMap);

  const absDir = path.join(process.cwd(), dir);
  const tarPath = path.join(os.tmpdir(), `tmp-${id}-${Date.now()}.tar.gz`);

  if (fs.existsSync(tarPath)) {
    fs.unlinkSync(tarPath);
  }

  execSync(`tar --exclude="node_modules" --exclude=".git" -czf "${tarPath}" -C "${absDir}" .`);
  const tarBuffer = fs.readFileSync(tarPath);
  fs.unlinkSync(tarPath);

  console.log(`[Appwrite Deploy] Uploading ${id} (${tarBuffer.length} bytes)...`);
  const form = new FormData();
  form.append('code', new Blob([tarBuffer], { type: 'application/gzip' }), 'code.tar.gz');
  form.append('activate', 'true');
  form.append('entrypoint', entrypoint);
  form.append('commands', commands);

  const deployRes = await fetch(`${endpoint}/functions/${id}/deployments`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!deployRes.ok) {
    throw new Error(`Failed to create deployment for ${id}: ${await deployRes.text()}`);
  }
  const deployment = await deployRes.json();

  console.log(`[Appwrite Deploy] ${id} -> deployment ${deployment.$id} queued. Waiting for build...`);

  for (let attempt = 1; attempt <= 60; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${endpoint}/functions/${id}/deployments/${deployment.$id}`, { headers });
    if (!statusRes.ok) continue;
    const current = await statusRes.json();

    if (current.status === 'ready') {
      console.log(`[Appwrite Deploy] ${id} deployment ${deployment.$id} is READY and ACTIVE.`);
      return current;
    }
    if (current.status === 'failed') {
      throw new Error(`Deployment ${deployment.$id} for ${id} failed. Build logs:\n${current.buildLogs}`);
    }
  }

  throw new Error(`Timed out waiting for function ${id} deployment ${deployment.$id} to finish building.`);
}

async function main() {

  loadDotEnv();

  const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
  const projectId = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
  const apiKey = process.env.APPWRITE_API_KEY;

  if (!apiKey || apiKey.includes('placeholder')) {
    throw new Error('Missing valid APPWRITE_API_KEY environment variable.');
  }

  const envMap = {
    DATABASE_URL: process.env.DATABASE_URL || '',
    DIRECT_URL: process.env.DIRECT_URL || '',
    EVENT_HMAC_SECRET: process.env.EVENT_HMAC_SECRET || '',
    APPWRITE_ENDPOINT: endpoint,
    APPWRITE_PROJECT_ID: projectId,
    APPWRITE_API_KEY: apiKey,
    APPWRITE_STORAGE_BUCKET_ID: process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf',
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID || 'itech2027-db',
    APPWRITE_VOTES_COLLECTION_ID: process.env.APPWRITE_VOTES_COLLECTION_ID || 'votes',
    APPWRITE_PDF_BATCHES_COLLECTION_ID: process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches',
    APPWRITE_LEADERBOARD_COLLECTION_ID: process.env.APPWRITE_LEADERBOARD_COLLECTION_ID || 'leaderboard_cache',
  };

  const functionsToDeploy = [
    {
      id: 'generate-bingo-pdf',
      dir: 'functions/generate-bingo-pdf',
      entrypoint: 'src/main.js',
      commands: 'npm install',
    },
    {
      id: 'cleanup-idempotency-sessions',
      dir: 'functions/cleanup-idempotency-sessions',
      entrypoint: 'src/main.js',
      commands: 'npm install',
    },
    {
      id: 'compute-leaderboard-snapshot',
      dir: 'functions/compute-leaderboard-snapshot',
      entrypoint: 'src/main.js',
      commands: 'npm install',
    },
  ];

  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // Deploy all 3 functions concurrently to minimize CI pipeline latency
  await Promise.all(functionsToDeploy.map((fn) => deployFunction(fn, envMap, endpoint, headers)));

  console.log('\nAll 3 Appwrite Serverless Functions deployed and verified READY.');
}

main().catch((err) => {
  console.error('Fatal deployment error:', err);
  process.exit(1);
});
