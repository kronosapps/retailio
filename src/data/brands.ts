/**
 * Local brand master (offline-first).
 * Products still store brand as a display string for POS/Sheets compat.
 */

import type { BrandRecord } from "@/modules/masterData/types"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"

const STORAGE_KEY = "retailos.brands.v1"

type BrandStore = {
  version: 1
  items: BrandRecord[]
}

function emptyStore(): BrandStore {
  return { version: 1, items: [] }
}

function readStore(): BrandStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<BrandStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      items: parsed.items.map((row) => ({
        ...row,
        nameKey: row.nameKey || normalizeNameKey(row.name || ""),
      })) as BrandRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: BrandStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalBrands(): BrandRecord[] {
  return [...readStore().items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
}

export function getLocalBrand(id: string): BrandRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalBrandByName(name: string): BrandRecord | null {
  const needle = normalizeNameKey(name)
  if (!needle) return null
  return (
    readStore().items.find((item) => item.nameKey === needle) ?? null
  )
}

export function upsertLocalBrand(record: BrandRecord): BrandRecord {
  const store = readStore()
  const next: BrandRecord = {
    ...record,
    name: record.name.trim(),
    nameKey: normalizeNameKey(record.name),
  }
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function replaceLocalBrands(items: BrandRecord[]) {
  writeStore({ version: 1, items })
}
