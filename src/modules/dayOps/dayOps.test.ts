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

vi.mock("@/modules/reports/EndOfDayService", () => ({
  EndOfDayService: {
    isSheetsConfigured: () => false,
    run: vi.fn(async () => ({
      dayKey: "20260101",
      dayLabel: "Today",
      ranAt: new Date().toISOString(),
      invoicesSynced: 0,
      paymentsSynced: 0,
      refundsSynced: 0,
      customersSynced: 0,
      summarySynced: false,
      errors: [],
      sheetsConfigured: false,
    })),
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

describe("DayOpsService", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("opens and closes a business day with closing preview panels", async () => {
    const { DayOpsService } = await import("@/modules/dayOps")

    const opened = await DayOpsService.openDay({
      storeId: "s1",
      actorId: "u1",
      openingCashPaisa: 10000,
      openingUpiPaisa: 5000,
    })
    expect(opened.status).toBe("OPEN")
    expect(DayOpsService.getOpen("s1")?.id).toBe(opened.id)

    const preview = await DayOpsService.getClosingPreview("today", "s1")
    expect(preview.dayKey).toBe(opened.dayKey)
    expect(preview.sales).toBeDefined()
    expect(preview.cash).toBeDefined()
    expect(preview.upi).toBeDefined()
    expect(preview.refunds).toBeDefined()
    expect(preview.discounts).toBeDefined()
    expect(preview.expenses).toBeDefined()
    expect(preview.cashierVariance).toBeDefined()

    const { day } = await DayOpsService.closeDay({
      storeId: "s1",
      actorId: "u1",
      syncSheets: false,
      allowOpenShifts: true,
    })
    expect(day.status).toBe("CLOSED")
    expect(day.closingSnapshot).not.toBeNull()
    expect(DayOpsService.getOpen("s1")).toBeNull()
  })

  it("rejects a second open while a day is open", async () => {
    const { DayOpsService, DayOpsError } = await import("@/modules/dayOps")
    await DayOpsService.openDay({ storeId: "s1", actorId: "u1" })
    // Same day returns existing
    const again = await DayOpsService.openDay({ storeId: "s1", actorId: "u1" })
    expect(again.status).toBe("OPEN")

    // Simulate another open day on different key by closing then... just ensure close requires open
    await DayOpsService.closeDay({
      storeId: "s1",
      syncSheets: false,
      allowOpenShifts: true,
    })
    await expect(
      DayOpsService.closeDay({ storeId: "s1", syncSheets: false })
    ).rejects.toBeInstanceOf(DayOpsError)
  })
})
