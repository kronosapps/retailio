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

describe("CRM — customer profile & loyalty", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("builds a CRM profile with segments and purchase history", async () => {
    const { CustomerService } = await import("@/modules/customer/CustomerService")
    const { CrmService } = await import("@/modules/crm/CrmService")
    const { createInvoice } = await import("@/data/invoices")

    const customer = await CustomerService.create({
      name: "Ravi",
      phone: "9876543210",
      storeId: "store-1",
    })

    createInvoice({
      cashierId: "c1",
      cashierName: "Cashier",
      storeId: "store-1",
      customerName: "Ravi",
      customerId: customer.id,
      customerPhone: "9876543210",
      lines: [
        {
          itemId: "A",
          name: "Item",
          weight: "1",
          qty: 1,
          unitPricePaisa: 50000,
          lineTotalPaisa: 50000,
        },
      ],
      totals: {
        grossSubtotal: 50000,
        friendsFamilyDiscount: 0,
        friendsFamilyPercent: 0,
        occasionDiscount: 0,
        occasionPercent: 0,
        occasionName: null,
        loyaltyDiscount: 0,
        loyaltyLabel: null,
        taxableAmount: 47619,
        gstAmount: 2381,
        gstPercent: 5,
        cgstAmount: 1190,
        sgstAmount: 1191,
        cgstPercent: 2.5,
        sgstPercent: 2.5,
        total: 50000,
      },
      loyalty: { mode: "off", freeItemId: null, freeItemName: null },
    })

    await CustomerService.save({
      ...customer,
      totalSpendPaisa: 50000,
      visitCount: 1,
      lastPurchaseAt: new Date().toISOString(),
      loyaltyPoints: 500,
      loyaltyPunches: 1,
    })

    const profile = CrmService.getProfile(customer.id)
    expect(profile).not.toBeNull()
    expect(profile!.lifetimeSpendPaisa).toBe(50000)
    expect(profile!.visitCount).toBe(1)
    expect(profile!.purchases).toHaveLength(1)
    expect(profile!.segments.some((s) => s.id === "new")).toBe(true)
  })

  it("applies store credit FIFO and stamps loyalty on paid purchase", async () => {
    const { CustomerService } = await import("@/modules/customer/CustomerService")
    const { CrmService } = await import("@/modules/crm/CrmService")
    const { creditNoteRepository } = await import(
      "@/repositories/CreditNoteRepository"
    )

    const customer = await CustomerService.create({
      name: "Meera",
      phone: "9123456780",
    })
    await CustomerService.save({
      ...customer,
      storeCreditPaisa: 20000,
    })

    await creditNoteRepository.issue({
      customerId: customer.id,
      customerName: "Meera",
      amountPaisa: 20000,
    })

    const applied = await CrmService.applyStoreCredit({
      customerId: customer.id,
      amountPaisa: 5000,
      invoiceId: "INV-TEST",
    })
    expect(applied.appliedPaisa).toBe(5000)
    expect(applied.customer.storeCreditPaisa).toBe(15000)

    const after = await CrmService.recordPaidPurchase({
      customerId: customer.id,
      purchasePaisa: 10000,
      redeemedLoyalty: false,
    })
    expect(after?.loyaltyPunches).toBe(1)
    expect(after?.loyaltyPoints).toBe(100)

    const redeemed = await CrmService.recordPaidPurchase({
      customerId: customer.id,
      purchasePaisa: 10000,
      redeemedLoyalty: true,
    })
    expect(redeemed?.loyaltyPunches).toBe(0)
  })

  it("redeems points, bumps on-account AR, and settles", async () => {
    const { CustomerService } = await import("@/modules/customer/CustomerService")
    const { CrmService } = await import("@/modules/crm/CrmService")
    const { PricingService } = await import("@/modules/pricing/PricingService")

    const customer = await CustomerService.create({
      name: "Arun",
      phone: "9000000001",
    })
    await CustomerService.save({
      ...customer,
      loyaltyPoints: 500,
      totalSpendPaisa: 3_000_000,
      visitCount: 10,
    })

    const priced = PricingService.priceOrder({
      lines: [
        {
          itemId: "X",
          sku: "X",
          name: "Item",
          qty: 1,
          listUnitPaisa: 10000,
        },
      ],
      pointsToRedeem: 20,
      availablePoints: 500,
      customerSegments: ["vip", "regular"],
    })
    expect(priced.totals.pointsRedeemed).toBe(20)
    expect(priced.totals.pointsDiscount).toBe(2000)
    expect(priced.totals.total).toBe(8000)

    await CrmService.recordPaidPurchase({
      customerId: customer.id,
      purchasePaisa: 8000,
      pointsRedeemed: 20,
    })
    const afterPoints = CustomerService.getById(customer.id)!
    expect(afterPoints.loyaltyPoints).toBe(560)

    await CrmService.bumpOutstanding({
      customerId: customer.id,
      amountPaisa: 8000,
    })
    expect(CustomerService.getById(customer.id)!.outstandingPaisa).toBe(8000)

    await CrmService.settleOutstanding({
      customerId: customer.id,
      amountPaisa: 3000,
      method: "Cash",
    })
    expect(CustomerService.getById(customer.id)!.outstandingPaisa).toBe(5000)

    const today = new Date().toISOString().slice(0, 10)
    await PricingService.saveCoupon({
      code: "VIP10",
      discountType: "PERCENT",
      discountValue: 10,
      startsOn: today,
      endsOn: today,
      segmentScope: ["vip"],
    })
    const eligible = CrmService.listEligibleCoupons(customer.id)
    expect(eligible.some((c) => c.code === "VIP10")).toBe(true)
  })
})
