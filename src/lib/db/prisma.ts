import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

const DEFAULT_POOL_MAX = 5;
const MIN_POOL_MAX = 1;
const MAX_POOL_MAX = 10;
const CONNECTION_TIMEOUT_MS = 10000;
const IDLE_TIMEOUT_MS = 30000;
const MAX_CA_CERT_LENGTH = 65536;

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const TRANSPORT_QUERY_PARAMS = new Set([
  'ssl',
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'uselibpqcompat',
  'sslnegotiation',
]);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function loadStandaloneEnvIfNeeded(): void {

  // Load .env in standalone CLI/test invocations where Next.js env loading has not run
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      // Production runtimes inject environment variables directly without a local .env file
    }
  }
}

function parseBoundedPoolLimit(rawLimit: string | null): number {

  if (!rawLimit) {
    return DEFAULT_POOL_MAX;
  }

  const trimmedLimit = rawLimit.trim();
  if (!/^\d+$/.test(trimmedLimit)) {
    return DEFAULT_POOL_MAX;
  }

  const parsedLimit = Number.parseInt(trimmedLimit, 10);
  return Math.min(Math.max(parsedLimit, MIN_POOL_MAX), MAX_POOL_MAX);
}

function validateCertificateAuthority(rawCertificate: string | undefined): string | undefined {

  const certificateAuthority = rawCertificate?.trim();
  if (!certificateAuthority) {
    return undefined;
  }

  if (
    certificateAuthority.length > MAX_CA_CERT_LENGTH ||
    !certificateAuthority.includes('-----BEGIN CERTIFICATE-----') ||
    !certificateAuthority.includes('-----END CERTIFICATE-----')
  ) {
    throw new Error('INVALID_DATABASE_CA_CERT');
  }

  return certificateAuthority;
}

export function createDatabasePoolConfig(
  connectionUrl?: string,
  environment: NodeJS.ProcessEnv = process.env
): PoolConfig {

  const rawConnectionString = (connectionUrl ?? environment.DATABASE_URL)?.trim();
  if (!rawConnectionString) {
    throw new Error('CRITICAL: DATABASE_URL environment variable is missing.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawConnectionString);
  } catch {
    throw new Error('INVALID_DATABASE_URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    throw new Error('INVALID_DATABASE_URL');
  }

  const maxConnections = parseBoundedPoolLimit(parsedUrl.searchParams.get('connection_limit'));
  const certificateAuthority = validateCertificateAuthority(environment.DATABASE_CA_CERT);
  const isLocalHost = LOCAL_DATABASE_HOSTS.has(parsedUrl.hostname.toLowerCase());
  const rawSslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase();
  const rawSslParam = parsedUrl.searchParams.get('ssl')?.toLowerCase();
  const explicitLocalSsl =
    isLocalHost &&
    (rawSslMode === 'require' ||
      rawSslMode === 'verify-ca' ||
      rawSslMode === 'verify-full' ||
      rawSslParam === 'true' ||
      rawSslParam === '1');

  // pg parses URL transport query params over explicit PoolConfig.ssl, which can silently downgrade rejectUnauthorized.
  for (const key of [...parsedUrl.searchParams.keys()]) {
    if (TRANSPORT_QUERY_PARAMS.has(key.toLowerCase())) {
      parsedUrl.searchParams.delete(key);
    }
  }

  const sslConfig: PoolConfig['ssl'] =
    isLocalHost && !explicitLocalSsl && !certificateAuthority
      ? false
      : {
          rejectUnauthorized: true,
          ...(certificateAuthority ? { ca: certificateAuthority } : {}),
        };

  return {
    connectionString: parsedUrl.toString(),
    ssl: sslConfig,
    max: maxConnections,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
  };
}

function createPrismaClient(): PrismaClient {

  loadStandaloneEnvIfNeeded();

  const poolConfig = createDatabasePoolConfig(process.env.DATABASE_URL);
  const adapter = new PrismaPg(poolConfig, {
    onPoolError: (error: Error) => {
      console.error('PostgreSQL pool error:', error.message);
    },
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
