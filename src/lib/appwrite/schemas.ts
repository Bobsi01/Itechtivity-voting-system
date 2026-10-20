import { z } from 'zod';

/**
 * Public Vote Event Broadcast Payload Schema
 * Scoped strictly to public tallies and booth code with zero voter identity or stub token info.
 */
export const VoteBroadcastSchema = z.object({
  boothId: z.string().uuid(),
  boothCode: z.string().regex(/^CS-\d{2}$/),
  awardId: z.string().uuid(),
  awardTitle: z.string().min(2).max(100),
  slotNumber: z.number().int().min(1).max(6),
  totalVotesForAward: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
}).strict();

export type VoteBroadcastPayload = z.infer<typeof VoteBroadcastSchema>;

/**
 * Production PDF Batch Event Broadcast Payload Schema
 * Tracks generation status progression and download metadata for printable bingo cards.
 */
export const BatchBroadcastSchema = z.object({
  batchId: z.string().min(1),
  batchNumber: z.number().int().positive(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  fileId: z.string().optional(),
  fileName: z.string().min(3).max(255),
  totalCards: z.number().int().positive(),
  totalSheets: z.number().int().positive(),
  fileSize: z.number().int().nonnegative().optional(),
  updatedAt: z.string().datetime(),
}).strict();

export type BatchBroadcastPayload = z.infer<typeof BatchBroadcastSchema>;

/**
 * Sanitized Registration Event Broadcast Signal Schema
 * Strictly omits attendee name, student number, program, and contact info to prevent PII exposure over public WebSockets.
 */
export const RegistrationBroadcastSchema = z.object({
  eventType: z.literal('REGISTRATION_EVENT'),
  transactionId: z.string().uuid(),
  quantity: z.number().int().positive(),
  timestamp: z.string().datetime(),
  processedByRole: z.enum(['REGISTRATION', 'ADMIN']),
}).strict();

export type RegistrationBroadcastPayload = z.infer<typeof RegistrationBroadcastSchema>;

/**
 * Sanitized Card Batch Activation Broadcast Signal Schema
 * Broadcasts card activation counts to sync inventory without exposing attendee or purchaser data.
 */
export const CardBatchActivatedBroadcastSchema = z.object({
  eventType: z.literal('CARD_BATCH_ACTIVATED'),
  batchId: z.string().optional(),
  mode: z.enum(['BY_BATCH', 'BY_RANGE', 'BY_SERIALS']),
  activatedCount: z.number().int().positive(),
  timestamp: z.string().datetime(),
}).strict();

export type CardBatchActivatedBroadcastPayload = z.infer<typeof CardBatchActivatedBroadcastSchema>;

/**
 * System Configuration and Emergency Voting Freeze Broadcast Payload Schema
 * Notifies clients of global voting freeze/unfreeze and award lock status changes in real time.
 */
export const SystemConfigBroadcastSchema = z.object({
  eventType: z.literal('SYSTEM_CONFIG_EVENT'),
  isVotingOpen: z.boolean(),
  isAwardsLocked: z.boolean(),
  isRegistrationOpen: z.boolean().default(true),
  timestamp: z.string().datetime(),
}).strict();

export type SystemConfigBroadcastPayload = z.input<typeof SystemConfigBroadcastSchema>;

/**
 * Sanitized Audit Trail Broadcast Signal Schema
 * Strictly omits actor email, IP address, user ID, and internal details to maintain zero-trust security.
 */
export const AuditBroadcastSchema = z.object({
  eventType: z.literal('AUDIT_EVENT'),
  action: z.string().min(2).max(64),
  resource: z.string().min(2).max(64),
  timestamp: z.string().datetime(),
}).strict();

export type AuditBroadcastPayload = z.infer<typeof AuditBroadcastSchema>;
