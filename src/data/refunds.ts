/**
 * Local refund persistence (offline-first).
 * Firestore + Sheets sync happens via RefundRepository after writes.
 */

import type { PaymentMethod } from "@/modules/payment/types"

export type RefundStatus = "Completed" | "Cancelled"

export type RefundLine = {
  itemId: string
  name: string
  weight: string
  qty: number
}

export type RefundRecord = {
  id: string
  /** Human-readable REF-YYYYMMDD-##### */
  refundId: string
  invoiceId: string
  paymentId: string | null
  customerId: string | null
  customerName: string
  amountPaisa: number
  amount: number
  method: PaymentMethod
  reason: string
  restock: boolean
  restockedSkuCount: number
  status: RefundStatus
  storeId: string | null
  lines: RefundLine[]
  createdAt: string
  createdBy: string | null
  updatedAt: string
}

const STORAGE_KEY = "retailos.refunds.v1"
const REFUND_PREFIX = "REF-"
const DAILY_PAD = 5

type RefundStore = {
  version: 1
  sequencesByDate: Record<string, number>
  items: RefundRecord[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): RefundStore {
  return { version: 1, sequencesByDate: {}, items: [] }
}

function readStore(): RefundStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<RefundStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return {
      version: 1,
      sequencesByDate:
        parsed.sequencesByDate && typeof parsed.sequencesByDate === "object"
          ? parsed.sequencesByDate
          : {},
      items: parsed.items as RefundRecord[],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: RefundStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function formatRefundId(dateKey: string, sequence: number) {
  return `${REFUND_PREFIX}${dateKey}-${String(sequence).padStart(DAILY_PAD, "0")}`
}

export function listLocalRefunds(): RefundRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalRefund(id: string): RefundRecord | null {
  return readStore().items.find((item) => item.id === id) ?? null
}

export function getLocalRefundByInvoice(
  invoiceId: string
): RefundRecord | null {
  return (
    readStore().items.find(
      (item) => item.invoiceId === invoiceId && item.status === "Completed"
    ) ?? null
  )
}

export function upsertLocalRefund(record: RefundRecord): RefundRecord {
  const store = readStore()
  const index = store.items.findIndex((item) => item.id === record.id)
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export type CreateRefundLocalInput = Omit<
  RefundRecord,
  "id" | "refundId" | "createdAt" | "updatedAt" | "status"
> & {
  id: string
  status?: RefundStatus
}

export function createLocalRefund(input: CreateRefundLocalInput): RefundRecord {
  const store = readStore()
  const dateKey = todayDateKey()
  const sequence = (store.sequencesByDate[dateKey] ?? 0) + 1
  const now = new Date().toISOString()

  const record: RefundRecord = {
    ...input,
    refundId: formatRefundId(dateKey, sequence),
    status: input.status ?? "Completed",
    createdAt: now,
    updatedAt: now,
  }

  writeStore({
    version: 1,
    sequencesByDate: {
      ...store.sequencesByDate,
      [dateKey]: sequence,
    },
    items: [...store.items, record],
  })

  return record
}
