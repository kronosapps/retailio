import {
  calculateOrderTotals,
  clampDiscountPercent,
  discountConfig,
  getActiveOccasionDiscount,
  type OrderTotals,
} from "@/data/discounts"
import {
  getEffectiveLoyalty,
  maxRedeemablePoints,
  paisaFromPointsRedeemed,
} from "@/data/loyalty"
import {
  getPromoSettings,
  isBirthdayInWindow,
} from "@/data/promoSettings"
import { splitInclusiveGst, taxConfig } from "@/data/tax"
import { type Paisa, percentOfPaisa, roundPaisa, rupeesToPaisa } from "@/lib/money"
import { taxPricedLines } from "@/modules/gst/taxEngine"
import { productRepository } from "@/repositories/ProductRepository"
import {
  couponRepository,
  priceHistoryRepository,
  promotionRepository,
} from "@/repositories/PricingRepository"
import { createId } from "@/utils/id"

import type {
  AppliedPriceRule,
  CouponRecord,
  PriceHistoryRecord,
  PriceSnapshot,
  PromotionRecord,
} from "./types"
import { explainPriceSnapshot } from "./types"

export class PricingError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INACTIVE"

  constructor(code: PricingError["code"], message: string) {
    super(message)
    this.name = "PricingError"
    this.code = code
  }
}

export type PriceCartLineInput = {
  itemId: string
  sku?: string | null
  name: string
  weight?: string
  qty: number
  /** Catalog list unit (paisa). */
  listUnitPaisa: Paisa
  category?: string | null
  isLoyaltyReward?: boolean
  /** Product GST % when known (else engine default). */
  gstRate?: number | null
  hsnCode?: string | null
  sacCode?: string | null
}

export type PricedCartLine = PriceCartLineInput & {
  /** Frozen list unit. */
  unitPricePaisa: Paisa
  /** Net line after all discounts. */
  lineTotalPaisa: Paisa
  priceSnapshot: PriceSnapshot
  taxSnapshot: import("@/modules/gst/types").LineTaxSnapshot
}

export type PriceOrderInput = {
  lines: PriceCartLineInput[]
  applyOccasion?: boolean
  friendsFamilyPercent?: number
  redeemLoyaltyPercent?: boolean
  couponCode?: string | null
  /** Points the cashier wants to redeem (capped by balance + payable). */
  pointsToRedeem?: number
  /** Available loyalty points on the attached customer. */
  availablePoints?: number
  /** CRM segment ids for coupon targeting (e.g. vip). */
  customerSegments?: string[]
  /** YYYY-MM-DD — enables birthday promo when configured. */
  customerBirthday?: string | null
  /** Customer GSTIN for B2B / place of supply. */
  customerGstin?: string | null
  customerStateCode?: string | null
  at?: Date
}

export type PriceOrderTotals = OrderTotals & {
  couponDiscount: Paisa
  couponCode: string | null
  /** List − promo subtotal (line promotions). */
  promotionalDiscount: Paisa
  pointsDiscount: Paisa
  pointsRedeemed: number
  igstAmount: Paisa
  igstPercent: number
}

export type PriceOrderResult = {
  lines: PricedCartLine[]
  totals: PriceOrderTotals
  coupon: CouponRecord | null
  tax: import("@/modules/gst/types").OrderTaxSummary
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function inWindow(today: string, startsOn: string, endsOn: string) {
  return today >= startsOn && today <= endsOn
}

/**
 * Pricing subsystem — resolve promotions/coupons + existing POS discounts,
 * and freeze a PriceSnapshot on every sale line.
 */
export class PricingService {
  static listPromotions(): PromotionRecord[] {
    return promotionRepository.list()
  }

  static listCoupons(): CouponRecord[] {
    return couponRepository.list()
  }

  static listPriceHistory(sku?: string): PriceHistoryRecord[] {
    return priceHistoryRepository.list(sku)
  }

  static hydrate() {
    return Promise.all([
      promotionRepository.hydrate(),
      couponRepository.hydrate(),
      priceHistoryRepository.hydrate(),
    ])
  }

  static async savePromotion(
    input: {
      id?: string
      name: string
      active?: boolean
      discountType: "PERCENT" | "FIXED"
      /** Percent points or rupees off unit. */
      discountValue: number
      startsOn: string
      endsOn: string
      skuScope?: string[]
      categoryScope?: string[]
      priority?: number
      notes?: string | null
      storeId?: string | null
      actorId?: string | null
    }
  ): Promise<PromotionRecord> {
    if (!input.name.trim()) {
      throw new PricingError("VALIDATION", "Promotion name is required.")
    }
    if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
      throw new PricingError("VALIDATION", "Discount value must be positive.")
    }
    const isNew = !input.id
    const now = new Date().toISOString()
    const record: PromotionRecord = {
      id: input.id || createId("promo"),
      name: input.name.trim(),
      active: input.active !== false,
      discountType: input.discountType,
      discountValue:
        input.discountType === "FIXED"
          ? rupeesToPaisa(input.discountValue)
          : input.discountValue,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      skuScope: input.skuScope || [],
      categoryScope: input.categoryScope || [],
      priority: input.priority ?? 100,
      notes: input.notes ?? null,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
    }
    if (!isNew) {
      const existing = promotionRepository.getById(input.id!)
      if (existing) record.createdAt = existing.createdAt
    }
    return promotionRepository.save(record, isNew)
  }

  static async saveCoupon(input: {
    id?: string
    code: string
    name?: string
    active?: boolean
    discountType: "PERCENT" | "FIXED"
    discountValue: number
    startsOn: string
    endsOn: string
    minSubtotalRupees?: number
    maxRedemptions?: number | null
    segmentScope?: string[]
    notes?: string | null
    storeId?: string | null
    actorId?: string | null
  }): Promise<CouponRecord> {
    const code = input.code.trim().toUpperCase()
    if (!code) throw new PricingError("VALIDATION", "Coupon code is required.")
    if (!Number.isFinite(input.discountValue) || input.discountValue <= 0) {
      throw new PricingError("VALIDATION", "Discount value must be positive.")
    }
    const clash = couponRepository.getByCode(code)
    if (clash && clash.id !== input.id) {
      throw new PricingError("VALIDATION", "Coupon code already exists.")
    }
    const isNew = !input.id
    const now = new Date().toISOString()
    const record: CouponRecord = {
      id: input.id || createId("cpn"),
      code,
      name: (input.name || code).trim(),
      active: input.active !== false,
      discountType: input.discountType,
      discountValue:
        input.discountType === "FIXED"
          ? rupeesToPaisa(input.discountValue)
          : input.discountValue,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      minSubtotalPaisa: rupeesToPaisa(input.minSubtotalRupees || 0),
      maxRedemptions: input.maxRedemptions ?? null,
      redemptionCount: isNew
        ? 0
        : couponRepository.getById(input.id!)?.redemptionCount || 0,
      notes: input.notes ?? null,
      segmentScope: (input.segmentScope || [])
        .map((s) => s.trim())
        .filter(Boolean),
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
    }
    if (!isNew) {
      const existing = couponRepository.getById(input.id!)
      if (existing) record.createdAt = existing.createdAt
    }
    return couponRepository.save(record, isNew)
  }

  static async recordPriceChange(input: {
    sku: string
    productName: string
    oldSellingPricePaisa: Paisa
    newSellingPricePaisa: Paisa
    actorId?: string | null
    storeId?: string | null
  }) {
    if (input.oldSellingPricePaisa === input.newSellingPricePaisa) return null
    return priceHistoryRepository.append({
      sku: input.sku.trim().toUpperCase(),
      productName: input.productName,
      oldSellingPricePaisa: input.oldSellingPricePaisa,
      newSellingPricePaisa: input.newSellingPricePaisa,
      changedAt: new Date().toISOString(),
      changedBy: input.actorId ?? null,
      storeId: input.storeId ?? null,
    })
  }

  /** Best matching active promotion for a SKU/category. */
  static findPromotionForProduct(
    sku: string,
    category: string | null | undefined,
    at = new Date()
  ): PromotionRecord | null {
    if (!getPromoSettings().masters.productPromotionsEnabled) return null
    const today = dateKey(at)
    const key = sku.trim().toUpperCase()
    const cat = category?.trim() || ""
    const candidates = promotionRepository.list().filter((p) => {
      if (!p.active) return false
      if (!inWindow(today, p.startsOn, p.endsOn)) return false
      if (p.skuScope.length && !p.skuScope.includes(key)) return false
      if (p.categoryScope.length && !p.categoryScope.includes(cat)) return false
      return true
    })
    return candidates[0] ?? null
  }

  static applyPromotionToUnit(
    listUnitPaisa: Paisa,
    promo: PromotionRecord | null
  ): { unitPaisa: Paisa; rule: AppliedPriceRule | null } {
    if (!promo || listUnitPaisa <= 0) {
      return { unitPaisa: listUnitPaisa, rule: null }
    }
    let off = 0
    if (promo.discountType === "PERCENT") {
      off = percentOfPaisa(listUnitPaisa, promo.discountValue)
    } else {
      off = Math.min(listUnitPaisa, Math.max(0, Math.round(promo.discountValue)))
    }
    if (off <= 0) return { unitPaisa: listUnitPaisa, rule: null }
    return {
      unitPaisa: Math.max(0, listUnitPaisa - off),
      rule: {
        type: "PROMOTION",
        id: promo.id,
        label: promo.name,
        amountPaisa: off,
      },
    }
  }

  /**
   * Full cart pricing with RetailOS discount stacking rules:
   * - Festival and loyalty are independent (may stack together)
   * - F&F XOR Coupon; either may stack with festival
   * - Loyalty discount = points XOR punch% XOR free-item (one only)
   * - Loyalty blocked when F&F or Coupon is on
   */
  static priceOrder(input: PriceOrderInput): PriceOrderResult {
    const at = input.at || new Date()
    const settings = getPromoSettings()
    const orderPromosOn = settings.masters.orderPromotionsEnabled
    const occasion = orderPromosOn ? getActiveOccasionDiscount(at) : null

    let fnf = clampDiscountPercent(
      input.friendsFamilyPercent || 0,
      settings.friendsAndFamily.maxPercent ||
        discountConfig.friendsAndFamily.maxPercent
    )
    const couponRequested = Boolean(input.couponCode?.trim())
    // F&F XOR Coupon — prefer F&F when both somehow set
    const couponCodeEffective =
      fnf > 0 || !couponRequested
        ? null
        : input.couponCode?.trim() || null
    if (couponCodeEffective) {
      fnf = 0
    }
    const hasFnfOrCoupon = fnf > 0 || Boolean(couponCodeEffective)

    // Loyalty redeem independent of festival; blocked by F&F/Coupon
    const loyaltyDiscountAllowed = !hasFnfOrCoupon

    const freeItemOn =
      settings.freeItemVisitPromo.enabled ||
      settings.masters.freeItemPromoEnabled
    const wantsFreeItem =
      loyaltyDiscountAllowed &&
      freeItemOn &&
      input.lines.some((l) => l.isLoyaltyReward && l.qty > 0)
    const wantsPunchPercent =
      loyaltyDiscountAllowed &&
      !wantsFreeItem &&
      settings.masters.punchPercentEnabled &&
      Boolean(input.redeemLoyaltyPercent)
    const pointsToRedeem =
      loyaltyDiscountAllowed &&
      !wantsFreeItem &&
      !wantsPunchPercent &&
      settings.masters.pointsRedeemEnabled
        ? input.pointsToRedeem
        : 0
    const redeemLoyaltyPercent = wantsPunchPercent

    const birthdayOk =
      orderPromosOn &&
      isBirthdayInWindow(input.customerBirthday, at, settings.birthday)
    const birthdayPercent = birthdayOk ? settings.birthday.percent : 0
    const birthdayLabel = birthdayOk ? settings.birthday.label : null
    const loyaltyEff = getEffectiveLoyalty()

    // 1) Line-level promo
    const intermediate = input.lines.map((line) => {
      const isFreeReward =
        Boolean(line.isLoyaltyReward) && wantsFreeItem && freeItemOn
      if (isFreeReward || line.qty <= 0) {
        const snap: PriceSnapshot = {
          listUnitPaisa: 0,
          promoUnitPaisa: 0,
          listLinePaisa: 0,
          promoLinePaisa: 0,
          netLinePaisa: 0,
          explanation: isFreeReward
            ? "Loyalty reward (₹0)."
            : "Empty line.",
          appliedRules: isFreeReward
            ? [
                {
                  type: "LOYALTY",
                  id: "reward-item",
                  label: "Free loyalty item",
                  amountPaisa: 0,
                },
              ]
            : [],
        }
        return {
          ...line,
          listUnitPaisa: 0,
          promoUnitPaisa: 0,
          listLinePaisa: 0,
          promoLinePaisa: 0,
          promoRule: null as AppliedPriceRule | null,
          snapBase: snap,
        }
      }
      const sku = (line.sku || line.itemId).trim()
      const product = productRepository.getById(sku)
      const category = line.category || product?.category || null
      const listUnit = Math.max(0, Math.round(line.listUnitPaisa))
      const promo = this.findPromotionForProduct(sku, category, at)
      const { unitPaisa: promoUnit, rule } = this.applyPromotionToUnit(
        listUnit,
        promo
      )
      const listLine = roundPaisa(listUnit * line.qty)
      const promoLine = roundPaisa(promoUnit * line.qty)
      return {
        ...line,
        listUnitPaisa: listUnit,
        promoUnitPaisa: promoUnit,
        listLinePaisa: listLine,
        promoLinePaisa: promoLine,
        promoRule: rule,
        snapBase: null as PriceSnapshot | null,
      }
    })

    const promoSubtotal = roundPaisa(
      intermediate.reduce((s, l) => s + l.promoLinePaisa, 0)
    )

    // 2) Coupon on promo subtotal (optional segment targeting)
    let coupon: CouponRecord | null = null
    let couponDiscount = 0
    if (orderPromosOn && couponCodeEffective) {
      coupon = couponRepository.getByCode(couponCodeEffective)
      const today = dateKey(at)
      const customerSegs = new Set(input.customerSegments || [])
      const segmentOk =
        !coupon?.segmentScope?.length ||
        coupon.segmentScope.some((s) => customerSegs.has(s))
      if (
        coupon &&
        coupon.active &&
        inWindow(today, coupon.startsOn, coupon.endsOn) &&
        promoSubtotal >= coupon.minSubtotalPaisa &&
        segmentOk &&
        (coupon.maxRedemptions == null ||
          coupon.redemptionCount < coupon.maxRedemptions)
      ) {
        if (coupon.discountType === "PERCENT") {
          couponDiscount = percentOfPaisa(promoSubtotal, coupon.discountValue)
        } else {
          couponDiscount = Math.min(
            promoSubtotal,
            Math.max(0, Math.round(coupon.discountValue))
          )
        }
      } else {
        coupon = null
      }
    }

    const afterCoupon = Math.max(0, promoSubtotal - couponDiscount)

    // 3) Reuse existing order % stack on after-coupon base via synthetic lines
    // Build totals using promo unit prices, then layer coupon into friendsFamily-style reporting.
    const baseTotals = calculateOrderTotals(
      intermediate.map((l) => ({
        unitPricePaisa: l.qty > 0 ? roundPaisa(l.promoLinePaisa / l.qty) : 0,
        qty: l.qty,
      })),
      {
        applyOccasion: Boolean(input.applyOccasion),
        occasion,
        friendsFamilyPercent: fnf,
        redeemLoyalty: redeemLoyaltyPercent,
      }
    )

    // Adjust: recalculate when coupon and/or birthday layer on top of the stack.
    let totals: PriceOrderTotals
    if (couponDiscount > 0 || birthdayPercent > 0) {
      const friendsFamilyDiscount = percentOfPaisa(afterCoupon, fnf)
      const afterFriendsFamily = Math.max(0, afterCoupon - friendsFamilyDiscount)
      const occasionPercent =
        input.applyOccasion && occasion ? occasion.percent : 0
      const occasionDiscount =
        occasionPercent > 0
          ? percentOfPaisa(afterFriendsFamily, occasionPercent)
          : 0
      const afterOccasion = Math.max(0, afterFriendsFamily - occasionDiscount)
      const birthdayDiscount =
        birthdayPercent > 0
          ? percentOfPaisa(afterOccasion, birthdayPercent)
          : 0
      const afterBirthday = Math.max(0, afterOccasion - birthdayDiscount)
      let loyaltyDiscount = 0
      let loyaltyLabel: string | null = null
      if (redeemLoyaltyPercent) {
        loyaltyDiscount = percentOfPaisa(
          afterBirthday,
          loyaltyEff.percentReward.percent
        )
        loyaltyLabel = loyaltyEff.percentReward.label
      }
      const total = Math.max(0, afterBirthday - loyaltyDiscount)
      const gst = splitInclusiveGst(total, taxConfig.gst.percent)
      const occasionNameParts = [
        occasion?.name ?? null,
        birthdayDiscount > 0 ? birthdayLabel : null,
      ].filter(Boolean)
      totals = {
        grossSubtotal: promoSubtotal,
        friendsFamilyDiscount,
        friendsFamilyPercent: fnf,
        afterFriendsFamily,
        occasionDiscount: occasionDiscount + birthdayDiscount,
        occasionPercent: occasionPercent + birthdayPercent,
        occasionName: occasionNameParts.join(" + ") || null,
        loyaltyDiscount,
        loyaltyLabel,
        total,
        taxableAmount: gst.taxableAmount,
        gstAmount: gst.gstAmount,
        gstPercent: gst.gstPercent,
        gstLabel: taxConfig.gst.label,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        cgstPercent: gst.cgstPercent,
        sgstPercent: gst.sgstPercent,
        cgstLabel: taxConfig.gst.cgstLabel,
        sgstLabel: taxConfig.gst.sgstLabel,
        couponDiscount,
        couponCode: coupon?.code ?? null,
        promotionalDiscount: 0,
        pointsDiscount: 0,
        pointsRedeemed: 0,
        igstAmount: 0,
        igstPercent: 0,
      }
    } else {
      totals = {
        ...baseTotals,
        couponDiscount: 0,
        couponCode: null,
        promotionalDiscount: 0,
        pointsDiscount: 0,
        pointsRedeemed: 0,
        grossSubtotal: promoSubtotal || baseTotals.grossSubtotal,
        igstAmount: 0,
        igstPercent: 0,
      }
    }

    // Prefer list gross on the invoice for audit (promo shows in line snapshots).
    const listGross = roundPaisa(
      intermediate.reduce((s, l) => s + l.listLinePaisa, 0)
    )
    const promotionalDiscount = Math.max(0, listGross - promoSubtotal)
    totals = {
      ...totals,
      grossSubtotal: listGross || totals.grossSubtotal,
      promotionalDiscount,
    }

    // 3b) Loyalty points redeem (after punch %, before line allocation)
    const wantPoints = Math.max(0, Math.floor(pointsToRedeem || 0))
    const availablePoints = Math.max(0, Math.floor(input.availablePoints || 0))
    if (wantPoints > 0 && availablePoints > 0 && totals.total > 0) {
      const pointsRedeemed = maxRedeemablePoints(
        totals.total,
        Math.min(wantPoints, availablePoints)
      )
      const pointsDiscount = paisaFromPointsRedeemed(pointsRedeemed)
      if (pointsDiscount > 0) {
        const newTotal = Math.max(0, totals.total - pointsDiscount)
        const gst = splitInclusiveGst(newTotal, taxConfig.gst.percent)
        totals = {
          ...totals,
          total: newTotal,
          taxableAmount: gst.taxableAmount,
          gstAmount: gst.gstAmount,
          gstPercent: gst.gstPercent,
          cgstAmount: gst.cgstAmount,
          sgstAmount: gst.sgstAmount,
          cgstPercent: gst.cgstPercent,
          sgstPercent: gst.sgstPercent,
          pointsDiscount,
          pointsRedeemed,
        }
      }
    }

    // 4) Allocate net to lines proportionally by promoLine
    const netPayable = totals.total
    const allocBase = promoSubtotal > 0 ? promoSubtotal : 1
    let allocated = 0
    const pricedLines: PricedCartLine[] = intermediate.map((line, index) => {
      const isLast = index === intermediate.length - 1
      let netLine = 0
      if (line.isLoyaltyReward || line.promoLinePaisa <= 0) {
        netLine = 0
      } else if (isLast) {
        netLine = Math.max(0, netPayable - allocated)
      } else {
        netLine = roundPaisa((line.promoLinePaisa / allocBase) * netPayable)
        allocated += netLine
      }

      const rules: AppliedPriceRule[] = [
        {
          type: "BASE",
          id: null,
          label: "List price",
          amountPaisa: 0,
        },
      ]
      if (line.promoRule) {
        rules.push({
          ...line.promoRule,
          amountPaisa: line.promoRule.amountPaisa * line.qty,
        })
      }
      if (coupon && couponDiscount > 0 && line.promoLinePaisa > 0) {
        const share = roundPaisa(
          (line.promoLinePaisa / allocBase) * couponDiscount
        )
        if (share > 0) {
          rules.push({
            type: "COUPON",
            id: coupon.id,
            label: `Coupon ${coupon.code}`,
            amountPaisa: share,
          })
        }
      }
      if (fnf > 0 && line.promoLinePaisa > 0) {
        const share = roundPaisa(
          (line.promoLinePaisa / allocBase) * totals.friendsFamilyDiscount
        )
        if (share > 0) {
          rules.push({
            type: "FRIENDS_FAMILY",
            id: "fnf",
            label: `Friends & Family ${fnf}%`,
            amountPaisa: share,
          })
        }
      }
      if (totals.occasionDiscount > 0 && line.promoLinePaisa > 0) {
        const share = roundPaisa(
          (line.promoLinePaisa / allocBase) * totals.occasionDiscount
        )
        if (share > 0) {
          rules.push({
            type: "OCCASION",
            id: occasion?.id ?? "occasion",
            label: totals.occasionName || "Occasion",
            amountPaisa: share,
          })
        }
      }
      if (totals.loyaltyDiscount > 0 && line.promoLinePaisa > 0) {
        const share = roundPaisa(
          (line.promoLinePaisa / allocBase) * totals.loyaltyDiscount
        )
        if (share > 0) {
          rules.push({
            type: "LOYALTY",
            id: "loyalty-percent",
            label: totals.loyaltyLabel || "Loyalty",
            amountPaisa: share,
          })
        }
      }
      if (totals.pointsDiscount > 0 && line.promoLinePaisa > 0) {
        const share = roundPaisa(
          (line.promoLinePaisa / allocBase) * totals.pointsDiscount
        )
        if (share > 0) {
          rules.push({
            type: "POINTS",
            id: "loyalty-points",
            label: `Points (−${totals.pointsRedeemed})`,
            amountPaisa: share,
          })
        }
      }

      const snapshot: PriceSnapshot = {
        listUnitPaisa: line.listUnitPaisa,
        promoUnitPaisa: line.promoUnitPaisa,
        listLinePaisa: line.listLinePaisa,
        promoLinePaisa: line.promoLinePaisa,
        netLinePaisa: netLine,
        explanation: "",
        appliedRules: rules,
      }
      const discountParts = rules
        .filter((r) => r.type !== "BASE" && r.amountPaisa > 0)
        .map(
          (r) => `${r.label} (−₹${(r.amountPaisa / 100).toFixed(2)})`
        )
      snapshot.explanation =
        line.isLoyaltyReward
          ? "Loyalty reward (₹0)."
          : discountParts.length
            ? `List ₹${(line.listUnitPaisa / 100).toFixed(2)} × ${line.qty} → ${discountParts.join(" → ")} → net ₹${(netLine / 100).toFixed(2)}`
            : `List ₹${(line.listUnitPaisa / 100).toFixed(2)} × ${line.qty} (no discounts).`

      return {
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        weight: line.weight,
        qty: line.qty,
        listUnitPaisa: line.listUnitPaisa,
        category: line.category,
        isLoyaltyReward: line.isLoyaltyReward,
        gstRate: line.gstRate,
        hsnCode: line.hsnCode,
        sacCode: line.sacCode,
        unitPricePaisa: line.listUnitPaisa,
        lineTotalPaisa: netLine,
        priceSnapshot: snapshot,
        taxSnapshot: {
          hsnCode: null,
          sacCode: null,
          gstRate: 0,
          pricingMode: "INCLUSIVE",
          supplyType: "INTRA",
          taxablePaisa: 0,
          cgstPaisa: 0,
          sgstPaisa: 0,
          igstPaisa: 0,
          gstPaisa: 0,
          lineTotalPaisa: netLine,
        },
      }
    })

    // 5) Line-level GST (product rates / HSN) — inclusive retail default
    const taxLinesInput = pricedLines.map((line) => {
      const product = productRepository.getById(
        (line.sku || line.itemId || "").trim()
      )
      return {
        netLinePaisa: line.lineTotalPaisa,
        gstRate: line.gstRate ?? product?.gstRate ?? null,
        hsnCode: line.hsnCode ?? product?.hsnCode ?? null,
        sacCode: line.sacCode ?? null,
        isLoyaltyReward: line.isLoyaltyReward,
      }
    })
    const { lineTaxes, summary: taxSummary } = taxPricedLines(taxLinesInput, {
      customerGstin: input.customerGstin,
      customerStateCode: input.customerStateCode,
    })

    const pricedWithTax: PricedCartLine[] = pricedLines.map((line, i) => ({
      ...line,
      taxSnapshot: lineTaxes[i],
      // Exclusive mode: payable grows by tax; inclusive keeps net as charged.
      lineTotalPaisa:
        taxSummary.pricingMode === "EXCLUSIVE"
          ? lineTaxes[i].lineTotalPaisa
          : line.lineTotalPaisa,
    }))

    const primaryRate =
      taxSummary.ratesUsed.length === 1
        ? taxSummary.ratesUsed[0]
        : taxSummary.ratesUsed[0] ?? taxConfig.gst.percent

    const payableTotal =
      taxSummary.pricingMode === "EXCLUSIVE"
        ? taxSummary.totalPaisa
        : totals.total

    totals = {
      ...totals,
      total: payableTotal,
      taxableAmount: taxSummary.taxablePaisa,
      gstAmount: taxSummary.gstPaisa,
      gstPercent: primaryRate,
      cgstAmount: taxSummary.cgstPaisa,
      sgstAmount: taxSummary.sgstPaisa,
      cgstPercent: primaryRate / 2,
      sgstPercent: primaryRate / 2,
      igstAmount: taxSummary.igstPaisa,
      igstPercent:
        taxSummary.supplyType === "INTER" ? primaryRate : 0,
    }

    return {
      lines: pricedWithTax,
      totals,
      coupon,
      tax: taxSummary,
    }
  }

  static explainSaleLine(snapshot: PriceSnapshot | null | undefined): string {
    return explainPriceSnapshot(snapshot)
  }

  static async redeemCoupon(code: string) {
    const c = couponRepository.getByCode(code)
    if (!c) return null
    return couponRepository.recordRedemption(c.id)
  }
}
