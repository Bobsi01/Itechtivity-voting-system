---
name: appwrite-cloud
description: >-
  Procedures for integrating Appwrite Cloud Storage (PDF exports and booth logos) and Appwrite
  Realtime WebSockets (live tally and system event broadcasts). Use when uploading card print sheets,
  downloading stored PDFs/logos, or dispatching and subscribing to real-time updates in Next.js.
  Do not use for PostgreSQL database mutations, QR code cryptographic verification, or PDF rendering layout.
---

# Appwrite Cloud Storage & Realtime WebSocket Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Client & Server SDK Distinction & Shared Schemas

* **Server-side (Next.js Node.js runtime):** Use `node-appwrite` (`Client`, `Storage`, `Databases`, `Functions`, `ID`) and import `InputFile` from the `'node-appwrite/file'` subpath (required by `node-appwrite@^14.2.0`). Requires `APPWRITE_API_KEY`.
* **Client-side (React browsers):** Use `appwrite` (`Client`, `type RealtimeResponseEvent`). Never expose `APPWRITE_API_KEY`; use `NEXT_PUBLIC_APPWRITE_*` variables.
* **Strict Payload Contracts (`src/lib/appwrite/schemas.ts`):** All server broadcasts and client subscriptions must validate against `.strict()` Zod schemas (`VoteBroadcastSchema`, `BatchBroadcastSchema`, `RegistrationBroadcastSchema`, `CardBatchActivatedBroadcastSchema`, `SystemConfigBroadcastSchema`, `AuditBroadcastSchema`).

## 2. Server Setup, Lazy Initialization & Broadcasts (`src/lib/appwrite/server.ts`)

Always check `isAppwriteServerConfigured()`, initialize the SDK lazily via `getServerClient()`, validate payloads with Zod, and wrap broadcasts in `try/catch` so Appwrite outages never roll back committed PostgreSQL transactions:

```typescript
import { Client, Storage, Databases, Functions, ID } from 'node-appwrite';
import { VoteBroadcastSchema, type VoteBroadcastPayload } from './schemas';

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

// VoteBroadcastSchema requires boothId, boothCode, awardId, awardTitle, slotNumber, totalVotesForAward, timestamp
export async function broadcastVoteEvent(payload: VoteBroadcastPayload): Promise<void> {

  try {
    const validated = VoteBroadcastSchema.parse(payload);
    if (!isAppwriteServerConfigured()) {
      return;
    }

    const { databases } = getServerClient();
    const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.APPWRITE_VOTES_COLLECTION_ID || 'votes';

    await databases.createDocument(databaseId, collectionId, ID.unique(), validated);
  } catch (error) {
    console.warn('[Appwrite Realtime Broadcast Fallback]:', payload?.boothCode, payload?.awardTitle, error);
  }
}
```

### Appwrite Collections & Cloud Functions
* **Collections:** `votes` (`APPWRITE_VOTES_COLLECTION_ID`), `pdf_batches` (`APPWRITE_PDF_BATCHES_COLLECTION_ID`), and `system_events` (`APPWRITE_SYSTEM_EVENTS_COLLECTION_ID`, multiplexed by `eventType`: `REGISTRATION_EVENT`, `CARD_BATCH_ACTIVATED`, `SYSTEM_CONFIG_EVENT`, `AUDIT_EVENT`).
* **Async Function Triggers:** Use `functions.createExecution(..., true)` via `triggerLeaderboardSnapshot()` (`compute-leaderboard-snapshot`) and `triggerAppwritePdfGeneration()` (`generate-bingo-pdf`).

## 3. PDF Batch & Booth Logo Storage Uploads (`src/lib/appwrite/server.ts`)

Use `InputFile.fromBuffer` imported from `'node-appwrite/file'`. Return `null` when running in local-only mode (`!isAppwriteServerConfigured()`), while production callers require durable upload persistence:

```typescript
// Standalone pattern matching uploadBatchPdfToAppwrite in src/lib/appwrite/server.ts
// (server.ts centralizes configuration checks via isAppwriteServerConfigured() and lazy getServerClient())
import { Client, Storage, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

export async function uploadBatchPdfToAppwrite(
  fileBuffer: Buffer,
  fileName: string
): Promise<string | null> {

  const apiKey = process.env.APPWRITE_API_KEY || '';
  const endpoint = process.env.APPWRITE_ENDPOINT || '';
  if (!apiKey || apiKey.includes('placeholder') || !endpoint || endpoint.includes('localhost:8080')) {
    return null;
  }

  try {
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027')
      .setKey(apiKey);

    const storage = new Storage(client);
    const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf';
    const inputFile = InputFile.fromBuffer(fileBuffer, fileName);

    const uploadedFile = await storage.createFile(bucketId, ID.unique(), inputFile);
    return uploadedFile.$id;
  } catch (error) {
    console.warn('[Appwrite Storage Upload Fallback]:', error);
    return null;
  }
}
```

* **Storage Buckets:** `bingo-cards-pdf` (`APPWRITE_STORAGE_BUCKET_ID`) stores batch PDF sheets (`uploadBatchPdfToAppwrite`, `downloadBatchPdfFromAppwrite`). `booth-logos` (`APPWRITE_BOOTH_LOGOS_BUCKET_ID`) stores booth logos (`uploadBoothLogoToAppwrite`, `downloadBoothLogoFromAppwrite` with a 3 MB bounded stream guard and 5s timeout).

## 4. Realtime WebSockets & Resilient Polling on Client (`src/lib/appwrite/client.ts`)

Browser subscriptions must initialize `Client` lazily, check `canUseAppwriteRealtime()` (guarding missing/local endpoints and mixed HTTP/HTTPS contexts), validate every `response.payload` with `.safeParse(...)`, and pair WebSockets with `createResilientPoller` and `EventDeduplicator` for venue Wi-Fi disruptions:

```typescript
import { Client } from 'appwrite';
import type { RealtimeResponseEvent } from 'appwrite';
import { VoteBroadcastSchema, type VoteBroadcastPayload } from './schemas';

let clientInstance: Client | null = null;

export function getAppwriteBrowserClient(): Client {

  if (!clientInstance) {
    clientInstance = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1')
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'itechtivity-2027');
  }

  return clientInstance;
}

function canUseAppwriteRealtime(): boolean {

  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '';

  if (
    !endpoint ||
    endpoint.includes('localhost:8080') ||
    (typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      endpoint.startsWith('http://'))
  ) {
    return false;
  }

  return true;
}

export function subscribeToVoteEvents(
  onVoteUpdate: (data: VoteBroadcastPayload) => void
): () => void {

  try {
    if (!canUseAppwriteRealtime()) {
      return () => {};
    }

    const client = getAppwriteBrowserClient();
    const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID || 'votes';
    const channel = `databases.${databaseId}.collections.${collectionId}.documents`;

    return client.subscribe(
      channel,
      (response: RealtimeResponseEvent<unknown>) => {

        if (response.events.some((event) => event.includes('.create') || event.includes('.update'))) {
          const parsed = VoteBroadcastSchema.safeParse(response.payload);
          if (parsed.success) {
            onVoteUpdate(parsed.data);
          } else {
            console.warn('Realtime vote payload schema mismatch:', parsed.error);
          }
        }
      }
    );
  } catch (error) {
    console.warn('Realtime vote subscription fallback active:', error);
    return () => {};
  }
}
```

Use the matching client helpers in `src/lib/appwrite/client.ts` for other streams: `subscribeToBatchEvents`, `subscribeToRegistrationEvents`, `subscribeToCardActivationEvents`, `subscribeToSystemConfigEvents`, `subscribeToAuditEvents`, `createResilientPoller`, and `EventDeduplicator`.
