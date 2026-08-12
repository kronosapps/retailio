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

describe("AccountingRules", () => {
  it("builds balanced sale, refund, and expense entries", async () => {
    const { AccountingRules, isBalanced } = await import(
      "@/modules/accounting/rules/AccountingRules"
    )

    const sale = AccountingRules.fromSale({
      invoiceId: "INV-1",
      createdAt: "2026-04-01T10:00:00.000Z",
      cashierId: "u1",
      cashierName: "Ada",
      paymentMethod: "UPI",
      paymentStatus: "Paid",
      storeId: "s1",
      totals: { taxableAmount: 10000, gstAmount: 500, total: 10500 },
    } as never)

    expect(isBalanced(sale)).toBe(true)
    expect(sale.referenceType).toBe("sale")
    expect(sale.source).toBe("posted")

    const refund = AccountingRules.fromRefund({
      refundId: "REF-1",
      invoiceId: "INV-1",
      amountPaisa: 10500,
      method: "UPI",
      createdAt: "2026-04-02T10:00:00.000Z",
    })
    expect(isBalanced(refund)).toBe(true)

    const expense = AccountingRules.fromExpense({
      id: "exp-1",
      title: "Rent",
      amountPaisa: 500000,
      paymentMethod: "Cash",
      storeId: "s1",
      createdAt: "2026-04-03T10:00:00.000Z",
    })
    expect(isBalanced(expense)).toBe(true)
    expect(expense.paymentMethod).toBe("Cash")

    const pin = AccountingRules.fromPurchaseInvoice({
      id: "pin-1",
      invoiceNumber: "PIN-1",
      totalPaisa: 40000,
      postedAt: "2026-04-04T10:00:00.000Z",
      billDate: "2026-04-04",
      createdAt: "2026-04-04T09:00:00.000Z",
      updatedBy: "t",
      createdBy: "t",
      storeId: "s1",
      status: "POSTED",
    } as never)
    expect(isBalanced(pin)).toBe(true)
    expect(pin.referenceType).toBe("purchase_invoice")

    const spay = AccountingRules.fromSupplierPayment({
      id: "spay-1",
      paymentNumber: "SPAY-1",
      invoiceNumber: "PIN-1",
      amountPaisa: 15000,
      method: "UPI",
      paidAt: "2026-04-05T10:00:00.000Z",
      createdBy: "t",
      storeId: "s1",
    } as never)
    expect(isBalanced(spay)).toBe(true)
    expect(spay.referenceType).toBe("supplier_payment")
  })
})

describe("JournalRepository idempotency", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("does not overwrite an existing posted reference", async () => {
    const { journalRepository } = await import(
      "@/repositories/JournalRepository"
    )
    const { AccountingRules } = await import(
      "@/modules/accounting/rules/AccountingRules"
    )

    const first = AccountingRules.fromExpense({
      id: "exp-dup",
      title: "First",
      amountPaisa: 100,
      storeId: null,
      createdAt: "2026-04-01T00:00:00.000Z",
      paymentMethod: "Cash",
    })
    const saved = await journalRepository.savePosted(first)
    const second = {
      ...AccountingRules.fromExpense({
        id: "exp-dup",
        title: "Second attempt",
        amountPaisa: 999,
        storeId: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        paymentMethod: "Cash",
      }),
      id: "je_other",
    }
    const again = await journalRepository.savePosted(second)
    expect(again.id).toBe(saved.id)
    expect(again.description).toBe("First")
    expect(journalRepository.list()).toHaveLength(1)
  })
})

describe("AccountingService merge", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("prefers posted over projected for the same reference", async () => {
    const { journalRepository } = await import(
      "@/repositories/JournalRepository"
    )
    const { AccountingRules } = await import(
      "@/modules/accounting/rules/AccountingRules"
    )
    const { AccountingService } = await import(
      "@/modules/accounting/AccountingService"
    )

    await journalRepository.savePosted(
      AccountingRules.fromExpense({
        id: "exp-merge",
        title: "Posted Rent",
        amountPaisa: 1000,
        storeId: null,
        createdAt: new Date().toISOString(),
        paymentMethod: "UPI",
      })
    )

    // Projection will also emit expense if in local expenses — seed expense too
    const { ExpenseService } = await import("@/modules/expense/ExpenseService")
    await ExpenseService.save({
      id: "exp-merge",
      title: "Projected title should lose",
      amountPaisa: 1000,
      storeId: null,
      createdAt: new Date().toISOString(),
      paymentMethod: "Cash",
    })

    const start = new Date()
    start.setFullYear(start.getFullYear() - 1)
    const end = new Date()
    end.setFullYear(end.getFullYear() + 1)

    const merged = await AccountingService.getMergedEntries({ start, end })
    const hit = merged.find(
      (e) => e.referenceType === "expense" && e.referenceId === "exp-merge"
    )
    expect(hit?.source).toBe("posted")
    expect(hit?.description).toBe("Posted Rent")
    expect(hit?.paymentMethod).toBe("UPI")
  })
})
