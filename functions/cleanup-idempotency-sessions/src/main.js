import pg from 'pg';
import { createDatabasePoolConfig } from './database-config.js';

const { Pool } = pg;

/**
 * Scheduled Appwrite Function (CRON: 0 *\/6 * * *)
 * Prunes expired IdempotencyLog entries older than 24 hours to prevent database bloat.
 */
export default async ({ res, log, error }) => {

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    error('Missing pooled DATABASE_URL environment variable.');
    return res.json({ success: false, error: 'MISSING_DATABASE_URL' }, 500);
  }

  let pool;
  try {
    pool = new Pool(createDatabasePoolConfig());
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
    error('Idempotency cleanup database operation failed.');
    return res.json({ success: false, error: 'IDEMPOTENCY_CLEANUP_FAILED' }, 500);
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        error('Idempotency cleanup database shutdown failed.');
      }
    }
  }
};
