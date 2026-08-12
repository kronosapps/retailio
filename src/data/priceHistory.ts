/**
 * Append-only product sell-price history.
 */

import type { PriceHistoryRecord } from "@/modules/pricing/types"

const STORAGE_KEY = "retailos.price_history.v1"

type Store = { version: 1; items: PriceHistoryRecord[] }

function empty(): Store {
  return { version: 1, items: [] }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Store>
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listLocalPriceHistory(sku?: string): PriceHistoryRecord[] {
  const items = [...read().items].sort((a, b) =>
    b.changedAt.localeCompare(a.changedAt)
  )
  if (!sku) return items
  const key = sku.trim().toUpperCase()
  return items.filter((i) => i.sku === key)
}

export function appendLocalPriceHistory(
  record: PriceHistoryRecord
): PriceHistoryRecord {
  const store = read()
  const idx = store.items.findIndex((i) => i.id === record.id)
  if (idx >= 0) store.items[idx] = record
  else store.items.push(record)
  write({ version: 1, items: store.items.slice(-2000) })
  return record
}

export const PRICE_HISTORY_STORAGE_KEY = STORAGE_KEY
