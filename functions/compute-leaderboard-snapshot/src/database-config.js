export function createDatabasePoolConfig(environment = process.env) {

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('MISSING_DATABASE_URL');

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('INVALID_DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    throw new Error('INVALID_DATABASE_URL');
  }

  // pg URL options can replace its explicit SSL object. Always keep transport policy here.
  const transportOptions = new Set(['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat', 'sslnegotiation']);
  for (const key of [...parsedUrl.searchParams.keys()]) {
    if (transportOptions.has(key.toLowerCase())) parsedUrl.searchParams.delete(key);
  }

  const certificateAuthority = environment.DATABASE_CA_CERT?.trim();
  if (certificateAuthority && (certificateAuthority.length > 65536
    || !certificateAuthority.includes('-----BEGIN CERTIFICATE-----')
    || !certificateAuthority.includes('-----END CERTIFICATE-----'))) {
    throw new Error('INVALID_DATABASE_CA_CERT');
  }

  return {
    connectionString: parsedUrl.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(certificateAuthority ? { ca: certificateAuthority } : {}),
    },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  };
}
