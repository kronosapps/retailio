import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
}))

vi.mock("@/events/EventPublisher", () => ({
  EventPublisher: {
    publish: vi.fn(async () => undefined),
  },
}))

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  }
}

describe("PricingService", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("applies promotion then freezes a line snapshot", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const today = new Date().toISOString().slice(0, 10)

    await PricingService.savePromotion({
      name: "Snack 10%",
      discountType: "PERCENT",
      discountValue: 10,
      startsOn: today,
      endsOn: today,
      skuScope: ["SNACK-1"],
    })

    const result = PricingService.priceOrder({
      lines: [
        {
          itemId: "SNACK-1",
          sku: "SNACK-1",
          name: "Snack",
          weight: "100g",
          qty: 1,
          listUnitPaisa: 5000,
        },
      ],
      applyOccasion: false,
      friendsFamilyPercent: 0,
      redeemLoyaltyPercent: false,
    })

    expect(result.totals.grossSubtotal).toBe(5000)
    expect(result.totals.promotionalDiscount).toBe(500)
    expect(result.lines[0].unitPricePaisa).toBe(5000)
    expect(result.lines[0].lineTotalPaisa).toBe(4500)
    expect(result.lines[0].priceSnapshot.promoUnitPaisa).toBe(4500)
    expect(result.lines[0].priceSnapshot.explanation).toContain("Snack 10%")
    expect(result.lines[0].priceSnapshot.appliedRules.some((r) => r.type === "PROMOTION")).toBe(
      true
    )
  })

  it("applies coupon after promo and retains coupon on totals", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const today = new Date().toISOString().slice(0, 10)

    await PricingService.saveCoupon({
      code: "SAVE10",
      discountType: "PERCENT",
      discountValue: 10,
      startsOn: today,
      endsOn: today,
      minSubtotalRupees: 0,
    })

    const result = PricingService.priceOrder({
      lines: [
        {
          itemId: "A",
          sku: "A",
          name: "Item A",
          qty: 1,
          listUnitPaisa: 10000,
        },
      ],
      couponCode: "SAVE10",
    })

    expect(result.totals.couponCode).toBe("SAVE10")
    expect(result.totals.couponDiscount).toBe(1000)
    expect(result.totals.total).toBe(9000)
    expect(
      result.lines[0].priceSnapshot.appliedRules.some((r) => r.type === "COUPON")
    ).toBe(true)
  })

  it("records catalog price history", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const row = await PricingService.recordPriceChange({
      sku: "SKU-9",
      productName: "Widget",
      oldSellingPricePaisa: 5000,
      newSellingPricePaisa: 4500,
    })
    expect(row?.oldSellingPricePaisa).toBe(5000)
    expect(PricingService.listPriceHistory("SKU-9")).toHaveLength(1)
  })

  it("festival and loyalty are independent and may stack", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const { savePromoSettings } = await import("@/data/promoSettings")
    const today = new Date().toISOString().slice(0, 10)
    savePromoSettings({
      occasion: {
        id: "fest",
        name: "Festival",
        percent: 10,
        active: true,
        startsOn: today,
        endsOn: today,
      },
      masters: {
        punchPercentEnabled: true,
        pointsRedeemEnabled: true,
        freeItemPromoEnabled: false,
        orderPromotionsEnabled: true,
      },
      freeItemVisitPromo: { enabled: false, visitsRequired: 10, financialYearStartMonth: 4 },
    })

    const line = {
      itemId: "A",
      sku: "A",
      name: "Item A",
      qty: 1,
      listUnitPaisa: 10000,
    }

    const loyaltyOnly = PricingService.priceOrder({
      lines: [line],
      applyOccasion: false,
      redeemLoyaltyPercent: true,
    })
    expect(loyaltyOnly.totals.occasionDiscount).toBe(0)
    expect(loyaltyOnly.totals.loyaltyDiscount).toBeGreaterThan(0)

    const both = PricingService.priceOrder({
      lines: [line],
      applyOccasion: true,
      redeemLoyaltyPercent: true,
    })
    expect(both.totals.occasionDiscount).toBeGreaterThan(0)
    expect(both.totals.loyaltyDiscount).toBeGreaterThan(0)
  })

  it("F&F XOR coupon; F&F stacks with festival and blocks loyalty", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const { savePromoSettings } = await import("@/data/promoSettings")
    const today = new Date().toISOString().slice(0, 10)
    savePromoSettings({
      occasion: {
        id: "fest",
        name: "Festival",
        percent: 10,
        active: true,
        startsOn: today,
        endsOn: today,
      },
      masters: {
        punchPercentEnabled: true,
        orderPromotionsEnabled: true,
      },
    })

    await PricingService.saveCoupon({
      code: "SAVE10",
      discountType: "PERCENT",
      discountValue: 10,
      startsOn: today,
      endsOn: today,
      minSubtotalRupees: 0,
    })

    const line = {
      itemId: "A",
      sku: "A",
      name: "Item A",
      qty: 1,
      listUnitPaisa: 10000,
    }

    const both = PricingService.priceOrder({
      lines: [line],
      applyOccasion: true,
      friendsFamilyPercent: 20,
      couponCode: "SAVE10",
      redeemLoyaltyPercent: true,
    })
    // Prefer F&F over coupon
    expect(both.totals.friendsFamilyPercent).toBe(20)
    expect(both.totals.friendsFamilyDiscount).toBeGreaterThan(0)
    expect(both.totals.couponDiscount).toBe(0)
    expect(both.totals.occasionDiscount).toBeGreaterThan(0)
    expect(both.totals.loyaltyDiscount).toBe(0)

    const couponOnly = PricingService.priceOrder({
      lines: [line],
      applyOccasion: true,
      friendsFamilyPercent: 0,
      couponCode: "SAVE10",
      redeemLoyaltyPercent: true,
      pointsToRedeem: 500,
      availablePoints: 2000,
    })
    expect(couponOnly.totals.couponDiscount).toBeGreaterThan(0)
    expect(couponOnly.totals.occasionDiscount).toBeGreaterThan(0)
    expect(couponOnly.totals.loyaltyDiscount).toBe(0)
    expect(couponOnly.totals.pointsDiscount).toBe(0)
  })

  it("applies only one loyalty offer: free item beats punch% and points", async () => {
    const { PricingService } = await import("@/modules/pricing/PricingService")
    const { savePromoSettings } = await import("@/data/promoSettings")
    const today = new Date().toISOString().slice(0, 10)
    savePromoSettings({
      occasion: {
        id: "fest",
        name: "Festival",
        percent: 10,
        active: true,
        startsOn: today,
        endsOn: today,
      },
      masters: {
        punchPercentEnabled: true,
        pointsRedeemEnabled: true,
        freeItemPromoEnabled: true,
        orderPromotionsEnabled: true,
      },
      freeItemVisitPromo: {
        enabled: true,
        visitsRequired: 10,
        financialYearStartMonth: 4,
      },
    })

    const result = PricingService.priceOrder({
      lines: [
        {
          itemId: "A",
          sku: "A",
          name: "Item A",
          qty: 1,
          listUnitPaisa: 10000,
        },
        {
          itemId: "REWARD",
          sku: "REWARD",
          name: "Free tea",
          qty: 1,
          listUnitPaisa: 2000,
          isLoyaltyReward: true,
        },
      ],
      applyOccasion: true,
      redeemLoyaltyPercent: true,
      pointsToRedeem: 1000,
      availablePoints: 5000,
    })

    expect(result.lines.find((l) => l.isLoyaltyReward)?.lineTotalPaisa).toBe(0)
    expect(result.totals.loyaltyDiscount).toBe(0)
    expect(result.totals.pointsDiscount).toBe(0)
  })
})
