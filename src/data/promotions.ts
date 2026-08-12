/**
 * Promotional prices — local offline-first.
 */

import type { PromotionRecord } from "@/modules/pricing/types"

const STORAGE_KEY = "retailos.promotions.v1"

type Store = { version: 1; items: PromotionRecord[] }

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
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizePromotion)
        : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizePromotion(
  raw: PromotionRecord | (Partial<PromotionRecord> & { id: string })
): PromotionRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    name: raw.name?.trim() || "Promotion",
    active: raw.active !== false,
    discountType: raw.discountType === "FIXED" ? "FIXED" : "PERCENT",
    discountValue: Number(raw.discountValue) || 0,
    startsOn: raw.startsOn || now.slice(0, 10),
    endsOn: raw.endsOn || now.slice(0, 10),
    skuScope: Array.isArray(raw.skuScope)
      ? raw.skuScope.map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [],
    categoryScope: Array.isArray(raw.categoryScope)
      ? raw.categoryScope.map((c) => c.trim()).filter(Boolean)
      : [],
    priority: Number.isFinite(raw.priority) ? Number(raw.priority) : 100,
    notes: raw.notes?.trim() || null,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
  }
}

export function listLocalPromotions(): PromotionRecord[] {
  return [...read().items].sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name)
  )
}

export function getLocalPromotion(id: string): PromotionRecord | null {
  return read().items.find((i) => i.id === id) ?? null
}

export function upsertLocalPromotion(record: PromotionRecord): PromotionRecord {
  const store = read()
  const next = normalizePromotion(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  write(store)
  return next
}

export function removeLocalPromotion(id: string): void {
  const store = read()
  store.items = store.items.filter((i) => i.id !== id)
  write(store)
}

export const PROMOTIONS_STORAGE_KEY = STORAGE_KEY
