import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SITE_ID = 'itechtivity-2027-site';
const PUBLIC_DOMAIN = 'itech2027-voting.appwrite.network';
const REQUIRED_ENV = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'];
const EXCLUDED_PATHS = [
  '.github',
  'node_modules',
  '.next',
  '.git',
  '.env',
  'storage',
  'output',
  'certificates',
  '.playwright-cli',
  'functions',
  'cookies.txt',
  'tsconfig.tsbuildinfo',
];

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

async function syncSiteVariables(endpoint, headers) {

  const desiredVars = {
    DATABASE_URL: process.env.DATABASE_URL || '',
    DIRECT_URL: process.env.DIRECT_URL || '',
    EVENT_HMAC_SECRET: process.env.EVENT_HMAC_SECRET || '',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || '',
    NEXTAUTH_URL: `https://${PUBLIC_DOMAIN}`,
    APPWRITE_ENDPOINT: endpoint,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027',
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY || '',
    APPWRITE_STORAGE_BUCKET_ID: process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf',
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID || 'itech2027-db',
    APPWRITE_VOTES_COLLECTION_ID: process.env.APPWRITE_VOTES_COLLECTION_ID || 'votes',
    APPWRITE_PDF_BATCHES_COLLECTION_ID: process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches',
    APPWRITE_LEADERBOARD_COLLECTION_ID: process.env.APPWRITE_LEADERBOARD_COLLECTION_ID || 'leaderboard_cache',
    APPWRITE_FUNCTION_ID: process.env.APPWRITE_FUNCTION_ID || 'generate-bingo-pdf',
    NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || endpoint,
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'itechtivity-2027',
    NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET_ID: process.env.NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf',
    NEXT_PUBLIC_APPWRITE_DATABASE_ID: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'itech2027-db',
    NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID: process.env.NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID || 'votes',
    NEXT_PUBLIC_APPWRITE_PDF_BATCHES_COLLECTION_ID: process.env.NEXT_PUBLIC_APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches',
  };

  const listRes = await fetch(`${endpoint}/sites/${SITE_ID}/variables`, { headers });
  if (!listRes.ok) {
    throw new Error(`Failed to list site variables: ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const existingByKey = new Map((listData.variables || []).map((v) => [v.key, v]));

  const entries = Object.entries(desiredVars).filter(([, value]) => Boolean(value));
  console.log(`Synchronizing ${entries.length} site environment variables...`);

  await Promise.all(
    entries.map(async ([key, value]) => {
      const existing = existingByKey.get(key);
      const isSecret = key.includes('SECRET') || key.includes('API_KEY') || key.includes('DATABASE_URL') || key.includes('DIRECT_URL');

      if (existing) {
        if (existing.value === value) return;
        const updateRes = await fetch(`${endpoint}/sites/${SITE_ID}/variables/${existing.$id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value, secret: isSecret }),
        });
        if (!updateRes.ok && isSecret) {
          // Secret variables cannot be updated in-place once marked secret; recreate if needed
          await fetch(`${endpoint}/sites/${SITE_ID}/variables/${existing.$id}`, {
            method: 'DELETE',
            headers,
          });
          await fetch(`${endpoint}/sites/${SITE_ID}/variables`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ variableId: 'unique()', key, value, secret: isSecret }),
          });
        }
      } else {
        const createRes = await fetch(`${endpoint}/sites/${SITE_ID}/variables`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variableId: 'unique()', key, value, secret: isSecret }),
        });
        if (!createRes.ok) {
          throw new Error(`Failed to create site variable ${key}: ${await createRes.text()}`);
        }
      }
    })
  );
}

async function ensurePublicDomainRule(endpoint, headers) {

  const listRes = await fetch(`${endpoint}/proxy/rules`, { headers });
  if (!listRes.ok) return;

  const rulesData = await listRes.json();
  const hasPublicDomain = (rulesData.rules || []).some((r) => r.domain === PUBLIC_DOMAIN);

  if (!hasPublicDomain) {
    console.log(`Creating public proxy domain rule for ${PUBLIC_DOMAIN}...`);
    await fetch(`${endpoint}/proxy/rules/site`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: PUBLIC_DOMAIN, siteId: SITE_ID }),
    });
  }
}

async function ensureSiteBuildRuntime(endpoint, headers, targetRuntime = 'node-26') {

  const getRes = await fetch(`${endpoint}/sites/${SITE_ID}`, { headers });
  if (!getRes.ok) {
    throw new Error(`Failed to fetch site metadata: ${await getRes.text()}`);
  }

  const site = await getRes.json();
  if (site.buildRuntime === targetRuntime) return;

  console.log(`Updating site ${SITE_ID} buildRuntime from ${site.buildRuntime} to ${targetRuntime}...`);
  const updateRes = await fetch(`${endpoint}/sites/${SITE_ID}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: site.name,
      framework: site.framework || 'nextjs',
      buildRuntime: targetRuntime,
      enabled: site.enabled ?? true,
      logging: site.logging ?? true,
      timeout: site.timeout || 30,
      installCommand: site.installCommand || 'npm install',
      buildCommand: site.buildCommand || 'npm run build',
      outputDirectory: site.outputDirectory || '.next',
      adapter: site.adapter || 'ssr',
      buildSpecification: site.buildSpecification || 's-2vcpu-2gb',
    }),
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update site buildRuntime: ${await updateRes.text()}`);
  }
}

async function main() {

  loadDotEnv();

  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const endpoint = process.env.APPWRITE_ENDPOINT;
  const headers = {
    'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
    'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
  };

  await ensureSiteBuildRuntime(endpoint, headers, 'node-26');
  await syncSiteVariables(endpoint, headers);
  await ensurePublicDomainRule(endpoint, headers);

  if (process.env.SYNC_VARS_ONLY === 'true') {
    console.log('Site variables and public domain rule synchronized (SYNC_VARS_ONLY=true).');
    return;
  }

  const tarPath = path.join(process.cwd(), 'tmp-site.tar.gz');
  const excludeFlags = EXCLUDED_PATHS.map((entry) => `--exclude="./${entry}"`).join(' ');
  execSync(`tar ${excludeFlags} -czf "${tarPath}" .`);

  const tarBuffer = fs.readFileSync(tarPath);
  fs.unlinkSync(tarPath);
  console.log(`Uploading site archive (${(tarBuffer.length / 1024).toFixed(0)} KB)...`);

  const form = new FormData();
  form.append('code', new Blob([tarBuffer], { type: 'application/gzip' }), 'code.tar.gz');
  form.append('activate', 'true');
  form.append('installCommand', 'npm install');
  form.append('buildCommand', 'npm run build');
  form.append('outputDirectory', '.next');

  const createRes = await fetch(`${endpoint}/sites/${SITE_ID}/deployments`, {
    method: 'POST',
    headers,
    body: form,
  });
  const deployment = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Create deployment failed: ${JSON.stringify(deployment)}`);
  }
  console.log(`Deployment ${deployment.$id} queued.`);

  for (let attempt = 1; attempt <= 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusRes = await fetch(`${endpoint}/sites/${SITE_ID}/deployments/${deployment.$id}`, { headers });
    const current = await statusRes.json();
    console.log(`  [${attempt}] status: ${current.status}`);

    if (current.status === 'ready') {
      console.log(`Deployment ${deployment.$id} READY and ACTIVE at https://${PUBLIC_DOMAIN}`);
      return;
    }
    if (current.status === 'failed') {
      throw new Error(`Build failed:\n${current.buildLogs}`);
    }
  }

  throw new Error('Timed out waiting for site build.');
}

main().catch((err) => {
  console.error('Site deployment error:', err);
  process.exit(1);
});
