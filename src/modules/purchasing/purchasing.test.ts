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

describe("PurchaseReceivingService ad-hoc GRN", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("posts GRN and increases stock via InventoryService.addStock", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { PurchaseReceivingService } = await import(
      "@/modules/purchasing/PurchaseReceivingService"
    )
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    await ProductService.create({
      name: "Test Halwa",
      sku: "GRN-SKU-1",
      category: "Test",
      sellingPrice: 100,
      costPrice: 50,
      storeId: "store-1",
      actorId: "t",
    })

    const supplier = await SupplierService.create(
      { name: "Vendor One", storeId: "store-1" },
      "t"
    )

    const before = InventoryService.getCurrentStock("GRN-SKU-1")
    const grn = await PurchaseReceivingService.receiveAdHoc({
      supplierId: supplier.id,
      lines: [{ sku: "GRN-SKU-1", quantity: 5, unitCostRupees: 48 }],
      storeId: "store-1",
      actorId: "t",
      actorName: "Tester",
    })

    expect(grn.status).toBe("POSTED")
    expect(grn.purchaseOrderId).toBeNull()
    expect(grn.grnNumber).toMatch(/^GRN-/)
    expect(InventoryService.getCurrentStock("GRN-SKU-1")).toBe(before + 5)

    const movements = InventoryService.getMovementHistory("GRN-SKU-1")
    expect(movements.some((m) => m.referenceId === grn.id && m.type === "PURCHASE")).toBe(
      true
    )
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.GOODS_RECEIVED,
      expect.objectContaining({ id: grn.id, status: "POSTED" }),
      "store-1"
    )
  })

  it("rejects unknown SKU and double-post", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { PurchaseReceivingService, PurchaseReceivingError } = await import(
      "@/modules/purchasing/PurchaseReceivingService"
    )

    await ProductService.create({
      name: "Item",
      sku: "GRN-SKU-2",
      category: "Test",
      sellingPrice: 10,
      storeId: null,
      actorId: "t",
    })
    const supplier = await SupplierService.create(
      { name: "Vendor Two", storeId: null },
      "t"
    )

    await expect(
      PurchaseReceivingService.receiveAdHoc({
        supplierId: supplier.id,
        lines: [{ sku: "MISSING", quantity: 1 }],
        actorId: "t",
      })
    ).rejects.toBeInstanceOf(PurchaseReceivingError)

    const grn = await PurchaseReceivingService.receiveAdHoc({
      supplierId: supplier.id,
      lines: [{ sku: "GRN-SKU-2", quantity: 2 }],
      actorId: "t",
    })

    await expect(
      PurchaseReceivingService.post(grn.id, { actorId: "t" })
    ).rejects.toMatchObject({ code: "ALREADY_POSTED" })
  })
})
