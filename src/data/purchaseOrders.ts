/**
 * Purchase Orders — local offline-first store.
 * Stock is never applied from a PO; only posted GRNs increase inventory.
 */

export type PurchaseOrderLine = {
  sku: string
  productName: string
  quantityOrdered: number
  quantityReceived: number
  unitCostRupees: number | null
  notes: string | null
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIAL"
  | "RECEIVED"
  | "CANCELLED"

export type PurchaseOrderRecord = {
  id: string
  /** Human-readable PO-YYYYMMDD-##### */
  poNumber: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  orderedAt: string | null
  expectedAt: string | null
  notes: string | null
  lines: PurchaseOrderLine[]
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  issuedAt: string | null
  cancelledAt: string | null
}

export type CreatePurchaseOrderInput = {
  supplierId: string
  supplierName: string
  expectedAt?: string | null
  notes?: string | null
  lines: Array<{
    sku: string
    productName?: string
    quantityOrdered: number
    unitCostRupees?: number | null
    notes?: string | null
  }>
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.purchase_orders.v1"
const PO_PREFIX = "PO-"
const DAILY_PAD = 5

type PurchaseOrderStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: PurchaseOrderRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): PurchaseOrderStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): PurchaseOrderStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<PurchaseOrderStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizePurchaseOrder)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: PurchaseOrderStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizePurchaseOrder(
  raw: PurchaseOrderRecord | (Partial<PurchaseOrderRecord> & { id: string })
): PurchaseOrderRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    poNumber: raw.poNumber || raw.id,
    supplierId: raw.supplierId || "",
    supplierName: (raw.supplierName || "").trim() || "Supplier",
    status: raw.status || "DRAFT",
    orderedAt: raw.orderedAt ?? null,
    expectedAt: raw.expectedAt ?? null,
    notes: raw.notes?.trim() || null,
    lines: Array.isArray(raw.lines)
      ? raw.lines.map((l) => ({
          sku: (l.sku || "").trim().toUpperCase(),
          productName: (l.productName || l.sku || "").trim(),
          quantityOrdered: Math.max(0, Number(l.quantityOrdered) || 0),
          quantityReceived: Math.max(0, Number(l.quantityReceived) || 0),
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
    issuedAt: raw.issuedAt ?? null,
    cancelledAt: raw.cancelledAt ?? null,
  }
}

export function listLocalPurchaseOrders(): PurchaseOrderRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalPurchaseOrder(id: string): PurchaseOrderRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalPurchaseOrder(
  record: PurchaseOrderRecord
): PurchaseOrderRecord {
  const store = readStore()
  const next = normalizePurchaseOrder(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextPoNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${PO_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

export function remainingQty(line: PurchaseOrderLine): number {
  return Math.max(0, line.quantityOrdered - line.quantityReceived)
}

export function derivePoStatus(
  lines: PurchaseOrderLine[],
  current: PurchaseOrderStatus
): PurchaseOrderStatus {
  if (current === "DRAFT" || current === "CANCELLED") return current
  if (!lines.length) return current
  const anyReceived = lines.some((l) => l.quantityReceived > 0)
  const allReceived = lines.every(
    (l) => l.quantityReceived >= l.quantityOrdered
  )
  if (allReceived) return "RECEIVED"
  if (anyReceived) return "PARTIAL"
  return "ISSUED"
}
