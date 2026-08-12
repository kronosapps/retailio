/**
 * Sales returns — goods document (stock + settlement).
 * Settlement: REFUND (cash/UPI), CREDIT_NOTE (store credit), EXCHANGE (return + new sale).
 */

export type SalesReturnSettlement =
  | "REFUND"
  | "CREDIT_NOTE"
  | "EXCHANGE"

export type SalesReturnStatus = "DRAFT" | "POSTED" | "CANCELLED"

export type SalesReturnLine = {
  itemId: string
  sku: string | null
  name: string
  /** Qty originally sold on the invoice line. */
  soldQty: number
  /** Qty being returned now. */
  quantity: number
  unitPricePaisa: number
  lineTotalPaisa: number
}

/** Optional new product lines when settlement is EXCHANGE. */
export type ExchangeLine = {
  itemId: string
  sku: string | null
  name: string
  quantity: number
  unitPricePaisa: number
  lineTotalPaisa: number
}

export type SalesReturnRecord = {
  id: string
  returnNumber: string
  invoiceId: string
  status: SalesReturnStatus
  settlement: SalesReturnSettlement
  customerId: string | null
  customerName: string
  reason: string | null
  notes: string | null
  restock: boolean
  lines: SalesReturnLine[]
  /** New products taken in exchange (empty unless EXCHANGE). */
  exchangeLines: ExchangeLine[]
  subtotalPaisa: number
  gstPaisa: number
  totalPaisa: number
  /** Exchange sale total (new merchandise). */
  exchangeTotalPaisa: number
  /** exchangeTotal − returnTotal; >0 customer pays, <0 we refund/credit. */
  netDeltaPaisa: number
  refundId: string | null
  creditNoteId: string | null
  exchangeInvoiceId: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  postedAt: string | null
}

const STORAGE_KEY = "retailos.sales_returns.v1"
const SRN_PREFIX = "SRN-"
const DAILY_PAD = 5

type SalesReturnStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: SalesReturnRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): SalesReturnStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): SalesReturnStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<SalesReturnStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeSalesReturn)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: SalesReturnStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeSalesReturn(
  raw: SalesReturnRecord | (Partial<SalesReturnRecord> & { id: string })
): SalesReturnRecord {
  const now = new Date().toISOString()
  return {
    id: raw.id,
    returnNumber: raw.returnNumber || raw.id,
    invoiceId: raw.invoiceId || "",
    status:
      raw.status === "POSTED"
        ? "POSTED"
        : raw.status === "CANCELLED"
          ? "CANCELLED"
          : "DRAFT",
    settlement:
      raw.settlement === "CREDIT_NOTE" || raw.settlement === "EXCHANGE"
        ? raw.settlement
        : "REFUND",
    customerId: raw.customerId ?? null,
    customerName: raw.customerName?.trim() || "Walk-in",
    reason: raw.reason?.trim() || null,
    notes: raw.notes?.trim() || null,
    restock: raw.restock !== false,
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    exchangeLines: Array.isArray(raw.exchangeLines) ? raw.exchangeLines : [],
    subtotalPaisa: Math.max(0, Math.round(Number(raw.subtotalPaisa) || 0)),
    gstPaisa: Math.max(0, Math.round(Number(raw.gstPaisa) || 0)),
    totalPaisa: Math.max(0, Math.round(Number(raw.totalPaisa) || 0)),
    exchangeTotalPaisa: Math.max(
      0,
      Math.round(Number(raw.exchangeTotalPaisa) || 0)
    ),
    netDeltaPaisa: Math.round(Number(raw.netDeltaPaisa) || 0),
    refundId: raw.refundId ?? null,
    creditNoteId: raw.creditNoteId ?? null,
    exchangeInvoiceId: raw.exchangeInvoiceId ?? null,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    updatedBy: raw.updatedBy ?? null,
    postedAt: raw.postedAt ?? null,
  }
}

export function listLocalSalesReturns(): SalesReturnRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalSalesReturn(id: string): SalesReturnRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalSalesReturn(
  record: SalesReturnRecord
): SalesReturnRecord {
  const store = readStore()
  const next = normalizeSalesReturn(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextSalesReturnNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${SRN_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

export const SALES_RETURNS_STORAGE_KEY = STORAGE_KEY
