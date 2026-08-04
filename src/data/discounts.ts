import discountData from "./discounts.json"
import { type Paisa, percentOfPaisa, roundPaisa } from "@/lib/money"
import { loyaltyConfig } from "./loyalty"
import { splitInclusiveGst, taxConfig } from "./tax"

export type OccasionDiscount = {
  id: string
  name: string
  percent: number
  active: boolean
  startsOn: string
  endsOn: string
  note?: string
}

export type FriendsAndFamilyConfig = {
  presets: number[]
  maxPercent: number
  note?: string
}

export type DiscountConfig = {
  occasion: OccasionDiscount
  friendsAndFamily: FriendsAndFamilyConfig
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function isDateInRange(today: Date, startsOn: string, endsOn: string) {
  const start = parseDateOnly(startsOn)
  const end = parseDateOnly(endsOn)
  if (!start || !end) return false

  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  return current >= start && current <= end
}

export const discountConfig = discountData as DiscountConfig

export function getActiveOccasionDiscount(
  today = new Date()
): OccasionDiscount | null {
  const occasion = discountConfig.occasion
  if (!occasion?.active) return null
  if (typeof occasion.percent !== "number" || occasion.percent <= 0) return null
  if (!isDateInRange(today, occasion.startsOn, occasion.endsOn)) return null
  return occasion
}

export function clampDiscountPercent(value: number, maxPercent: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(0, value), maxPercent)
}

export type OrderLineInput = {
  /** Unit price in paisa. */
  unitPricePaisa: Paisa
  qty: number
}

/** All money fields are integer paisa. */
export type OrderTotals = {
  grossSubtotal: Paisa
  friendsFamilyDiscount: Paisa
  friendsFamilyPercent: number
  afterFriendsFamily: Paisa
  occasionDiscount: Paisa
  occasionPercent: number
  occasionName: string | null
  loyaltyDiscount: Paisa
  loyaltyLabel: string | null
  /** Payable amount after discounts (GST inclusive), in paisa. */
  total: Paisa
  taxableAmount: Paisa
  gstAmount: Paisa
  gstPercent: number
  gstLabel: string
}

export function calculateOrderTotals(
  lines: OrderLineInput[],
  options: {
    applyOccasion: boolean
    occasion: OccasionDiscount | null
    friendsFamilyPercent: number
    /** Apply punch-card % off (mutually exclusive with a free loyalty item). */
    redeemLoyalty?: boolean
  }
): OrderTotals {
  const grossSubtotal = roundPaisa(
    lines.reduce((sum, line) => sum + line.unitPricePaisa * line.qty, 0)
  )

  const friendsFamilyPercent = Math.max(0, options.friendsFamilyPercent)
  const friendsFamilyDiscount = percentOfPaisa(
    grossSubtotal,
    friendsFamilyPercent
  )
  const afterFriendsFamily = Math.max(0, grossSubtotal - friendsFamilyDiscount)

  const occasion = options.applyOccasion ? options.occasion : null
  const occasionPercent = occasion?.percent ?? 0
  const occasionDiscount =
    occasion && occasionPercent > 0
      ? percentOfPaisa(afterFriendsFamily, occasionPercent)
      : 0

  const afterOccasion = Math.max(0, afterFriendsFamily - occasionDiscount)

  let loyaltyDiscount: Paisa = 0
  let loyaltyLabel: string | null = null
  if (options.redeemLoyalty) {
    const { percent, label } = loyaltyConfig.percentReward
    loyaltyDiscount = percentOfPaisa(afterOccasion, percent)
    loyaltyLabel = label
  }

  const total = Math.max(0, afterOccasion - loyaltyDiscount)
  const gst = splitInclusiveGst(total, taxConfig.gst.percent)

  return {
    grossSubtotal,
    friendsFamilyDiscount,
    friendsFamilyPercent,
    afterFriendsFamily,
    occasionDiscount,
    occasionPercent,
    occasionName: occasion?.name ?? null,
    loyaltyDiscount,
    loyaltyLabel,
    total,
    taxableAmount: gst.taxableAmount,
    gstAmount: gst.gstAmount,
    gstPercent: gst.gstPercent,
    gstLabel: taxConfig.gst.label,
  }
}
