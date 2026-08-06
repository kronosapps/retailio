/** Retry delays: 1m, 5m, 15m — max 3 attempts. */
export const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
] as const

export const MAX_RETRIES = 3

export function nextRetryAt(retryCount: number, from = Date.now()): string | null {
  if (retryCount >= MAX_RETRIES) return null
  const delay = RETRY_DELAYS_MS[Math.min(retryCount, RETRY_DELAYS_MS.length - 1)]
  return new Date(from + delay).toISOString()
}

export function shouldRetry(retryCount: number): boolean {
  return retryCount < MAX_RETRIES
}
