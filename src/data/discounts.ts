import discountData from "./discounts.json"

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
  unitPrice: number
  qty: number
}

export type OrderTotals = {
  grossSubtotal: number
  friendsFamilyDiscount: number
  friendsFamilyPercent: number
  afterFriendsFamily: number
  occasionDiscount: number
  occasionPercent: number
  occasionName: string | null
  total: number
}

export function calculateOrderTotals(
  lines: OrderLineInput[],
  options: {
    applyOccasion: boolean
    occasion: OccasionDiscount | null
    friendsFamilyPercent: number
  }
): OrderTotals {
  const grossSubtotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.qty,
    0
  )

  const friendsFamilyPercent = Math.max(0, options.friendsFamilyPercent)
  const friendsFamilyDiscount = (grossSubtotal * friendsFamilyPercent) / 100
  const afterFriendsFamily = Math.max(0, grossSubtotal - friendsFamilyDiscount)

  const occasion = options.applyOccasion ? options.occasion : null
  const occasionPercent = occasion?.percent ?? 0
  const occasionDiscount =
    occasion && occasionPercent > 0
      ? (afterFriendsFamily * occasionPercent) / 100
      : 0

  return {
    grossSubtotal,
    friendsFamilyDiscount,
    friendsFamilyPercent,
    afterFriendsFamily,
    occasionDiscount,
    occasionPercent,
    occasionName: occasion?.name ?? null,
    total: Math.max(0, afterFriendsFamily - occasionDiscount),
  }
}
