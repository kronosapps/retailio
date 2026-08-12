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

describe("normalizeNameKey", () => {
  it("collapses case and whitespace", async () => {
    const { normalizeNameKey, namesConflict } = await import(
      "@/modules/masterData/normalizeNameKey"
    )
    expect(normalizeNameKey("  Chocolate ")).toBe("chocolate")
    expect(normalizeNameKey("CHOCOLATE")).toBe("chocolate")
    expect(namesConflict("Chocolate", "chocolates")).toBe(false)
    expect(namesConflict("Chocolate", "chocolate")).toBe(true)
  })
})

describe("MasterData brands / units / categories", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("rejects duplicate brand names ignoring case", async () => {
    const { MasterDataService } = await import("@/modules/masterData")
    await MasterDataService.createBrand({ name: "Chocolate" })
    await expect(
      MasterDataService.createBrand({ name: "chocolate" })
    ).rejects.toThrow(/already exists/i)
  })

  it("ensureCategory reuses existing nameKey", async () => {
    const { MasterDataService } = await import("@/modules/masterData")
    const first = await MasterDataService.ensureCategory("Halwa")
    const second = await MasterDataService.ensureCategory("halwa")
    expect(second.id).toBe(first.id)
    expect(second.name).toBe("Halwa")
  })

  it("seeds default units and tax rates", async () => {
    const { MasterDataService } = await import("@/modules/masterData")
    const units = MasterDataService.listUnits()
    expect(units.some((u) => u.code === "g")).toBe(true)
    const rates = MasterDataService.listTaxRates()
    expect(rates.map((r) => r.ratePercent)).toEqual(
      expect.arrayContaining([0, 5, 12, 18, 28])
    )
  })
})

describe("Supplier name uniqueness", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("blocks Acme / acme duplicates", async () => {
    const { supplierRepository } = await import(
      "@/repositories/SupplierRepository"
    )
    await supplierRepository.create({ name: "Acme Foods" })
    await expect(
      supplierRepository.create({ name: "acme foods" })
    ).rejects.toThrow(/already exists/i)
  })
})
