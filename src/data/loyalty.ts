import loyaltyData from "./loyalty.json"
import {
  getPromoSettings,
  redeemPaisaPerPointFromMapping,
} from "./promoSettings"

export type LoyaltyPercentReward = {
  percent: number
  label: string
}

export type LoyaltyPointsConfig = {
  /** Spend this many paisa to earn 1 point (default ₹1). */
  paisaPerPoint: number
  /** Legacy: each redeemed point worth this many paisa (overridden by mapping). */
  redeemPaisaPerPoint?: number
  /** Display mapping: N points = M rupees. */
  redeemPoints?: number
  redeemRupees?: number
  /** Redeem only in multiples of this. */
  redeemStep?: number
  label?: string
}

export type LoyaltySegmentsConfig = {
  vipMinSpendPaisa: number
  regularMinVisits: number
  atRiskDays: number
}

export type LoyaltyConfig = {
  name: string
  punchesRequired: number
  note?: string
  percentReward: LoyaltyPercentReward
  points?: LoyaltyPointsConfig
  segments?: LoyaltySegmentsConfig
}

export const loyaltyConfig = loyaltyData as LoyaltyConfig

/** Effective loyalty values (JSON defaults + Promotions Management overrides). */
export function getEffectiveLoyalty() {
  const s = getPromoSettings()
  const redeemPaisaPerPoint = redeemPaisaPerPointFromMapping(s.loyaltyRedeem)
  return {
    punchesRequired: s.punchesRequired,
    percentReward: {
      percent: s.percentReward,
      label: s.percentRewardLabel,
    },
    paisaPerPoint: s.earnPaisaPerPoint,
    redeemPaisaPerPoint,
    redeemStep: Math.max(1, Math.round(s.loyaltyRedeem.step || 500)),
    redeemPoints: s.loyaltyRedeem.points,
    redeemRupees: s.loyaltyRedeem.rupees,
    name: loyaltyConfig.name,
    note: loyaltyConfig.note,
    segments: loyaltyConfig.segments,
    masters: s.masters,
    punchRules: s.punchRules,
    punchCardEnabled: s.masters.punchCardEnabled,
    pointsRedeemEnabled: s.masters.pointsRedeemEnabled,
    punchPercentEnabled: s.masters.punchPercentEnabled,
    freeItemPromoEnabled: s.masters.freeItemPromoEnabled,
  }
}

export function getLoyaltyRewardSummary() {
  const e = getEffectiveLoyalty()
  return `Either ${e.percentReward.percent}% off the order, or 1 free redeemable item`
}

export function pointsFromSpendPaisa(spendPaisa: number): number {
  const per = Math.max(1, Math.round(getEffectiveLoyalty().paisaPerPoint || 100))
  return Math.max(0, Math.floor(Math.max(0, spendPaisa) / per))
}

/** Paisa discount from redeeming N points. */
export function paisaFromPointsRedeemed(points: number): number {
  const per = Math.max(1, getEffectiveLoyalty().redeemPaisaPerPoint)
  return Math.max(0, Math.floor(points) * per)
}

/**
 * Max redeemable points against payable — floored to redeem step (e.g. 500).
 * Example: 1670 available → 1500 redeemable.
 */
export function maxRedeemablePoints(
  payablePaisa: number,
  availablePoints: number
): number {
  const e = getEffectiveLoyalty()
  const per = Math.max(1, e.redeemPaisaPerPoint)
  const step = Math.max(1, e.redeemStep)
  const byAmount = Math.floor(Math.max(0, payablePaisa) / per)
  const raw = Math.max(
    0,
    Math.min(Math.floor(availablePoints), byAmount)
  )
  return Math.floor(raw / step) * step
}

/** Snap a requested redeem amount down to a valid step multiple ≤ max. */
export function snapRedeemPoints(
  requested: number,
  maxAllowed: number
): number {
  const step = Math.max(1, getEffectiveLoyalty().redeemStep)
  const capped = Math.max(0, Math.min(Math.floor(requested || 0), maxAllowed))
  return Math.floor(capped / step) * step
}

export function formatRedeemMappingLabel() {
  const e = getEffectiveLoyalty()
  return `${e.redeemPoints} pts = ₹${e.redeemRupees}`
}

export type WelcomePointsCustomer = {
  loyaltyPoints: number
  visitCount: number
  welcomePromoGranted?: boolean
  welcomePromoPointsRemaining?: number
}

/**
 * Points the cashier may redeem on this ticket.
 * Welcome promo: only promo tranche (≤500/visit for first 2 visits).
 * Earned points unlock after 2 paid visits AND welcome promo is fully used.
 * Same stacking rules as regular points apply at PricingService.
 */
export function getRedeemableLoyaltyPoints(
  customer: WelcomePointsCustomer
): number {
  const wallet = Math.max(0, Math.floor(customer.loyaltyPoints || 0))
  if (!customer.welcomePromoGranted) return wallet

  const remaining = Math.max(
    0,
    Math.floor(customer.welcomePromoPointsRemaining || 0)
  )
  const visits = Math.max(0, Math.floor(customer.visitCount || 0))
  const promo = getPromoSettings().welcomePromo
  const perVisit = Math.max(0, Math.floor(promo.redeemPerVisit || 500))
  const visitLimit = Math.max(1, Math.floor(promo.visitLimit || 2))

  if (visits >= visitLimit && remaining <= 0) {
    return wallet
  }

  const visitCap = visits < visitLimit ? perVisit : remaining
  return Math.min(wallet, remaining, visitCap)
}

/** True while welcome promo locks earned-point redemption. */
export function isWelcomePromoLockActive(
  customer: WelcomePointsCustomer
): boolean {
  if (!customer.welcomePromoGranted) return false
  const remaining = Math.max(
    0,
    Math.floor(customer.welcomePromoPointsRemaining || 0)
  )
  const visits = Math.max(0, Math.floor(customer.visitCount || 0))
  const visitLimit = Math.max(
    1,
    Math.floor(getPromoSettings().welcomePromo.visitLimit || 2)
  )
  return visits < visitLimit || remaining > 0
}

export function describeWelcomePromoStatus(
  customer: WelcomePointsCustomer
): string | null {
  if (!customer.welcomePromoGranted) return null
  const remaining = Math.max(
    0,
    Math.floor(customer.welcomePromoPointsRemaining || 0)
  )
  const visits = Math.max(0, Math.floor(customer.visitCount || 0))
  const promo = getPromoSettings().welcomePromo
  const perVisit = promo.redeemPerVisit
  const visitLimit = promo.visitLimit
  if (visits >= visitLimit && remaining <= 0) {
    return "Welcome promo complete — earned points are redeemable."
  }
  if (visits < visitLimit) {
    return `Welcome promo: up to ${perVisit} pts this visit (${remaining} promo left · visit ${visits + 1}/${visitLimit}). Earned points unlock after ${visitLimit} visits when promo is used.`
  }
  return `Welcome promo leftover: ${remaining} pts. Earned points unlock after promo is fully used.`
}
