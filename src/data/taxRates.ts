/**
 * Editable GST / tax rate master (offline-first).
 * Seeds from common India slabs; products still store gstRate number.
 */

import { GST_SLAB_RATES } from "@/data/gstSettings"
import type { TaxRateRecord } from "@/modules/masterData/types"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"

const STORAGE_KEY = "retailos.tax_rates.v1"

type TaxRateStore = {
  version: 1
  seeded: boolean
  items: TaxRateRecord[]
}

function emptyStore(): TaxRateStore {
  return { version: 1, seeded: false, items: [] }
}

function rateKey(rate: number): string {
  return normalizeNameKey(String(rate))
}

function readStore(): TaxRateStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<TaxRateStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      seeded: Boolean(parsed.seeded),
      items: parsed.items as TaxRateRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: TaxRateStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function ensureDefaultTaxRates(
  storeId: string | null = null
): TaxRateRecord[] {
  const store = readStore()
  if (store.seeded && store.items.length > 0) {
    return [...store.items].sort((a, b) => a.ratePercent - b.ratePercent)
  }
  const now = new Date().toISOString()
  const items: TaxRateRecord[] = GST_SLAB_RATES.map((rate) => ({
    id: `tax_default_${rate}`,
    ratePercent: rate,
    label: rate === 0 ? "Nil (0%)" : `GST ${rate}%`,
    nameKey: rateKey(rate),
    active: true,
    storeId,
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    updatedBy: null,
  }))
  const byKey = new Map(items.map((r) => [r.nameKey, r]))
  for (const existing of store.items) {
    byKey.set(existing.nameKey, existing)
  }
  writeStore({ version: 1, seeded: true, items: [...byKey.values()] })
  return listLocalTaxRates()
}

export function listLocalTaxRates(): TaxRateRecord[] {
  const store = readStore()
  if (!store.seeded || store.items.length === 0) {
    return ensureDefaultTaxRates()
  }
  return [...store.items].sort((a, b) => a.ratePercent - b.ratePercent)
}

export function getLocalTaxRate(id: string): TaxRateRecord | null {
  ensureDefaultTaxRates()
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalTaxRateByPercent(rate: number): TaxRateRecord | null {
  ensureDefaultTaxRates()
  const needle = rateKey(rate)
  return readStore().items.find((item) => item.nameKey === needle) ?? null
}

export function upsertLocalTaxRate(record: TaxRateRecord): TaxRateRecord {
  ensureDefaultTaxRates()
  const store = readStore()
  const rate = Math.round(record.ratePercent * 100) / 100
  const next: TaxRateRecord = {
    ...record,
    ratePercent: rate,
    label: (record.label || `GST ${rate}%`).trim(),
    nameKey: rateKey(rate),
  }
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore({ ...store, seeded: true })
  return next
}
