/**
 * Pricing domain — snapshots, promotions, coupons, price history.
 * Answers: "Why did this sell for ₹45 instead of ₹50?"
 */

import type { Paisa } from "@/lib/money"

/** One rule that changed the price (persisted on the sale line). */
export type AppliedPriceRule = {
  type:
    | "BASE"
    | "PROMOTION"
    | "COUPON"
    | "FRIENDS_FAMILY"
    | "OCCASION"
    | "LOYALTY"
    | "MANUAL"
  id: string | null
  label: string
  /** Discount amount in paisa (positive = reduction). */
  amountPaisa: Paisa
}

/**
 * Frozen at sale time — do not re-resolve from today's catalog.
 */
export type PriceSnapshot = {
  /** Catalog list unit when sold. */
  listUnitPaisa: Paisa
  /** Unit after product/category promotion (before order %). */
  promoUnitPaisa: Paisa
  /** List × qty before order-level discounts. */
  listLinePaisa: Paisa
  /** Line share of cart after promo, before F&F/occasion/loyalty. */
  promoLinePaisa: Paisa
  /** Final net line total charged (after all discounts). */
  netLinePaisa: Paisa
  /** Human-readable one-liner. */
  explanation: string
  appliedRules: AppliedPriceRule[]
}

export type PromotionDiscountType = "PERCENT" | "FIXED"

export type PromotionRecord = {
  id: string
  name: string
  active: boolean
  discountType: PromotionDiscountType
  /** Percent (e.g. 10) or fixed rupees off unit (stored as paisa for FIXED). */
  discountValue: number
  /** YYYY-MM-DD */
  startsOn: string
  endsOn: string
  /** Empty = all products (still filtered by category if set). */
  skuScope: string[]
  /** Empty = any category. */
  categoryScope: string[]
  priority: number
  notes: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export type CouponRecord = {
  id: string
  code: string
  name: string
  active: boolean
  discountType: PromotionDiscountType
  /** Percent or fixed paisa off order subtotal (after promo). */
  discountValue: number
  startsOn: string
  endsOn: string
  minSubtotalPaisa: number
  maxRedemptions: number | null
  redemptionCount: number
  notes: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export type PriceHistoryRecord = {
  id: string
  sku: string
  productName: string
  oldSellingPricePaisa: Paisa
  newSellingPricePaisa: Paisa
  changedAt: string
  changedBy: string | null
  storeId: string | null
}

export function explainPriceSnapshot(snap: PriceSnapshot | null | undefined): string {
  if (!snap) return "No price snapshot (legacy sale)."
  if (snap.explanation) return snap.explanation
  const parts = snap.appliedRules
    .filter((r) => r.type !== "BASE" && r.amountPaisa > 0)
    .map((r) => `${r.label} (−${(r.amountPaisa / 100).toFixed(2)})`)
  if (!parts.length) {
    return `List price ₹${(snap.listUnitPaisa / 100).toFixed(2)} (no discounts).`
  }
  return `List ₹${(snap.listUnitPaisa / 100).toFixed(2)} → ${parts.join(" → ")} → net ₹${(snap.netLinePaisa / Math.max(1, snap.listLinePaisa / Math.max(1, snap.listUnitPaisa)) / 100).toFixed(2)}`
}
