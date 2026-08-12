/**
 * Goods Received Notes — local offline-first store.
 * Stock is applied only when a GRN is posted (via PurchaseReceivingService).
 */

export type GoodsReceiptLine = {
  sku: string
  productName: string
  quantity: number
  /** Optional unit cost in rupees (for later invoice matching). */
  unitCostRupees: number | null
  notes: string | null
}

export type GoodsReceiptStatus = "DRAFT" | "POSTED" | "CANCELLED"

export type GoodsReceiptRecord = {
  id: string
  /** Human-readable GRN-YYYYMMDD-##### */
  grnNumber: string
  supplierId: string
  supplierName: string
  /** Null for ad-hoc receipts (no PO yet). */
  purchaseOrderId: string | null
  status: GoodsReceiptStatus
  receivedAt: string
  notes: string | null
  lines: GoodsReceiptLine[]
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  postedAt: string | null
}

export type CreateGoodsReceiptInput = {
  supplierId: string
  supplierName: string
  purchaseOrderId?: string | null
  receivedAt?: string
  notes?: string | null
  lines: Array<{
    sku: string
    productName?: string
    quantity: number
    unitCostRupees?: number | null
    notes?: string | null
  }>
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.goods_receipts.v1"
const GRN_PREFIX = "GRN-"
const DAILY_PAD = 5

type GoodsReceiptStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: GoodsReceiptRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): GoodsReceiptStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): GoodsReceiptStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<GoodsReceiptStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeGoodsReceipt)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: GoodsReceiptStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeGoodsReceipt(
  raw: GoodsReceiptRecord | (Partial<GoodsReceiptRecord> & { id: string })
): GoodsReceiptRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    grnNumber: raw.grnNumber || raw.id,
    supplierId: raw.supplierId || "",
    supplierName: (raw.supplierName || "").trim() || "Supplier",
    purchaseOrderId: raw.purchaseOrderId ?? null,
    status: raw.status || "DRAFT",
    receivedAt: raw.receivedAt || now,
    notes: raw.notes?.trim() || null,
    lines: Array.isArray(raw.lines)
      ? raw.lines.map((l) => ({
          sku: (l.sku || "").trim().toUpperCase(),
          productName: (l.productName || l.sku || "").trim(),
          quantity: Number(l.quantity) || 0,
          unitCostRupees:
            l.unitCostRupees == null || !Number.isFinite(Number(l.unitCostRupees))
              ? null
              : Number(l.unitCostRupees),
          notes: l.notes?.trim() || null,
        }))
      : [],
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    postedAt: raw.postedAt ?? null,
  }
}

export function listLocalGoodsReceipts(): GoodsReceiptRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalGoodsReceipt(id: string): GoodsReceiptRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalGoodsReceipt(
  record: GoodsReceiptRecord
): GoodsReceiptRecord {
  const store = readStore()
  const next = normalizeGoodsReceipt(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextGrnNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${GRN_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}
