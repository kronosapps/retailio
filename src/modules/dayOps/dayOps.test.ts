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

  it("opens with editable openings + checklist and closes with preview", async () => {
    const { DayOpsService } = await import("@/modules/dayOps")

    const opened = await DayOpsService.openDay({
      storeId: "s1",
      actorId: "u1",
      openingCashPaisa: 10000,
      openingUpiPaisa: 5000,
      checklist: {
        bankingVerified: true,
        floatReady: true,
        printersOk: true,
        upiQrOk: true,
      },
    })
    expect(opened.status).toBe("OPEN")
    expect(opened.openingCashPaisa).toBe(10000)
    expect(opened.sodChecklist?.bankingVerified).toBe(true)
    expect(DayOpsService.isStoreDayOpen("s1")).toBe(true)

    const preview = await DayOpsService.getClosingPreview("today", "s1")
    expect(preview.stockExceptions).toBeDefined()
    expect(preview.cashierVariance).toBeDefined()

    const { day } = await DayOpsService.closeDay({
      storeId: "s1",
      actorId: "u1",
      syncSheets: false,
      allowOpenShifts: true,
    })
    expect(day.status).toBe("CLOSED")
    expect(day.closingSnapshot).not.toBeNull()
    expect(DayOpsService.isStoreDayOpen("s1")).toBe(false)
  })

  it("reopens a closed day with audit reason", async () => {
    const { DayOpsService, DayOpsError } = await import("@/modules/dayOps")
    const opened = await DayOpsService.openDay({ storeId: "s1", actorId: "u1" })
    await DayOpsService.closeDay({
      storeId: "s1",
      syncSheets: false,
      allowOpenShifts: true,
    })
    const again = await DayOpsService.reopenDay({
      dayKey: opened.dayKey,
      storeId: "s1",
      actorId: "admin",
      reason: "Missed expense posting",
    })
    expect(again.status).toBe("OPEN")
    expect(again.reopenReason).toBe("Missed expense posting")

    await expect(
      DayOpsService.reopenDay({
        dayKey: opened.dayKey,
        storeId: "s1",
        reason: "ab",
      })
    ).rejects.toBeInstanceOf(DayOpsError)
  })

  it("suggests openings from banking when no yesterday close", async () => {
    const { DayOpsService } = await import("@/modules/dayOps")
    const s = DayOpsService.getSuggestedOpenings("s1")
    expect(s.source).toBe("banking")
    expect(typeof s.cashPaisa).toBe("number")
  })
})
