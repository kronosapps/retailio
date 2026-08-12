/**
 * Thresholds for staff operational alerts (offline-first).
 */

export type AlertThresholds = {
  version: 1
  /** Discount share of gross that triggers large_discount (0–1). */
  largeDiscountRatio: number
  /** Absolute discount paisa floor. */
  largeDiscountMinPaisa: number
  /** Refund amount paisa that triggers large_refund. */
  largeRefundMinPaisa: number
  /** Absolute till variance paisa. */
  cashVarianceMinPaisa: number
  /** Customer AR outstanding paisa. */
  customerOutstandingMinPaisa: number
  /** Supplier AP remaining paisa. */
  supplierOutstandingMinPaisa: number
  /** Lot expiry window (days). */
  expiryWithinDays: number
  /** Suppress duplicate staff alerts for the same dedupeKey within this ms. */
  dedupeWindowMs: number
}

const STORAGE_KEY = "retailos.alert_thresholds.v1"

const DEFAULTS: AlertThresholds = {
  version: 1,
  largeDiscountRatio: 0.2,
  largeDiscountMinPaisa: 50000, // ₹500
  largeRefundMinPaisa: 100000, // ₹1000
  cashVarianceMinPaisa: 5000, // ₹50
  customerOutstandingMinPaisa: 50000,
  supplierOutstandingMinPaisa: 100000,
  expiryWithinDays: 14,
  dedupeWindowMs: 6 * 60 * 60 * 1000,
}

export function getAlertThresholds(): AlertThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AlertThresholds>
    return { ...DEFAULTS, ...parsed, version: 1 }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAlertThresholds(
  patch: Partial<AlertThresholds>
): AlertThresholds {
  const next = { ...getAlertThresholds(), ...patch, version: 1 as const }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
