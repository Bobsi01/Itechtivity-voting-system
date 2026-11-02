interface RateLimitRecord {
  timestamps: number[];
  windowMs: number;
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private lastCleanup: number;

  constructor(
    private readonly maxRecords = 10000,
    private readonly getTime: () => number = Date.now
  ) {

    this.lastCleanup = getTime();
  }

  /**
   * Evaluates if a request identified by key is allowed within the sliding window.
   */
  public check(
    key: string,
    maxRequests: number,
    windowMs: number
  ): RateLimitResult {

    const now = this.getTime();
    this.maybeCleanup(now);

    let record = this.records.get(key);
    if (!record) {
      if (this.records.size >= this.maxRecords) {
        this.maybeCleanup(now, true);
        if (this.records.size >= this.maxRecords) {
          return { allowed: false, retryAfterSeconds: 60, remaining: 0 };
        }
      }

      record = { timestamps: [], windowMs, expiresAt: now + windowMs };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    record.windowMs = Math.max(record.windowMs, windowMs);
    record.timestamps = record.timestamps.filter((timestamp) => timestamp > now - record.windowMs);
    const activeTimestamps = record.timestamps.filter((timestamp) => timestamp > now - windowMs);

    if (activeTimestamps.length >= maxRequests) {
      const oldestInWindow = activeTimestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }

    record.timestamps.push(now);
    record.expiresAt = now + record.windowMs;
    return {
      allowed: true,
      remaining: maxRequests - activeTimestamps.length - 1,
    };
  }

  /**
   * Resets rate limit records for a given key (e.g. after successful login).
   */
  public reset(key: string): void {

    this.records.delete(key);
  }

  /**
   * Prunes stale records periodically to prevent unbounded memory growth.
   */
  private maybeCleanup(now: number, force = false): void {

    if (!force && now - this.lastCleanup < 60000) return;
    this.lastCleanup = now;

    for (const [key, record] of this.records.entries()) {
      // Each key retains its own window; scan traffic must not erase longer login limits.
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }
}

export const rateLimiter = new SlidingWindowRateLimiter();

export function getClientIp(request: Request): string {

  const IPV4_PATTERN = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

  function isValidIp(ip: string): boolean {
    return (IPV4_PATTERN.test(ip) || IPV6_PATTERN.test(ip)) && !ip.includes(' ');
  }

  // 1. Standard reverse-proxy forwarded chain: the leftmost hop is the client IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && isValidIp(s));
    if (hops.length > 0) {
      return hops[0];
    }
  }

  // 2. Cloudflare connecting IP (if validated format)
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIp(cfConnectingIp.trim())) {
    return cfConnectingIp.trim();
  }

  // 3. Real IP header fallback (if validated format)
  const realIp = request.headers.get('x-real-ip');
  if (realIp && isValidIp(realIp.trim())) {
    return realIp.trim();
  }

  return '127.0.0.1';
}
