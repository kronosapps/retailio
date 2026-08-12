/**
 * Customer credit notes — store credit from sales returns (no cash out).
 */

export type CreditNoteStatus = "OPEN" | "APPLIED" | "VOID"

export type CreditNoteRecord = {
  id: string
  creditNoteNumber: string
  customerId: string
  customerName: string
  invoiceId: string | null
  salesReturnId: string | null
  amountPaisa: number
  /** Remaining unused credit. */
  balancePaisa: number
  status: CreditNoteStatus
  reason: string | null
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  appliedAt: string | null
}

const STORAGE_KEY = "retailos.credit_notes.v1"
const CN_PREFIX = "CN-"
const DAILY_PAD = 5

type CreditNoteStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: CreditNoteRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): CreditNoteStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): CreditNoteStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<CreditNoteStore>
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeCreditNote)
        : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: CreditNoteStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function normalizeCreditNote(
  raw: CreditNoteRecord | (Partial<CreditNoteRecord> & { id: string })
): CreditNoteRecord {
  const now = new Date().toISOString()
  const amount = Math.max(0, Math.round(Number(raw.amountPaisa) || 0))
  const balance =
    raw.balancePaisa == null
      ? amount
      : Math.max(0, Math.round(Number(raw.balancePaisa) || 0))
  return {
    id: raw.id,
    creditNoteNumber: raw.creditNoteNumber || raw.id,
    customerId: raw.customerId || "",
    customerName: raw.customerName?.trim() || "Customer",
    invoiceId: raw.invoiceId ?? null,
    salesReturnId: raw.salesReturnId ?? null,
    amountPaisa: amount,
    balancePaisa: balance,
    status:
      raw.status === "APPLIED" || raw.status === "VOID" ? raw.status : "OPEN",
    reason: raw.reason?.trim() || null,
    storeId: raw.storeId ?? null,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || raw.createdAt || now,
    createdBy: raw.createdBy ?? null,
    appliedAt: raw.appliedAt ?? null,
  }
}

export function listLocalCreditNotes(): CreditNoteRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalCreditNote(id: string): CreditNoteRecord | null {
  return readStore().items.find((i) => i.id === id) ?? null
}

export function upsertLocalCreditNote(
  record: CreditNoteRecord
): CreditNoteRecord {
  const store = readStore()
  const next = normalizeCreditNote(record)
  const idx = store.items.findIndex((i) => i.id === next.id)
  if (idx >= 0) store.items[idx] = next
  else store.items.push(next)
  writeStore(store)
  return next
}

export function nextCreditNoteNumber(date = new Date()): string {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const seq = (store.sequencesByDate[dateKey] || 0) + 1
  store.sequencesByDate[dateKey] = seq
  writeStore(store)
  return `${CN_PREFIX}${dateKey}-${String(seq).padStart(DAILY_PAD, "0")}`
}

export const CREDIT_NOTES_STORAGE_KEY = STORAGE_KEY
