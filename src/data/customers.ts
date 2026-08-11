/**
 * Local customer persistence (offline-first).
 * Firestore + Sheets sync happens via CustomerRepository after writes.
 */

export type CustomerRecord = {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string
  /** Optional GSTIN for B2B classification (statutory scaffold). */
  gstin?: string
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  /** Lifetime spend in paisa (best-effort; updated on paid sales). */
  totalSpendPaisa: number
  visitCount: number
  lastPurchaseAt: string | null
}

const STORAGE_KEY = "retailos.customers.v1"

export type CreateCustomerInput = {
  name: string
  phone?: string
  email?: string
  notes?: string
  storeId?: string | null
  createdBy?: string | null
}

type CustomerStore = {
  version: 1
  items: CustomerRecord[]
}

function emptyStore(): CustomerStore {
  return { version: 1, items: [] }
}

function readStore(): CustomerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<CustomerStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      items: parsed.items.map(normalizeCustomer),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CustomerStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function normalizeCustomer(raw: CustomerRecord): CustomerRecord {
  return {
    ...raw,
    name: raw.name?.trim() || "Customer",
    phone: raw.phone?.trim() || undefined,
    email: raw.email?.trim() || undefined,
    notes: raw.notes?.trim() || undefined,
    gstin: raw.gstin?.trim().toUpperCase() || undefined,
    storeId: raw.storeId ?? null,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    totalSpendPaisa: Number.isFinite(raw.totalSpendPaisa)
      ? raw.totalSpendPaisa
      : 0,
    visitCount: Number.isFinite(raw.visitCount) ? raw.visitCount : 0,
    lastPurchaseAt: raw.lastPurchaseAt ?? null,
  }
}

/** Digits-only phone; prefers last 10 digits for IN mobiles. */
export function normalizeCustomerPhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 8) return null
  if (digits.length >= 10) return digits.slice(-10)
  return digits
}

export function isWalkInName(name?: string | null): boolean {
  const n = (name || "").trim().toLowerCase()
  return !n || n === "walk-in" || n === "walkin" || n === "guest"
}

export function listLocalCustomers(): CustomerRecord[] {
  return [...readStore().items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
}

export function getLocalCustomer(id: string): CustomerRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalCustomerByPhone(
  phone: string,
  storeId?: string | null
): CustomerRecord | null {
  const normalized = normalizeCustomerPhone(phone)
  if (!normalized) return null
  return (
    readStore().items.find((item) => {
      const itemPhone = normalizeCustomerPhone(item.phone)
      if (itemPhone !== normalized) return false
      if (!storeId) return true
      return !item.storeId || item.storeId === storeId
    }) ?? null
  )
}

export function findLocalCustomerByName(
  name: string,
  storeId?: string | null
): CustomerRecord | null {
  const key = name.trim().toLowerCase()
  if (!key || isWalkInName(key)) return null
  return (
    readStore().items.find((item) => {
      if (item.name.trim().toLowerCase() !== key) return false
      if (!storeId) return true
      return !item.storeId || item.storeId === storeId
    }) ?? null
  )
}

/** Prefix / contains search for POS checkout autofill (name or phone digits). */
export function searchLocalCustomers(
  query: string,
  storeId?: string | null,
  limit = 8
): CustomerRecord[] {
  const raw = query.trim()
  if (!raw || isWalkInName(raw)) return []

  const digits = raw.replace(/\D/g, "")
  const nameKey = raw.toLowerCase()

  const matches = readStore().items.filter((item) => {
    if (storeId && item.storeId && item.storeId !== storeId) return false
    if (digits.length >= 3) {
      const phone = normalizeCustomerPhone(item.phone) || ""
      const phoneRaw = (item.phone || "").replace(/\D/g, "")
      if (phone.includes(digits) || phoneRaw.includes(digits)) return true
    }
    return item.name.toLowerCase().includes(nameKey)
  })

  return matches
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
    .slice(0, limit)
}

export function upsertLocalCustomer(record: CustomerRecord): CustomerRecord {
  const store = readStore()
  const next = normalizeCustomer(record)
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function deleteLocalCustomer(id: string): CustomerRecord | null {
  const store = readStore()
  const existing = store.items.find((item) => item.id === id) ?? null
  if (!existing) return null
  store.items = store.items.filter((item) => item.id !== id)
  writeStore(store)
  return existing
}

export function buildCustomerRecord(
  input: CreateCustomerInput,
  id: string
): CustomerRecord {
  const now = new Date().toISOString()
  const phone = normalizeCustomerPhone(input.phone) ?? undefined
  return {
    id,
    name: input.name.trim() || "Customer",
    phone,
    email: input.email?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    storeId: input.storeId ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
    totalSpendPaisa: 0,
    visitCount: 0,
    lastPurchaseAt: null,
  }
}
