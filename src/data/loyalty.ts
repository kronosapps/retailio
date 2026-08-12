import loyaltyData from "./loyalty.json"

export type LoyaltyPercentReward = {
  percent: number
  label: string
}

export type LoyaltyPointsConfig = {
  /** Spend this many paisa to earn 1 point (default ₹1). */
  paisaPerPoint: number
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
