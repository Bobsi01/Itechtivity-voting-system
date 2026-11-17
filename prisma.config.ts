import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const MAX_CA_CERT_LENGTH = 65536;

function resolveCliDatasourceUrl(): string | undefined {

  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      // Production and CI environments inject variables without a local .env file
    }
  }

  const certificateAuthority = process.env.DATABASE_CA_CERT?.trim();
  if (
    certificateAuthority &&
    (certificateAuthority.length > MAX_CA_CERT_LENGTH ||
      !certificateAuthority.includes('-----BEGIN CERTIFICATE-----') ||
      !certificateAuthority.includes('-----END CERTIFICATE-----'))
  ) {
    throw new Error('INVALID_DATABASE_CA_CERT');
  }

  return process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || undefined;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveCliDatasourceUrl(),
  },
});
