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

  it("builds deep-links from alert meta", async () => {
    const { buildAlertHref } = await import(
      "@/modules/notifications/alertDeepLinks"
    )
    expect(
      buildAlertHref({
        messageType: "out_of_stock",
        meta: { sku: "SKU-1" },
      })
    ).toBe("/inventory/stock?sku=SKU-1")
    expect(
      buildAlertHref({
        messageType: "pending_purchase",
        meta: { purchaseOrderId: "po_9" },
      })
    ).toBe("/purchasing/orders?poId=po_9")
    expect(
      buildAlertHref({
        messageType: "outstanding_customer",
        customerId: "cust_1",
      })
    ).toBe("/customers/cust_1")
    expect(
      buildAlertHref({
        messageType: "failed_payment",
        invoiceId: "INV-9",
      })
    ).toBe("/invoices/INV-9")
  })

  it("hides muted types for cashier role", async () => {
    const { saveAlertThresholds } = await import(
      "@/modules/notifications/alertThresholds"
    )
    const { AlertService } = await import(
      "@/modules/notifications/services/AlertService"
    )

    saveAlertThresholds({
      roleMutes: {
        cashier: ["failed_sync"],
        manager: [],
        admin: [],
      },
    })

    await AlertService.raise({
      messageType: "failed_sync",
      title: "Failed sync",
      body: "Sheets dead letter",
      dedupeKey: "failed_sync:x1",
      priority: "high",
      storeId: "store-1",
    })

    expect(
      AlertService.listStaffAlerts("store-1", "cashier").some(
        (a) => a.messageType === "failed_sync"
      )
    ).toBe(false)
    expect(
      AlertService.listStaffAlerts("store-1", "admin").some(
        (a) => a.messageType === "failed_sync"
      )
    ).toBe(true)
  })

  it("queues telegram sibling for critical alerts when enabled", async () => {
    const { saveAlertThresholds } = await import(
      "@/modules/notifications/alertThresholds"
    )
    const { AlertService } = await import(
      "@/modules/notifications/services/AlertService"
    )
    const { notificationRepository } = await import(
      "@/repositories/NotificationRepository"
    )

    saveAlertThresholds({
      telegramCriticalEnabled: true,
      telegramChatId: "-100123",
    })

    await AlertService.raise({
      messageType: "out_of_stock",
      title: "Out of stock",
      body: "SKU-1 empty",
      dedupeKey: "out_of_stock:SKU-1",
      priority: "critical",
      storeId: "store-1",
      meta: { sku: "SKU-1" },
    })

    // allow sibling queue
    await new Promise((r) => setTimeout(r, 20))

    const telegram = notificationRepository
      .list()
      .find((n) => n.channel === "telegram")
    expect(telegram).toBeTruthy()
    expect(telegram?.status).toBe("Queued")
    expect(telegram?.meta?.telegramChatId).toBe("-100123")
  })
})
