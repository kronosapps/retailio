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

describe("welcome promo + punch eligibility", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("onboards with 1000 promo pts; only 500 redeemable on first visit", async () => {
    const { CrmService } = await import("@/modules/crm/CrmService")
    const {
      getRedeemableLoyaltyPoints,
      isWelcomePromoLockActive,
    } = await import("@/data/loyalty")

    const customer = await CrmService.onboardAtPos({
      phone: "9876543210",
      name: "New Guest",
      email: "guest@example.com",
      birthday: "1990-05-01",
      storeId: "store-1",
    })

    expect(customer.loyaltyPoints).toBe(1000)
    expect(customer.welcomePromoGranted).toBe(true)
    expect(customer.welcomePromoPointsRemaining).toBe(1000)
    expect(customer.visitCount).toBe(0)
    expect(getRedeemableLoyaltyPoints(customer)).toBe(500)
    expect(isWelcomePromoLockActive(customer)).toBe(true)
  })

  it("locks earned points until 2 visits and promo are used", async () => {
    const { getRedeemableLoyaltyPoints } = await import("@/data/loyalty")

    // After visit 1 with 500 promo redeemed, wallet has earned + leftover promo
    const afterVisit1 = {
      loyaltyPoints: 1000 - 500 + 80, // redeemed 500 promo, earned 80
      visitCount: 1,
      welcomePromoGranted: true,
      welcomePromoPointsRemaining: 500,
    }
    expect(getRedeemableLoyaltyPoints(afterVisit1)).toBe(500)

    const afterVisit2PromoLeft = {
      loyaltyPoints: 580 - 500 + 90, // 170
      visitCount: 2,
      welcomePromoGranted: true,
      welcomePromoPointsRemaining: 0,
    }
    // Promo used + 2 visits → full wallet redeemable
    expect(getRedeemableLoyaltyPoints(afterVisit2PromoLeft)).toBe(170)

    const afterVisit2PromoLeftOver = {
      loyaltyPoints: 300,
      visitCount: 2,
      welcomePromoGranted: true,
      welcomePromoPointsRemaining: 200,
    }
    // Promo leftover still locks earned — only promo remaining
    expect(getRedeemableLoyaltyPoints(afterVisit2PromoLeftOver)).toBe(200)
  })

  it("records promo redemption against welcome balance", async () => {
    const { CrmService } = await import("@/modules/crm/CrmService")
    const customer = await CrmService.onboardAtPos({
      phone: "9123456780",
      name: "Promo Guest",
      email: "promo@example.com",
      birthday: "1992-01-15",
    })

    const result = await CrmService.recordPaidPurchase({
      customerId: customer.id,
      purchasePaisa: 10000,
      pointsRedeemed: 500,
      lines: [
        {
          itemId: "MH-BL-0500",
          sku: "MH-BL-0500",
          qty: 1,
          category: "Madugula Halwa",
          unitSize: 500,
        },
      ],
    })

    expect(result?.pointsRedeemed).toBe(500)
    expect(result?.customer.welcomePromoPointsRemaining).toBe(500)
    expect(result?.customer.loyaltyPoints).toBeGreaterThanOrEqual(500)
  })

  it("punches only Halwa 500g+ by default", async () => {
    const { isSalePunchEligible, savePromoSettings, getPromoSettings } =
      await import("@/data/promoSettings")

    // Ensure defaults
    const rules = getPromoSettings().punchRules
    expect(rules.categoryScope).toContain("Halwa")
    expect(rules.minUnitGrams).toBe(500)

    expect(
      isSalePunchEligible({
        purchasePaisa: 50000,
        lines: [
          {
            itemId: "MH-BL-0250",
            sku: "MH-BL-0250",
            qty: 2,
            category: "Madugula Halwa",
            unitSize: 250,
          },
        ],
      })
    ).toBe(false)

    expect(
      isSalePunchEligible({
        purchasePaisa: 50000,
        lines: [
          {
            itemId: "MH-BL-0500",
            sku: "MH-BL-0500",
            qty: 1,
            category: "Madugula Halwa",
            unitSize: 500,
          },
        ],
      })
    ).toBe(true)

    expect(
      isSalePunchEligible({
        purchasePaisa: 50000,
        lines: [
          {
            itemId: "LADDU-500",
            sku: "LADDU-500",
            qty: 1,
            category: "Laddu",
            unitSize: 500,
          },
        ],
      })
    ).toBe(false)

    savePromoSettings({
      punchRules: {
        ...getPromoSettings().punchRules,
        skuScope: ["LADDU-500"],
      },
    })
    expect(
      isSalePunchEligible({
        purchasePaisa: 50000,
        lines: [
          {
            itemId: "LADDU-500",
            sku: "LADDU-500",
            qty: 1,
            category: "Laddu",
            unitSize: 500,
          },
        ],
      })
    ).toBe(true)
  })
})
