/**
 * Purchase invoices (supplier bills / AP) — local offline-first store.
 * Stock is never applied from an invoice; only posted GRNs increase inventory.
 */

export type PurchaseInvoiceLine = {
  sku: string
  productName: string
  quantity: number
  unitCostPaisa: number
  lineTotalPaisa: number
  goodsReceiptId: string
}

export type PurchaseInvoiceStatus =
  | "DRAFT"
  | "POSTED"
  | "PARTIAL"
  | "PAID"
  | "CANCELLED"

export type PurchaseInvoiceRecord = {
  id: string
  /** Human-readable PIN-YYYYMMDD-##### */
  invoiceNumber: string
  supplierBillNumber: string | null
  supplierId: string
  supplierName: string
  goodsReceiptIds: string[]
  purchaseOrderId: string | null
  billDate: string
  dueAt: string | null
  notes: string | null
  lines: PurchaseInvoiceLine[]
  subtotalPaisa: number
  totalPaisa: number
  amountPaidPaisa: number
  /** Debit notes / purchase returns applied against this invoice. */
  amountCreditedPaisa: number
  status: PurchaseInvoiceStatus
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  postedAt: string | null
}

export type CreatePurchaseInvoiceInput = {
  supplierId: string
  supplierName: string
  goodsReceiptIds: string[]
  purchaseOrderId?: string | null
  supplierBillNumber?: string | null
  billDate?: string
  dueAt?: string | null
  notes?: string | null
  lines: Array<{
    sku: string
    productName?: string
    quantity: number
    unitCostPaisa: number
    goodsReceiptId: string
  }>
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.purchase_invoices.v1"
const PIN_PREFIX = "PIN-"
const DAILY_PAD = 5

type PurchaseInvoiceStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: PurchaseInvoiceRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): PurchaseInvoiceStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): PurchaseInvoiceStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<PurchaseInvoiceStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizePurchaseInvoice)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PurchaseInvoiceStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizePurchaseInvoice(
  raw: PurchaseInvoiceRecord | (Partial<PurchaseInvoiceRecord> & { id: string })
): PurchaseInvoiceRecord {
  const now = new Date().toISOString()
  const lines: PurchaseInvoiceLine[] = Array.isArray(raw.lines)
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
          goodsReceiptId: l.goodsReceiptId || "",
        }
      })
    : []
  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)
  return {
    id: raw.id,
    invoiceNumber: raw.invoiceNumber || raw.id,
    supplierBillNumber: raw.supplierBillNumber?.trim() || null,
    supplierId: raw.supplierId || "",
    supplierName: (raw.supplierName || "").trim() || "Supplier",
    goodsReceiptIds: Array.isArray(raw.goodsReceiptIds)
      ? raw.goodsReceiptIds.filter(Boolean)
      : [],
    purchaseOrderId: raw.purchaseOrderId ?? null,
    billDate: raw.billDate || raw.createdAt || now,
    dueAt: raw.dueAt ?? null,
    notes: raw.notes?.trim() || null,
    lines,
    subtotalPaisa: raw.subtotalPaisa != null ? Number(raw.subtotalPaisa) : subtotal,
    totalPaisa: raw.totalPaisa != null ? Number(raw.totalPaisa) : subtotal,
    amountPaidPaisa: Math.max(0, Number(raw.amountPaidPaisa) || 0),
    amountCreditedPaisa: Math.max(0, Number(raw.amountCreditedPaisa) || 0),
    status: raw.status || "DRAFT",
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    postedAt: raw.postedAt ?? null,
  }
}

export function listLocalPurchaseInvoices(): PurchaseInvoiceRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalPurchaseInvoice(
  id: string
): PurchaseInvoiceRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalPurchaseInvoice(
  record: PurchaseInvoiceRecord
): PurchaseInvoiceRecord {
  const store = readStore()
  const next = normalizePurchaseInvoice(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextPurchaseInvoiceNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${PIN_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

export function remainingPayablePaisa(inv: PurchaseInvoiceRecord): number {
  return Math.max(
    0,
    inv.totalPaisa - inv.amountPaidPaisa - (inv.amountCreditedPaisa || 0)
  )
}

export function deriveInvoicePaymentStatus(
  inv: Pick<
    PurchaseInvoiceRecord,
    "totalPaisa" | "amountPaidPaisa" | "amountCreditedPaisa" | "status"
  >
): PurchaseInvoiceStatus {
  if (inv.status === "DRAFT" || inv.status === "CANCELLED") return inv.status
  const settled =
    (inv.amountPaidPaisa || 0) + (inv.amountCreditedPaisa || 0)
  if (settled <= 0) return "POSTED"
  if (settled >= inv.totalPaisa) return "PAID"
  return "PARTIAL"
}
