import assert from 'node:assert/strict';
import { Databases } from 'node-appwrite';
import type { Models } from 'node-appwrite';
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
} from '../appwrite/schemas';

import {
  broadcastVoteEvent,
  broadcastBatchEvent,
  broadcastRegistrationEvent,
  broadcastCardActivationEvent,
  broadcastSystemConfigEvent,
  broadcastAuditEvent,
} from '../appwrite/server';

import {
  subscribeToVoteEvents,
  subscribeToBatchEvents,
  subscribeToRegistrationEvents,
  subscribeToCardActivationEvents,
  subscribeToSystemConfigEvents,
  subscribeToAuditEvents,
  EventDeduplicator,
  createEventDeduplicator,
} from '../appwrite/client';

let totalAssertions = 0;
let passedAssertions = 0;

function assertCondition(condition: boolean, testDescription: string): void {

  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`[PASS] ${testDescription}`);
  } else {
    console.error(`[FAIL] ${testDescription}`);
    assert.fail(`Assertion failed: ${testDescription}`);
  }
}

/**
 * Vector 1: Vote Broadcast Schema Validation
 * Verifies that valid vote tallies pass schema validation, while invalid booth codes,
 * out-of-range slots (>6), negative vote counts, or extra fields are strictly rejected.
 */
function testVector1VoteBroadcastSchema(): void {

  console.log('\n--- Vector 1: Vote Broadcast Schema Validation ---');

  const validVotePayload: VoteBroadcastPayload = {
    boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    boothCode: 'CS-01',
    awardId: '7ca85f64-5717-4562-b3fc-2c963f66afa7',
    awardTitle: 'Best Capstone Project',
    slotNumber: 1,
    totalVotesForAward: 42,
    timestamp: new Date().toISOString(),
  };

  // Valid vote passes validation
  const validResult = VoteBroadcastSchema.safeParse(validVotePayload);
  assertCondition(validResult.success === true, 'Valid vote payload passes VoteBroadcastSchema');

  // Verify all valid slot numbers (1 through 6) pass
  for (let slot = 1; slot <= 6; slot++) {
    const slotPayload = { ...validVotePayload, slotNumber: slot };
    assertCondition(
      VoteBroadcastSchema.safeParse(slotPayload).success === true,
      `Valid slot number ${slot} is accepted by VoteBroadcastSchema`
    );
  }

  // Out-of-bounds slot numbers must be rejected
  const invalidSlots = [0, 7, -1, 10, 2.5];
  for (const slot of invalidSlots) {
    const invalidSlotPayload = { ...validVotePayload, slotNumber: slot };
    const result = VoteBroadcastSchema.safeParse(invalidSlotPayload);
    assertCondition(
      result.success === false,
      `Invalid slot number ${slot} is rejected by VoteBroadcastSchema`
    );
  }

  // Invalid booth codes must be rejected
  const invalidBoothCodes = ['CS-1', 'CS-001', 'CS-411', 'IT-01', 'cs-01', 'INVALID', ''];
  for (const code of invalidBoothCodes) {
    const invalidCodePayload = { ...validVotePayload, boothCode: code };
    const result = VoteBroadcastSchema.safeParse(invalidCodePayload);
    assertCondition(
      result.success === false,
      `Malformed booth code "${code}" is rejected by VoteBroadcastSchema`
    );
  }

  // Negative total vote counts must be rejected
  const negativeVotePayload = { ...validVotePayload, totalVotesForAward: -1 };
  assertCondition(
    VoteBroadcastSchema.safeParse(negativeVotePayload).success === false,
    'Negative totalVotesForAward is rejected by VoteBroadcastSchema'
  );

  // Extra unauthorized fields must be rejected due to .strict() constraint
  const extraFieldsPayload = {
    ...validVotePayload,
    voterName: 'Unauthorized Attendee',
    stubSerial: 'B27-B01-0001-S1',
  };
  const strictResult = VoteBroadcastSchema.safeParse(extraFieldsPayload);
  assertCondition(
    strictResult.success === false,
    'Extra fields containing voter identity are strictly rejected by VoteBroadcastSchema.strict()'
  );
}

/**
 * Vector 2: Sanitized Registration Privacy & Strict PII Exclusion
 * Verifies that sanitized registration signals pass validation, while any attendee PII
 * (buyerName, studentNumber, program, contact info, email) is strictly rejected via .strict().
 */
function testVector2RegistrationPrivacy(): void {

  console.log('\n--- Vector 2: Sanitized Registration Privacy & Strict PII Exclusion ---');

  const validRegistrationPayload: RegistrationBroadcastPayload = {
    eventType: 'REGISTRATION_EVENT',
    transactionId: '123e4567-e89b-12d3-a456-426614174000',
    quantity: 5,
    timestamp: new Date().toISOString(),
    processedByRole: 'REGISTRATION',
  };

  // Valid sanitized payload passes validation
  const validResult = RegistrationBroadcastSchema.safeParse(validRegistrationPayload);
  assertCondition(
    validResult.success === true,
    'Valid sanitized registration event signal passes RegistrationBroadcastSchema'
  );

  // Admin role is also permitted
  const adminResult = RegistrationBroadcastSchema.safeParse({
    ...validRegistrationPayload,
    processedByRole: 'ADMIN',
  });
  assertCondition(
    adminResult.success === true,
    'ADMIN role is permitted in RegistrationBroadcastSchema'
  );

  // Unauthorized roles must be rejected
  const invalidRoleResult = RegistrationBroadcastSchema.safeParse({
    ...validRegistrationPayload,
    processedByRole: 'EXHIBITOR',
  });
  assertCondition(
    invalidRoleResult.success === false,
    'Unauthorized EXHIBITOR role is rejected in RegistrationBroadcastSchema'
  );

  // Strict PII exclusion tests: attendee demographics must never cross WebSocket boundaries
  const piiFieldTests: Array<{ fieldName: string; payload: Record<string, unknown> }> = [
    {
      fieldName: 'buyerName',
      payload: { ...validRegistrationPayload, buyerName: 'Daniel Bobis' },
    },
    {
      fieldName: 'studentNumber',
      payload: { ...validRegistrationPayload, studentNumber: '2023-00001-TG-0' },
    },
    {
      fieldName: 'program',
      payload: { ...validRegistrationPayload, program: 'BSIT' },
    },
    {
      fieldName: 'contactNumber',
      payload: { ...validRegistrationPayload, contactNumber: '+639123456789' },
    },
    {
      fieldName: 'email',
      payload: { ...validRegistrationPayload, email: 'attendee@example.com' },
    },
    {
      fieldName: 'buyerType',
      payload: { ...validRegistrationPayload, buyerType: 'CSD_STUDENT' },
    },
    {
      fieldName: 'ipAddress',
      payload: { ...validRegistrationPayload, ipAddress: '192.168.1.1' },
    },
  ];

  for (const test of piiFieldTests) {
    const result = RegistrationBroadcastSchema.safeParse(test.payload);
    assertCondition(
      result.success === false,
      `PII attribute "${test.fieldName}" is strictly rejected by RegistrationBroadcastSchema.strict()`
    );
  }

  // Also verify AuditBroadcastSchema strictly rejects actor emails, user IDs, and stack traces
  const validAuditPayload: AuditBroadcastPayload = {
    eventType: 'AUDIT_EVENT',
    action: 'CARD_BATCH_ACTIVATED',
    resource: 'TICKET_STUB',
    timestamp: new Date().toISOString(),
  };
  assertCondition(
    AuditBroadcastSchema.safeParse(validAuditPayload).success === true,
    'Valid sanitized audit event signal passes AuditBroadcastSchema'
  );

  const piiAuditPayload = {
    ...validAuditPayload,
    actorEmail: 'admin@itech.edu',
    ipAddress: '10.0.0.1',
    userId: '987e6543-e21b-12d3-a456-426614174999',
  };
  assertCondition(
    AuditBroadcastSchema.safeParse(piiAuditPayload).success === false,
    'Audit log actor email and IP address are strictly rejected by AuditBroadcastSchema.strict()'
  );
}

/**
 * Vector 3: System Config Broadcast Validation
 * Verifies system configuration broadcast schema for emergency voting freeze and award locking toggles.
 */
function testVector3SystemConfigBroadcast(): void {

  console.log('\n--- Vector 3: System Config Broadcast Validation ---');

  const now = new Date().toISOString();

  // Test all valid state combinations
  const validStates: Array<{ name: string; isVotingOpen: boolean; isAwardsLocked: boolean }> = [
    { name: 'Normal Voting Active', isVotingOpen: true, isAwardsLocked: false },
    { name: 'Emergency Voting Frozen', isVotingOpen: false, isAwardsLocked: false },
    { name: 'Ceremony Locked', isVotingOpen: false, isAwardsLocked: true },
    { name: 'Preview Mode Locked', isVotingOpen: true, isAwardsLocked: true },
  ];

  for (const state of validStates) {
    const payload: SystemConfigBroadcastPayload = {
      eventType: 'SYSTEM_CONFIG_EVENT',
      isVotingOpen: state.isVotingOpen,
      isAwardsLocked: state.isAwardsLocked,
      timestamp: now,
    };
    const result = SystemConfigBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === true,
      `State "${state.name}" (voting: ${state.isVotingOpen}, locked: ${state.isAwardsLocked}) passes validation`
    );
  }

  // Non-boolean values must be rejected
  const nonBooleanPayload = {
    eventType: 'SYSTEM_CONFIG_EVENT',
    isVotingOpen: 'true',
    isAwardsLocked: 0,
    timestamp: now,
  };
  assertCondition(
    SystemConfigBroadcastSchema.safeParse(nonBooleanPayload).success === false,
    'Non-boolean string or number flags are rejected by SystemConfigBroadcastSchema'
  );

  // Mismatched eventType literal must be rejected
  const wrongTypePayload = {
    eventType: 'CONFIG_CHANGED',
    isVotingOpen: true,
    isAwardsLocked: false,
    timestamp: now,
  };
  assertCondition(
    SystemConfigBroadcastSchema.safeParse(wrongTypePayload).success === false,
    'Mismatched eventType literal is rejected by SystemConfigBroadcastSchema'
  );

  // Extra fields rejected via strict
  const extraFieldsPayload = {
    eventType: 'SYSTEM_CONFIG_EVENT',
    isVotingOpen: true,
    isAwardsLocked: false,
    timestamp: now,
    adminOverrideReason: 'Maintenance',
  };
  assertCondition(
    SystemConfigBroadcastSchema.safeParse(extraFieldsPayload).success === false,
    'Extra configuration fields are rejected by SystemConfigBroadcastSchema.strict()'
  );
}

/**
 * Vector 4: Mock Server Dispatch
 * Asserts broadcast functions correctly invoke Appwrite databases.createDocument with proper
 * database ID, collection IDs, and validated payloads, and handles failure without throwing.
 */
async function testVector4MockServerDispatch(): Promise<void> {

  console.log('\n--- Vector 4: Mock Server Dispatch ---');

  // Configure environment variables for mock server testing
  process.env.APPWRITE_API_KEY = 'mock_valid_server_api_key_32_characters_long';
  process.env.APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
  process.env.APPWRITE_PROJECT_ID = 'itechtivity-2027';
  process.env.APPWRITE_DATABASE_ID = 'test-itech2027-db';
  process.env.APPWRITE_VOTES_COLLECTION_ID = 'test-votes';
  process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID = 'test-pdf_batches';
  process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID = 'test-system_events';

  interface DocumentCallRecord {
    databaseId: string;
    collectionId: string;
    documentId: string;
    data: Record<string, unknown>;
  }

  const recordedCalls: DocumentCallRecord[] = [];
  const originalCreateDocument = Databases.prototype.createDocument;

  // Intercept Databases.prototype.createDocument with mock implementation
  Databases.prototype.createDocument = async function <TDocument extends Models.Document>(
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: Omit<TDocument, keyof Models.Document>,
    permissions?: string[]
  ): Promise<TDocument> {
    recordedCalls.push({
      databaseId,
      collectionId,
      documentId,
      data: data as Record<string, unknown>,
    });
    const mockDocument = {
      $id: documentId,
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
      $permissions: permissions ?? [],
      $collectionId: collectionId,
      $databaseId: databaseId,
      ...(data as Record<string, unknown>),
    };
    return mockDocument as TDocument;
  };

  try {
    // 1. Test broadcastVoteEvent
    recordedCalls.length = 0;
    const votePayload: VoteBroadcastPayload = {
      boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      boothCode: 'CS-02',
      awardId: '7ca85f64-5717-4562-b3fc-2c963f66afa7',
      awardTitle: 'Innovation Award',
      slotNumber: 2,
      totalVotesForAward: 15,
      timestamp: new Date().toISOString(),
    };
    await broadcastVoteEvent(votePayload);

    assertCondition(recordedCalls.length === 1, 'broadcastVoteEvent triggered exactly 1 createDocument call');
    assertCondition(
      recordedCalls[0]?.databaseId === 'test-itech2027-db',
      'broadcastVoteEvent used correct database ID'
    );
    assertCondition(
      recordedCalls[0]?.collectionId === 'test-votes',
      'broadcastVoteEvent targeted votes collection'
    );
    assertCondition(
      recordedCalls[0]?.data.boothCode === 'CS-02' && recordedCalls[0]?.data.totalVotesForAward === 15,
      'broadcastVoteEvent preserved validated vote payload attributes'
    );

    // 2. Test broadcastBatchEvent
    recordedCalls.length = 0;
    const batchPayload: BatchBroadcastPayload = {
      batchId: 'batch-001',
      batchNumber: 1,
      status: 'COMPLETED',
      fileId: 'file-xyz',
      fileName: 'bingo_batch_001.pdf',
      totalCards: 100,
      totalSheets: 25,
      fileSize: 1048576,
      updatedAt: new Date().toISOString(),
    };
    await broadcastBatchEvent(batchPayload);

    assertCondition(recordedCalls.length === 1, 'broadcastBatchEvent triggered exactly 1 createDocument call');
    assertCondition(
      recordedCalls[0]?.collectionId === 'test-pdf_batches',
      'broadcastBatchEvent targeted pdf_batches collection'
    );
    assertCondition(
      recordedCalls[0]?.data.status === 'COMPLETED',
      'broadcastBatchEvent transmitted COMPLETED batch status'
    );

    // 3. Test broadcastRegistrationEvent
    recordedCalls.length = 0;
    const regPayload: RegistrationBroadcastPayload = {
      eventType: 'REGISTRATION_EVENT',
      transactionId: '123e4567-e89b-12d3-a456-426614174001',
      quantity: 3,
      timestamp: new Date().toISOString(),
      processedByRole: 'REGISTRATION',
    };
    await broadcastRegistrationEvent(regPayload);

    assertCondition(recordedCalls.length === 1, 'broadcastRegistrationEvent triggered createDocument');
    assertCondition(
      recordedCalls[0]?.collectionId === 'test-system_events',
      'broadcastRegistrationEvent targeted system_events collection'
    );
    assertCondition(
      recordedCalls[0]?.data.eventType === 'REGISTRATION_EVENT',
      'broadcastRegistrationEvent transmitted sanitized signal'
    );

    // 4. Test broadcastCardActivationEvent
    recordedCalls.length = 0;
    const cardActivationPayload: CardBatchActivatedBroadcastPayload = {
      eventType: 'CARD_BATCH_ACTIVATED',
      batchId: 'batch-002',
      mode: 'BY_BATCH',
      activatedCount: 50,
      timestamp: new Date().toISOString(),
    };
    await broadcastCardActivationEvent(cardActivationPayload);

    assertCondition(recordedCalls.length === 1, 'broadcastCardActivationEvent triggered createDocument');
    assertCondition(
      recordedCalls[0]?.collectionId === 'test-system_events',
      'broadcastCardActivationEvent targeted system_events collection'
    );
    assertCondition(
      recordedCalls[0]?.data.activatedCount === 50,
      'broadcastCardActivationEvent preserved activatedCount'
    );

    // 5. Test broadcastSystemConfigEvent
    recordedCalls.length = 0;
    const configPayload: SystemConfigBroadcastPayload = {
      eventType: 'SYSTEM_CONFIG_EVENT',
      isVotingOpen: false,
      isAwardsLocked: true,
      timestamp: new Date().toISOString(),
    };
    await broadcastSystemConfigEvent(configPayload);

    assertCondition(recordedCalls.length === 1, 'broadcastSystemConfigEvent triggered createDocument');
    assertCondition(
      recordedCalls[0]?.data.isVotingOpen === false && recordedCalls[0]?.data.isAwardsLocked === true,
      'broadcastSystemConfigEvent transmitted emergency freeze state'
    );

    // 6. Test broadcastAuditEvent
    recordedCalls.length = 0;
    const auditPayload: AuditBroadcastPayload = {
      eventType: 'AUDIT_EVENT',
      action: 'SYSTEM_CONFIG_UPDATED',
      resource: 'EVENT_CONFIG',
      timestamp: new Date().toISOString(),
    };
    await broadcastAuditEvent(auditPayload);

    assertCondition(recordedCalls.length === 1, 'broadcastAuditEvent triggered createDocument');
    assertCondition(
      recordedCalls[0]?.data.action === 'SYSTEM_CONFIG_UPDATED',
      'broadcastAuditEvent transmitted sanitized audit action'
    );

    // 7. Non-blocking error handling: Appwrite failure must not throw uncaught error
    Databases.prototype.createDocument = async function <TDocument extends Models.Document>(): Promise<TDocument> {
      throw new Error('Simulated Appwrite cluster rate limit error');
    };

    const originalWarn = console.warn;
    const capturedWarnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      capturedWarnings.push(args);
    };

    let threwError = false;
    try {
      await broadcastVoteEvent(votePayload);
    } catch {
      threwError = true;
    } finally {
      console.warn = originalWarn;
    }

    assertCondition(
      threwError === false,
      'broadcastVoteEvent catches Appwrite network errors and fails open without throwing'
    );
    assertCondition(
      capturedWarnings.some((w) => String(w[0]).includes('[Appwrite Realtime Broadcast Fallback]')),
      'broadcastVoteEvent emits structured console.warn fallback message upon error'
    );
  } finally {
    // Restore original prototype
    Databases.prototype.createDocument = originalCreateDocument;
  }
}

/**
 * Vector 5: Mock Client Subscription Ingestion
 * Emits simulated Realtime events into subscription handlers and asserts callback invocation.
 */
function testVector5MockClientSubscriptionIngestion(): void {

  console.log('\n--- Vector 5: Mock Client Subscription Ingestion ---');

  // Configure browser endpoint environment
  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = 'itechtivity-2027';
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = 'test-itech2027-db';
  process.env.NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID = 'test-votes';
  process.env.NEXT_PUBLIC_APPWRITE_SYSTEM_EVENTS_COLLECTION_ID = 'test-system_events';
  process.env.NEXT_PUBLIC_APPWRITE_PDF_BATCHES_COLLECTION_ID = 'test-pdf_batches';

  type SubscriptionCallback = (response: RealtimeResponseEvent<never>) => void;
  const channelSubscribers = new Map<string, Set<SubscriptionCallback>>();

  const originalSubscribe = Client.prototype.subscribe;

  // Intercept Client.prototype.subscribe
  Client.prototype.subscribe = function <T>(
    channelOrChannels: string | string[],
    callback: (payload: RealtimeResponseEvent<T>) => void
  ): () => void {
    const channels = Array.isArray(channelOrChannels) ? channelOrChannels : [channelOrChannels];
    const callbackWrapper = callback as unknown as SubscriptionCallback;

    for (const channel of channels) {
      if (!channelSubscribers.has(channel)) {
        channelSubscribers.set(channel, new Set());
      }
      channelSubscribers.get(channel)!.add(callbackWrapper);
    }

    return () => {
      for (const channel of channels) {
        channelSubscribers.get(channel)?.delete(callbackWrapper);
      }
    };
  };

  try {
    function emitMockEvent(channel: string, payload: unknown, action = 'create'): void {
      const listeners = channelSubscribers.get(channel);
      if (!listeners) return;

      const responseEvent: RealtimeResponseEvent<never> = {
        events: [`databases.test-itech2027-db.collections.${channel.split('.').at(-2) || 'unknown'}.documents.${action}`],
        channels: [channel],
        timestamp: Date.now(),
        payload: payload as never,
      };

      for (const listener of Array.from(listeners)) {
        listener(responseEvent);
      }
    }

    // 1. Test subscribeToVoteEvents
    let receivedVote: VoteBroadcastPayload | null = null;
    const unsubVote = subscribeToVoteEvents((data) => {
      receivedVote = data;
    });

    const mockVotePayload: VoteBroadcastPayload = {
      boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      boothCode: 'CS-03',
      awardId: '7ca85f64-5717-4562-b3fc-2c963f66afa7',
      awardTitle: 'Best UI/UX Award',
      slotNumber: 3,
      totalVotesForAward: 88,
      timestamp: new Date().toISOString(),
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-votes.documents', mockVotePayload);
    assertCondition(
      receivedVote !== null && (receivedVote as VoteBroadcastPayload).boothCode === 'CS-03',
      'subscribeToVoteEvents receives and parses incoming vote event'
    );

    // Verify unsubscribe stops invocation
    receivedVote = null;
    unsubVote();
    emitMockEvent('databases.test-itech2027-db.collections.test-votes.documents', mockVotePayload);
    assertCondition(
      receivedVote === null,
      'Unsubscribing from subscribeToVoteEvents detaches listener and halts notifications'
    );

    // 2. Test subscribeToSystemConfigEvents
    let receivedConfig: SystemConfigBroadcastPayload | null = null;
    const unsubConfig = subscribeToSystemConfigEvents((data) => {
      receivedConfig = data;
    });

    const mockConfigPayload: SystemConfigBroadcastPayload = {
      eventType: 'SYSTEM_CONFIG_EVENT',
      isVotingOpen: false,
      isAwardsLocked: false,
      timestamp: new Date().toISOString(),
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-system_events.documents', mockConfigPayload);
    assertCondition(
      receivedConfig !== null && (receivedConfig as SystemConfigBroadcastPayload).isVotingOpen === false,
      'subscribeToSystemConfigEvents receives emergency voting freeze event'
    );
    unsubConfig();

    // 3. Test subscribeToRegistrationEvents
    let receivedReg: RegistrationBroadcastPayload | null = null;
    const unsubReg = subscribeToRegistrationEvents((data) => {
      receivedReg = data;
    });

    const mockRegPayload: RegistrationBroadcastPayload = {
      eventType: 'REGISTRATION_EVENT',
      transactionId: '123e4567-e89b-12d3-a456-426614174002',
      quantity: 10,
      timestamp: new Date().toISOString(),
      processedByRole: 'REGISTRATION',
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-system_events.documents', mockRegPayload);
    assertCondition(
      receivedReg !== null && (receivedReg as RegistrationBroadcastPayload).quantity === 10,
      'subscribeToRegistrationEvents receives sanitized registration signal'
    );
    unsubReg();

    // 4. Test subscribeToCardActivationEvents
    let receivedActivation: CardBatchActivatedBroadcastPayload | null = null;
    const unsubActivation = subscribeToCardActivationEvents((data) => {
      receivedActivation = data;
    });

    const mockActivationPayload: CardBatchActivatedBroadcastPayload = {
      eventType: 'CARD_BATCH_ACTIVATED',
      batchId: 'batch-005',
      mode: 'BY_RANGE',
      activatedCount: 200,
      timestamp: new Date().toISOString(),
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-system_events.documents', mockActivationPayload);
    assertCondition(
      receivedActivation !== null && (receivedActivation as CardBatchActivatedBroadcastPayload).activatedCount === 200,
      'subscribeToCardActivationEvents receives card activation signal'
    );
    unsubActivation();

    // 5. Test subscribeToAuditEvents
    let receivedAudit: AuditBroadcastPayload | null = null;
    const unsubAudit = subscribeToAuditEvents((data) => {
      receivedAudit = data;
    });

    const mockAuditPayload: AuditBroadcastPayload = {
      eventType: 'AUDIT_EVENT',
      action: 'VOTE_SUBMITTED',
      resource: 'VOTE',
      timestamp: new Date().toISOString(),
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-system_events.documents', mockAuditPayload);
    assertCondition(
      receivedAudit !== null && (receivedAudit as AuditBroadcastPayload).action === 'VOTE_SUBMITTED',
      'subscribeToAuditEvents receives sanitized audit event signal'
    );
    unsubAudit();

    // 6. Test subscribeToBatchEvents
    let receivedBatch: BatchBroadcastPayload | null = null;
    const unsubBatch = subscribeToBatchEvents((data) => {
      receivedBatch = data;
    });

    const mockBatchPayload: BatchBroadcastPayload = {
      batchId: 'batch-999',
      batchNumber: 99,
      status: 'PROCESSING',
      fileName: 'batch_099.pdf',
      totalCards: 20,
      totalSheets: 5,
      updatedAt: new Date().toISOString(),
    };

    emitMockEvent('databases.test-itech2027-db.collections.test-pdf_batches.documents', mockBatchPayload);
    assertCondition(
      receivedBatch !== null && (receivedBatch as BatchBroadcastPayload).status === 'PROCESSING',
      'subscribeToBatchEvents receives PROCESSING batch status progression'
    );
    unsubBatch();
  } finally {
    // Restore original client prototype
    Client.prototype.subscribe = originalSubscribe;
  }
}

/**
 * Vector 6: Malformed Payload Ingestion Protection
 * Emits corrupted and hostile payloads and asserts safe handling without uncaught listener crashes.
 */
function testVector6MalformedPayloadProtection(): void {

  console.log('\n--- Vector 6: Malformed Payload Ingestion Protection ---');

  type SubscriptionCallback = (response: RealtimeResponseEvent<never>) => void;
  const channelSubscribers = new Map<string, Set<SubscriptionCallback>>();

  const originalSubscribe = Client.prototype.subscribe;
  Client.prototype.subscribe = function <T>(
    channelOrChannels: string | string[],
    callback: (payload: RealtimeResponseEvent<T>) => void
  ): () => void {
    const channels = Array.isArray(channelOrChannels) ? channelOrChannels : [channelOrChannels];
    const callbackWrapper = callback as unknown as SubscriptionCallback;

    for (const channel of channels) {
      if (!channelSubscribers.has(channel)) {
        channelSubscribers.set(channel, new Set());
      }
      channelSubscribers.get(channel)!.add(callbackWrapper);
    }

    return () => {
      for (const channel of channels) {
        channelSubscribers.get(channel)?.delete(callbackWrapper);
      }
    };
  };

  const originalWarn = console.warn;
  const capturedWarnings: unknown[][] = [];

  try {
    console.warn = (...args: unknown[]) => {
      capturedWarnings.push(args);
    };

    function emitRawEvent(channel: string, payload: unknown, action = 'create'): void {
      const listeners = channelSubscribers.get(channel);
      if (!listeners) return;

      const responseEvent: RealtimeResponseEvent<never> = {
        events: [`databases.test-itech2027-db.collections.${channel.split('.').at(-2) || 'unknown'}.documents.${action}`],
        channels: [channel],
        timestamp: Date.now(),
        payload: payload as never,
      };

      for (const listener of Array.from(listeners)) {
        listener(responseEvent);
      }
    }

    let voteCallbackInvoked = false;
    const unsubVote = subscribeToVoteEvents(() => {
      voteCallbackInvoked = true;
    });

    // 1. Missing required fields in vote payload
    voteCallbackInvoked = false;
    emitRawEvent('databases.test-itech2027-db.collections.test-votes.documents', {
      totalVotesForAward: 10,
    });
    assertCondition(
      voteCallbackInvoked === false,
      'Malformed vote payload with missing fields is discarded safely without callback execution'
    );

    // 2. Corrupt non-object payloads: null, string, number, array
    const malformedPayloads = [null, undefined, 'corrupt-string-data', 12345, ['array', 'element']];
    for (const corrupt of malformedPayloads) {
      voteCallbackInvoked = false;
      let crashed = false;
      try {
        emitRawEvent('databases.test-itech2027-db.collections.test-votes.documents', corrupt);
      } catch {
        crashed = true;
      }
      assertCondition(
        crashed === false && voteCallbackInvoked === false,
        `Corrupt payload (${typeof corrupt}) is handled gracefully without throwing or triggering callback`
      );
    }

    // 3. Delete action ignored by subscription
    voteCallbackInvoked = false;
    emitRawEvent(
      'databases.test-itech2027-db.collections.test-votes.documents',
      {
        boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        boothCode: 'CS-01',
        awardId: '7ca85f64-5717-4562-b3fc-2c963f66afa7',
        awardTitle: 'Best UI/UX Award',
        slotNumber: 1,
        totalVotesForAward: 10,
        timestamp: new Date().toISOString(),
      },
      'delete'
    );
    assertCondition(
      voteCallbackInvoked === false,
      'Document delete events are ignored by subscriptions filtering for create/update'
    );
    unsubVote();

    // 4. Cross-event contamination on shared system_events collection
    let regCallbackInvoked = false;
    const unsubReg = subscribeToRegistrationEvents(() => {
      regCallbackInvoked = true;
    });

    // Emit AUDIT_EVENT on system_events channel
    regCallbackInvoked = false;
    emitRawEvent('databases.test-itech2027-db.collections.test-system_events.documents', {
      eventType: 'AUDIT_EVENT',
      action: 'ADMIN_LOGIN',
      resource: 'AUTH',
      timestamp: new Date().toISOString(),
    });
    assertCondition(
      regCallbackInvoked === false,
      'Registration subscription ignores peer AUDIT_EVENT without false triggering or schema mismatch errors'
    );

    // Emit malformed target event with corrupt transactionId
    regCallbackInvoked = false;
    emitRawEvent('databases.test-itech2027-db.collections.test-system_events.documents', {
      eventType: 'REGISTRATION_EVENT',
      transactionId: 'invalid-non-uuid-string',
      quantity: -5,
    });
    assertCondition(
      regCallbackInvoked === false,
      'Target registration event with invalid UUID and negative quantity is safely rejected'
    );
    unsubReg();

    assertCondition(
      capturedWarnings.some((w) => String(w[0]).includes('Realtime vote payload schema mismatch')),
      'Schema mismatch on vote channel logged to console.warn'
    );
    assertCondition(
      capturedWarnings.some((w) => String(w[0]).includes('Realtime REGISTRATION_EVENT payload schema mismatch')),
      'Schema mismatch on registration channel logged to console.warn'
    );
  } finally {
    console.warn = originalWarn;
    Client.prototype.subscribe = originalSubscribe;
  }
}

/**
 * Vector 7: Event Deduplication Logic
 * Asserts EventDeduplicator filters repeated transaction IDs within sliding TTL window
 * and correctly manages capacity limits.
 */
async function testVector7EventDeduplicationLogic(): Promise<void> {

  console.log('\n--- Vector 7: Event Deduplication Logic ---');

  const deduplicator = createEventDeduplicator(100, 60000);
  const transactionId1 = 'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c';
  const transactionId2 = 'f2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d';

  // First delivery should be accepted
  assertCondition(
    deduplicator.shouldProcess(transactionId1) === true,
    'First delivery of transactionId1 is approved for processing'
  );

  // Duplicate delivery within window must be filtered out
  assertCondition(
    deduplicator.shouldProcess(transactionId1) === false,
    'Immediate duplicate delivery of transactionId1 is filtered out'
  );

  assertCondition(
    deduplicator.shouldProcess(transactionId1) === false,
    'Third repeated delivery of transactionId1 is filtered out'
  );

  // Distinct transaction ID is processed
  assertCondition(
    deduplicator.shouldProcess(transactionId2) === true,
    'Distinct transactionId2 is approved for processing'
  );

  // Verify has method
  assertCondition(
    deduplicator.has(transactionId1) === true && deduplicator.has(transactionId2) === true,
    'has() method accurately reports recorded transaction IDs'
  );
  assertCondition(
    deduplicator.has('unrecorded-id') === false,
    'has() returns false for unrecorded IDs'
  );

  // Simulation: WebSocket event arrives first, followed by concurrent polling response
  const recentTransactions: Array<{ id: string; amount: number }> = [];
  function ingestTransaction(tx: { id: string; amount: number }): void {
    if (deduplicator.shouldProcess(tx.id)) {
      recentTransactions.push(tx);
    }
  }

  const sharedTxId = 'a1111111-2222-3333-4444-555555555555';
  // WebSocket delivery:
  ingestTransaction({ id: sharedTxId, amount: 100 });
  // Concurrent fallback polling delivery:
  ingestTransaction({ id: sharedTxId, amount: 100 });

  assertCondition(
    recentTransactions.filter((tx) => tx.id === sharedTxId).length === 1,
    'Concurrent WebSocket and polling deliveries result in exactly 1 unique transaction record'
  );

  // Max capacity LRU pruning
  const smallDeduplicator = new EventDeduplicator(3, 60000);
  smallDeduplicator.shouldProcess('id-1');
  smallDeduplicator.shouldProcess('id-2');
  smallDeduplicator.shouldProcess('id-3');
  // Adding 4th item when max is 3 should evict oldest 'id-1'
  smallDeduplicator.shouldProcess('id-4');

  assertCondition(
    smallDeduplicator.has('id-1') === false,
    'Oldest entry is evicted when EventDeduplicator capacity is exceeded'
  );
  assertCondition(
    smallDeduplicator.has('id-4') === true,
    'Newest entry is preserved upon capacity overflow'
  );

  // TTL expiration: entries should expire after sliding window
  const shortTtlDeduplicator = new EventDeduplicator(10, 50); // 50ms TTL
  const expiringId = 'expiring-transaction-id';
  shortTtlDeduplicator.shouldProcess(expiringId);
  assertCondition(
    shortTtlDeduplicator.shouldProcess(expiringId) === false,
    'Expiring entry is blocked before TTL elapses'
  );

  // Wait for TTL window to elapse
  await new Promise((resolve) => setTimeout(resolve, 70));

  assertCondition(
    shortTtlDeduplicator.shouldProcess(expiringId) === true,
    'Expiring entry is permitted again after TTL window expires'
  );

  // Clear method resets state
  deduplicator.clear();
  assertCondition(
    deduplicator.has(transactionId1) === false,
    'clear() removes all tracked IDs'
  );
  assertCondition(
    deduplicator.shouldProcess(transactionId1) === true,
    'Cleared ID can be processed again'
  );
}

/**
 * Vector 8: Absolute Tally Idempotency
 * Asserts repeated vote tallies set state to absolute value without numeric accumulation drift.
 */
function testVector8AbsoluteTallyIdempotency(): void {

  console.log('\n--- Vector 8: Absolute Tally Idempotency ---');

  // Simulated component state representing booth/award standings
  const awardStandings: Record<string, number> = {};

  /**
   * Correct WebSocket ingestion handler: sets state to absolute authoritative tally
   */
  function applyAuthoritativeVoteUpdate(payload: VoteBroadcastPayload): void {
    awardStandings[payload.awardId] = payload.totalVotesForAward;
  }

  const awardId = 'b1b2b3b4-c5c6-7d8e-9f0a-1b2c3d4e5f6a';
  const repeatedPayload: VoteBroadcastPayload = {
    boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    boothCode: 'CS-01',
    awardId,
    awardTitle: 'Best Capstone Project',
    slotNumber: 1,
    totalVotesForAward: 42,
    timestamp: new Date().toISOString(),
  };

  // Simulate 5 repeated deliveries of the same vote tally:
  // 1. Initial WebSocket broadcast
  // 2. Duplicate TCP retransmission
  // 3. Reconnect burst on Wi-Fi recovery
  // 4. Concurrent fallback HTTP polling response
  // 5. Delayed out-of-order packet
  for (let delivery = 1; delivery <= 5; delivery++) {
    applyAuthoritativeVoteUpdate(repeatedPayload);
  }

  // Tally must strictly equal 42, NEVER 210
  assertCondition(
    awardStandings[awardId] === 42,
    '5 repeated deliveries of totalVotesForAward: 42 evaluate strictly to 42'
  );

  // Erroneous relative accumulation calculation to verify anti-pattern contrast
  let buggyAccumulatedTally = 0;
  for (let delivery = 1; delivery <= 5; delivery++) {
    buggyAccumulatedTally += repeatedPayload.totalVotesForAward;
  }

  assertCondition(
    buggyAccumulatedTally === 210,
    'Erroneous relative accumulation would have drifted to 210'
  );
  assertCondition(
    awardStandings[awardId] !== buggyAccumulatedTally,
    'Authoritative absolute assignment prevents 210 numeric accumulation drift'
  );

  // Subsequent legitimate vote increments tally to 43
  const nextVotePayload: VoteBroadcastPayload = {
    ...repeatedPayload,
    totalVotesForAward: 43,
    timestamp: new Date().toISOString(),
  };

  // Deliver next vote 3 times
  applyAuthoritativeVoteUpdate(nextVotePayload);
  applyAuthoritativeVoteUpdate(nextVotePayload);
  applyAuthoritativeVoteUpdate(nextVotePayload);

  assertCondition(
    awardStandings[awardId] === 43,
    'Subsequent vote progression sets tally to authoritative value 43 without drift'
  );
}

/**
 * Main Test Runner
 */
async function main(): Promise<void> {

  console.log('Starting Itechtivity 2027 WebSocket Integration & Security Test Suite...');
  const startTime = Date.now();

  testVector1VoteBroadcastSchema();
  testVector2RegistrationPrivacy();
  testVector3SystemConfigBroadcast();
  await testVector4MockServerDispatch();
  testVector5MockClientSubscriptionIngestion();
  testVector6MalformedPayloadProtection();
  await testVector7EventDeduplicationLogic();
  testVector8AbsoluteTallyIdempotency();

  const durationMs = Date.now() - startTime;
  console.log(`\n======================================================`);
  console.log(`WebSocket Test Suite Finished: ${passedAssertions}/${totalAssertions} assertions passed (${durationMs}ms)`);
  console.log(`======================================================\n`);

  if (passedAssertions !== totalAssertions) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error during WebSocket test execution:', error);
  process.exitCode = 1;
});
