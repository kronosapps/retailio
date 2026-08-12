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

describe("Sales returns & exchanges", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("posts partial return with refund and restocks", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { InvoiceService } = await import("@/modules/invoice/InvoiceService")
    const { invoiceRepository } = await import(
      "@/repositories/InvoiceRepository"
    )
    const { SalesReturnService } = await import(
      "@/modules/salesReturn/SalesReturnService"
    )
    const { rupeesToPaisa } = await import("@/lib/money")
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    await ProductService.create({
      name: "Barfi",
      sku: "SR-SKU-1",
      category: "Sweets",
      sellingPrice: 100,
      costPrice: 40,
      storeId: "s1",
      actorId: "t",
    })
    await InventoryService.addOpeningStock({
      sku: "SR-SKU-1",
      quantity: 10,
      storeId: "s1",
      actorId: "t",
    })

    const sale = await InvoiceService.create({
      cashierId: "t",
      cashierName: "Tester",
      storeId: "s1",
      customerName: "Walk-in",
      lines: [
        {
          itemId: "SR-SKU-1",
          sku: "SR-SKU-1",
          name: "Barfi",
          weight: "1",
          qty: 5,
          unitPricePaisa: rupeesToPaisa(100),
          lineTotalPaisa: rupeesToPaisa(500),
        },
      ],
      totals: {
        grossSubtotal: rupeesToPaisa(500),
        friendsFamilyDiscount: 0,
        friendsFamilyPercent: 0,
        occasionDiscount: 0,
        occasionPercent: 0,
        occasionName: null,
        loyaltyDiscount: 0,
        loyaltyLabel: null,
        taxableAmount: rupeesToPaisa(500),
        gstAmount: 0,
        gstPercent: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        cgstPercent: 0,
        sgstPercent: 0,
        total: rupeesToPaisa(500),
      },
      loyalty: { mode: "off", freeItemId: null, freeItemName: null },
    })
    await invoiceRepository.updatePaymentFields(sale.invoiceId, {
      paymentStatus: "Paid",
      paymentMethod: "Cash",
    })
    await InventoryService.deductForSale(
      { ...sale, paymentStatus: "Paid" },
      "t",
      "Tester"
    )
    expect(InventoryService.getCurrentStock("SR-SKU-1")).toBe(5)

    const posted = await SalesReturnService.create({
      invoiceId: sale.invoiceId,
      settlement: "REFUND",
      lines: [{ itemId: "SR-SKU-1", sku: "SR-SKU-1", quantity: 2 }],
      reason: "Partial return",
      refundMethod: "Cash",
      actorId: "t",
      storeId: "s1",
    })

    expect(posted.status).toBe("POSTED")
    expect(posted.totalPaisa).toBe(rupeesToPaisa(200))
    expect(posted.refundId).toBeTruthy()
    expect(InventoryService.getCurrentStock("SR-SKU-1")).toBe(7)

    const updated = await invoiceRepository.getById(sale.invoiceId)
    expect(updated?.paymentStatus).toBe("PartiallyRefunded")

    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SALE_RETURN_POSTED,
      expect.objectContaining({ id: posted.id, settlement: "REFUND" }),
      "s1"
    )
  })

  it("issues credit note and bumps customer store credit", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { CustomerService } = await import("@/modules/customer/CustomerService")
    const { InvoiceService } = await import("@/modules/invoice/InvoiceService")
    const { invoiceRepository } = await import(
      "@/repositories/InvoiceRepository"
    )
    const { SalesReturnService } = await import(
      "@/modules/salesReturn/SalesReturnService"
    )
    const { creditNoteRepository } = await import(
      "@/repositories/CreditNoteRepository"
    )
    const { rupeesToPaisa } = await import("@/lib/money")

    await ProductService.create({
      name: "Ladoo",
      sku: "SR-SKU-2",
      category: "Sweets",
      sellingPrice: 50,
      storeId: "s1",
      actorId: "t",
    })
    const customer = await CustomerService.create(
      { name: "Priya", phone: "9999999999", storeId: "s1" },
      "t"
    )
    const sale = await InvoiceService.create({
      cashierId: "t",
      cashierName: "Tester",
      storeId: "s1",
      customerName: customer.name,
      customerId: customer.id,
      lines: [
        {
          itemId: "SR-SKU-2",
          sku: "SR-SKU-2",
          name: "Ladoo",
          weight: "1",
          qty: 2,
          unitPricePaisa: rupeesToPaisa(50),
          lineTotalPaisa: rupeesToPaisa(100),
        },
      ],
      totals: {
        grossSubtotal: rupeesToPaisa(100),
        friendsFamilyDiscount: 0,
        friendsFamilyPercent: 0,
        occasionDiscount: 0,
        occasionPercent: 0,
        occasionName: null,
        loyaltyDiscount: 0,
        loyaltyLabel: null,
        taxableAmount: rupeesToPaisa(100),
        gstAmount: 0,
        gstPercent: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        cgstPercent: 0,
        sgstPercent: 0,
        total: rupeesToPaisa(100),
      },
      loyalty: { mode: "off", freeItemId: null, freeItemName: null },
    })
    await invoiceRepository.updatePaymentFields(sale.invoiceId, {
      paymentStatus: "Paid",
      paymentMethod: "UPI",
    })

    const posted = await SalesReturnService.create({
      invoiceId: sale.invoiceId,
      settlement: "CREDIT_NOTE",
      lines: [{ itemId: "SR-SKU-2", sku: "SR-SKU-2", quantity: 2 }],
      reason: "Store credit",
      restock: false,
      actorId: "t",
    })
    expect(posted.creditNoteId).toBeTruthy()
    const note = creditNoteRepository.getById(posted.creditNoteId!)
    expect(note?.balancePaisa).toBe(rupeesToPaisa(100))
    expect(CustomerService.getById(customer.id)?.storeCreditPaisa).toBe(
      rupeesToPaisa(100)
    )
  })
})
