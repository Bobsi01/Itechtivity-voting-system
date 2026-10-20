import { Client, Storage, Databases, Functions, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

export {
  VoteBroadcastSchema,
  type VoteBroadcastPayload,
  BatchBroadcastSchema,
  type BatchBroadcastPayload,
  RegistrationBroadcastSchema,
  type RegistrationBroadcastPayload,
  CardBatchActivatedBroadcastSchema,
  type CardBatchActivatedBroadcastPayload,
  SystemConfigBroadcastSchema,
  type SystemConfigBroadcastPayload,
  AuditBroadcastSchema,
  type AuditBroadcastPayload,
} from './schemas';

import {
  VoteBroadcastSchema,
  type VoteBroadcastPayload,
  BatchBroadcastSchema,
  type BatchBroadcastPayload,
  RegistrationBroadcastSchema,
  type RegistrationBroadcastPayload,
  CardBatchActivatedBroadcastSchema,
  type CardBatchActivatedBroadcastPayload,
  SystemConfigBroadcastSchema,
  type SystemConfigBroadcastPayload,
  AuditBroadcastSchema,
  type AuditBroadcastPayload,
} from './schemas';

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
 * Broadcasts a verified vote event via Appwrite Realtime WebSockets.
 * Offloads live WebSocket connections from the Next.js server to Appwrite Cloud.
 */
export async function broadcastVoteEvent(payload: VoteBroadcastPayload): Promise<void> {

  try {
    const validated = VoteBroadcastSchema.parse(payload);
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
      validated
    );
  } catch (error) {
    console.warn('[Appwrite Realtime Broadcast Fallback]:', payload?.boothCode, payload?.awardTitle, error);
  }
}

/**
 * Broadcasts a PDF batch status event via Appwrite Realtime WebSockets.
 * Notifies production operators of batch completion or failures.
 */
export async function broadcastBatchEvent(payload: BatchBroadcastPayload): Promise<void> {

  try {
    const validated = BatchBroadcastSchema.parse(payload);
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      validated
    );
  } catch (error) {
    console.warn('[Appwrite Batch Broadcast Fallback]:', payload?.batchNumber, error);
  }
}

/**
 * Broadcasts a sanitized registration event signal via Appwrite Realtime WebSockets.
 * Omits all attendee PII to synchronize concurrent cashier counters safely.
 */
export async function broadcastRegistrationEvent(payload: RegistrationBroadcastPayload): Promise<void> {

  try {
    const validated = RegistrationBroadcastSchema.parse(payload);
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID || 'system_events';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      validated
    );
  } catch (error) {
    console.warn('[Appwrite Registration Broadcast Fallback]:', error);
  }
}

/**
 * Broadcasts a sanitized card batch activation signal via Appwrite Realtime WebSockets.
 * Synchronizes available inventory counts without exposing purchaser details.
 */
export async function broadcastCardActivationEvent(payload: CardBatchActivatedBroadcastPayload): Promise<void> {

  try {
    const validated = CardBatchActivatedBroadcastSchema.parse(payload);
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID || 'system_events';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      validated
    );
  } catch (error) {
    console.warn('[Appwrite Card Activation Broadcast Fallback]:', error);
  }
}

/**
 * Broadcasts system configuration and emergency voting freeze alerts.
 * Notifies exhibitor scanners and live displays of administrative lockdowns.
 */
export async function broadcastSystemConfigEvent(
  payload: Omit<SystemConfigBroadcastPayload, 'isRegistrationOpen'> & {
    isRegistrationOpen?: boolean;
  }
): Promise<void> {

  try {
    const validated = SystemConfigBroadcastSchema.parse({
      ...payload,
      isRegistrationOpen: payload.isRegistrationOpen ?? true,
    });
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID || 'system_events';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      validated
    );
  } catch (error) {
    console.warn('[Appwrite System Config Broadcast Fallback]:', error);
  }
}

/**
 * Broadcasts a sanitized security audit log notification signal.
 * Alerts administrators to critical security actions without leaking sensitive parameters.
 */
export async function broadcastAuditEvent(payload: AuditBroadcastPayload): Promise<void> {

  try {
    const validated = AuditBroadcastSchema.parse(payload);
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID || 'system_events';

    await databases.createDocument(
      databaseId,
      collectionId,
      ID.unique(),
      validated
    );
  } catch (error) {
    console.warn('[Appwrite Audit Broadcast Fallback]:', error);
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

/**
 * Uploads a booth logo/icon image buffer to Appwrite Cloud Storage (booth-logos bucket).
 * Returns the public view URL and file ID, or null if Appwrite is not configured.
 */
export async function uploadBoothLogoToAppwrite(
  fileBuffer: Buffer,
  fileName: string
): Promise<{ fileId: string; viewUrl: string } | null> {

  if (!isAppwriteServerConfigured()) {
    return null;
  }

  try {
    const { storage } = getServerClient();
    const bucketId = process.env.APPWRITE_BOOTH_LOGOS_BUCKET_ID || 'booth-logos';
    const inputFile = InputFile.fromBuffer(fileBuffer, fileName);

    const uploadedFile = await storage.createFile(bucketId, ID.unique(), inputFile);
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
    const projectId = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
    const viewUrl = `${endpoint}/storage/buckets/${bucketId}/files/${uploadedFile.$id}/view?project=${projectId}`;

    return {
      fileId: uploadedFile.$id,
      viewUrl,
    };
  } catch (error) {
    console.warn('[Appwrite Booth Logo Upload Fallback]:', error);
    return null;
  }
}

/**
 * Downloads a booth logo buffer from Appwrite Cloud Storage by fileId.
 */
export async function downloadBoothLogoFromAppwrite(fileId: string): Promise<Buffer | null> {

  if (!isAppwriteServerConfigured() || !fileId) {
    return null;
  }

  try {
    const { storage } = getServerClient();
    const bucketId = process.env.APPWRITE_BOOTH_LOGOS_BUCKET_ID || 'booth-logos';
    const arrayBuffer = await storage.getFileView(bucketId, fileId);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.warn('[Appwrite Booth Logo Download Fallback]:', error);
    return null;
  }
}

