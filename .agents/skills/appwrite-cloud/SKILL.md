---
name: appwrite-cloud
description: >-
  Procedures for integrating Appwrite Cloud Storage (PDF exports) and Appwrite Realtime WebSockets
  (live tally broadcasts). Use when uploading card print sheets, streaming files, or dispatching
  and subscribing to real-time vote updates in Next.js.
---

# Appwrite Cloud Storage & Realtime WebSocket Skill

## 1. Client & Server SDK Distinction
* **Server-side (Next.js Node.js runtime):** Use `node-appwrite`. Requires `APPWRITE_API_KEY`.
* **Client-side (React browsers):** Use `appwrite`. Never expose the API Key; use public Project ID.

## 2. Server Setup & Broadcast (`src/lib/appwrite/server.ts`)
```typescript
import { Client, Storage, Databases, ID } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

export const appwriteStorage = new Storage(client);
export const appwriteDatabases = new Databases(client);

export interface VoteUpdatePayload {
  boothId: string;
  awardId: string;
  slotNumber: number;
  totalVotesForAward: number;
  timestamp: string;
}

// Broadcasts real-time updates by creating or updating a document in the Appwrite votes collection
export async function broadcastVoteEvent(payload: VoteUpdatePayload): Promise<void> {
  const databaseId = process.env.APPWRITE_DATABASE_ID!;
  const collectionId = process.env.APPWRITE_VOTES_COLLECTION_ID!;

  await appwriteDatabases.createDocument(
    databaseId,
    collectionId,
    ID.unique(),
    payload
  );
}
```

## 3. Streaming PDF Upload to Appwrite Storage
```typescript
import { InputFile } from 'node-appwrite';
import { appwriteStorage } from './server';

export async function uploadBatchPdf(fileBuffer: Buffer, fileName: string): Promise<string> {
  const BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_ID!;
  const file = InputFile.fromBuffer(fileBuffer, fileName);
  
  const result = await appwriteStorage.createFile(BUCKET_ID, 'unique()', file);
  return result.$id;
}
```

## 4. Realtime WebSockets on Client (`src/lib/appwrite/client.ts`)
```typescript
import { Client, RealtimeResponseEvent } from 'appwrite';
import type { VoteUpdatePayload } from './server';

export const appwriteClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

// Hook for live leaderboard subscription using standard Appwrite resource channel
export function subscribeToVoteEvents(onVoteUpdate: (data: VoteUpdatePayload) => void) {
  const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
  const collectionId = process.env.NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID!;
  const channel = `databases.${databaseId}.collections.${collectionId}.documents`;

  return appwriteClient.subscribe(channel, (response: RealtimeResponseEvent<VoteUpdatePayload>) => {
    if (response.events.some((event) => event.includes('.create') || event.includes('.update'))) {
      onVoteUpdate(response.payload);
    }
  });
}
```
