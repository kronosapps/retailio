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

describe("Backup & Restore", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("builds a database backup envelope with counts", async () => {
    const { buildDatabaseBackup } = await import(
      "@/modules/backup/collectSnapshot"
    )
    const payload = await buildDatabaseBackup({
      storeId: "store-1",
      storeName: "Demo",
    })
    expect(payload.manifest.formatVersion).toBe(1)
    expect(payload.manifest.kind).toBe("database")
    expect(payload.collections).toHaveProperty("products")
    expect(payload.collections).toHaveProperty("invoices")
    expect(payload.collections).toHaveProperty("journal_entries")
    expect(payload.meta.excluded.length).toBeGreaterThan(0)
    expect(payload.manifest.counts.products).toBeTypeOf("number")
  })

  it("inspects backup JSON without applying", async () => {
    const { RestoreService } = await import(
      "@/modules/backup/RestoreService"
    )
    const ok = RestoreService.inspectJsonText(
      JSON.stringify({
        manifest: {
          formatVersion: 1,
          kind: "database",
          exportedAt: "2026-08-13T00:00:00.000Z",
          storeId: "s1",
          counts: { products: 1 },
        },
        collections: { products: [{ id: "p1" }] },
      })
    )
    expect(ok.ok).toBe(true)
    expect(ok.canApply).toBe(false)
    expect(ok.collectionKeys).toContain("products")

    await expect(RestoreService.apply({})).rejects.toThrow(/disabled/i)
  })

  it("rejects future format versions", async () => {
    const { RestoreService } = await import(
      "@/modules/backup/RestoreService"
    )
    const bad = RestoreService.inspectJsonText(
      JSON.stringify({
        manifest: { formatVersion: 99, kind: "database" },
        collections: {},
      })
    )
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/newer/i)
  })
})
