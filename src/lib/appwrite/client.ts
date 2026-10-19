import { Client } from 'appwrite';
import type { RealtimeResponseEvent } from 'appwrite';
import type { VoteBroadcastPayload, BatchBroadcastPayload } from './server';

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

/**
 * Subscribes to real-time vote updates via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.votes.documents
 */
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

    const unsubscribe = client.subscribe(
      channel,
      (response: RealtimeResponseEvent<VoteBroadcastPayload>) => {
        if (
          response.events.some(
            (event) => event.includes('.create') || event.includes('.update')
          )
        ) {
          onVoteUpdate(response.payload);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn('Realtime vote subscription fallback active:', error);
    return () => {};
  }
}

/**
 * Subscribes to real-time asynchronous PDF batch completion updates via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.pdf_batches.documents
 */
export function subscribeToBatchEvents(
  onBatchUpdate: (data: BatchBroadcastPayload) => void
): () => void {

  try {
    if (!canUseAppwriteRealtime()) {
      return () => {};
    }

    const client = getAppwriteBrowserClient();
    const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.NEXT_PUBLIC_APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches';

    const channel = `databases.${databaseId}.collections.${collectionId}.documents`;

    const unsubscribe = client.subscribe(
      channel,
      (response: RealtimeResponseEvent<BatchBroadcastPayload>) => {
        if (
          response.events.some(
            (event) => event.includes('.create') || event.includes('.update')
          )
        ) {
          onBatchUpdate(response.payload);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn('Realtime batch subscription fallback active:', error);
    return () => {};
  }
}
