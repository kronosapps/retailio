import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/repositories/firestoreHelpers", () => ({
  upsertDocument: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => null),
  listDocuments: vi.fn(async () => null),
  subscribeQueryDocuments: vi.fn(() => () => undefined),
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

describe("Offline sync reliability", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
    vi.resetModules()
  })

  it("dedupes enqueue by eventId and idempotencyKey", async () => {
    const { syncQueue } = await import("@/services/sync/SyncQueue")

    const a = syncQueue.enqueue({
      action: "upsert",
      sheet: "Payments",
      data: { paymentId: "PAY-1" },
      eventType: "PAYMENT_RECEIVED",
      eventId: "evt_1",
      idempotencyKey: "payment:PAY-1",
    })
    const b = syncQueue.enqueue({
      action: "upsert",
      sheet: "Payments",
      data: { paymentId: "PAY-1" },
      eventType: "PAYMENT_RECEIVED",
      eventId: "evt_1",
      idempotencyKey: "payment:PAY-1",
    })
    const c = syncQueue.enqueue({
      action: "upsert",
      sheet: "Payments",
      data: { paymentId: "PAY-1" },
      eventType: "PAYMENT_RECEIVED",
      eventId: "evt_2",
      idempotencyKey: "payment:PAY-1",
    })

    expect(b.id).toBe(a.id)
    expect(c.id).toBe(a.id)
    expect(syncQueue.listAll()).toHaveLength(1)
  })

  it("requeues dead letters for retry", async () => {
    const { syncQueue } = await import("@/services/sync/SyncQueue")
    const item = syncQueue.enqueue({
      action: "upsert",
      sheet: "Payments",
      data: { paymentId: "PAY-2" },
      eventType: "PAYMENT_RECEIVED",
      eventId: "evt_dl",
      idempotencyKey: "payment:PAY-2",
    })
    syncQueue.moveToDeadLetter(item, "network down")
    expect(syncQueue.listDeadLetters()).toHaveLength(1)
    expect(syncQueue.listPending()).toHaveLength(0)

    const revived = syncQueue.requeueDeadLetter(item.id, { resetRetries: true })
    expect(revived?.status).toBe("Pending")
    expect(revived?.retries).toBe(0)
    expect(syncQueue.listDeadLetters()).toHaveLength(0)
    expect(syncQueue.listPending()).toHaveLength(1)
  })

  it("does not re-publish PAYMENT_RECEIVED when already Paid", async () => {
    const { EventPublisher } = await import("@/events/EventPublisher")
    const publish = EventPublisher.publish as unknown as ReturnType<typeof vi.fn>
    publish.mockClear()

    const { paymentRepository } = await import(
      "@/repositories/PaymentRepository"
    )

    const base = {
      paymentId: "PAY-IDEMP",
      invoiceId: "INV-1",
      invoiceNumber: "INV-1",
      transactionReference: "TR-IDEMP",
      merchantUPI: "x@upi",
      merchantName: "Store",
      amountPaisa: 10000,
      amount: 100,
      currency: "INR" as const,
      paymentMethod: "UPI" as const,
      status: "Pending" as const,
      createdAt: new Date().toISOString(),
      paidAt: null,
      remarks: null,
      upiUrl: null,
      qrGeneratedAt: null,
      qrExpiresAt: null,
      customerName: "Walk-in",
      customerId: null,
      customerPhone: null,
      storeId: "store-1",
      attempt: 1,
      upiTxnLast4: null,
      cashReceiptNumber: null,
      cashReceiptId: null,
    }

    await paymentRepository.save(base)
    publish.mockClear()

    await paymentRepository.update("PAY-IDEMP", {
      status: "Paid",
      paidAt: new Date().toISOString(),
    })
    expect(publish).toHaveBeenCalledTimes(1)

    publish.mockClear()
    await paymentRepository.update("PAY-IDEMP", {
      status: "Paid",
      paidAt: new Date().toISOString(),
    })
    expect(publish).toHaveBeenCalledTimes(0)
  })

  it("builds payment idempotency keys", async () => {
    const { syncIdempotencyKey, sheetUpsertKeyField } = await import(
      "@/services/sync/syncIdempotency"
    )
    expect(
      syncIdempotencyKey("PAYMENT_RECEIVED", { paymentId: "PAY-9" })
    ).toBe("payment:PAY-9")
    expect(sheetUpsertKeyField("Payments")).toBe("paymentId")
  })
})
