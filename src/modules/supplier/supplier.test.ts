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

describe("SupplierService", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("creates, lists, updates, and deactivates suppliers", async () => {
    const { SupplierService } = await import("@/modules/supplier/SupplierService")
    const { EventPublisher } = await import("@/events/EventPublisher")
    const { EventTypes } = await import("@/events/EventTypes")

    const created = await SupplierService.create(
      {
        name: "  Acme Foods  ",
        phone: "9876543210",
        gstin: "36aaaaa0000a1z5",
        paymentTerms: "Net 15",
        storeId: "store-1",
      },
      "actor-1"
    )

    expect(created.name).toBe("Acme Foods")
    expect(created.gstin).toBe("36AAAAA0000A1Z5")
    expect(created.active).toBe(true)
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SUPPLIER_CREATED,
      expect.objectContaining({ id: created.id, name: "Acme Foods" }),
      "store-1"
    )

    expect(SupplierService.list()).toHaveLength(1)

    const updated = await SupplierService.update({
      id: created.id,
      paymentTerms: "Net 30",
      actorId: "actor-1",
    })
    expect(updated.paymentTerms).toBe("Net 30")
    expect(EventPublisher.publish).toHaveBeenCalledWith(
      EventTypes.SUPPLIER_UPDATED,
      expect.objectContaining({ paymentTerms: "Net 30" }),
      "store-1"
    )

    const inactive = await SupplierService.setActive(created.id, false, "actor-1")
    expect(inactive.active).toBe(false)
    expect(SupplierService.list({ includeInactive: false })).toHaveLength(0)
    expect(SupplierService.list({ includeInactive: true })).toHaveLength(1)
  })

  it("rejects empty supplier name", async () => {
    const { SupplierService, SupplierError } = await import(
      "@/modules/supplier/SupplierService"
    )
    await expect(
      SupplierService.create({ name: "   ", storeId: null }, null)
    ).rejects.toBeInstanceOf(SupplierError)
  })
})
