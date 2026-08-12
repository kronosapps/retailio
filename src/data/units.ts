/**
 * Local unit-of-measure master (offline-first).
 * Products keep unitSize (pack qty) + unit code string for POS/Sheets.
 */

import type { UnitRecord } from "@/modules/masterData/types"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"

const STORAGE_KEY = "retailos.units.v1"

const DEFAULT_UNITS: Omit<
  UnitRecord,
  "id" | "storeId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>[] = [
  { code: "pcs", name: "Pieces", nameKey: "pcs", active: true },
  { code: "g", name: "Gram", nameKey: "g", active: true },
  { code: "kg", name: "Kilogram", nameKey: "kg", active: true },
  { code: "ml", name: "Millilitre", nameKey: "ml", active: true },
  { code: "l", name: "Litre", nameKey: "l", active: true },
  { code: "pack", name: "Pack", nameKey: "pack", active: true },
]

type UnitStore = {
  version: 1
  seeded: boolean
  items: UnitRecord[]
}

function emptyStore(): UnitStore {
  return { version: 1, seeded: false, items: [] }
}

function readStore(): UnitStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<UnitStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      seeded: Boolean(parsed.seeded),
      items: parsed.items.map((row) => ({
        ...row,
        code: (row.code || row.name || "").trim(),
        nameKey:
          row.nameKey ||
          normalizeNameKey(row.code || row.name || ""),
      })) as UnitRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: UnitStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

/** Ensure default UoM rows exist once per browser. */
export function ensureDefaultUnits(storeId: string | null = null): UnitRecord[] {
  const store = readStore()
  if (store.seeded && store.items.length > 0) {
    return [...store.items].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { sensitivity: "base" })
    )
  }
  const now = new Date().toISOString()
  const items: UnitRecord[] = DEFAULT_UNITS.map((u) => ({
    id: `unit_default_${u.code}`,
    code: u.code,
    name: u.name,
    nameKey: u.nameKey,
    active: true,
    storeId,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    updatedBy: null,
  }))
  // Preserve any custom rows already present
  const byKey = new Map(items.map((u) => [u.nameKey, u]))
  for (const existing of store.items) {
    byKey.set(existing.nameKey, existing)
  }
  writeStore({
    version: 1,
    seeded: true,
    items: [...byKey.values()],
  })
  return listLocalUnits()
}

export function listLocalUnits(): UnitRecord[] {
  const store = readStore()
  if (!store.seeded || store.items.length === 0) {
    return ensureDefaultUnits()
  }
  return [...store.items].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { sensitivity: "base" })
  )
}

export function getLocalUnit(id: string): UnitRecord | null {
  ensureDefaultUnits()
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalUnitByCode(code: string): UnitRecord | null {
  ensureDefaultUnits()
  const needle = normalizeNameKey(code)
  if (!needle) return null
  return (
    readStore().items.find(
      (item) => item.nameKey === needle || normalizeNameKey(item.code) === needle
    ) ?? null
  )
}

export function upsertLocalUnit(record: UnitRecord): UnitRecord {
  ensureDefaultUnits()
  const store = readStore()
  const code = record.code.trim()
  const next: UnitRecord = {
    ...record,
    code,
    name: (record.name || code).trim(),
    nameKey: normalizeNameKey(code),
  }
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore({ ...store, seeded: true })
  return next
}

export function replaceLocalUnits(items: UnitRecord[]) {
  writeStore({ version: 1, seeded: true, items })
}
