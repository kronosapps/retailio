/**
 * Purchase returns (RTV / debit notes) — local offline-first store.
 * Stock is removed and AP credited only when a return is posted.
 */

export type PurchaseReturnLine = {
  sku: string
  productName: string
  quantity: number
  unitCostPaisa: number
  lineTotalPaisa: number
}

export type PurchaseReturnStatus = "DRAFT" | "POSTED" | "CANCELLED"

export type PurchaseReturnRecord = {
  id: string
  /** Human-readable PRN-YYYYMMDD-##### */
  returnNumber: string
  supplierId: string
  supplierName: string
  /** Source GRN when returning against goods received. */
  goodsReceiptId: string | null
  grnNumber: string | null
  /** Source invoice when posting a debit note against AP. */
  purchaseInvoiceId: string | null
  invoiceNumber: string | null
  status: PurchaseReturnStatus
  returnedAt: string
  reason: string | null
  notes: string | null
  lines: PurchaseReturnLine[]
  subtotalPaisa: number
  totalPaisa: number
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  postedAt: string | null
}

export type CreatePurchaseReturnInput = {
  supplierId: string
  supplierName: string
  goodsReceiptId?: string | null
  grnNumber?: string | null
  purchaseInvoiceId?: string | null
  invoiceNumber?: string | null
  returnedAt?: string
  reason?: string | null
  notes?: string | null
  lines: Array<{
    sku: string
    productName?: string
    quantity: number
    unitCostPaisa: number
  }>
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.purchase_returns.v1"
const PRN_PREFIX = "PRN-"
const DAILY_PAD = 5

type PurchaseReturnStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: PurchaseReturnRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): PurchaseReturnStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): PurchaseReturnStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<PurchaseReturnStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizePurchaseReturn)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PurchaseReturnStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizePurchaseReturn(
  raw: PurchaseReturnRecord | (Partial<PurchaseReturnRecord> & { id: string })
): PurchaseReturnRecord {
  const now = new Date().toISOString()
  const lines: PurchaseReturnLine[] = Array.isArray(raw.lines)
    ? raw.lines.map((l) => {
        const qty = Math.max(0, Number(l.quantity) || 0)
        const unit = Math.max(0, Math.round(Number(l.unitCostPaisa) || 0))
        return {
          sku: (l.sku || "").trim().toUpperCase(),
          productName: (l.productName || l.sku || "").trim(),
          quantity: qty,
          unitCostPaisa: unit,
          lineTotalPaisa:
            l.lineTotalPaisa != null
              ? Math.max(0, Math.round(Number(l.lineTotalPaisa) || 0))
              : Math.round(qty * unit),
        }
      })
    : []
  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)
  return {
    id: raw.id,
    returnNumber: raw.returnNumber || raw.id,
    supplierId: raw.supplierId || "",
    supplierName: (raw.supplierName || "").trim() || "Supplier",
    goodsReceiptId: raw.goodsReceiptId ?? null,
    grnNumber: raw.grnNumber?.trim() || null,
    purchaseInvoiceId: raw.purchaseInvoiceId ?? null,
    invoiceNumber: raw.invoiceNumber?.trim() || null,
    status: raw.status || "DRAFT",
    returnedAt: raw.returnedAt || now,
    reason: raw.reason?.trim() || null,
    notes: raw.notes?.trim() || null,
    lines,
    subtotalPaisa: raw.subtotalPaisa != null ? Number(raw.subtotalPaisa) : subtotal,
    totalPaisa: raw.totalPaisa != null ? Number(raw.totalPaisa) : subtotal,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    postedAt: raw.postedAt ?? null,
  }
}

export function listLocalPurchaseReturns(): PurchaseReturnRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalPurchaseReturn(id: string): PurchaseReturnRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalPurchaseReturn(
  record: PurchaseReturnRecord
): PurchaseReturnRecord {
  const store = readStore()
  const next = normalizePurchaseReturn(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextPurchaseReturnNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${PRN_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}
