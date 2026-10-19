import { Client, Storage, Databases, Functions, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

export interface VoteBroadcastPayload {
  boothId: string;
  boothCode: string;
  awardId: string;
  awardTitle: string;
  slotNumber: number;
  totalVotesForAward: number;
  timestamp: string;
}

export interface BatchBroadcastPayload {
  batchId: string;
  batchNumber: number;
  status: string;
  fileId?: string;
  fileName: string;
  totalCards: number;
  totalSheets: number;
  fileSize?: number;
  updatedAt: string;
}

let serverClient: Client | null = null;
let storageClient: Storage | null = null;
let databasesClient: Databases | null = null;
let functionsClient: Functions | null = null;

export function isAppwriteServerConfigured(): boolean {

  const apiKey = process.env.APPWRITE_API_KEY || '';
  const endpoint = process.env.APPWRITE_ENDPOINT || '';

  if (
    !apiKey ||
    apiKey.includes('placeholder') ||
    apiKey === 'local_appwrite_server_key' ||
    !endpoint ||
    endpoint.includes('localhost:8080')
  ) {
    return false;
  }

  return true;
}

function getServerClient(): {
  client: Client;
  storage: Storage;
  databases: Databases;
  functions: Functions;
} {

  if (!serverClient) {
    serverClient = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027')
      .setKey(process.env.APPWRITE_API_KEY || 'local_appwrite_server_key');

    storageClient = new Storage(serverClient);
    databasesClient = new Databases(serverClient);
    functionsClient = new Functions(serverClient);
  }

  return {
    client: serverClient,
    storage: storageClient!,
    databases: databasesClient!,
    functions: functionsClient!,
  };
}

/**
 * Broadcasts a vote event via Appwrite Realtime WebSockets.
 * Offloads live WebSocket connections from the Next.js server to Appwrite Cloud.
 */
export async function broadcastVoteEvent(payload: VoteBroadcastPayload): Promise<void> {

  try {
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_VOTES_COLLECTION_ID || 'votes';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      payload
    );
  } catch (error) {
    console.warn('[Appwrite Realtime Broadcast Fallback]:', payload.boothCode, payload.awardTitle, error);
  }
}

/**
 * Triggers the compute-leaderboard-snapshot Appwrite Function asynchronously
 * to refresh the materialized leaderboard cache after a vote is recorded.
 */
export async function triggerLeaderboardSnapshot(): Promise<void> {

  try {
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { functions } = getServerClient();
    await functions.createExecution(
      'compute-leaderboard-snapshot',
      JSON.stringify({ triggeredAt: new Date().toISOString() }),
      true
    );
  } catch (error) {
    console.warn('[Appwrite Leaderboard Snapshot Trigger Fallback]:', error);
  }
}

/**
 * Streams a generated A4 PDF batch buffer to Appwrite Cloud Storage (bingo-cards-pdf bucket).
 * Returns the Appwrite fileId when Appwrite Cloud is configured, or null in local-only mode.
 */
export async function uploadBatchPdfToAppwrite(
  fileBuffer: Buffer,
  fileName: string
): Promise<string | null> {

  if (!isAppwriteServerConfigured()) {
    return null;
  }

  try {
    const { storage } = getServerClient();
    const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf';
    const inputFile = InputFile.fromBuffer(fileBuffer, fileName);

    const uploadedFile = await storage.createFile(bucketId, ID.unique(), inputFile);
    return uploadedFile.$id;
  } catch (error) {
    console.warn('[Appwrite Storage Upload Fallback]:', error);
    return null;
  }
}

/**
 * Downloads a batch PDF buffer from Appwrite Cloud Storage by fileId when local ephemeral disk is empty.
 */
export async function downloadBatchPdfFromAppwrite(fileId: string): Promise<Buffer | null> {

  if (!isAppwriteServerConfigured() || !fileId) {
    return null;
  }

  try {
    const { storage } = getServerClient();
    const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf';
    const arrayBuffer = await storage.getFileView(bucketId, fileId);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn('[Appwrite Storage Download Fallback]:', error);
    return null;
  }
}

/**
 * Triggers an asynchronous Appwrite Function execution (xasync: true) for batch PDF generation.
 * The serverless function renders the A4 vector PDF, uploads to Appwrite Storage, updates Supabase,
 * and broadcasts a Realtime WebSocket notification on completion.
 */
export async function triggerAppwritePdfGeneration(batchPayload: {
  batchId: string;
  batchNumber: number;
  totalCards: number;
  fileName: string;
  awardsList: Array<{ slotNumber: number; title: string }>;
}): Promise<{ success: boolean; executionId?: string; status?: string; error?: string }> {

  if (!isAppwriteServerConfigured()) {
    return { success: false, error: 'APPWRITE_NOT_CONFIGURED' };
  }

  try {
    const { functions } = getServerClient();
    const functionId = process.env.APPWRITE_FUNCTION_ID || 'generate-bingo-pdf';

    const execution = await functions.createExecution(
      functionId,
      JSON.stringify(batchPayload),
      true
    );

    return {
      success: true,
      executionId: execution.$id,
      status: execution.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Appwrite Function execution failed';
    return { success: false, error: message };
  }
}
