/**
 * Exponential-ish retry policy for sync queue items.
 * After maxAttempts → dead letter (never silently drop).
 */
export class RetryManager {
  private readonly maxAttempts: number
  private readonly baseDelayMs: number

  constructor(maxAttempts = 3, baseDelayMs = 1000) {
    this.maxAttempts = maxAttempts
    this.baseDelayMs = baseDelayMs
  }

  shouldRetry(retries: number): boolean {
    return retries < this.maxAttempts
  }

  nextDelayMs(retries: number): number {
    return this.baseDelayMs * Math.pow(2, Math.max(0, retries))
  }

  get maxRetries() {
    return this.maxAttempts
  }
}

export const retryManager = new RetryManager(3, 1000)
