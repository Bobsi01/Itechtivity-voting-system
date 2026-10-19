import pg from 'pg';

const { Pool } = pg;

/**
 * Scheduled Appwrite Function (CRON: 0 *\/6 * * *)
 * Prunes expired IdempotencyLog entries older than 24 hours to prevent database bloat.
 */
export default async ({ res, log, error }) => {

  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    error('Missing DATABASE_URL or DIRECT_URL environment variable.');
    return res.json({ success: false, error: 'MISSING_DATABASE_URL' }, 500);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const deleteResult = await pool.query(
      `DELETE FROM "IdempotencyLog" WHERE "createdAt" < NOW() - INTERVAL '24 hours'`
    );

    const prunedCount = deleteResult.rowCount ?? 0;
    log(`Pruned ${prunedCount} expired idempotency log records.`);

    return res.json({
      success: true,
      prunedCount,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    error(`Idempotency cleanup failed: ${err.message}`);
    return res.json({ success: false, error: 'IDEMPOTENCY_CLEANUP_FAILED' }, 500);
  } finally {
    await pool.end();
  }
};
