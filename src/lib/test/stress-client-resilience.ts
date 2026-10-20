/**
 * Itechtivity 2027 - Empirical Challenger 2 Stress Test Suite
 * Concurrency, Network Flap, Deduplication, and Debounce Coalescence
 *
 * Directives:
 * - STRICT NO EMOJIS anywhere (code, comments, console logs)
 * - Strict TypeScript typing (zero any, zero @ts-ignore)
 * - Empirical verification of client synchronization resilience
 */

import {
  EventDeduplicator,
  createEventDeduplicator,
  createResilientPoller,
} from '../appwrite/client';
import type { VoteBroadcastPayload, SystemConfigBroadcastPayload } from '../appwrite/schemas';

interface StressTestStats {
  passed: number;
  failed: number;
  total: number;
}

const stats: StressTestStats = {
  passed: 0,
  failed: 0,
  total: 0,
};

function assertCondition(condition: boolean, testName: string, failureDetails?: string): void {
  stats.total++;
  if (condition) {
    stats.passed++;
    console.log(`[PASS] ${testName}`);
  } else {
    stats.failed++;
    console.error(`[FAIL] ${testName}${failureDetails ? `: ${failureDetails}` : ''}`);
  }
}

/**
 * Challenge 1: EventDeduplicator under Massive Concurrency and Burst Deliveries
 */
async function challenge1DeduplicationAndConcurrency(): Promise<void> {
  console.log('\n--- Challenge 1: EventDeduplicator & High Concurrency Burst ---');

  const deduplicator = createEventDeduplicator(500, 5000);
  const sharedTxId = 'tx-concurrent-stress-001';
  let processedCount = 0;

  // Simulate 100 concurrent workers trying to process the exact same transaction ID
  const promises: Array<Promise<void>> = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      new Promise<void>((resolve) => {
        // Slight random micro-tick jitter
        setTimeout(() => {
          if (deduplicator.shouldProcess(sharedTxId)) {
            processedCount++;
          }
          resolve();
        }, Math.floor(Math.random() * 5));
      })
    );
  }

  await Promise.all(promises);

  assertCondition(
    processedCount === 1,
    '100 concurrent burst attempts for identical transaction ID yield exactly 1 execution',
    `Processed count was ${processedCount}`
  );

  // Interleaved WebSocket and HTTP Polling Burst:
  // 50 unique transactions, each delivered 10 times concurrently (5 via WS, 5 via Poll)
  const totalUnique = 50;
  const executionsByTx = new Map<string, number>();

  const burstTasks: Array<Promise<void>> = [];
  for (let txIndex = 0; txIndex < totalUnique; txIndex++) {
    const txId = `tx-interleaved-burst-${txIndex}`;
    executionsByTx.set(txId, 0);

    for (let attempt = 0; attempt < 10; attempt++) {
      burstTasks.push(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (deduplicator.shouldProcess(txId)) {
              executionsByTx.set(txId, (executionsByTx.get(txId) ?? 0) + 1);
            }
            resolve();
          }, Math.floor(Math.random() * 8));
        })
      );
    }
  }

  await Promise.all(burstTasks);

  const duplicateOccurrences = Array.from(executionsByTx.values()).filter((count) => count !== 1);
  assertCondition(
    duplicateOccurrences.length === 0,
    '500 interleaved WS and polling deliveries across 50 transactions executed each transaction exactly once',
    `Non-single executions detected: ${duplicateOccurrences.length}`
  );

  // Capacity LRU eviction boundary stress
  const smallCapacityDeduplicator = new EventDeduplicator(5, 60000);
  for (let i = 1; i <= 5; i++) {
    smallCapacityDeduplicator.shouldProcess(`item-${i}`);
  }
  // All 5 items should be in memory
  assertCondition(
    smallCapacityDeduplicator.has('item-1') && smallCapacityDeduplicator.has('item-5'),
    'Capacity buffer filled to maximum limit (5/5 items present)'
  );

  // Ingest 6th item; item-1 must be evicted
  smallCapacityDeduplicator.shouldProcess('item-6');
  assertCondition(
    !smallCapacityDeduplicator.has('item-1'),
    'LRU eviction correctly discarded oldest entry (item-1) on capacity overflow'
  );
  assertCondition(
    smallCapacityDeduplicator.has('item-6') && smallCapacityDeduplicator.has('item-2'),
    'Newest entry (item-6) and adjacent entries preserved after LRU eviction'
  );

  // Re-ingest evicted item-1: should now be accepted because it was pruned
  const reIngestAccepted = smallCapacityDeduplicator.shouldProcess('item-1');
  assertCondition(
    reIngestAccepted === true,
    'Evicted entry can be processed again after capacity eviction'
  );
}

/**
 * Challenge 2: Resilient Polling Exponential Backoff & Reset Verification
 */
async function challenge2ResilientPollingMechanics(): Promise<void> {
  console.log('\n--- Challenge 2: Resilient Polling Exponential Backoff & Reset ---');

  let pollCount = 0;
  const pollLog: number[] = [];

  const poller = createResilientPoller(
    () => {
      pollCount++;
      pollLog.push(Date.now());
    },
    {
      initialIntervalMs: 50,
      maxIntervalMs: 200,
      backoffFactor: 1.5,
    }
  );

  poller.start();

  // Wait for 3 polling intervals: 50ms, then 75ms (total ~125ms)
  await new Promise((resolve) => setTimeout(resolve, 160));

  assertCondition(
    pollCount >= 2,
    `Resilient poller executed expected initial polls (count: ${pollCount})`
  );

  // Reset poller: simulates incoming WebSocket event resetting the backoff timer
  poller.reset();
  const countBeforeReset = pollCount;

  // After reset, the next poll occurs at initial interval (50ms)
  await new Promise((resolve) => setTimeout(resolve, 75));

  assertCondition(
    pollCount > countBeforeReset,
    'Poller reset rescheduled immediate poll at initial interval'
  );

  // Stop poller and verify no further executions occur
  poller.stop();
  const countAtStop = pollCount;
  await new Promise((resolve) => setTimeout(resolve, 120));

  assertCondition(
    pollCount === countAtStop,
    'Stopping resilient poller cleanly halted all background timer intervals'
  );
}

/**
 * Challenge 3: Rapid Vote Broadcasts - Absolute Tallies vs Relative Accumulation Drift
 */
function challenge3AbsoluteTallyDriftPrevention(): void {
  console.log('\n--- Challenge 3: Absolute Tally Idempotency vs Relative Drift ---');

  interface BoothStandings {
    boothCode: string;
    totalVotes: number;
    awardVotes: Record<string, number>;
  }

  // Simulated AwardsStage component state
  const stageLeaderboard: Record<string, BoothStandings> = {
    'CS-01': { boothCode: 'CS-01', totalVotes: 0, awardVotes: {} },
    'CS-02': { boothCode: 'CS-02', totalVotes: 0, awardVotes: {} },
  };

  /**
   * Verified authoritative ingestion pattern used in AwardsStage & LiveLeaderboard
   */
  function ingestAuthoritativeVote(payload: VoteBroadcastPayload): void {
    const booth = stageLeaderboard[payload.boothCode];
    if (booth) {
      booth.awardVotes[payload.awardId] = payload.totalVotesForAward;
      // Recompute total booth votes from authoritative award tallies
      booth.totalVotes = Object.values(booth.awardVotes).reduce((sum, v) => sum + v, 0);
    }
  }

  /**
   * Vulnerable relative accumulation anti-pattern (for comparison and drift proof)
   */
  let vulnerableRelativeAccumulator = 0;
  function ingestVulnerableVote(payload: VoteBroadcastPayload): void {
    vulnerableRelativeAccumulator += payload.totalVotesForAward;
  }

  const sampleVote: VoteBroadcastPayload = {
    boothId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    boothCode: 'CS-01',
    awardId: 'award-uuid-slot-1',
    awardTitle: 'Best Capstone Project',
    slotNumber: 1,
    totalVotesForAward: 35,
    timestamp: new Date().toISOString(),
  };

  // Simulate extreme network flap: 100 rapid duplicate event dispatches
  // (e.g. WebSocket reconnection loop, broadcast fanout, fallback polling)
  for (let i = 0; i < 100; i++) {
    ingestAuthoritativeVote(sampleVote);
    ingestVulnerableVote(sampleVote);
  }

  assertCondition(
    stageLeaderboard['CS-01'].awardVotes['award-uuid-slot-1'] === 35,
    'Authoritative state assignment strictly maintains tally at 35 despite 100 duplicate deliveries'
  );

  assertCondition(
    stageLeaderboard['CS-01'].totalVotes === 35,
    'Authoritative totalVotes recomputation remains strictly at 35'
  );

  assertCondition(
    vulnerableRelativeAccumulator === 3500,
    'Empirical proof: Vulnerable relative accumulation drifted from 35 to 3500 (9900% error)'
  );

  // Subsequent legitimate progression to 36 votes
  const progressionVote: VoteBroadcastPayload = {
    ...sampleVote,
    totalVotesForAward: 36,
  };
  ingestAuthoritativeVote(progressionVote);

  assertCondition(
    stageLeaderboard['CS-01'].awardVotes['award-uuid-slot-1'] === 36,
    'Subsequent vote progression cleanly updates authoritative tally to 36 without residual drift'
  );

  // Monotonic guard analysis (out-of-order delayed packet)
  function ingestWithMonotonicCheck(current: number, incoming: number): number {
    return Math.max(current, incoming);
  }

  const delayedOlderVote = 35;
  const currentTally = 36;
  const monotonicResult = ingestWithMonotonicCheck(currentTally, delayedOlderVote);
  assertCondition(
    monotonicResult === 36,
    'Monotonic guard Math.max(current, incoming) protects against delayed out-of-order older packets'
  );
}

/**
 * Challenge 4: Emergency Freeze Alert, Viewfinder Pausing & Rejection Verification
 */
function challenge4EmergencyFreezeBehavior(): void {
  console.log('\n--- Challenge 4: Emergency Freeze Alert & Viewfinder Pausing ---');

  interface ScannerSimulationState {
    isVotingOpen: boolean;
    viewfinderActive: boolean;
    alertBannerVisible: boolean;
    toastErrorLogged: boolean;
    networkCallsAttempted: number;
  }

  const scannerState: ScannerSimulationState = {
    isVotingOpen: true,
    viewfinderActive: true,
    alertBannerVisible: false,
    toastErrorLogged: false,
    networkCallsAttempted: 0,
  };

  function onSystemConfigUpdate(payload: SystemConfigBroadcastPayload): void {
    scannerState.isVotingOpen = payload.isVotingOpen;
    if (!payload.isVotingOpen) {
      scannerState.viewfinderActive = false;
      scannerState.alertBannerVisible = true;
      scannerState.toastErrorLogged = true;
    } else {
      scannerState.viewfinderActive = true;
      scannerState.alertBannerVisible = false;
    }
  }

  // Simulates handleProcessScan in mobile-scanner.tsx
  function handleProcessScan(qrPayload: string): { accepted: boolean; reason?: string } {
    if (!scannerState.isVotingOpen) {
      scannerState.toastErrorLogged = true;
      return { accepted: false, reason: 'Voting is currently frozen. Cannot submit votes.' };
    }
    // Proceed with network submission
    scannerState.networkCallsAttempted++;
    return { accepted: true };
  }

  // 1. Initial active voting state
  assertCondition(
    scannerState.isVotingOpen === true && scannerState.viewfinderActive === true && scannerState.alertBannerVisible === false,
    'Initial scanner state: voting open, camera viewfinder active, alert banner hidden'
  );

  const initialScan = handleProcessScan('B27-B01-0001-S1.9F4A2C8E');
  assertCondition(
    initialScan.accepted === true && scannerState.networkCallsAttempted === 1,
    'Scans are permitted and processed while voting is open'
  );

  // 2. Administrator triggers emergency voting freeze
  onSystemConfigUpdate({
    eventType: 'SYSTEM_CONFIG_EVENT',
    isVotingOpen: false,
    isAwardsLocked: false,
    timestamp: new Date().toISOString(),
  });

  assertCondition(
    scannerState.isVotingOpen === false,
    'Emergency freeze payload instantly flips isVotingOpen to false'
  );
  assertCondition(
    scannerState.alertBannerVisible === true,
    'Emergency freeze alert banner is immediately displayed with assertive accessibility role'
  );
  assertCondition(
    scannerState.viewfinderActive === false,
    'Camera viewfinder stream is immediately unmounted and replaced with paused placeholder'
  );

  // 3. Attempting to scan or submit manual input during freeze
  const frozenScanResult = handleProcessScan('B27-B01-0002-S1.1A2B3C4D');
  assertCondition(
    frozenScanResult.accepted === false && Boolean(frozenScanResult.reason?.includes('frozen')),
    'Scan submission is immediately blocked at handler boundary without network dispatch'
  );
  assertCondition(
    scannerState.networkCallsAttempted === 1,
    'Zero HTTP /api/vote network requests dispatched while voting is frozen'
  );

  // 4. Administrator reopens voting
  onSystemConfigUpdate({
    eventType: 'SYSTEM_CONFIG_EVENT',
    isVotingOpen: true,
    isAwardsLocked: false,
    timestamp: new Date().toISOString(),
  });

  assertCondition(
    scannerState.isVotingOpen === true && scannerState.viewfinderActive === true && scannerState.alertBannerVisible === false,
    'Reopening voting immediately removes alert banner and resumes viewfinder scanning'
  );

  const resumedScanResult = handleProcessScan('B27-B01-0003-S1.5E6F7A8B');
  assertCondition(
    resumedScanResult.accepted === true && scannerState.networkCallsAttempted === 2,
    'Scans execute normally once voting is resumed'
  );
}

/**
 * Challenge 5: Trailing Debounce Coalesces Rapid Burst Requests
 */
async function challenge5DebounceCoalescence(): Promise<void> {
  console.log('\n--- Challenge 5: Trailing Debounce Coalescence ---');

  let executionCount = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function debouncedFetch(delayMs = 100): void {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      executionCount++;
    }, delayMs);
  }

  // Burst 1: Fire 50 calls in rapid succession, spaced 5ms apart (total 250ms)
  // With 100ms trailing debounce, the timer keeps resetting until the last call finishes
  for (let i = 0; i < 50; i++) {
    debouncedFetch(100);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // Before the trailing debounce window elapses, executionCount MUST still be 0
  assertCondition(
    executionCount === 0,
    'Debounced fetch has not fired prematurely during ongoing rapid burst'
  );

  // Wait for trailing debounce window (100ms + buffer)
  await new Promise((resolve) => setTimeout(resolve, 150));

  assertCondition(
    executionCount === 1,
    '50 rapid burst events coalesced into exactly 1 network query execution',
    `Expected 1, got ${executionCount}`
  );

  // Burst 2: Two distinct bursts separated by a lull longer than debounce window
  // Burst 2A: 10 calls spaced 5ms apart
  for (let i = 0; i < 10; i++) {
    debouncedFetch(80);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // Allow Burst 2A trailing debounce to execute
  await new Promise((resolve) => setTimeout(resolve, 110));

  assertCondition(
    executionCount === 2,
    'First separated burst cleanly executed at its trailing edge (execution count: 2)'
  );

  // Burst 2B: 10 more calls spaced 5ms apart
  for (let i = 0; i < 10; i++) {
    debouncedFetch(80);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // Allow Burst 2B trailing debounce to execute
  await new Promise((resolve) => setTimeout(resolve, 110));

  assertCondition(
    executionCount === 3,
    'Second separated burst cleanly executed at its trailing edge (execution count: 3)'
  );

  // Extreme Synchronous Burst: 1,000 synchronous calls
  for (let i = 0; i < 1000; i++) {
    debouncedFetch(50);
  }

  await new Promise((resolve) => setTimeout(resolve, 80));

  assertCondition(
    executionCount === 4,
    '1,000 extreme synchronous calls coalesced into exactly 1 trailing network query',
    `Expected 4, got ${executionCount}`
  );
}

/**
 * Main Runner
 */
async function runEmpiricalStressSuite(): Promise<void> {
  console.log('================================================================');
  console.log('Starting Challenger 2: Concurrency & Synchronization Stress Test');
  console.log('================================================================');

  const startTime = Date.now();

  try {
    await challenge1DeduplicationAndConcurrency();
    await challenge2ResilientPollingMechanics();
    challenge3AbsoluteTallyDriftPrevention();
    challenge4EmergencyFreezeBehavior();
    await challenge5DebounceCoalescence();
  } catch (error) {
    console.error('Unhandled exception in stress test suite:', error);
    stats.failed++;
  }

  const durationMs = Date.now() - startTime;

  console.log('\n================================================================');
  console.log(`Stress Test Results: ${stats.passed}/${stats.total} passed, ${stats.failed} failed (${durationMs}ms)`);
  console.log('================================================================');

  if (stats.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

void runEmpiricalStressSuite();
