import { Client } from 'appwrite';
import type { RealtimeResponseEvent } from 'appwrite';
import {
  VoteBroadcastSchema,
  BatchBroadcastSchema,
  RegistrationBroadcastSchema,
  CardBatchActivatedBroadcastSchema,
  SystemConfigBroadcastSchema,
  AuditBroadcastSchema,
  type VoteBroadcastPayload,
  type BatchBroadcastPayload,
  type RegistrationBroadcastPayload,
  type CardBatchActivatedBroadcastPayload,
  type SystemConfigBroadcastPayload,
  type AuditBroadcastPayload,
} from './schemas';

export type {
  VoteBroadcastPayload,
  BatchBroadcastPayload,
  RegistrationBroadcastPayload,
  CardBatchActivatedBroadcastPayload,
  SystemConfigBroadcastPayload,
  AuditBroadcastPayload,
};

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
      (response: RealtimeResponseEvent<unknown>) => {
        if (
          response.events.some(
            (event) => event.includes('.create') || event.includes('.update')
          )
        ) {
          const parsed = VoteBroadcastSchema.safeParse(response.payload);
          if (parsed.success) {
            onVoteUpdate(parsed.data);
          } else {
            console.warn('Realtime vote payload schema mismatch:', parsed.error);
          }
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
      (response: RealtimeResponseEvent<unknown>) => {
        if (
          response.events.some(
            (event) => event.includes('.create') || event.includes('.update')
          )
        ) {
          const parsed = BatchBroadcastSchema.safeParse(response.payload);
          if (parsed.success) {
            onBatchUpdate(parsed.data);
          } else {
            console.warn('Realtime batch payload schema mismatch:', parsed.error);
          }
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn('Realtime batch subscription fallback active:', error);
    return () => {};
  }
}

/**
 * Shared helper for subscribing to system_events collection with strict Zod validation.
 */
function subscribeToSystemEvents<T>(
  expectedEventType: string,
  parsePayload: (raw: unknown) => { success: true; data: T } | { success: false; error: unknown },
  onUpdate: (data: T) => void
): () => void {

  try {
    if (!canUseAppwriteRealtime()) {
      return () => {};
    }

    const client = getAppwriteBrowserClient();
    const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'itech2027-db';
    const collectionId = process.env.NEXT_PUBLIC_APPWRITE_SYSTEM_EVENTS_COLLECTION_ID || 'system_events';

    const channel = `databases.${databaseId}.collections.${collectionId}.documents`;

    const unsubscribe = client.subscribe(
      channel,
      (response: RealtimeResponseEvent<unknown>) => {
        if (
          response.events.some(
            (event) => event.includes('.create') || event.includes('.update')
          )
        ) {
          const payload = response.payload as Record<string, unknown> | null;
          const isTargetOrMalformed = !payload || !payload.eventType || payload.eventType === expectedEventType;

          if (isTargetOrMalformed) {
            const parsed = parsePayload(response.payload);
            if (parsed.success) {
              onUpdate(parsed.data);
            } else {
              console.warn(`Realtime ${expectedEventType} payload schema mismatch:`, parsed.error);
            }
          }
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn(`Realtime ${expectedEventType} subscription fallback active:`, error);
    return () => {};
  }
}

/**
 * Subscribes to real-time registration transaction events via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.system_events.documents
 */
export function subscribeToRegistrationEvents(
  onRegistrationUpdate: (payload: RegistrationBroadcastPayload) => void
): () => void {

  return subscribeToSystemEvents(
    'REGISTRATION_EVENT',
    (raw) => RegistrationBroadcastSchema.safeParse(raw),
    onRegistrationUpdate
  );
}

/**
 * Subscribes to real-time card activation events via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.system_events.documents
 */
export function subscribeToCardActivationEvents(
  onCardUpdate: (payload: CardBatchActivatedBroadcastPayload) => void
): () => void {

  return subscribeToSystemEvents(
    'CARD_BATCH_ACTIVATED',
    (raw) => CardBatchActivatedBroadcastSchema.safeParse(raw),
    onCardUpdate
  );
}

/**
 * Subscribes to real-time system configuration and voting freeze events via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.system_events.documents
 */
export function subscribeToSystemConfigEvents(
  onConfigUpdate: (payload: SystemConfigBroadcastPayload) => void
): () => void {

  return subscribeToSystemEvents(
    'SYSTEM_CONFIG_EVENT',
    (raw) => SystemConfigBroadcastSchema.safeParse(raw),
    onConfigUpdate
  );
}

/**
 * Subscribes to real-time administrative audit log notification events via Appwrite Realtime WebSocket.
 * Channel: databases.[id].collections.system_events.documents
 */
export function subscribeToAuditEvents(
  onAuditUpdate: (payload: AuditBroadcastPayload) => void
): () => void {

  return subscribeToSystemEvents(
    'AUDIT_EVENT',
    (raw) => AuditBroadcastSchema.safeParse(raw),
    onAuditUpdate
  );
}

export interface ResilientPollerOptions {
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  backoffFactor?: number;
}

export interface ResilientPoller {
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Creates an exponential backoff poller scaling from initialIntervalMs (default 5000ms)
 * to maxIntervalMs (default 30000ms) for high resilience during exhibition Wi-Fi disruptions.
 */
export function createResilientPoller(
  pollFn: () => Promise<void> | void,
  options: ResilientPollerOptions = {}
): ResilientPoller {

  const initialInterval = options.initialIntervalMs ?? 5000;
  const maxInterval = options.maxIntervalMs ?? 30000;
  const backoffFactor = options.backoffFactor ?? 1.5;

  let currentInterval = initialInterval;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;

  const scheduleNext = () => {
    if (!isRunning) return;

    timerId = setTimeout(async () => {
      if (!isRunning) return;

      try {
        await pollFn();
      } catch (error) {
        console.warn('Resilient poller execution error:', error);
      }

      currentInterval = Math.min(Math.round(currentInterval * backoffFactor), maxInterval);
      scheduleNext();
    }, currentInterval);
  };

  return {
    start: () => {
      if (isRunning) return;
      isRunning = true;
      currentInterval = initialInterval;
      scheduleNext();
    },
    stop: () => {
      isRunning = false;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    reset: () => {
      currentInterval = initialInterval;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (isRunning) {
        scheduleNext();
      }
    },
  };
}

/**
 * Event deduplication helper to guard against duplicate transaction or event processing
 * when receiving redundant WebSocket and polling deliveries.
 */
export class EventDeduplicator {

  private seenIds: Map<string, number> = new Map();
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = 1000, ttlMs = 60000) {

    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  public shouldProcess(id: string): boolean {

    const now = Date.now();
    this.prune(now);

    if (this.seenIds.has(id)) {
      return false;
    }

    this.seenIds.set(id, now);
    if (this.seenIds.size > this.maxEntries) {
      const oldestKey = this.seenIds.keys().next().value;
      if (oldestKey) {
        this.seenIds.delete(oldestKey);
      }
    }

    return true;
  }

  public has(id: string): boolean {

    return this.seenIds.has(id);
  }

  public add(id: string): void {

    this.shouldProcess(id);
  }

  public clear(): void {

    this.seenIds.clear();
  }

  private prune(now: number): void {

    for (const [key, timestamp] of this.seenIds.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.seenIds.delete(key);
      } else {
        break;
      }
    }
  }
}

export function createEventDeduplicator(maxEntries = 1000, ttlMs = 60000): EventDeduplicator {

  return new EventDeduplicator(maxEntries, ttlMs);
}
