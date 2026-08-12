/**
 * Supplier payments against purchase invoices — local offline-first store.
 */

export type SupplierPaymentMethod = "Cash" | "UPI"

export type SupplierPaymentRecord = {
  id: string
  /** Human-readable SPAY-YYYYMMDD-##### */
  paymentNumber: string
  supplierId: string
  supplierName: string
  purchaseInvoiceId: string
  invoiceNumber: string
  amountPaisa: number
  method: SupplierPaymentMethod
  status: "Paid"
  paidAt: string
  notes: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export type CreateSupplierPaymentInput = {
  supplierId: string
  supplierName: string
  purchaseInvoiceId: string
  invoiceNumber: string
  amountPaisa: number
  method: SupplierPaymentMethod
  paidAt?: string
  notes?: string | null
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.supplier_payments.v1"
const SPAY_PREFIX = "SPAY-"
const DAILY_PAD = 5

type SupplierPaymentStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: SupplierPaymentRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): SupplierPaymentStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): SupplierPaymentStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<SupplierPaymentStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeSupplierPayment)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: SupplierPaymentStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeSupplierPayment(
  raw: SupplierPaymentRecord | (Partial<SupplierPaymentRecord> & { id: string })
): SupplierPaymentRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    paymentNumber: raw.paymentNumber || raw.id,
    supplierId: raw.supplierId || "",
    supplierName: (raw.supplierName || "").trim() || "Supplier",
    purchaseInvoiceId: raw.purchaseInvoiceId || "",
    invoiceNumber: raw.invoiceNumber || "",
    amountPaisa: Math.max(0, Math.round(Number(raw.amountPaisa) || 0)),
    method: raw.method === "Cash" ? "Cash" : "UPI",
    status: "Paid",
    paidAt: raw.paidAt || raw.createdAt || now,
    notes: raw.notes?.trim() || null,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
  }
}

export function listLocalSupplierPayments(): SupplierPaymentRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.paidAt.localeCompare(a.paidAt)
  )
}

export function getLocalSupplierPayment(
  id: string
): SupplierPaymentRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalSupplierPayment(
  record: SupplierPaymentRecord
): SupplierPaymentRecord {
  const store = readStore()
  const next = normalizeSupplierPayment(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextSupplierPaymentNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${SPAY_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}
