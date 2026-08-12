import { beforeEach, describe, expect, it, vi } from "vitest"

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

describe("Settings catalog & stores", () => {
  beforeEach(() => {
    vi.resetModules()
    // @ts-expect-error test polyfill
    globalThis.localStorage = memoryStorage()
  })

  it("exposes the Configuration Center sections", async () => {
    const { SETTINGS_SECTIONS, settingsSectionsForRole, canAccessSettingsPath } =
      await import("@/modules/settings/catalog")

    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      "business",
      "invoice",
      "tax",
      "inventory",
      "pos",
      "payments",
      "banking",
      "notifications",
      "users",
      "integrations",
      "data",
    ])
    expect(settingsSectionsForRole("admin")).toHaveLength(11)
    expect(settingsSectionsForRole("manager")).toHaveLength(0)
    expect(canAccessSettingsPath("admin", "/settings/payments")).toBe(true)
    expect(canAccessSettingsPath("cashier", "/settings")).toBe(false)
  })

  it("persists inventory and POS business settings", async () => {
    const { SettingsService } = await import(
      "@/modules/settings/SettingsService"
    )

    const inv = SettingsService.saveInventorySettings({
      defaultReorderLevel: 25,
    })
    expect(inv.defaultReorderLevel).toBe(25)
    expect(SettingsService.getInventorySettings().defaultReorderLevel).toBe(25)

    const pos = SettingsService.savePosSettings({ requireDayOpen: false })
    expect(pos.requireDayOpen).toBe(false)
    expect(SettingsService.getPosSettings().requireDayOpen).toBe(false)
  })
})
