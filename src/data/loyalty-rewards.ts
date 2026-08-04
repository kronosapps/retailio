import { assetUrl } from "@/lib/asset-url"
import { type Paisa, rupeesToPaisa } from "@/lib/money"

import loyaltyRewardsData from "./loyalty-rewards.json"

export type LoyaltyRewardItem = {
  id: string
  name: string
  weight: string
  /** Catalog value in paisa (for display; item is free when redeemed). */
  value: Paisa
  color: string
  image?: string
}

type RawLoyaltyRewardItem = {
  id: string
  name: string
  weight: string
  value: number
  color: string
  image?: string
}

function normalizeRewardItem(raw: RawLoyaltyRewardItem): LoyaltyRewardItem {
  const item: LoyaltyRewardItem = {
    id: raw.id,
    name: raw.name,
    weight: raw.weight,
    value: rupeesToPaisa(raw.value),
    color: raw.color,
  }
  if (raw.image) item.image = assetUrl(raw.image)
  return item
}

const rawItems = (loyaltyRewardsData as { items: RawLoyaltyRewardItem[] }).items

export const LOYALTY_REWARD_ITEMS: LoyaltyRewardItem[] = rawItems.map(
  normalizeRewardItem
)

export function getLoyaltyRewardItem(
  id: string | null | undefined
): LoyaltyRewardItem | null {
  if (!id) return null
  return LOYALTY_REWARD_ITEMS.find((item) => item.id === id) ?? null
}
