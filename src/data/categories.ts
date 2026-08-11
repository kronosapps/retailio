/**
 * Local product categories (offline-first).
 * Products still store category as a display name string for POS/Sheets compat.
 */

import type { CategoryRecord } from "@/modules/inventory/types"

const STORAGE_KEY = "retailos.categories.v1"

type CategoryStore = {
  version: 1
  items: CategoryRecord[]
}

function emptyStore(): CategoryStore {
  return { version: 1, items: [] }
}

function readStore(): CategoryStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<CategoryStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return { version: 1, items: parsed.items as CategoryRecord[] }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CategoryStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalCategories(): CategoryRecord[] {
  return [...readStore().items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
}

export function getLocalCategory(id: string): CategoryRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalCategoryByName(name: string): CategoryRecord | null {
  const needle = name.trim().toLowerCase()
  return (
    readStore().items.find((item) => item.name.trim().toLowerCase() === needle) ??
    null
  )
}

export function upsertLocalCategory(record: CategoryRecord): CategoryRecord {
  const store = readStore()
  const index = store.items.findIndex((item) => item.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function replaceLocalCategories(items: CategoryRecord[]) {
  writeStore({ version: 1, items })
}
