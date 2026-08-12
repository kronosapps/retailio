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
})
