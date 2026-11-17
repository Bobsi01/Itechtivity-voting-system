import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {

  // Load .env in standalone CLI/test invocations where Next.js env loading has not run
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      // Production runtimes inject environment variables directly without a local .env file
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('CRITICAL: DATABASE_URL environment variable is missing.');
  }

  const adapter = new PrismaPg({ connectionString });

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
