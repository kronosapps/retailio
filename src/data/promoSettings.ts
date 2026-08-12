/**
 * Runtime Promotions Management settings (overrides JSON defaults).
 * Stored offline-first in localStorage.
 */

import discountDefaults from "./discounts.json"
import loyaltyDefaults from "./loyalty.json"
import { getLocalProduct } from "./products"

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
 * Festival (occasion) and loyalty discounts are independent and may stack.
 * F&F XOR Coupon; either may stack with festival.
 * On a ticket: points XOR punch% XOR free-item (one loyalty discount).
 * Registered (points) members never get punch stamps; punch-card guests never earn points.
 */
export type PromoMasterSwitches = {
  /** Product / SKU line promotions. */
  productPromotionsEnabled: boolean
  /** Order campaigns: coupons, occasion, birthday (additional discounts OK). */
  orderPromotionsEnabled: boolean
  /** Physical / digital punch card for non-registered guests. */
  punchCardEnabled: boolean
  /** Points redemption at POS (registered members). */
  pointsRedeemEnabled: boolean
  /** Punch-card % reward at POS (non-registered / punch path). */
  punchPercentEnabled: boolean
  /** Free-item visit promo (registered; see freeItemVisitPromo). */
  freeItemPromoEnabled: boolean
}

/** Free item after N store visits in the financial year (resets each FY). */
export type FreeItemVisitPromoSettings = {
  /** Off by default — enable in Promotions Management. */
  enabled: boolean
  /** Visits required in the current FY (default 10). */
  visitsRequired: number
  /** FY start month 1–12 (India default 4 = April). */
  financialYearStartMonth: number
}

/** When a paid sale qualifies for a digital punch stamp. */
export type PunchRules = {
  /** Minimum payable / bill in paisa (0 = no min). */
  minBillPaisa: number
  /** Empty = ignore SKU list. Otherwise these SKUs count (OR with category). */
  skuScope: string[]
  /**
   * Category substrings (case-insensitive), e.g. "Halwa" matches
   * "Madugula Halwa". Empty = ignore category filter.
   */
  categoryScope: string[]
  /**
   * Minimum pack size in grams (unitSize). 0 = no size filter.
   * Default 500 → 500g / 1kg packs only.
   */
  minUnitGrams: number
  /** Min qty of qualifying products (default 1). */
  minQty: number
}

/** New-customer POS onboarding welcome points. */
export type WelcomePromoSettings = {
  enabled: boolean
  /** Total promo points granted on register (default 1000). */
  grantPoints: number
  /** Max promo points redeemable per visit during the promo window. */
  redeemPerVisit: number
  /** Promo window length in paid visits (default 2). */
  visitLimit: number
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
  welcomePromo: WelcomePromoSettings
  freeItemVisitPromo: FreeItemVisitPromoSettings
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
      /** Visit-based free item — off until enabled in Promotions. */
      freeItemPromoEnabled: false,
    },
    loyaltyRedeem: {
      points: 1000,
      rupees: 10,
      step: 500,
    },
    punchRules: {
      minBillPaisa: 0,
      skuScope: [],
      /** Default: Halwa category packs 500g and above. */
      categoryScope: ["Halwa"],
      minUnitGrams: 500,
      minQty: 1,
    },
    welcomePromo: {
      enabled: true,
      grantPoints: 1000,
      redeemPerVisit: 500,
      visitLimit: 2,
    },
    freeItemVisitPromo: {
      enabled: false,
      visitsRequired: 10,
      financialYearStartMonth: 4,
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
      punchRules: {
        ...base.punchRules,
        ...parsed.punchRules,
        skuScope: Array.isArray(parsed.punchRules?.skuScope)
          ? parsed.punchRules!.skuScope
          : base.punchRules.skuScope,
        categoryScope: Array.isArray(parsed.punchRules?.categoryScope)
          ? parsed.punchRules!.categoryScope
          : base.punchRules.categoryScope,
        minUnitGrams: Number.isFinite(parsed.punchRules?.minUnitGrams)
          ? Math.max(0, Math.floor(parsed.punchRules!.minUnitGrams || 0))
          : base.punchRules.minUnitGrams,
        minQty: Number.isFinite(parsed.punchRules?.minQty)
          ? Math.max(1, Math.floor(parsed.punchRules!.minQty || 1))
          : base.punchRules.minQty,
      },
      welcomePromo: {
        ...base.welcomePromo,
        ...parsed.welcomePromo,
      },
      freeItemVisitPromo: {
        ...base.freeItemVisitPromo,
        ...parsed.freeItemVisitPromo,
      },
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
    punchRules: {
      ...cur.punchRules,
      ...patch.punchRules,
      skuScope: patch.punchRules?.skuScope ?? cur.punchRules.skuScope,
      categoryScope:
        patch.punchRules?.categoryScope ?? cur.punchRules.categoryScope,
      minUnitGrams:
        patch.punchRules?.minUnitGrams ?? cur.punchRules.minUnitGrams,
      minQty: patch.punchRules?.minQty ?? cur.punchRules.minQty,
    },
    welcomePromo: { ...cur.welcomePromo, ...patch.welcomePromo },
    freeItemVisitPromo: {
      ...cur.freeItemVisitPromo,
      ...patch.freeItemVisitPromo,
    },
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
  category?: string | null
  /** Pack size in grams (catalog unitSize). */
  unitSize?: number | null
}

function resolvePunchLineMeta(line: PunchLineInput): {
  key: string
  category: string
  unitSize: number
} {
  const key = (line.sku || line.itemId || "").trim().toUpperCase()
  let category = (line.category || "").trim()
  let unitSize =
    typeof line.unitSize === "number" && Number.isFinite(line.unitSize)
      ? line.unitSize
      : 0
  if (!category || unitSize <= 0) {
    const product = getLocalProduct(key) || getLocalProduct(line.itemId)
    if (product) {
      if (!category) category = product.category || ""
      if (unitSize <= 0) unitSize = product.unitSize || 0
    }
  }
  return { key, category, unitSize }
}

function lineMatchesPunchScope(
  line: PunchLineInput,
  rules: PunchRules
): boolean {
  const { key, category, unitSize } = resolvePunchLineMeta(line)
  const minGrams = Math.max(0, Math.floor(rules.minUnitGrams || 0))
  if (minGrams > 0 && unitSize < minGrams) return false

  const skuScope = (rules.skuScope || [])
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  const catScope = (rules.categoryScope || [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  if (skuScope.length === 0 && catScope.length === 0) {
    return true
  }

  const skuOk = skuScope.length > 0 && skuScope.includes(key)
  const catOk =
    catScope.length > 0 &&
    catScope.some((c) => category.toLowerCase().includes(c))

  if (skuScope.length > 0 && catScope.length > 0) return skuOk || catOk
  if (skuScope.length > 0) return skuOk
  return catOk
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
  const minQty = Math.max(1, Math.floor(rules.minQty || 1))

  // No line detail (legacy callers): stamp on spend if min bill met.
  if (!input.lines || input.lines.length === 0) {
    return spend > 0
  }

  const qualifyingQty = lines
    .filter((l) => lineMatchesPunchScope(l, rules))
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

/**
 * Indian-style FY key from a date (default starts April).
 * Example: 15 May 2026 → "2026-27"; 10 Mar 2026 → "2025-26".
 */
export function getFinancialYearKey(
  at = new Date(),
  startMonth = getPromoSettings().freeItemVisitPromo.financialYearStartMonth
): string {
  const month = Math.min(12, Math.max(1, Math.floor(startMonth || 4)))
  const y = at.getFullYear()
  const m = at.getMonth() + 1
  const startYear = m >= month ? y : y - 1
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0")
  return `${startYear}-${endYearShort}`
}

/** Whether free-item visit promo is available for this member. */
export function isFreeItemVisitEligible(
  customer: {
    pointsMember?: boolean
    fyVisitCount?: number
    fyKey?: string | null
  },
  settings = getPromoSettings()
): boolean {
  const on =
    settings.freeItemVisitPromo.enabled ||
    settings.masters.freeItemPromoEnabled
  if (!on) return false
  if (!customer.pointsMember) return false
  const required = Math.max(
    1,
    Math.floor(settings.freeItemVisitPromo.visitsRequired || 10)
  )
  const fyKey = getFinancialYearKey(
    new Date(),
    settings.freeItemVisitPromo.financialYearStartMonth
  )
  const visits =
    customer.fyKey === fyKey
      ? Math.max(0, Math.floor(customer.fyVisitCount || 0))
      : 0
  return visits >= required
}

export const PROMO_SETTINGS_STORAGE_KEY = STORAGE_KEY
