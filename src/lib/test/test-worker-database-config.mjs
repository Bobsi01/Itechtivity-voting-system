import assert from 'node:assert/strict';

const workers = ['cleanup-idempotency-sessions', 'compute-leaderboard-snapshot', 'generate-bingo-pdf'];

for (const worker of workers) {
  const { createDatabasePoolConfig } = await import(`../../../functions/${worker}/src/database-config.js`);
  const environment = {
    DATABASE_URL: 'postgresql://test:local@db.example.test:6543/test?pgbouncer=true&sslmode=no-verify&SSL=0&sslrootcert=bad&sslcert=bad&sslkey=bad&uselibpqcompat=true&sslnegotiation=direct',
    DIRECT_URL: 'postgresql://ignored.example.test/test',
  };
  const config = createDatabasePoolConfig(environment);
  const parsed = new URL(config.connectionString);
  assert.equal(parsed.hostname, 'db.example.test');
  assert.deepEqual([...parsed.searchParams], [['pgbouncer', 'true']]);
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.max, 5);
  assert.equal(config.connectionTimeoutMillis, 10000);
  assert.equal(config.idleTimeoutMillis, 30000);
  assert.throws(() => createDatabasePoolConfig({ DIRECT_URL: environment.DIRECT_URL }), /MISSING_DATABASE_URL/);
  for (const invalid of ['bad-url', 'https://db.example.test/test', 'postgresql:///test']) {
    assert.throws(() => createDatabasePoolConfig({ DATABASE_URL: invalid }), /INVALID_DATABASE_URL/);
  }
  assert.throws(() => createDatabasePoolConfig({ ...environment, DATABASE_CA_CERT: 'invalid' }), /INVALID_DATABASE_CA_CERT/);
  const certificate = '-----BEGIN CERTIFICATE-----\ntest-only-fixture\n-----END CERTIFICATE-----';
  assert.equal(createDatabasePoolConfig({ ...environment, DATABASE_CA_CERT: ` ${certificate} ` }).ssl.ca, certificate);
  console.log(`${worker}: verified TLS configuration, URL override removal, pooled connection selection, and invalid configuration rejection`);
}
