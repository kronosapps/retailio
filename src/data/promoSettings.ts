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

/**
 * Master switches.
 * Points / punch-% / free-item can each be enabled in settings.
 * On a single POS ticket only one loyalty discount applies (points XOR punch% XOR free item),
 * and only together with Festival; F&F/Coupon block loyalty redeem (earn still works).
 */
export type PromoMasterSwitches = {
  /** Product / SKU line promotions. */
  productPromotionsEnabled: boolean
  /** Order campaigns: coupons, occasion, birthday (additional discounts OK). */
  orderPromotionsEnabled: boolean
  /** Digital punch card stamping + punch progress on receipt. */
  punchCardEnabled: boolean
  /** Points redemption at POS. */
  pointsRedeemEnabled: boolean
  /** Punch-card % reward at POS. */
  punchPercentEnabled: boolean
  /** Free-item punch reward at POS. */
  freeItemPromoEnabled: boolean
}

/** When a paid sale qualifies for a digital punch stamp. */
export type PunchRules = {
  /** Minimum payable / bill in paisa (0 = no min). */
  minBillPaisa: number
  /** Empty = any product. Otherwise only these SKUs count toward punch qty. */
  skuScope: string[]
  /** Min qty of qualifying products (default 1). */
  minQty: number
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
  punchRules: PunchRules
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
      punchCardEnabled: true,
      pointsRedeemEnabled: true,
      punchPercentEnabled: true,
      freeItemPromoEnabled: true,
    },
    loyaltyRedeem: {
      points: 1000,
      rupees: 10,
      step: 500,
    },
    punchRules: {
      minBillPaisa: 0,
      skuScope: [],
      minQty: 1,
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
    const masters = { ...base.masters, ...parsed.masters }
    return {
      ...base,
      ...parsed,
      version: 1,
      masters,
      loyaltyRedeem: { ...base.loyaltyRedeem, ...parsed.loyaltyRedeem },
      punchRules: { ...base.punchRules, ...parsed.punchRules },
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
  const masters = { ...cur.masters, ...patch.masters }
  const clean: PromoSettings = {
    version: 1,
    masters,
    loyaltyRedeem: { ...cur.loyaltyRedeem, ...patch.loyaltyRedeem },
    punchRules: { ...cur.punchRules, ...patch.punchRules },
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

export type PunchLineInput = {
  itemId: string
  sku?: string | null
  qty: number
  isLoyaltyReward?: boolean
}

/** Whether this sale earns a digital punch (same counter as physical card). */
export function isSalePunchEligible(
  input: {
    purchasePaisa: number
    lines?: PunchLineInput[]
  },
  settings = getPromoSettings()
): boolean {
  if (!settings.masters.punchCardEnabled) return false
  const rules = settings.punchRules
  const spend = Math.max(0, Math.round(input.purchasePaisa || 0))
  if (spend < Math.max(0, rules.minBillPaisa || 0)) return false

  const lines = (input.lines || []).filter((l) => !l.isLoyaltyReward && l.qty > 0)
  const scope = (rules.skuScope || [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const minQty = Math.max(1, Math.floor(rules.minQty || 1))

  // No line detail (legacy callers): stamp on spend if min bill met.
  if (!input.lines || input.lines.length === 0) {
    return spend > 0
  }

  if (scope.length === 0) {
    const totalQty = lines.reduce((s, l) => s + l.qty, 0)
    return spend > 0 && totalQty >= minQty
  }

  const qualifyingQty = lines
    .filter((l) => {
      const key = (l.sku || l.itemId || "").trim().toUpperCase()
      return scope.includes(key)
    })
    .reduce((s, l) => s + l.qty, 0)
  return qualifyingQty >= minQty
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
