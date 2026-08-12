/**
 * Runtime Promotions Management settings (overrides JSON defaults).
 * Stored offline-first in localStorage.
 */

import discountDefaults from "./discounts.json"
import loyaltyDefaults from "./loyalty.json"

const STORAGE_KEY = "retailos.promo_settings.v1"

export type BirthdayPromoSettings = {
  active: boolean
  /** Percent off order when birthday window matches. */
  percent: number
  daysBefore: number
  daysAfter: number
  label: string
}

export type LoyaltyRedeemMapping = {
  /** Points in the display bundle (e.g. 1000). */
  points: number
  /** Rupees that bundle is worth (e.g. 10). */
  rupees: number
  /** Redeem only in multiples of this (e.g. 500). */
  step: number
}

export type PromoMasterSwitches = {
  /** Product / SKU line promotions. */
  productPromotionsEnabled: boolean
  /** Order campaigns: coupons, occasion, birthday. */
  orderPromotionsEnabled: boolean
}

export type OccasionSettings = {
  id: string
  name: string
  percent: number
  active: boolean
  startsOn: string
  endsOn: string
  note?: string
}

export type FriendsFamilySettings = {
  presets: number[]
  maxPercent: number
  note?: string
}

export type PromoSettings = {
  version: 1
  masters: PromoMasterSwitches
  loyaltyRedeem: LoyaltyRedeemMapping
  /** Earn: paisa spent per 1 point. */
  earnPaisaPerPoint: number
  punchesRequired: number
  percentReward: number
  percentRewardLabel: string
  birthday: BirthdayPromoSettings
  occasion: OccasionSettings
  friendsAndFamily: FriendsFamilySettings
}

function defaults(): PromoSettings {
  const loyalty = loyaltyDefaults as {
    punchesRequired: number
    percentReward: { percent: number; label: string }
    points?: { paisaPerPoint?: number }
  }
  const discounts = discountDefaults as {
    occasion: OccasionSettings
    friendsAndFamily: FriendsFamilySettings
  }
  return {
    version: 1,
    masters: {
      productPromotionsEnabled: true,
      orderPromotionsEnabled: true,
    },
    loyaltyRedeem: {
      points: 1000,
      rupees: 10,
      step: 500,
    },
    earnPaisaPerPoint: loyalty.points?.paisaPerPoint ?? 100,
    punchesRequired: loyalty.punchesRequired,
    percentReward: loyalty.percentReward.percent,
    percentRewardLabel: loyalty.percentReward.label,
    birthday: {
      active: false,
      percent: 10,
      daysBefore: 3,
      daysAfter: 3,
      label: "Birthday promo",
    },
    occasion: { ...discounts.occasion },
    friendsAndFamily: { ...discounts.friendsAndFamily },
  }
}

function read(): PromoSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<PromoSettings>
    const base = defaults()
    return {
      ...base,
      ...parsed,
      version: 1,
      masters: { ...base.masters, ...parsed.masters },
      loyaltyRedeem: { ...base.loyaltyRedeem, ...parsed.loyaltyRedeem },
      birthday: { ...base.birthday, ...parsed.birthday },
      occasion: { ...base.occasion, ...parsed.occasion },
      friendsAndFamily: {
        ...base.friendsAndFamily,
        ...parsed.friendsAndFamily,
      },
    }
  } catch {
    return defaults()
  }
}

function write(settings: PromoSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getPromoSettings(): PromoSettings {
  return read()
}

export function savePromoSettings(
  patch: Partial<PromoSettings>
): PromoSettings {
  const cur = read()
  const clean: PromoSettings = {
    version: 1,
    masters: { ...cur.masters, ...patch.masters },
    loyaltyRedeem: { ...cur.loyaltyRedeem, ...patch.loyaltyRedeem },
    earnPaisaPerPoint: patch.earnPaisaPerPoint ?? cur.earnPaisaPerPoint,
    punchesRequired: patch.punchesRequired ?? cur.punchesRequired,
    percentReward: patch.percentReward ?? cur.percentReward,
    percentRewardLabel:
      patch.percentRewardLabel ?? cur.percentRewardLabel,
    birthday: { ...cur.birthday, ...patch.birthday },
    occasion: { ...cur.occasion, ...patch.occasion },
    friendsAndFamily: {
      ...cur.friendsAndFamily,
      ...patch.friendsAndFamily,
    },
  }
  write(clean)
  return clean
}

/** Paisa off per redeemed point from mapping (1000 pts = ₹10 → 1 paisa/pt). */
export function redeemPaisaPerPointFromMapping(
  mapping: LoyaltyRedeemMapping = getPromoSettings().loyaltyRedeem
): number {
  const pts = Math.max(1, Math.round(mapping.points || 1000))
  const rupees = Math.max(0, Number(mapping.rupees) || 0)
  return Math.max(1, Math.round((rupees * 100) / pts))
}

export function isBirthdayInWindow(
  birthday: string | null | undefined,
  at = new Date(),
  settings = getPromoSettings().birthday
): boolean {
  if (!settings.active || !birthday) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday.trim())
  if (!m) return false
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const year = at.getFullYear()
  const bday = new Date(year, month, day)
  const start = new Date(year, month, day)
  start.setDate(start.getDate() - Math.max(0, settings.daysBefore))
  const end = new Date(year, month, day)
  end.setDate(end.getDate() + Math.max(0, settings.daysAfter))
  const cur = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  // Handle year wrap roughly: also check previous/next year window
  if (cur >= start && cur <= end) return true
  const bdayPrev = new Date(bday)
  bdayPrev.setFullYear(year - 1)
  const startPrev = new Date(bdayPrev)
  startPrev.setDate(startPrev.getDate() - Math.max(0, settings.daysBefore))
  const endPrev = new Date(bdayPrev)
  endPrev.setDate(endPrev.getDate() + Math.max(0, settings.daysAfter))
  if (cur >= startPrev && cur <= endPrev) return true
  const bdayNext = new Date(bday)
  bdayNext.setFullYear(year + 1)
  const startNext = new Date(bdayNext)
  startNext.setDate(startNext.getDate() - Math.max(0, settings.daysBefore))
  const endNext = new Date(bdayNext)
  endNext.setDate(endNext.getDate() + Math.max(0, settings.daysAfter))
  return cur >= startNext && cur <= endNext
}

export const PROMO_SETTINGS_STORAGE_KEY = STORAGE_KEY
