import loyaltyData from "./loyalty.json"

export type LoyaltyPercentReward = {
  percent: number
  label: string
}

export type LoyaltyConfig = {
  name: string
  punchesRequired: number
  note?: string
  percentReward: LoyaltyPercentReward
}

export const loyaltyConfig = loyaltyData as LoyaltyConfig

export function getLoyaltyRewardSummary(config = loyaltyConfig) {
  return `Either ${config.percentReward.percent}% off the order, or 1 free redeemable item`
}
