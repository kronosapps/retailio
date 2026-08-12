/**
 * Stock take (physical count) sessions — local offline-first store.
 * Posting applies variance as ADJUSTMENT_IN / ADJUSTMENT_OUT (+ lot updates).
 */

export type StockTakeLine = {
  sku: string
  productName: string
  systemQty: number
  countedQty: number
  /** counted − system */
  varianceQty: number
  notes: string | null
}

export type StockTakeStatus = "DRAFT" | "POSTED" | "CANCELLED"

export type StockTakeRecord = {
  id: string
  takeNumber: string
  status: StockTakeStatus
  countedAt: string
  notes: string | null
  lines: StockTakeLine[]
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  postedAt: string | null
}

export type CreateStockTakeInput = {
  countedAt?: string
  notes?: string | null
  lines: Array<{
    sku: string
    productName?: string
    systemQty: number
    countedQty: number
    notes?: string | null
  }>
  storeId?: string | null
  actorId?: string | null
}

const STORAGE_KEY = "retailos.stock_takes.v1"
const ST_PREFIX = "ST-"
const DAILY_PAD = 5

type StockTakeStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: StockTakeRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): StockTakeStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): StockTakeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<StockTakeStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeStockTake)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: StockTakeStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeStockTake(
  raw: StockTakeRecord | (Partial<StockTakeRecord> & { id: string })
): StockTakeRecord {
  const now = new Date().toISOString()
  const lines: StockTakeLine[] = Array.isArray(raw.lines)
    ? raw.lines.map((l) => {
        const systemQty = Math.max(0, Number(l.systemQty) || 0)
        const countedQty = Math.max(0, Number(l.countedQty) || 0)
        return {
          sku: (l.sku || "").trim().toUpperCase(),
          productName: (l.productName || l.sku || "").trim(),
          systemQty,
          countedQty,
          varianceQty:
            l.varianceQty != null
              ? Number(l.varianceQty)
              : countedQty - systemQty,
          notes: l.notes?.trim() || null,
        }
      })
    : []
  return {
    id: raw.id,
    takeNumber: raw.takeNumber || raw.id,
    status: raw.status || "DRAFT",
    countedAt: raw.countedAt || now,
    notes: raw.notes?.trim() || null,
    lines,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    postedAt: raw.postedAt ?? null,
  }
}

export function listLocalStockTakes(): StockTakeRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalStockTake(id: string): StockTakeRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalStockTake(
  record: StockTakeRecord
): StockTakeRecord {
  const store = readStore()
  const next = normalizeStockTake(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextStockTakeNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${ST_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}
