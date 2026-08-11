import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_REORDER_LEVEL,
  resolveStockStatus,
  signedMovementQty,
} from "@/modules/inventory/types"

// Mock Firebase/Firestore helpers so repository writes stay local.
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

describe("inventory domain helpers", () => {
  it("resolves stock status from reorder level", () => {
    expect(resolveStockStatus(0, 10)).toBe("out_of_stock")
    expect(resolveStockStatus(5, 10)).toBe("low_stock")
    expect(resolveStockStatus(11, 10)).toBe("in_stock")
  })

  it("signs movement quantities by type", () => {
    expect(signedMovementQty("PURCHASE", 3)).toBe(3)
    expect(signedMovementQty("SALE", 3)).toBe(-3)
    expect(signedMovementQty("RETURN", 2)).toBe(2)
    expect(signedMovementQty("DAMAGE", 1)).toBe(-1)
  })

  it("defaults reorder level", () => {
    expect(DEFAULT_REORDER_LEVEL).toBe(10)
  })
})

describe("InventoryService stock movements", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("adds stock and records PURCHASE movement", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )

    await ProductService.create({
      name: "Test Halwa",
      sku: "TST-HAL-001",
      category: "Test",
      sellingPrice: 100,
      costPrice: 50,
      gstRate: 5,
      reorderLevel: 5,
      storeId: "store-1",
      actorId: "tester",
    })

    const { movement, inventory } = await InventoryService.addStock({
      sku: "TST-HAL-001",
      quantity: 12,
      actorId: "tester",
      actorName: "Tester",
      storeId: "store-1",
    })

    expect(inventory.quantity).toBe(12)
    expect(movement.type).toBe("PURCHASE")
    expect(movement.quantity).toBe(12)
    expect(InventoryService.getCurrentStock("TST-HAL-001")).toBe(12)
    expect(InventoryService.getMovementHistory("TST-HAL-001")).toHaveLength(1)
  })

  it("rejects removing more stock than available", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService, InventoryError } = await import(
      "@/modules/inventory/InventoryService"
    )

    await ProductService.create({
      name: "Small Pack",
      sku: "TST-SM-001",
      category: "Test",
      sellingPrice: 40,
      storeId: "store-1",
      actorId: "tester",
    })
    await InventoryService.addStock({
      sku: "TST-SM-001",
      quantity: 2,
      actorId: "tester",
    })

    await expect(
      InventoryService.removeStock({
        sku: "TST-SM-001",
        quantity: 5,
        actorId: "tester",
      })
    ).rejects.toBeInstanceOf(InventoryError)
  })

  it("adjust stock creates DAMAGE movement when removing as damaged", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )

    await ProductService.create({
      name: "Adj Item",
      sku: "TST-ADJ-001",
      category: "Test",
      sellingPrice: 10,
      storeId: "store-1",
      actorId: "tester",
    })
    await InventoryService.addStock({
      sku: "TST-ADJ-001",
      quantity: 10,
      actorId: "tester",
    })

    const { movement } = await InventoryService.adjustStock({
      sku: "TST-ADJ-001",
      quantity: 3,
      mode: "remove",
      reason: "Damaged",
      actorId: "tester",
      actorName: "Tester",
    })

    expect(movement.type).toBe("DAMAGE")
    expect(InventoryService.getCurrentStock("TST-ADJ-001")).toBe(7)
  })

  it("export helpers return tabular rows", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )

    await ProductService.create({
      name: "Export Item",
      sku: "TST-EXP-001",
      category: "Test",
      sellingPrice: 20,
      storeId: "store-1",
      actorId: "tester",
    })
    await InventoryService.addStock({
      sku: "TST-EXP-001",
      quantity: 4,
      actorId: "tester",
    })

    const products = InventoryService.exportProductsData()
    const stock = InventoryService.exportCurrentStockData()
    const movements = InventoryService.exportInventoryMovementsData()

    expect(products.some((r) => r.SKU === "TST-EXP-001")).toBe(true)
    expect(stock.some((r) => r.SKU === "TST-EXP-001" && r["Current Stock"] === 4)).toBe(
      true
    )
    expect(movements.length).toBeGreaterThan(0)
  })

  it("rejects duplicate SKU on create", async () => {
    const { ProductService, ProductError } = await import(
      "@/modules/products/ProductService"
    )

    await ProductService.create({
      name: "Dup",
      sku: "TST-DUP-001",
      category: "Test",
      sellingPrice: 1,
      actorId: "tester",
    })

    await expect(
      ProductService.create({
        name: "Dup 2",
        sku: "TST-DUP-001",
        category: "Test",
        sellingPrice: 2,
        actorId: "tester",
      })
    ).rejects.toBeInstanceOf(ProductError)
  })
})
