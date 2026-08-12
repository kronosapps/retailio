/**
 * Coupon codes — local offline-first.
 */

import type { CouponRecord } from "@/modules/pricing/types"

const STORAGE_KEY = "retailos.coupons.v1"

type Store = { version: 1; items: CouponRecord[] }

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
        ? parsed.items.map(normalizeCoupon)
        : [],
    }
  } catch {
    return empty()
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeCoupon(
  raw: CouponRecord | (Partial<CouponRecord> & { id: string })
): CouponRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    code: (raw.code || "").trim().toUpperCase(),
    name: raw.name?.trim() || raw.code || "Coupon",
    active: raw.active !== false,
    discountType: raw.discountType === "FIXED" ? "FIXED" : "PERCENT",
    discountValue: Number(raw.discountValue) || 0,
    startsOn: raw.startsOn || now.slice(0, 10),
    endsOn: raw.endsOn || now.slice(0, 10),
    minSubtotalPaisa: Math.max(0, Math.round(Number(raw.minSubtotalPaisa) || 0)),
    maxRedemptions:
      raw.maxRedemptions == null
        ? null
        : Math.max(0, Math.floor(Number(raw.maxRedemptions) || 0)),
    redemptionCount: Math.max(0, Math.floor(Number(raw.redemptionCount) || 0)),
    notes: raw.notes?.trim() || null,
    segmentScope: Array.isArray((raw as Partial<CouponRecord>).segmentScope)
      ? ((raw as Partial<CouponRecord>).segmentScope || [])
          .map((s) => String(s).trim())
          .filter(Boolean)
      : [],
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
  }
}

export function listLocalCoupons(): CouponRecord[] {
  return [...read().items].sort((a, b) => a.code.localeCompare(b.code))
}

export function getLocalCoupon(id: string): CouponRecord | null {
  return read().items.find((i) => i.id === id) ?? null
}

export function getLocalCouponByCode(code: string): CouponRecord | null {
  const key = code.trim().toUpperCase()
  return read().items.find((i) => i.code === key) ?? null
}

export function upsertLocalCoupon(record: CouponRecord): CouponRecord {
  const store = read()
  const next = normalizeCoupon(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  write(store)
  return next
}

export const COUPONS_STORAGE_KEY = STORAGE_KEY
