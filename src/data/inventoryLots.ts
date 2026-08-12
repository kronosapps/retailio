/**
 * Inventory lots / batches — FEFO-tracked qty per SKU.
 * Header InventoryRecord.quantity remains the cached on-hand total.
 */

export type InventoryLotSourceType =
  | "OPENING_STOCK"
  | "PURCHASE"
  | "ADJUSTMENT_IN"
  | "RETURN"
  | "LEGACY"

export type InventoryLotRecord = {
  id: string
  /** Human-readable LOT-YYYYMMDD-##### */
  lotNumber: string
  sku: string
  productName: string
  /** Remaining on-hand in this lot. */
  quantity: number
  initialQuantity: number
  /** YYYY-MM-DD or null if unknown / non-perishable. */
  expiryDate: string | null
  /** When the lot entered stock. */
  receivedAt: string
  batchCode: string | null
  sourceType: InventoryLotSourceType
  sourceId: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export type CreateInventoryLotInput = {
  sku: string
  productName: string
  quantity: number
  expiryDate?: string | null
  receivedAt?: string
  batchCode?: string | null
  sourceType: InventoryLotSourceType
  sourceId?: string | null
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.inventory.lots.v1"
const LOT_PREFIX = "LOT-"
const DAILY_PAD = 5

type LotStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: InventoryLotRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): LotStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): LotStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<LotStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeInventoryLot)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: LotStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeInventoryLot(
  raw: InventoryLotRecord | (Partial<InventoryLotRecord> & { id: string })
): InventoryLotRecord {
  const now = new Date().toISOString()
  const qty = Math.max(0, Number(raw.quantity) || 0)
  const initial = Math.max(
    qty,
    Number(raw.initialQuantity) || 0,
    qty
  )
  return {
    id: raw.id,
    lotNumber: raw.lotNumber || raw.id,
    sku: (raw.sku || "").trim().toUpperCase(),
    productName: (raw.productName || raw.sku || "").trim(),
    quantity: qty,
    initialQuantity: initial,
    expiryDate: raw.expiryDate?.slice(0, 10) || null,
    receivedAt: raw.receivedAt || now,
    batchCode: raw.batchCode?.trim() || null,
    sourceType: raw.sourceType || "LEGACY",
    sourceId: raw.sourceId ?? null,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
  }
}

export function listLocalInventoryLots(): InventoryLotRecord[] {
  return [...readStore().items].sort((a, b) =>
    a.sku.localeCompare(b.sku) ||
    (a.expiryDate || "9999").localeCompare(b.expiryDate || "9999") ||
    a.receivedAt.localeCompare(b.receivedAt)
  )
}

export function getLocalInventoryLot(id: string): InventoryLotRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function listLocalLotsBySku(sku: string): InventoryLotRecord[] {
  const key = sku.trim().toUpperCase()
  return listLocalInventoryLots().filter((l) => l.sku === key)
}

export function upsertLocalInventoryLot(
  record: InventoryLotRecord
): InventoryLotRecord {
  const store = readStore()
  const next = normalizeInventoryLot(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextLotNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${LOT_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

/** FEFO: earliest expiry first; null expiry last; then oldest received. */
export function sortLotsFefo(lots: InventoryLotRecord[]): InventoryLotRecord[] {
  return [...lots].sort((a, b) => {
    const ae = a.expiryDate || "9999-99-99"
    const be = b.expiryDate || "9999-99-99"
    if (ae !== be) return ae.localeCompare(be)
    return a.receivedAt.localeCompare(b.receivedAt)
  })
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
