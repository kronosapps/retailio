import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
  subscribeQueryDocuments: vi.fn(() => () => undefined),
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

describe("Operational audit", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    vi.resetModules()
  })

  it("records price changes with actor", async () => {
    const { auditEngine } = await import("@/modules/audit/AuditEngine")
    const { AuditService } = await import("@/modules/audit/AuditService")
    const { EventTypes } = await import("@/events/EventTypes")
    const { EventPublisher } = await import("@/events/EventPublisher")

    auditEngine.start()
    await EventPublisher.publish(
      EventTypes.PRICE_CHANGED,
      {
        id: "ph_1",
        sku: "SKU-1",
        productName: "Halwa",
        oldSellingPricePaisa: 10000,
        newSellingPricePaisa: 12000,
        changedBy: "user_ada",
        storeId: "store-1",
        changedAt: new Date().toISOString(),
      },
      "store-1"
    )

    const rows = AuditService.list({ kind: "PRICE_CHANGED" })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.actorId).toBe("user_ada")
    expect(rows[0]?.message).toContain("Halwa")
    auditEngine.stop()
  })

  it("records stock adjustments from inventory movements", async () => {
    const { auditEngine } = await import("@/modules/audit/AuditEngine")
    const { AuditService } = await import("@/modules/audit/AuditService")
    const { EventTypes } = await import("@/events/EventTypes")
    const { EventPublisher } = await import("@/events/EventPublisher")

    auditEngine.start()
    await EventPublisher.publish(
      EventTypes.INVENTORY_MOVEMENT_CREATED,
      {
        id: "imv_1",
        sku: "SKU-2",
        productName: "Laddu",
        type: "ADJUSTMENT_OUT",
        quantity: 3,
        balanceAfter: 7,
        reason: "Damaged",
        createdBy: "user_bob",
        createdByName: "Bob",
        storeId: "store-1",
      },
      "store-1"
    )

    const rows = AuditService.list({ kind: "STOCK_ADJUSTED" })
    expect(rows.some((r) => r.actorId === "user_bob")).toBe(true)
    auditEngine.stop()
  })

  it("records refunds with createdBy", async () => {
    const { auditEngine } = await import("@/modules/audit/AuditEngine")
    const { AuditService } = await import("@/modules/audit/AuditService")
    const { EventTypes } = await import("@/events/EventTypes")
    const { EventPublisher } = await import("@/events/EventPublisher")

    auditEngine.start()
    await EventPublisher.publish(
      EventTypes.REFUND_CREATED,
      {
        refundId: "ref_1",
        invoiceId: "INV-9",
        customerName: "Ada",
        amountPaisa: 500000,
        method: "Cash",
        reason: "Customer return",
        createdBy: "user_manager",
        storeId: "store-1",
      },
      "store-1"
    )

    const rows = AuditService.list({ kind: "REFUND", query: "INV-9" })
    expect(rows[0]?.actorId).toBe("user_manager")
    expect(rows[0]?.message).toMatch(/5,000|5000/)
    auditEngine.stop()
  })

  it("records discounts from invoice payloads", async () => {
    const { auditEngine } = await import("@/modules/audit/AuditEngine")
    const { AuditService } = await import("@/modules/audit/AuditService")
    const { EventTypes } = await import("@/events/EventTypes")
    const { EventPublisher } = await import("@/events/EventPublisher")

    auditEngine.start()
    await EventPublisher.publish(
      EventTypes.INVOICE_CREATED,
      {
        invoiceId: "INV-D1",
        cashierId: "user_cash",
        cashierName: "Cashier",
        customerName: "Walk-in",
        discountPaisa: 500000,
        storeId: "store-1",
      },
      "store-1"
    )

    const rows = AuditService.list({ kind: "DISCOUNT_APPLIED" })
    expect(rows[0]?.actorId).toBe("user_cash")
    expect(rows[0]?.message).toMatch(/5,000|5000/)
    auditEngine.stop()
  })

  it("records login via AuditService.record", async () => {
    const { AuditService } = await import("@/modules/audit/AuditService")
    await AuditService.record({
      kind: "LOGIN_SUCCESS",
      message: "Login · Ada",
      actorId: "u1",
      actorName: "Ada",
      storeId: "store-1",
    })
    expect(AuditService.list({ kind: "LOGIN_SUCCESS" })[0]?.actorName).toBe(
      "Ada"
    )
  })
})
