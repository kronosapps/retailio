/**
 * Local supplier persistence (offline-first).
 * Firestore + Sheets sync happens via SupplierRepository after writes.
 */

import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"

export type SupplierRecord = {
  id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  pin?: string
  /** e.g. Net 15 / Net 30 / COD */
  paymentTerms?: string
  notes?: string
  active: boolean
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export type CreateSupplierInput = {
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  city?: string
  state?: string
  pin?: string
  paymentTerms?: string
  notes?: string
  active?: boolean
  storeId?: string | null
  createdBy?: string | null
}

export type UpdateSupplierInput = {
  id: string
  name?: string
  phone?: string | null
  email?: string | null
  gstin?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pin?: string | null
  paymentTerms?: string | null
  notes?: string | null
  active?: boolean
  actorId?: string | null
}

const STORAGE_KEY = "retailos.suppliers.v1"

type SupplierStore = {
  version: 1
  items: SupplierRecord[]
}

function emptyStore(): SupplierStore {
  return { version: 1, items: [] }
}

function readStore(): SupplierStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<SupplierStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      items: parsed.items.map(normalizeSupplier),
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: SupplierStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeSupplier(
  raw: SupplierRecord | (Partial<SupplierRecord> & { id: string; name: string })
): SupplierRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    name: (raw.name || "").trim() || "Supplier",
    phone: raw.phone?.trim() || undefined,
    email: raw.email?.trim() || undefined,
    gstin: raw.gstin?.trim().toUpperCase() || undefined,
    address: raw.address?.trim() || undefined,
    city: raw.city?.trim() || undefined,
    state: raw.state?.trim() || undefined,
    pin: raw.pin?.trim() || undefined,
    paymentTerms: raw.paymentTerms?.trim() || undefined,
    notes: raw.notes?.trim() || undefined,
    active: raw.active !== false,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
  }
}

export function listLocalSuppliers(options?: {
  includeInactive?: boolean
}): SupplierRecord[] {
  const includeInactive = options?.includeInactive ?? true
  return [...readStore().items]
    .filter((s) => includeInactive || s.active)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
}

export function getLocalSupplier(id: string): SupplierRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalSupplierByName(name: string): SupplierRecord | null {
  const needle = normalizeNameKey(name)
  if (!needle) return null
  return (
    readStore().items.find(
      (item) => normalizeNameKey(item.name) === needle
    ) ?? null
  )
}

export function upsertLocalSupplier(record: SupplierRecord): SupplierRecord {
  const store = readStore()
  const next = normalizeSupplier(record)
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function deleteLocalSupplier(id: string): SupplierRecord | null {
  const store = readStore()
  const existing = store.items.find((item) => item.id === id) ?? null
  if (!existing) return null
  store.items = store.items.filter((item) => item.id !== id)
  writeStore(store)
  return existing
}

export function buildSupplierRecord(
  input: CreateSupplierInput,
  id: string
): SupplierRecord {
  const now = new Date().toISOString()
  return normalizeSupplier({
    id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    gstin: input.gstin,
    address: input.address,
    city: input.city,
    state: input.state,
    pin: input.pin,
    paymentTerms: input.paymentTerms,
    notes: input.notes,
    active: input.active ?? true,
    storeId: input.storeId ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
  })
}

export function searchLocalSuppliers(
  query: string,
  storeId?: string | null,
  limit = 20
): SupplierRecord[] {
  const raw = query.trim().toLowerCase()
  const items = listLocalSuppliers({ includeInactive: false })
  const filtered = items.filter((item) => {
    if (storeId && item.storeId && item.storeId !== storeId) return false
    if (!raw) return true
    return (
      item.name.toLowerCase().includes(raw) ||
      (item.phone || "").includes(raw) ||
      (item.email || "").toLowerCase().includes(raw) ||
      (item.gstin || "").toLowerCase().includes(raw)
    )
  })
  return filtered.slice(0, limit)
}
