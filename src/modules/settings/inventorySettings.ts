/**
 * Store-scoped inventory defaults (business settings — not env).
 */

const STORAGE_KEY = "retailos.inventory.settings.v1"

export type InventorySettings = {
  /** Used when a product has no per-SKU reorderLevel. */
  defaultReorderLevel: number
}

const DEFAULTS: InventorySettings = {
  defaultReorderLevel: 10,
}

function sanitize(raw: Partial<InventorySettings>): InventorySettings {
  const n = Number(raw.defaultReorderLevel)
  return {
    defaultReorderLevel:
      Number.isFinite(n) && n >= 0 ? Math.min(1_000_000, Math.floor(n)) : 10,
  }
}

export function getInventorySettings(): InventorySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return sanitize(JSON.parse(raw) as Partial<InventorySettings>)
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveInventorySettings(
  patch: Partial<InventorySettings>
): InventorySettings {
  const next = sanitize({ ...getInventorySettings(), ...patch })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function resolveDefaultReorderLevel(): number {
  return getInventorySettings().defaultReorderLevel
}
