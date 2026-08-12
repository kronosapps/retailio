import loyaltyData from "./loyalty.json"

export type LoyaltyPercentReward = {
  percent: number
  label: string
}

export type LoyaltyPointsConfig = {
  /** Spend this many paisa to earn 1 point (default ₹1). */
  paisaPerPoint: number
  /** Each redeemed point is worth this many paisa off (default ₹1). */
  redeemPaisaPerPoint?: number
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

export function getLoyaltyRewardSummary(config = loyaltyConfig) {
  return `Either ${config.percentReward.percent}% off the order, or 1 free redeemable item`
}

export function pointsFromSpendPaisa(
  spendPaisa: number,
  config = loyaltyConfig
): number {
  const per = Math.max(1, Math.round(config.points?.paisaPerPoint || 100))
  return Math.max(0, Math.floor(Math.max(0, spendPaisa) / per))
}

/** Paisa discount from redeeming N points. */
export function paisaFromPointsRedeemed(
  points: number,
  config = loyaltyConfig
): number {
  const per = Math.max(
    1,
    Math.round(
      config.points?.redeemPaisaPerPoint ||
        config.points?.paisaPerPoint ||
        100
    )
  )
  return Math.max(0, Math.floor(points) * per)
}

/** Max points that can be applied against a payable amount. */
export function maxRedeemablePoints(
  payablePaisa: number,
  availablePoints: number,
  config = loyaltyConfig
): number {
  const per = Math.max(
    1,
    Math.round(
      config.points?.redeemPaisaPerPoint ||
        config.points?.paisaPerPoint ||
        100
    )
  )
  const byAmount = Math.floor(Math.max(0, payablePaisa) / per)
  return Math.max(0, Math.min(Math.floor(availablePoints), byAmount))
}
