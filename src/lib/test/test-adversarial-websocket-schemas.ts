import assert from 'node:assert/strict';
import { Databases, Storage, Functions } from 'node-appwrite';
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
  triggerLeaderboardSnapshot,
  uploadBatchPdfToAppwrite,
  downloadBatchPdfFromAppwrite,
  triggerAppwritePdfGeneration,
} from '../appwrite/server';

import {
  subscribeToVoteEvents,
  subscribeToBatchEvents,
  subscribeToRegistrationEvents,
  subscribeToCardActivationEvents,
  subscribeToSystemConfigEvents,
  subscribeToAuditEvents,
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
 * Standard baseline valid payloads used across mutation matrices.
 */
const VALID_VOTE_PAYLOAD: VoteBroadcastPayload = {
  boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  boothCode: 'CS-01',
  awardId: '7ca85f64-5717-4562-b3fc-2c963f66afa7',
  awardTitle: 'Best Capstone Project',
  slotNumber: 1,
  totalVotesForAward: 42,
  timestamp: '2026-10-19T18:30:00.000Z',
};

const VALID_BATCH_PAYLOAD: BatchBroadcastPayload = {
  batchId: 'batch-2026-001',
  batchNumber: 1,
  status: 'COMPLETED',
  fileId: 'appwrite-file-12345',
  fileName: 'bingo_cards_batch_001.pdf',
  totalCards: 100,
  totalSheets: 25,
  fileSize: 1048576,
  updatedAt: '2026-10-19T18:30:00.000Z',
};

const VALID_REGISTRATION_PAYLOAD: RegistrationBroadcastPayload = {
  eventType: 'REGISTRATION_EVENT',
  transactionId: '123e4567-e89b-12d3-a456-426614174000',
  quantity: 5,
  timestamp: '2026-10-19T18:30:00.000Z',
  processedByRole: 'REGISTRATION',
};

const VALID_CARD_ACTIVATION_PAYLOAD: CardBatchActivatedBroadcastPayload = {
  eventType: 'CARD_BATCH_ACTIVATED',
  batchId: 'batch-2026-002',
  mode: 'BY_BATCH',
  activatedCount: 50,
  timestamp: '2026-10-19T18:30:00.000Z',
};

const VALID_SYSTEM_CONFIG_PAYLOAD: SystemConfigBroadcastPayload = {
  eventType: 'SYSTEM_CONFIG_EVENT',
  isVotingOpen: true,
  isAwardsLocked: false,
  isRegistrationOpen: true,
  timestamp: '2026-10-19T18:30:00.000Z',
};

const VALID_AUDIT_PAYLOAD: AuditBroadcastPayload = {
  eventType: 'AUDIT_EVENT',
  action: 'CARD_BATCH_ACTIVATED',
  resource: 'TICKET_STUB',
  timestamp: '2026-10-19T18:30:00.000Z',
};

/**
 * Challenge Vector 1: Prototype Pollution & Hostile Property Injection
 * Injects dangerous prototype manipulation keys and internal JavaScript properties into all schemas.
 */
function testVector1PrototypePollution(): void {

  console.log('\n--- Challenge Vector 1: Prototype Pollution & Hostile Property Injection ---');

  const schemas = [
    { name: 'VoteBroadcastSchema', schema: VoteBroadcastSchema, base: VALID_VOTE_PAYLOAD },
    { name: 'BatchBroadcastSchema', schema: BatchBroadcastSchema, base: VALID_BATCH_PAYLOAD },
    { name: 'RegistrationBroadcastSchema', schema: RegistrationBroadcastSchema, base: VALID_REGISTRATION_PAYLOAD },
    { name: 'CardBatchActivatedBroadcastSchema', schema: CardBatchActivatedBroadcastSchema, base: VALID_CARD_ACTIVATION_PAYLOAD },
    { name: 'SystemConfigBroadcastSchema', schema: SystemConfigBroadcastSchema, base: VALID_SYSTEM_CONFIG_PAYLOAD },
    { name: 'AuditBroadcastSchema', schema: AuditBroadcastSchema, base: VALID_AUDIT_PAYLOAD },
  ];

  const hostileKeys: Array<{ key: string; value: unknown }> = [
    { key: '__proto__', value: { polluted: true } },
    { key: 'constructor', value: { prototype: { polluted: true } } },
    { key: 'prototype', value: { polluted: true } },
    { key: 'toString', value: 'malicious-string-override' },
    { key: 'valueOf', value: () => 1337 },
    { key: 'hasOwnProperty', value: false },
    { key: '__defineGetter__', value: () => {} },
    { key: '__lookupSetter__', value: () => {} },
  ];

  for (const { name, schema, base } of schemas) {
    // 1. Injected via Object.defineProperty to ensure enumerable own property
    for (const { key, value } of hostileKeys) {
      const injectedObj: Record<string, unknown> = { ...base };
      Object.defineProperty(injectedObj, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });

      const result = schema.safeParse(injectedObj);
      assertCondition(
        result.success === false,
        `${name} strictly blocks injected property "${key}"`
      );
    }

    // 2. Injected via JSON.parse attack vector
    const jsonHostile = JSON.stringify({
      ...base,
      __proto__: { polluted: true },
      constructor: { evil: true },
      prototype: { evil: true },
    });
    const parsedFromJson = JSON.parse(jsonHostile);
    const parseResult = schema.safeParse(parsedFromJson);
    assertCondition(
      parseResult.success === false,
      `${name} strictly blocks JSON-deserialized prototype pollution object`
    );

    // Verify global Object.prototype was never tainted
    const probe: Record<string, unknown> = {};
    assertCondition(
      probe.polluted === undefined && probe.evil === undefined,
      `Global Object.prototype remains pristine after ${name} stress test`
    );
  }
}

/**
 * Challenge Vector 2: Mass Assignment & Sensitive Data Leakage Prevention
 * Injects unauthorized PII, auth secrets, database internals, and privilege escalation keys.
 */
function testVector2MassAssignmentAndPiiLeakage(): void {

  console.log('\n--- Challenge Vector 2: Mass Assignment & Sensitive Data Leakage Prevention ---');

  const dangerousInjections: Array<{ category: string; key: string; value: unknown }> = [
    // PII Leaks
    { category: 'PII', key: 'voterName', value: 'Anonymous Student' },
    { category: 'PII', key: 'studentNumber', value: '2023-09876-MN-0' },
    { category: 'PII', key: 'buyerEmail', value: 'infiltrator@test.edu' },
    { category: 'PII', key: 'contactNumber', value: '+639999999999' },
    { category: 'PII', key: 'ipAddress', value: '192.168.100.254' },
    { category: 'PII', key: 'nationalId', value: '1111-2222-3333-4444' },

    // Cryptographic & Auth Infiltration
    { category: 'Auth', key: 'pin', value: '9876' },
    { category: 'Auth', key: 'hmacSignature', value: 'd3b07384d113edec49eaa6238ad5ff00' },
    { category: 'Auth', key: 'ticketStubId', value: 'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c' },
    { category: 'Auth', key: 'secretKey', value: 'super-secret-hmac-key' },
    { category: 'Auth', key: 'jwt', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },

    // Privilege Escalation
    { category: 'RBAC', key: 'role', value: 'ADMIN' },
    { category: 'RBAC', key: 'isAdmin', value: true },
    { category: 'RBAC', key: 'permissions', value: ['ADMIN', 'SUPERUSER', 'ROOT'] },

    // Database & System Internals
    { category: 'Database', key: '$id', value: 'appwrite-doc-id' },
    { category: 'Database', key: '$createdAt', value: '2026-10-19T00:00:00Z' },
    { category: 'Database', key: '$databaseId', value: 'itech2027-db' },
    { category: 'Database', key: 'sql', value: 'DROP TABLE "VOTE" CASCADE;' },
    { category: 'Database', key: '__typename', value: 'InternalDocument' },
  ];

  // Test VoteBroadcastSchema
  for (const { category, key, value } of dangerousInjections) {
    const payload = { ...VALID_VOTE_PAYLOAD, [key]: value };
    const result = VoteBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `VoteBroadcastSchema.strict() blocks ${category} injection: "${key}"`
    );
  }

  // Test RegistrationBroadcastSchema
  for (const { category, key, value } of dangerousInjections) {
    const payload = { ...VALID_REGISTRATION_PAYLOAD, [key]: value };
    const result = RegistrationBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `RegistrationBroadcastSchema.strict() blocks ${category} injection: "${key}"`
    );
  }

  // Test SystemConfigBroadcastSchema
  for (const { category, key, value } of dangerousInjections) {
    const payload = { ...VALID_SYSTEM_CONFIG_PAYLOAD, [key]: value };
    const result = SystemConfigBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `SystemConfigBroadcastSchema.strict() blocks ${category} injection: "${key}"`
    );
  }

  // Test AuditBroadcastSchema
  for (const { category, key, value } of dangerousInjections) {
    const payload = { ...VALID_AUDIT_PAYLOAD, [key]: value };
    const result = AuditBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `AuditBroadcastSchema.strict() blocks ${category} injection: "${key}"`
    );
  }
}

/**
 * Challenge Vector 3: Numerical & String Boundary Stress Testing
 * Tests range extremes, floating point numbers, special characters, and regex bypass attempts.
 */
function testVector3BoundaryViolations(): void {

  console.log('\n--- Challenge Vector 3: Numerical & String Boundary Stress Testing ---');

  // 1. VoteBroadcastSchema: slotNumber (strictly 1 to 6 integers)
  const hostileSlotNumbers = [
    0, 7, -1, 100, 1.0001, 5.9999, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, '1', '6', null, undefined,
  ];

  for (const slot of hostileSlotNumbers) {
    const payload = { ...VALID_VOTE_PAYLOAD, slotNumber: slot };
    const result = VoteBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `VoteBroadcastSchema rejects invalid slotNumber: ${String(slot)}`
    );
  }

  // 2. VoteBroadcastSchema: boothCode regex /CS-\d{2}$/
  const hostileBoothCodes = [
    'CS-0',          // Too short
    'CS-000',        // Too long
    'CS-00\n',       // Trailing newline
    'CS-00\0',       // Null byte
    ' CS-01',        // Leading whitespace
    'CS-01 ',        // Trailing whitespace
    'CS-1A',         // Non-digit suffix
    'IT-01',         // Wrong prefix
    'ENG-01',        // Wrong prefix
    'cs-01',         // Lowercase
    'CS--1',         // Negative indicator
    'CS-01.5',       // Decimal
    'CS-999',        // 3 digits
    '',              // Empty string
    'CS-XX',         // Letters
  ];

  for (const code of hostileBoothCodes) {
    const payload = { ...VALID_VOTE_PAYLOAD, boothCode: code };
    const result = VoteBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `VoteBroadcastSchema rejects hostile boothCode: "${JSON.stringify(code)}"`
    );
  }

  // 3. VoteBroadcastSchema: totalVotesForAward (nonnegative integer)
  const hostileVoteCounts = [-1, -1000000, 1.5, NaN, Infinity, -Infinity, '42', null, undefined];
  for (const votes of hostileVoteCounts) {
    const payload = { ...VALID_VOTE_PAYLOAD, totalVotesForAward: votes };
    const result = VoteBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `VoteBroadcastSchema rejects hostile totalVotesForAward: ${String(votes)}`
    );
  }

  // 4. VoteBroadcastSchema: awardTitle boundary limits (min 2, max 100)
  assertCondition(
    VoteBroadcastSchema.safeParse({ ...VALID_VOTE_PAYLOAD, awardTitle: 'A' }).success === false,
    'VoteBroadcastSchema rejects awardTitle below minimum length (1 character)'
  );
  assertCondition(
    VoteBroadcastSchema.safeParse({ ...VALID_VOTE_PAYLOAD, awardTitle: 'A'.repeat(101) }).success === false,
    'VoteBroadcastSchema rejects awardTitle exceeding maximum length (101 characters)'
  );
  assertCondition(
    VoteBroadcastSchema.safeParse({ ...VALID_VOTE_PAYLOAD, awardTitle: 'AB' }).success === true,
    'VoteBroadcastSchema accepts awardTitle at lower boundary (2 characters)'
  );
  assertCondition(
    VoteBroadcastSchema.safeParse({ ...VALID_VOTE_PAYLOAD, awardTitle: 'A'.repeat(100) }).success === true,
    'VoteBroadcastSchema accepts awardTitle at upper boundary (100 characters)'
  );

  // 5. BatchBroadcastSchema: status enum
  const hostileStatuses = ['pending', 'completed', 'active', 'CANCELLED', 'UNKNOWN', '', 1, null];
  for (const status of hostileStatuses) {
    const payload = { ...VALID_BATCH_PAYLOAD, status };
    const result = BatchBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `BatchBroadcastSchema rejects invalid status enum: "${String(status)}"`
    );
  }

  // 6. RegistrationBroadcastSchema: processedByRole enum ('REGISTRATION' | 'ADMIN')
  const hostileRoles = ['STUDENT', 'EXHIBITOR', 'PRODUCTION', 'PUBLIC', 'USER', '', null];
  for (const role of hostileRoles) {
    const payload = { ...VALID_REGISTRATION_PAYLOAD, processedByRole: role };
    const result = RegistrationBroadcastSchema.safeParse(payload);
    assertCondition(
      result.success === false,
      `RegistrationBroadcastSchema rejects unauthorized role: "${String(role)}"`
    );
  }

  // 7. SystemConfigBroadcastSchema: strict boolean validation
  const nonBooleans = ['true', 'false', 1, 0, null, undefined, {}, []];
  for (const val of nonBooleans) {
    const payload1 = { ...VALID_SYSTEM_CONFIG_PAYLOAD, isVotingOpen: val };
    const payload2 = { ...VALID_SYSTEM_CONFIG_PAYLOAD, isAwardsLocked: val };
    assertCondition(
      SystemConfigBroadcastSchema.safeParse(payload1).success === false,
      `SystemConfigBroadcastSchema rejects non-boolean isVotingOpen: ${String(val)}`
    );
    assertCondition(
      SystemConfigBroadcastSchema.safeParse(payload2).success === false,
      `SystemConfigBroadcastSchema rejects non-boolean isAwardsLocked: ${String(val)}`
    );
  }

  // 8. Datetime format enforcement across all schemas
  const hostileTimestamps = [
    '2026-10-19',
    '2026-10-19 18:30:00',
    'invalid-date',
    '9999-99-99T99:99:99Z',
    '2026-02-30T10:00:00Z',
    1729368000000,
    '',
    null,
    undefined,
  ];

  for (const ts of hostileTimestamps) {
    const payload = { ...VALID_VOTE_PAYLOAD, timestamp: ts };
    assertCondition(
      VoteBroadcastSchema.safeParse(payload).success === false,
      `VoteBroadcastSchema rejects invalid datetime string: ${String(ts)}`
    );
  }
}

/**
 * Challenge Vector 4: Hostile Primitives, Nulls, & Circular Structures
 * Passes malformed types, nulls, functions, symbols, and circular objects to schema parsers.
 */
function testVector4HostilePrimitivesAndCirculars(): void {

  console.log('\n--- Challenge Vector 4: Hostile Primitives, Nulls, & Circular Structures ---');

  const schemas = [
    { name: 'VoteBroadcastSchema', schema: VoteBroadcastSchema },
    { name: 'BatchBroadcastSchema', schema: BatchBroadcastSchema },
    { name: 'RegistrationBroadcastSchema', schema: RegistrationBroadcastSchema },
    { name: 'CardBatchActivatedBroadcastSchema', schema: CardBatchActivatedBroadcastSchema },
    { name: 'SystemConfigBroadcastSchema', schema: SystemConfigBroadcastSchema },
    { name: 'AuditBroadcastSchema', schema: AuditBroadcastSchema },
  ];

  const malformedInputs: unknown[] = [
    null,
    undefined,
    '',
    'malformed-primitive-string',
    0,
    1337,
    false,
    true,
    [],
    [1, 2, 3],
    {},
    () => {},
    Symbol('hostile-symbol'),
    new Date(),
    /regex-attack/,
  ];

  for (const { name, schema } of schemas) {
    for (const input of malformedInputs) {
      let crashed = false;
      let parseSuccess = false;
      try {
        const result = schema.safeParse(input);
        parseSuccess = result.success;
      } catch {
        crashed = true;
      }

      assertCondition(
        crashed === false && parseSuccess === false,
        `${name} gracefully safely rejects malformed input (${typeof input}) without crashing`
      );
    }

    // Circular reference stress test
    const circularObj: Record<string, unknown> = { dummy: true };
    circularObj.self = circularObj;

    let circularCrashed = false;
    let circularSuccess = false;
    try {
      const result = schema.safeParse(circularObj);
      circularSuccess = result.success;
    } catch {
      circularCrashed = true;
    }

    assertCondition(
      circularCrashed === false && circularSuccess === false,
      `${name} safely rejects circular reference object without call stack overflow`
    );
  }
}

/**
 * Challenge Vector 5: Server Broadcast Functions under Simulated Cluster Failures
 * Simulates network partition, 503 Service Unavailable, ETIMEDOUT, 429 Rate Limits,
 * unconfigured credentials, and malformed inputs to ensure caller routes never crash.
 */
async function testVector5ServerBroadcastClusterFailureResilience(): Promise<void> {

  console.log('\n--- Challenge Vector 5: Server Broadcast Functions under Simulated Cluster Failures ---');

  // Configure environment variables for mock server testing
  process.env.APPWRITE_API_KEY = 'mock_valid_server_api_key_32_characters_long';
  process.env.APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
  process.env.APPWRITE_PROJECT_ID = 'itechtivity-2027';
  process.env.APPWRITE_DATABASE_ID = 'test-itech2027-db';
  process.env.APPWRITE_VOTES_COLLECTION_ID = 'test-votes';
  process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID = 'test-pdf_batches';
  process.env.APPWRITE_SYSTEM_EVENTS_COLLECTION_ID = 'test-system_events';
  process.env.APPWRITE_STORAGE_BUCKET_ID = 'test-bucket';

  const originalCreateDocument = Databases.prototype.createDocument;
  const originalCreateExecution = Functions.prototype.createExecution;
  const originalCreateFile = Storage.prototype.createFile;
  const originalGetFileView = Storage.prototype.getFileView;
  const originalWarn = console.warn;

  // Intercept console.warn to capture fallback messages
  const capturedWarnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    capturedWarnings.push(args);
  };

  try {
    // SCENARIO 5A: Appwrite Cluster Network Outage (503 Service Unavailable / ETIMEDOUT)
    const clusterErrors = [
      new Error('503 Service Unavailable: Appwrite cluster upstream unreachable'),
      new Error('ETIMEDOUT: connect ETIMEDOUT 10.0.0.1:443'),
      new Error('ECONNRESET: Connection reset by peer'),
      new Error('AppwriteException: Rate limit exceeded (HTTP 429)'),
    ];

    for (const clusterError of clusterErrors) {
      capturedWarnings.length = 0;

      Databases.prototype.createDocument = async function (): Promise<never> {
        throw clusterError;
      };
      Functions.prototype.createExecution = async function (): Promise<never> {
        throw clusterError;
      };
      Storage.prototype.createFile = async function (): Promise<never> {
        throw clusterError;
      };
      Storage.prototype.getFileView = async function (): Promise<never> {
        throw clusterError;
      };

      // 1. broadcastVoteEvent must not throw
      let threw = false;
      try {
        await broadcastVoteEvent(VALID_VOTE_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastVoteEvent survives cluster failure [${clusterError.message.slice(0, 20)}...] without throwing`
      );

      // 2. broadcastBatchEvent must not throw
      threw = false;
      try {
        await broadcastBatchEvent(VALID_BATCH_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastBatchEvent survives cluster failure without throwing`
      );

      // 3. broadcastRegistrationEvent must not throw
      threw = false;
      try {
        await broadcastRegistrationEvent(VALID_REGISTRATION_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastRegistrationEvent survives cluster failure without throwing`
      );

      // 4. broadcastCardActivationEvent must not throw
      threw = false;
      try {
        await broadcastCardActivationEvent(VALID_CARD_ACTIVATION_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastCardActivationEvent survives cluster failure without throwing`
      );

      // 5. broadcastSystemConfigEvent must not throw
      threw = false;
      try {
        await broadcastSystemConfigEvent(VALID_SYSTEM_CONFIG_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastSystemConfigEvent survives cluster failure without throwing`
      );

      // 6. broadcastAuditEvent must not throw
      threw = false;
      try {
        await broadcastAuditEvent(VALID_AUDIT_PAYLOAD);
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `broadcastAuditEvent survives cluster failure without throwing`
      );

      // 7. triggerLeaderboardSnapshot must not throw
      threw = false;
      try {
        await triggerLeaderboardSnapshot();
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `triggerLeaderboardSnapshot survives cluster failure without throwing`
      );

      // 8. uploadBatchPdfToAppwrite returns null on storage failure
      const uploadResult = await uploadBatchPdfToAppwrite(Buffer.from('PDF data'), 'batch_001.pdf');
      assertCondition(
        uploadResult === null,
        `uploadBatchPdfToAppwrite returns null upon storage cluster failure`
      );

      // 9. downloadBatchPdfFromAppwrite returns null on download failure
      const downloadResult = await downloadBatchPdfFromAppwrite('file-12345');
      assertCondition(
        downloadResult === null,
        `downloadBatchPdfFromAppwrite returns null upon download cluster failure`
      );

      // 10. triggerAppwritePdfGeneration returns error object instead of throwing
      const fnResult = await triggerAppwritePdfGeneration({
        batchId: 'batch-001',
        batchNumber: 1,
        totalCards: 10,
        fileName: 'batch_001.pdf',
        awardsList: [{ slotNumber: 1, title: 'Best Capstone' }],
      });
      assertCondition(
        fnResult.success === false && typeof fnResult.error === 'string',
        `triggerAppwritePdfGeneration returns graceful failure object upon cluster error`
      );
    }

    // SCENARIO 5B: Hostile / Corrupted Payloads passed directly to broadcast functions
    // Assert that bad payloads fail schema parsing inside the broadcast function and NEVER throw to caller
    const hostileServerPayloads: Array<{ fnName: string; invoke: () => Promise<void> }> = [
      {
        fnName: 'broadcastVoteEvent',
        invoke: () => broadcastVoteEvent({ ...VALID_VOTE_PAYLOAD, slotNumber: 999 } as unknown as VoteBroadcastPayload),
      },
      {
        fnName: 'broadcastVoteEvent (null)',
        invoke: () => broadcastVoteEvent(null as unknown as VoteBroadcastPayload),
      },
      {
        fnName: 'broadcastBatchEvent',
        invoke: () => broadcastBatchEvent({ ...VALID_BATCH_PAYLOAD, status: 'INVALID' } as unknown as BatchBroadcastPayload),
      },
      {
        fnName: 'broadcastRegistrationEvent',
        invoke: () => broadcastRegistrationEvent({ ...VALID_REGISTRATION_PAYLOAD, quantity: -10 } as unknown as RegistrationBroadcastPayload),
      },
      {
        fnName: 'broadcastCardActivationEvent',
        invoke: () => broadcastCardActivationEvent({ ...VALID_CARD_ACTIVATION_PAYLOAD, mode: 'INVALID' } as unknown as CardBatchActivatedBroadcastPayload),
      },
      {
        fnName: 'broadcastSystemConfigEvent',
        invoke: () => broadcastSystemConfigEvent({ ...VALID_SYSTEM_CONFIG_PAYLOAD, isVotingOpen: 'yes' } as unknown as SystemConfigBroadcastPayload),
      },
      {
        fnName: 'broadcastAuditEvent',
        invoke: () => broadcastAuditEvent({ ...VALID_AUDIT_PAYLOAD, action: 'A' } as unknown as AuditBroadcastPayload),
      },
    ];

    for (const { fnName, invoke } of hostileServerPayloads) {
      let threw = false;
      try {
        await invoke();
      } catch {
        threw = true;
      }
      assertCondition(
        threw === false,
        `${fnName} safely absorbs malformed input without throwing exception to caller route`
      );
    }

    // SCENARIO 5C: Unconfigured / Local Mode Execution
    process.env.APPWRITE_API_KEY = 'local_appwrite_server_key';
    let unconfiguredThrew = false;
    try {
      await broadcastVoteEvent(VALID_VOTE_PAYLOAD);
      await broadcastBatchEvent(VALID_BATCH_PAYLOAD);
      await broadcastRegistrationEvent(VALID_REGISTRATION_PAYLOAD);
      await triggerLeaderboardSnapshot();
      const uploadNull = await uploadBatchPdfToAppwrite(Buffer.from('PDF'), 'test.pdf');
      assertCondition(uploadNull === null, 'uploadBatchPdfToAppwrite returns null when unconfigured');
    } catch {
      unconfiguredThrew = true;
    }
    assertCondition(
      unconfiguredThrew === false,
      'Server broadcast functions gracefully no-op when Appwrite server is unconfigured'
    );
  } finally {
    // Restore mocks and console.warn
    Databases.prototype.createDocument = originalCreateDocument;
    Functions.prototype.createExecution = originalCreateExecution;
    Storage.prototype.createFile = originalCreateFile;
    Storage.prototype.getFileView = originalGetFileView;
    console.warn = originalWarn;
  }
}

/**
 * Challenge Vector 6: Client Subscription Ingestion Resilience
 * Simulates adversarial payloads delivered via WebSockets to client subscribers.
 */
function testVector6ClientSubscriptionAdversarialIngestion(): void {

  console.log('\n--- Challenge Vector 6: Client Subscription Ingestion Resilience ---');

  process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
  process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = 'itechtivity-2027';
  process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = 'test-itech2027-db';
  process.env.NEXT_PUBLIC_APPWRITE_VOTES_COLLECTION_ID = 'test-votes';
  process.env.NEXT_PUBLIC_APPWRITE_SYSTEM_EVENTS_COLLECTION_ID = 'test-system_events';
  process.env.NEXT_PUBLIC_APPWRITE_PDF_BATCHES_COLLECTION_ID = 'test-pdf_batches';

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
  console.warn = () => {};

  try {
    function emitAdversarialEvent(channel: string, payload: unknown, action = 'create'): void {
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

    // 1. Subscribe to vote events
    let voteDelivered = false;
    const unsubVote = subscribeToVoteEvents(() => {
      voteDelivered = true;
    });

    const voteChannel = 'databases.test-itech2027-db.collections.test-votes.documents';

    // Inject hostile vote payloads
    const hostileVoteDeliveries = [
      { ...VALID_VOTE_PAYLOAD, slotNumber: 10 },
      { ...VALID_VOTE_PAYLOAD, boothCode: 'MALFORMED' },
      { ...VALID_VOTE_PAYLOAD, extraVoterPii: 'Attendee Name' },
      { ...VALID_VOTE_PAYLOAD, __proto__: { evil: true } },
      null,
      undefined,
      'just-a-raw-string',
      123456,
      [],
    ];

    for (const badPayload of hostileVoteDeliveries) {
      voteDelivered = false;
      let crashed = false;
      try {
        emitAdversarialEvent(voteChannel, badPayload);
      } catch {
        crashed = true;
      }
      assertCondition(
        crashed === false && voteDelivered === false,
        `Client vote subscriber safely discards adversarial payload (${typeof badPayload}) without executing callback`
      );
    }

    unsubVote();

    // 2. Subscribe to batch events
    let batchDelivered = false;
    const unsubBatch = subscribeToBatchEvents(() => {
      batchDelivered = true;
    });

    const batchChannel = 'databases.test-itech2027-db.collections.test-pdf_batches.documents';
    batchDelivered = false;
    emitAdversarialEvent(batchChannel, { ...VALID_BATCH_PAYLOAD, status: 'HOSTILE_STATUS' });
    assertCondition(
      batchDelivered === false,
      'Client batch subscriber safely discards invalid status progression'
    );
    unsubBatch();

    // 3. Subscribe to registration events
    let regDelivered = false;
    const unsubReg = subscribeToRegistrationEvents(() => {
      regDelivered = true;
    });

    const systemChannel = 'databases.test-itech2027-db.collections.test-system_events.documents';

    // Emit peer event (CARD_BATCH_ACTIVATED) on shared system_events collection
    regDelivered = false;
    emitAdversarialEvent(systemChannel, VALID_CARD_ACTIVATION_PAYLOAD);
    assertCondition(
      regDelivered === false,
      'Registration subscriber ignores peer CARD_BATCH_ACTIVATED event on shared channel'
    );

    // Emit event with injected PII
    regDelivered = false;
    emitAdversarialEvent(systemChannel, {
      ...VALID_REGISTRATION_PAYLOAD,
      studentNumber: '2023-0001-TG',
    });
    assertCondition(
      regDelivered === false,
      'Registration subscriber rejects incoming event containing injected studentNumber PII'
    );

    unsubReg();

    // 4. Subscribe to system config events
    let configDelivered = false;
    const unsubConfig = subscribeToSystemConfigEvents(() => {
      configDelivered = true;
    });

    configDelivered = false;
    emitAdversarialEvent(systemChannel, {
      ...VALID_SYSTEM_CONFIG_PAYLOAD,
      isVotingOpen: 'not-a-boolean',
    });
    assertCondition(
      configDelivered === false,
      'System config subscriber safely rejects non-boolean payload'
    );
    unsubConfig();

    // 5. Subscribe to audit events
    let auditDelivered = false;
    const unsubAudit = subscribeToAuditEvents(() => {
      auditDelivered = true;
    });

    auditDelivered = false;
    emitAdversarialEvent(systemChannel, {
      ...VALID_AUDIT_PAYLOAD,
      actorEmail: 'admin@itech.edu',
    });
    assertCondition(
      auditDelivered === false,
      'Audit subscriber safely rejects incoming event containing actor email'
    );
    unsubAudit();

    // 6. Subscribe to card activation events
    let activationDelivered = false;
    const unsubActivation = subscribeToCardActivationEvents(() => {
      activationDelivered = true;
    });

    activationDelivered = false;
    emitAdversarialEvent(systemChannel, {
      ...VALID_CARD_ACTIVATION_PAYLOAD,
      mode: 'INVALID_MODE',
    });
    assertCondition(
      activationDelivered === false,
      'Card activation subscriber safely rejects invalid mode enum'
    );
    unsubActivation();

  } finally {
    console.warn = originalWarn;
    Client.prototype.subscribe = originalSubscribe;
  }
}

/**
 * Main Adversarial Test Suite Runner
 */
async function runAdversarialTestSuite(): Promise<void> {

  console.log('========================================================================');
  console.log('Starting Itechtivity 2027 Adversarial Payload & Cluster Resilience Suite');
  console.log('========================================================================');
  const startTime = Date.now();

  testVector1PrototypePollution();
  testVector2MassAssignmentAndPiiLeakage();
  testVector3BoundaryViolations();
  testVector4HostilePrimitivesAndCirculars();
  await testVector5ServerBroadcastClusterFailureResilience();
  testVector6ClientSubscriptionAdversarialIngestion();

  const durationMs = Date.now() - startTime;
  console.log('\n========================================================================');
  console.log(`Adversarial Suite Finished: ${passedAssertions}/${totalAssertions} assertions passed (${durationMs}ms)`);
  console.log('========================================================================\n');

  if (passedAssertions !== totalAssertions) {
    process.exitCode = 1;
  }
}

runAdversarialTestSuite().catch((error: unknown) => {
  console.error('Fatal unhandled error during adversarial test execution:', error);
  process.exitCode = 1;
});
