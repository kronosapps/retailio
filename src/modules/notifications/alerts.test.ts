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

describe("AlertService", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage())
  })

  it("raises in_app staff alerts with dedupe", async () => {
    const { AlertService } = await import(
      "@/modules/notifications/services/AlertService"
    )

    const first = await AlertService.raise({
      messageType: "failed_payment",
      title: "Failed payment",
      body: "INV-1 failed",
      dedupeKey: "failed_payment:pay_1",
      priority: "high",
      storeId: "store-1",
      href: "/transactions",
    })
    expect(first).toBeTruthy()
    expect(first?.channel).toBe("in_app")
    expect(first?.audience).toBe("staff")
    expect(first?.status).toBe("Delivered")

    const second = await AlertService.raise({
      messageType: "failed_payment",
      title: "Failed payment",
      body: "INV-1 failed again",
      dedupeKey: "failed_payment:pay_1",
      priority: "high",
      storeId: "store-1",
    })
    expect(second?.notificationId).toBe(first?.notificationId)

    expect(AlertService.unreadCount("store-1")).toBe(1)
    await AlertService.markRead(first!.notificationId)
    expect(AlertService.unreadCount("store-1")).toBe(0)
  })

  it("alerts large refunds from PAYMENT_REFUNDED payload", async () => {
    const { AlertService } = await import(
      "@/modules/notifications/services/AlertService"
    )
    const { EventTypes } = await import("@/events/EventTypes")

    await AlertService.onPaymentRefunded({
      id: "evt_1",
      type: EventTypes.PAYMENT_REFUNDED,
      storeId: "store-1",
      source: "repository",
      createdAt: new Date().toISOString(),
      payload: {
        invoiceId: "INV-R1",
        refundId: "ref_1",
        customerName: "Ada",
        amountPaisa: 250000,
      },
    })

    const alerts = AlertService.listStaffAlerts("store-1")
    expect(alerts.some((a) => a.messageType === "large_refund")).toBe(true)
  })

  it("alerts cash variance on shift close", async () => {
    const { AlertService } = await import(
      "@/modules/notifications/services/AlertService"
    )
    const { EventTypes } = await import("@/events/EventTypes")

    await AlertService.onShiftClosed({
      id: "evt_2",
      type: EventTypes.SHIFT_CLOSED,
      storeId: "store-1",
      source: "repository",
      createdAt: new Date().toISOString(),
      payload: {
        id: "shift_1",
        cashierName: "Bob",
        variancePaisa: -12500,
      },
    })

    const alerts = AlertService.listStaffAlerts("store-1")
    expect(alerts.some((a) => a.messageType === "cash_variance")).toBe(true)
  })

  it("maps alert tones for soft UI", async () => {
    const { alertToneFor } = await import(
      "@/modules/notifications/types/notification"
    )
    expect(alertToneFor("out_of_stock")).toBe("rose")
    expect(alertToneFor("low_stock")).toBe("amber")
    expect(alertToneFor("large_discount")).toBe("violet")
    expect(alertToneFor("pending_purchase")).toBe("sky")
  })
})
