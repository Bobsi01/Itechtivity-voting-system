import pg from 'pg';
import { Client, Databases, ID } from 'node-appwrite';

const { Pool } = pg;

/**
 * Aggregates live vote tallies per award and booth from Supabase PostgreSQL
 * and caches the snapshot in Appwrite Database (leaderboard_cache collection).
 */
export default async ({ res, log, error }) => {

  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const appwriteEndpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
  const appwriteProjectId = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
  const appwriteApiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
  const collectionId = process.env.APPWRITE_LEADERBOARD_COLLECTION_ID || 'leaderboard_cache';

  if (!databaseUrl || !appwriteApiKey) {
    error('Missing DATABASE_URL or APPWRITE_API_KEY.');
    return res.json({ success: false, error: 'MISSING_CONFIGURATION' }, 500);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const tallyResult = await pool.query(`
      SELECT
        a."id" AS "awardId",
        a."slotNumber",
        a."title" AS "awardTitle",
        b."id" AS "boothId",
        b."code" AS "boothCode",
        b."projectTitle",
        COUNT(v."id")::int AS "voteCount"
      FROM "Award" a
      CROSS JOIN "Booth" b
      LEFT JOIN "Vote" v ON v."awardId" = a."id" AND v."boothId" = b."id"
      WHERE a."isActive" = true
      GROUP BY a."id", a."slotNumber", a."title", b."id", b."code", b."projectTitle"
      HAVING COUNT(v."id") > 0
      ORDER BY a."slotNumber" ASC, "voteCount" DESC, b."code" ASC
    `);

    const snapshotPayload = {
      generatedAt: new Date().toISOString(),
      standings: tallyResult.rows,
    };

    const client = new Client()
      .setEndpoint(appwriteEndpoint)
      .setProject(appwriteProjectId)
      .setKey(appwriteApiKey);

    const databases = new Databases(client);

    const documentId = 'latest-tally';
    const docData = {
      cacheKey: 'latest-tally',
      payloadJson: JSON.stringify(snapshotPayload),
      updatedAt: snapshotPayload.generatedAt,
    };

    // SEC-07: Upsert single document ID 'latest-tally' to prevent unbounded document creation
    try {
      await databases.updateDocument(databaseId, collectionId, documentId, docData);
    } catch (docErr) {
      await databases.createDocument(databaseId, collectionId, documentId, docData);
    }

    log(`Cached leaderboard snapshot with ${tallyResult.rows.length} booth-award entries.`);

    return res.json({
      success: true,
      entriesCached: tallyResult.rows.length,
      updatedAt: snapshotPayload.generatedAt,
    });
  } catch (err) {
    error(`Leaderboard snapshot computation failed: ${err.message}`);
    return res.json({ success: false, error: 'SNAPSHOT_COMPUTATION_FAILED' }, 500);
  } finally {
    await pool.end();
  }
};
