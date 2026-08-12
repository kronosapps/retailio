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

describe("Stock lifecycle — lots + stock take", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("creates FEFO lots on receive and consumes earliest expiry first", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )

    await ProductService.create({
      name: "Milk Cake",
      sku: "LOT-SKU-1",
      category: "Sweets",
      sellingPrice: 100,
      costPrice: 40,
      storeId: "store-1",
      actorId: "t",
    })

    await InventoryService.addOpeningStock({
      sku: "LOT-SKU-1",
      quantity: 5,
      expiryDate: "2026-12-01",
      batchCode: "A",
      storeId: "store-1",
      actorId: "t",
    })
    await InventoryService.addStock({
      sku: "LOT-SKU-1",
      quantity: 5,
      type: "PURCHASE",
      expiryDate: "2026-09-01",
      batchCode: "B",
      storeId: "store-1",
      actorId: "t",
    })

    expect(InventoryService.getCurrentStock("LOT-SKU-1")).toBe(10)
    const lots = InventoryService.listLots("LOT-SKU-1")
    expect(lots).toHaveLength(2)

    await InventoryService.removeStock({
      sku: "LOT-SKU-1",
      quantity: 6,
      type: "SALE",
      actorId: "t",
    })

    const after = InventoryService.listLots("LOT-SKU-1")
    const early = after.find((l) => l.batchCode === "B")
    const late = after.find((l) => l.batchCode === "A")
    expect(early?.quantity).toBe(0)
    expect(late?.quantity).toBe(4)
    expect(InventoryService.getCurrentStock("LOT-SKU-1")).toBe(4)
  })

  it("posts stock take variances as adjustments", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { StockTakeService } = await import(
      "@/modules/inventory/StockTakeService"
    )

    await ProductService.create({
      name: "Halwa",
      sku: "ST-SKU-1",
      category: "Sweets",
      sellingPrice: 80,
      storeId: "store-1",
      actorId: "t",
    })
    await InventoryService.addOpeningStock({
      sku: "ST-SKU-1",
      quantity: 10,
      storeId: "store-1",
      actorId: "t",
    })

    const draft = await StockTakeService.startDraft({
      skus: ["ST-SKU-1"],
      storeId: "store-1",
      actorId: "t",
    })
    await StockTakeService.updateCounts(
      draft.id,
      [{ sku: "ST-SKU-1", countedQty: 8 }],
      "t"
    )
    const posted = await StockTakeService.post(draft.id, { actorId: "t" })
    expect(posted.status).toBe("POSTED")
    expect(InventoryService.getCurrentStock("ST-SKU-1")).toBe(8)
  })
})
