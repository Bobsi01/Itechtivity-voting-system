interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
}

class SlidingWindowRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private lastCleanup = Date.now();

  /**
   * Evaluates if a request identified by key is allowed within the sliding window.
   */
  public check(
    key: string,
    maxRequests: number,
    windowMs: number
  ): RateLimitResult {
    const now = Date.now();
    this.maybeCleanup(windowMs);

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    const windowStart = now - windowMs;
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    if (record.timestamps.length >= maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - record.timestamps.length,
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
  private maybeCleanup(windowMs: number): void {
    const now = Date.now();
    // Prune at most once every 60 seconds
    if (now - this.lastCleanup < 60000) return;
    this.lastCleanup = now;

    const threshold = now - windowMs * 2;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > threshold);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}

export const rateLimiter = new SlidingWindowRateLimiter();

export function getClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }
  return '127.0.0.1';
}
