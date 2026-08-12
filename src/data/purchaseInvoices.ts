/**
 * Purchase invoices (supplier bills / AP) — local offline-first store.
 * Stock is never applied from an invoice; only posted GRNs increase inventory.
 * Unit costs are GST-exclusive; gstPaisa is input tax on the taxable subtotal.
 */

import { percentOfPaisa, roundPaisa } from "@/lib/money"

export type PurchaseInvoiceLine = {
  sku: string
  productName: string
  quantity: number
  unitCostPaisa: number
  /** Taxable line value (qty × unit cost). */
  lineTotalPaisa: number
  /** GST % applied to this line (exclusive). */
  gstRate: number
  gstPaisa: number
  /** Empty string for bill-only (no GRN) lines. */
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
  /** Sum of taxable line totals. */
  subtotalPaisa: number
  gstPaisa: number
  cgstPaisa: number
  sgstPaisa: number
  /** subtotal + gst (AP amount). */
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
    gstRate?: number
    goodsReceiptId?: string
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

/** Build taxable + GST amounts for one exclusive-GST line. */
export function buildPurchaseLineAmounts(input: {
  quantity: number
  unitCostPaisa: number
  gstRate?: number
}): { lineTotalPaisa: number; gstRate: number; gstPaisa: number } {
  const qty = Math.max(0, Number(input.quantity) || 0)
  const unit = Math.max(0, Math.round(Number(input.unitCostPaisa) || 0))
  const gstRate = Math.max(0, Number(input.gstRate) || 0)
  const lineTotalPaisa = Math.round(qty * unit)
  const gstPaisa = percentOfPaisa(lineTotalPaisa, gstRate)
  return { lineTotalPaisa, gstRate, gstPaisa }
}

export function splitPurchaseGst(gstPaisa: number): {
  cgstPaisa: number
  sgstPaisa: number
} {
  const gst = Math.max(0, roundPaisa(gstPaisa))
  const cgstPaisa = Math.floor(gst / 2)
  return { cgstPaisa, sgstPaisa: gst - cgstPaisa }
}

export function normalizePurchaseInvoice(
  raw: PurchaseInvoiceRecord | (Partial<PurchaseInvoiceRecord> & { id: string })
): PurchaseInvoiceRecord {
  const now = new Date().toISOString()
  const lines: PurchaseInvoiceLine[] = Array.isArray(raw.lines)
    ? raw.lines.map((l) => {
        const qty = Math.max(0, Number(l.quantity) || 0)
        const unit = Math.max(0, Math.round(Number(l.unitCostPaisa) || 0))
        const built = buildPurchaseLineAmounts({
          quantity: qty,
          unitCostPaisa: unit,
          gstRate: l.gstRate,
        })
        const lineTotalPaisa =
          l.lineTotalPaisa != null
            ? Math.max(0, Math.round(Number(l.lineTotalPaisa) || 0))
            : built.lineTotalPaisa
        const gstRate = Math.max(0, Number(l.gstRate) || 0)
        const gstPaisa =
          l.gstPaisa != null
            ? Math.max(0, Math.round(Number(l.gstPaisa) || 0))
            : percentOfPaisa(lineTotalPaisa, gstRate)
        return {
          sku: (l.sku || "").trim().toUpperCase(),
          productName: (l.productName || l.sku || "").trim(),
          quantity: qty,
          unitCostPaisa: unit,
          lineTotalPaisa,
          gstRate,
          gstPaisa,
          goodsReceiptId: l.goodsReceiptId || "",
        }
      })
    : []
  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)
  const gstFromLines = lines.reduce((s, l) => s + l.gstPaisa, 0)
  const gstPaisa =
    raw.gstPaisa != null ? Math.max(0, Number(raw.gstPaisa) || 0) : gstFromLines
  const split =
    raw.cgstPaisa != null && raw.sgstPaisa != null
      ? {
          cgstPaisa: Math.max(0, Number(raw.cgstPaisa) || 0),
          sgstPaisa: Math.max(0, Number(raw.sgstPaisa) || 0),
        }
      : splitPurchaseGst(gstPaisa)
  const subtotalPaisa =
    raw.subtotalPaisa != null ? Number(raw.subtotalPaisa) : subtotal
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
    subtotalPaisa,
    gstPaisa,
    cgstPaisa: split.cgstPaisa,
    sgstPaisa: split.sgstPaisa,
    totalPaisa:
      raw.totalPaisa != null
        ? Number(raw.totalPaisa)
        : subtotalPaisa + gstPaisa,
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
