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

vi.mock("@/modules/inventory/InventoryService", () => ({
  InventoryService: {
    deductForSale: vi.fn(async () => 1),
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

describe("SaleTransactionService", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("advances happy path Checkout → Completed", async () => {
    const { SaleTransactionService } = await import(
      "@/modules/saleTransaction/SaleTransactionService"
    )

    const begun = await SaleTransactionService.begin({
      storeId: "s1",
      amountPaisa: 10000,
      customerName: "Walk-in",
    })
    expect(begun.status).toBe("CheckoutStarted")

    await SaleTransactionService.markInvoicePending(begun.id)
    await SaleTransactionService.attachInvoice(begun.id, "INV-1", 10000)
    let row = SaleTransactionService.getByInvoiceId("INV-1")
    expect(row?.status).toBe("InvoiceCreated")

    await SaleTransactionService.attachPayment("INV-1", "PAY-1")
    row = SaleTransactionService.getById(begun.id)
    expect(row?.status).toBe("PaymentPending")
    expect(row?.paymentId).toBe("PAY-1")

    await SaleTransactionService.confirmPayment("INV-1", "PAY-1")
    await SaleTransactionService.finalizeInvoice("INV-1")
    row = SaleTransactionService.getById(begun.id)
    expect(row?.status).toBe("InvoiceFinalized")

    await SaleTransactionService.finalizeStock("INV-1")
    row = SaleTransactionService.getById(begun.id)
    expect(row?.status).toBe("Completed")
    expect(SaleTransactionService.listIncomplete()).toHaveLength(0)
  })

  it("cancels unpaid before payment confirmed", async () => {
    const { SaleTransactionService } = await import(
      "@/modules/saleTransaction/SaleTransactionService"
    )
    const begun = await SaleTransactionService.begin({ storeId: "s1" })
    await SaleTransactionService.attachInvoice(begun.id, "INV-UNPAID", 500)

    const cancelled = await SaleTransactionService.cancel(
      "INV-UNPAID",
      "test cancel"
    )
    expect(cancelled?.status).toBe("Cancelled")
    expect(
      SaleTransactionService.listIncomplete().some((r) => r.id === begun.id)
    ).toBe(false)
  })

  it("blocks cancel after payment confirmed", async () => {
    const { SaleTransactionService } = await import(
      "@/modules/saleTransaction/SaleTransactionService"
    )
    const begun = await SaleTransactionService.begin({})
    await SaleTransactionService.attachInvoice(begun.id, "INV-PAID", 100)
    await SaleTransactionService.attachPayment("INV-PAID", "PAY-X")
    await SaleTransactionService.confirmPayment("INV-PAID")

    const result = await SaleTransactionService.cancel("INV-PAID")
    expect(result?.status).toBe("Failed")
    expect(result?.failureReason).toMatch(/Cannot cancel/)
  })

  it("retryStock requires Paid invoice", async () => {
    const { SaleTransactionService } = await import(
      "@/modules/saleTransaction/SaleTransactionService"
    )
    const begun = await SaleTransactionService.begin({})
    await SaleTransactionService.attachInvoice(begun.id, "INV-OPEN", 100)

    await expect(
      SaleTransactionService.retryStock("INV-OPEN")
    ).rejects.toThrow(/not paid|not found/i)
  })

  it("lists incomplete until Completed", async () => {
    const { SaleTransactionService } = await import(
      "@/modules/saleTransaction/SaleTransactionService"
    )
    const begun = await SaleTransactionService.begin({ storeId: "s1" })
    await SaleTransactionService.attachInvoice(begun.id, "INV-2", 200)
    expect(SaleTransactionService.listIncomplete("s1")).toHaveLength(1)
    expect(SaleTransactionService.listIncomplete("other")).toHaveLength(0)
  })
})
