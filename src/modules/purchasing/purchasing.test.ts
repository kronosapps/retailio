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

describe("PurchaseOrderService + GRN against PO", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("issues PO, receives against it, updates received qty and stock", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { PurchaseOrderService } = await import(
      "@/modules/purchasing/PurchaseOrderService"
    )
    const { PurchaseReceivingService } = await import(
      "@/modules/purchasing/PurchaseReceivingService"
    )
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    await ProductService.create({
      name: "PO Item",
      sku: "PO-SKU-1",
      category: "Test",
      sellingPrice: 100,
      costPrice: 40,
      storeId: "store-1",
      actorId: "t",
    })
    const supplier = await SupplierService.create(
      { name: "PO Vendor", storeId: "store-1" },
      "t"
    )

    const po = await PurchaseOrderService.create({
      supplierId: supplier.id,
      lines: [{ sku: "PO-SKU-1", quantityOrdered: 10, unitCostRupees: 40 }],
      storeId: "store-1",
      actorId: "t",
      issue: true,
    })
    expect(po.status).toBe("ISSUED")
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.PURCHASE_ORDER_ISSUED,
      expect.objectContaining({ id: po.id }),
      "store-1"
    )

    const before = InventoryService.getCurrentStock("PO-SKU-1")
    const grn = await PurchaseReceivingService.receiveAgainstPo({
      purchaseOrderId: po.id,
      lines: [{ sku: "PO-SKU-1", quantity: 4 }],
      actorId: "t",
      actorName: "Tester",
    })

    expect(grn.status).toBe("POSTED")
    expect(grn.purchaseOrderId).toBe(po.id)
    expect(InventoryService.getCurrentStock("PO-SKU-1")).toBe(before + 4)

    const updated = PurchaseOrderService.getById(po.id)!
    expect(updated.status).toBe("PARTIAL")
    expect(updated.lines[0].quantityReceived).toBe(4)
  })

  it("blocks over-receipt against PO remaining", async () => {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { PurchaseOrderService } = await import(
      "@/modules/purchasing/PurchaseOrderService"
    )
    const {
      PurchaseReceivingService,
      PurchaseReceivingError,
    } = await import("@/modules/purchasing/PurchaseReceivingService")

    await ProductService.create({
      name: "PO Item 2",
      sku: "PO-SKU-2",
      category: "Test",
      sellingPrice: 10,
      storeId: null,
      actorId: "t",
    })
    const supplier = await SupplierService.create(
      { name: "PO Vendor 2", storeId: null },
      "t"
    )
    const po = await PurchaseOrderService.create({
      supplierId: supplier.id,
      lines: [{ sku: "PO-SKU-2", quantityOrdered: 3 }],
      actorId: "t",
      issue: true,
    })

    await expect(
      PurchaseReceivingService.receiveAgainstPo({
        purchaseOrderId: po.id,
        lines: [{ sku: "PO-SKU-2", quantity: 5 }],
        actorId: "t",
      })
    ).rejects.toBeInstanceOf(PurchaseReceivingError)

    await PurchaseReceivingService.receiveAgainstPo({
      purchaseOrderId: po.id,
      lines: [{ sku: "PO-SKU-2", quantity: 3 }],
      actorId: "t",
    })
    expect(PurchaseOrderService.getById(po.id)?.status).toBe("RECEIVED")
  })
})

describe("SupplierInvoice + SupplierPayment (AP)", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  async function seedPostedGrn() {
    const { ProductService } = await import("@/modules/products/ProductService")
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { PurchaseReceivingService } = await import(
      "@/modules/purchasing/PurchaseReceivingService"
    )

    await ProductService.create({
      name: "AP Item",
      sku: "AP-SKU-1",
      category: "Test",
      sellingPrice: 100,
      costPrice: 50,
      storeId: "store-1",
      actorId: "t",
    })
    const supplier = await SupplierService.create(
      { name: "AP Vendor", storeId: "store-1" },
      "t"
    )
    const grn = await PurchaseReceivingService.receiveAdHoc({
      supplierId: supplier.id,
      lines: [{ sku: "AP-SKU-1", quantity: 2, unitCostRupees: 50 }],
      storeId: "store-1",
      actorId: "t",
    })
    return { supplier, grn }
  }

  it("posts invoice from GRN without changing stock; blocks overpay; partial then paid", async () => {
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { SupplierInvoiceService } = await import(
      "@/modules/purchasing/SupplierInvoiceService"
    )
    const { SupplierPaymentService, SupplierPaymentError } = await import(
      "@/modules/purchasing/SupplierPaymentService"
    )
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    const { grn } = await seedPostedGrn()
    const stockBefore = InventoryService.getCurrentStock("AP-SKU-1")

    const inv = await SupplierInvoiceService.createFromGrns({
      goodsReceiptIds: [grn.id],
      actorId: "t",
      issueAndPost: true,
    })

    expect(inv.status).toBe("POSTED")
    expect(inv.totalPaisa).toBe(10000) // 2 * ₹50
    expect(InventoryService.getCurrentStock("AP-SKU-1")).toBe(stockBefore)
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.PURCHASE_INVOICE_POSTED,
      expect.objectContaining({ id: inv.id, status: "POSTED" }),
      "store-1"
    )

    await expect(
      SupplierPaymentService.payInvoice({
        purchaseInvoiceId: inv.id,
        amountRupees: 200,
        method: "Cash",
        actorId: "t",
      })
    ).rejects.toBeInstanceOf(SupplierPaymentError)

    await SupplierPaymentService.payInvoice({
      purchaseInvoiceId: inv.id,
      amountRupees: 40,
      method: "Cash",
      actorId: "t",
    })
    expect(SupplierInvoiceService.getById(inv.id)?.status).toBe("PARTIAL")

    await SupplierPaymentService.payInvoice({
      purchaseInvoiceId: inv.id,
      amountRupees: 60,
      method: "UPI",
      actorId: "t",
    })
    const paid = SupplierInvoiceService.getById(inv.id)!
    expect(paid.status).toBe("PAID")
    expect(paid.amountPaidPaisa).toBe(10000)
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SUPPLIER_PAYMENT_RECORDED,
      expect.objectContaining({ purchaseInvoiceId: inv.id, status: "Paid" }),
      "store-1"
    )
  })

  it("rejects double-billing the same GRN", async () => {
    const { SupplierInvoiceService, SupplierInvoiceError } = await import(
      "@/modules/purchasing/SupplierInvoiceService"
    )
    const { grn } = await seedPostedGrn()

    await SupplierInvoiceService.createFromGrns({
      goodsReceiptIds: [grn.id],
      actorId: "t",
      issueAndPost: true,
    })

    await expect(
      SupplierInvoiceService.createFromGrns({
        goodsReceiptIds: [grn.id],
        actorId: "t",
      })
    ).rejects.toBeInstanceOf(SupplierInvoiceError)
  })

  it("posts purchase return: stock out, AP credit, blocks over-return", async () => {
    const { InventoryService } = await import(
      "@/modules/inventory/InventoryService"
    )
    const { SupplierInvoiceService } = await import(
      "@/modules/purchasing/SupplierInvoiceService"
    )
    const {
      PurchaseReturnService,
      PurchaseReturnError,
    } = await import("@/modules/purchasing/PurchaseReturnService")
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    const { grn } = await seedPostedGrn()
    const inv = await SupplierInvoiceService.createFromGrns({
      goodsReceiptIds: [grn.id],
      actorId: "t",
      issueAndPost: true,
    })

    const stockBefore = InventoryService.getCurrentStock("AP-SKU-1")
    const ret = await PurchaseReturnService.createAndPost({
      purchaseInvoiceId: inv.id,
      lines: [{ sku: "AP-SKU-1", quantity: 1 }],
      reason: "Damaged",
      actorId: "t",
      storeId: "store-1",
    })

    expect(ret.status).toBe("POSTED")
    expect(ret.returnNumber).toMatch(/^PRN-/)
    expect(InventoryService.getCurrentStock("AP-SKU-1")).toBe(stockBefore - 1)
    expect(
      InventoryService.getMovementHistory("AP-SKU-1").some(
        (m) => m.referenceId === ret.id && m.type === "PURCHASE_RETURN"
      )
    ).toBe(true)

    const updated = SupplierInvoiceService.getById(inv.id)!
    expect(updated.amountCreditedPaisa).toBe(5000) // 1 * ₹50
    expect(SupplierInvoiceService.remainingPayablePaisa(updated)).toBe(5000)

    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.PURCHASE_RETURN_POSTED,
      expect.objectContaining({ id: ret.id, status: "POSTED" }),
      "store-1"
    )

    await expect(
      PurchaseReturnService.createAndPost({
        purchaseInvoiceId: inv.id,
        lines: [{ sku: "AP-SKU-1", quantity: 2 }],
        actorId: "t",
      })
    ).rejects.toBeInstanceOf(PurchaseReturnError)
  })
})
