/**
 * Payment method master — enables/labels tenders for POS & expenses.
 * Codes stay aligned with PaymentMethod union for posting/banking.
 */

import type { PaymentMethodRecord } from "@/modules/masterData/types"
import { normalizeNameKey } from "@/modules/masterData/normalizeNameKey"

const STORAGE_KEY = "retailos.payment_methods.v1"

const DEFAULTS: Omit<
  PaymentMethodRecord,
  "createdAt" | "updatedAt" | "storeId"
>[] = [
  {
    id: "pm_cash",
    code: "Cash",
    label: "Cash",
    nameKey: "cash",
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "pm_upi",
    code: "UPI",
    label: "UPI",
    nameKey: "upi",
    enabled: true,
    sortOrder: 20,
  },
  {
    id: "pm_onaccount",
    code: "OnAccount",
    label: "On account",
    nameKey: "onaccount",
    enabled: true,
    sortOrder: 30,
  },
]

type PaymentMethodStore = {
  version: 1
  seeded: boolean
  items: PaymentMethodRecord[]
}

function emptyStore(): PaymentMethodStore {
  return { version: 1, seeded: false, items: [] }
}

function readStore(): PaymentMethodStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<PaymentMethodStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      seeded: Boolean(parsed.seeded),
      items: parsed.items as PaymentMethodRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PaymentMethodStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function ensureDefaultPaymentMethods(
  storeId: string | null = null
): PaymentMethodRecord[] {
  const store = readStore()
  if (store.seeded && store.items.length > 0) {
    return [...store.items].sort((a, b) => a.sortOrder - b.sortOrder)
  }
  const now = new Date().toISOString()
  const items: PaymentMethodRecord[] = DEFAULTS.map((row) => ({
    ...row,
    storeId,
    createdAt: now,
    updatedAt: now,
  }))
  writeStore({ version: 1, seeded: true, items })
  return listLocalPaymentMethods()
}

export function listLocalPaymentMethods(): PaymentMethodRecord[] {
  const store = readStore()
  if (!store.seeded || store.items.length === 0) {
    return ensureDefaultPaymentMethods()
  }
  return [...store.items].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getLocalPaymentMethod(id: string): PaymentMethodRecord | null {
  ensureDefaultPaymentMethods()
  return readStore().items.find((item) => item.id === id) ?? null
}

export function findLocalPaymentMethodByCode(
  code: string
): PaymentMethodRecord | null {
  ensureDefaultPaymentMethods()
  const needle = normalizeNameKey(code)
  return (
    readStore().items.find((item) => item.nameKey === needle) ?? null
  )
}

export function upsertLocalPaymentMethod(
  record: PaymentMethodRecord
): PaymentMethodRecord {
  ensureDefaultPaymentMethods()
  const store = readStore()
  const next: PaymentMethodRecord = {
    ...record,
    code: record.code.trim(),
    label: record.label.trim() || record.code.trim(),
    nameKey: normalizeNameKey(record.code),
    updatedAt: new Date().toISOString(),
  }
  const index = store.items.findIndex((item) => item.id === next.id)
  if (index >= 0) store.items[index] = next
  else store.items.push(next)
  writeStore({ ...store, seeded: true })
  return next
}
