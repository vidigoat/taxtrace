/**
 * Token-bucket rate limiter for polite API scraping.
 *
 * Most federal APIs (USAspending, FEC) say "be reasonable." We aim for
 * ~5 req/sec by default, which finishes a 1M-row scrape in ~55 hours.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }
}

/** Retry an async fn with exponential backoff on network errors. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) break;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
