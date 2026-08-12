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

describe("Cashier shift / till", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("opens float, posts sales/refunds/expenses/drops, closes with variance", async () => {
    const { ShiftService } = await import("@/modules/shift/ShiftService")
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")
    const { rupeesToPaisa } = await import("@/lib/money")

    const open = await ShiftService.open({
      cashierId: "c1",
      cashierName: "Ravi",
      openingFloatRupees: 5000,
      storeId: "store-1",
      actorId: "c1",
    })
    expect(open.status).toBe("OPEN")
    expect(open.openingFloatPaisa).toBe(rupeesToPaisa(5000))
    expect(open.expectedCashPaisa).toBe(rupeesToPaisa(5000))
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SHIFT_OPENED,
      expect.objectContaining({ id: open.id }),
      "store-1"
    )

    await ShiftService.recordAutomatedMovement({
      cashierId: "c1",
      type: "CASH_SALE",
      amountPaisa: rupeesToPaisa(28450),
      referenceId: "pay:1",
    })
    await ShiftService.recordAutomatedMovement({
      cashierId: "c1",
      type: "CASH_REFUND",
      amountPaisa: rupeesToPaisa(1000),
      referenceId: "refund:1",
    })
    await ShiftService.recordAutomatedMovement({
      cashierId: "c1",
      type: "CASH_EXPENSE",
      amountPaisa: rupeesToPaisa(500),
      referenceId: "exp:1",
    })
    await ShiftService.cashDrop({
      cashierId: "c1",
      amountRupees: 5000,
      note: "Safe drop",
      actorId: "c1",
    })

    // Idempotent sale
    await ShiftService.recordAutomatedMovement({
      cashierId: "c1",
      type: "CASH_SALE",
      amountPaisa: rupeesToPaisa(28450),
      referenceId: "pay:1",
    })

    const mid = ShiftService.getOpenForCashier("c1")!
    expect(mid.cashSalesPaisa).toBe(rupeesToPaisa(28450))
    expect(mid.expectedCashPaisa).toBe(rupeesToPaisa(26950))

    const closed = await ShiftService.close({
      cashierId: "c1",
      actualCashRupees: 26700,
      actorId: "c1",
    })
    expect(closed.status).toBe("CLOSED")
    expect(closed.actualCashPaisa).toBe(rupeesToPaisa(26700))
    expect(closed.variancePaisa).toBe(rupeesToPaisa(-250))
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SHIFT_CLOSED,
      expect.objectContaining({
        id: closed.id,
        variancePaisa: rupeesToPaisa(-250),
      }),
      "store-1"
    )
    expect(ShiftService.getOpenForCashier("c1")).toBeNull()
  })

  it("blocks second open shift for same cashier", async () => {
    const { ShiftService, ShiftError } = await import(
      "@/modules/shift/ShiftService"
    )
    await ShiftService.open({
      cashierId: "c2",
      openingFloatRupees: 100,
      actorId: "c2",
    })
    await expect(
      ShiftService.open({
        cashierId: "c2",
        openingFloatRupees: 50,
        actorId: "c2",
      })
    ).rejects.toBeInstanceOf(ShiftError)
  })
})
