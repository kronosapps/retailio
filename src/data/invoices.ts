import { type Paisa, roundPaisa } from "@/lib/money"
import type { PaymentMethod, PaymentStatus } from "@/modules/payment/types"

const STORAGE_KEY = "retailos.invoices.v1"
const INVOICE_PREFIX = "INV-"
const DAILY_PAD = 5

export type RecordedSaleLine = {
  itemId: string
  /** Catalog SKU when available (preferred for stock matching). */
  sku?: string | null
  name: string
  weight: string
  qty: number
  unitPricePaisa: Paisa
  lineTotalPaisa: Paisa
  isLoyaltyReward?: boolean
}

export type RecordedSale = {
  invoiceId: string
  /** Daily sequence number for the invoice date (YYYYMMDD). */
  sequence: number
  /** Calendar date key YYYYMMDD used for the ID. */
  dateKey: string
  createdAt: string
  cashierId: string | null
  cashierName: string | null
  storeId: string | null
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
  paymentId?: string | null
  paymentStatus?: PaymentStatus | null
  paymentMethod?: PaymentMethod | null
  lines: RecordedSaleLine[]
  totals: {
    grossSubtotal: Paisa
    friendsFamilyDiscount: Paisa
    friendsFamilyPercent: number
    occasionDiscount: Paisa
    occasionPercent: number
    occasionName: string | null
    loyaltyDiscount: Paisa
    loyaltyLabel: string | null
    taxableAmount: Paisa
    gstAmount: Paisa
    gstPercent: number
    cgstAmount: Paisa
    sgstAmount: Paisa
    cgstPercent: number
    sgstPercent: number
    total: Paisa
  }
  loyalty: {
    mode: "off" | "percent" | "item"
    freeItemId: string | null
    freeItemName: string | null
  }
}

type InvoiceStoreV2 = {
  version: 2
  sequencesByDate: Record<string, number>
  sales: RecordedSale[]
}

type LegacyInvoiceStore = {
  nextSequence?: number
  sales?: RecordedSale[]
}

function todayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function emptyStore(): InvoiceStoreV2 {
  return { version: 2, sequencesByDate: {}, sales: [] }
}

function normalizeSaleTotals(
  totals: RecordedSale["totals"]
): RecordedSale["totals"] {
  const gstAmount = totals.gstAmount ?? 0
  const cgstAmount =
    typeof totals.cgstAmount === "number"
      ? totals.cgstAmount
      : roundPaisa(gstAmount / 2)
  const sgstAmount =
    typeof totals.sgstAmount === "number"
      ? totals.sgstAmount
      : gstAmount - cgstAmount

  return {
    ...totals,
    gstAmount,
    cgstAmount,
    sgstAmount,
    cgstPercent:
      typeof totals.cgstPercent === "number" ? totals.cgstPercent : 2.5,
    sgstPercent:
      typeof totals.sgstPercent === "number" ? totals.sgstPercent : 2.5,
  }
}

function normalizeSale(sale: RecordedSale): RecordedSale {
  return {
    ...sale,
    totals: normalizeSaleTotals(sale.totals),
  }
}

function migrateStore(raw: unknown): InvoiceStoreV2 {
  if (!raw || typeof raw !== "object") return emptyStore()
  const data = raw as InvoiceStoreV2 & LegacyInvoiceStore

  if (data.version === 2 && data.sequencesByDate && Array.isArray(data.sales)) {
    return {
      version: 2,
      sequencesByDate: data.sequencesByDate,
      sales: data.sales.map(normalizeSale),
    }
  }

  // Legacy INV-000001 store — keep sales; new IDs use date format.
  const sales = Array.isArray(data.sales) ? data.sales : []
  return {
    version: 2,
    sequencesByDate: {},
    sales: sales.map((sale) =>
      normalizeSale({
        ...sale,
        dateKey: sale.dateKey || "legacy",
        paymentId: sale.paymentId ?? null,
        paymentStatus: sale.paymentStatus ?? "Paid",
        paymentMethod: sale.paymentMethod ?? null,
        customerName: sale.customerName ?? "Walk-in",
      })
    ),
  }
}

function readStore(): InvoiceStoreV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    return migrateStore(JSON.parse(raw))
  } catch {
    return emptyStore()
  }
}

function writeStore(store: InvoiceStoreV2) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function formatInvoiceId(dateKey: string, sequence: number) {
  return `${INVOICE_PREFIX}${dateKey}-${String(sequence).padStart(DAILY_PAD, "0")}`
}

function peekAllocation(date = new Date()) {
  const store = readStore()
  const dateKey = todayDateKey(date)
  const nextSequence = (store.sequencesByDate[dateKey] ?? 0) + 1
  return {
    dateKey,
    sequence: nextSequence,
    invoiceId: formatInvoiceId(dateKey, nextSequence),
  }
}

/** Peek the next invoice ID without consuming it. */
export function peekNextInvoiceId(date = new Date()) {
  return peekAllocation(date).invoiceId
}

export function listRecordedSales() {
  return [...readStore().sales].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getRecordedSale(invoiceId: string) {
  return readStore().sales.find((sale) => sale.invoiceId === invoiceId) ?? null
}

function preferSale(local: RecordedSale, remote: RecordedSale): RecordedSale {
  // Protect unsynced local payments; otherwise prefer cloud as SoT.
  if (local.paymentStatus === "Paid" && remote.paymentStatus !== "Paid") {
    return normalizeSale(local)
  }
  if (remote.paymentStatus === "Paid" && local.paymentStatus !== "Paid") {
    return normalizeSale(remote)
  }
  return normalizeSale({
    ...local,
    ...remote,
    invoiceId: local.invoiceId || remote.invoiceId,
    lines: Array.isArray(remote.lines) ? remote.lines : local.lines,
    totals: remote.totals ?? local.totals,
  })
}

/** Upsert a sale into the local cache (used when hydrating from Firestore). */
export function upsertRecordedSale(sale: RecordedSale): RecordedSale {
  const normalized = normalizeSale(sale)
  const store = readStore()
  const index = store.sales.findIndex(
    (item) => item.invoiceId === normalized.invoiceId
  )
  const sales = [...store.sales]
  if (index >= 0) sales[index] = preferSale(sales[index], normalized)
  else sales.push(normalized)

  const sequencesByDate = { ...store.sequencesByDate }
  if (normalized.dateKey && normalized.dateKey !== "legacy") {
    const current = sequencesByDate[normalized.dateKey] ?? 0
    sequencesByDate[normalized.dateKey] = Math.max(
      current,
      normalized.sequence ?? 0
    )
  }

  writeStore({ version: 2, sequencesByDate, sales })
  return (
    sales.find((item) => item.invoiceId === normalized.invoiceId) ?? normalized
  )
}

/**
 * Merge Firestore invoices into localStorage.
 * Keeps local-only rows (offline writes) and prefers Paid local over stale remote.
 */
export function mergeRemoteSales(remoteSales: RecordedSale[]): RecordedSale[] {
  for (const sale of remoteSales) {
    if (!sale?.invoiceId) continue
    upsertRecordedSale(sale)
  }
  return listRecordedSales()
}

export type CreateInvoiceInput = Omit<
  RecordedSale,
  | "invoiceId"
  | "sequence"
  | "dateKey"
  | "createdAt"
  | "paymentId"
  | "paymentStatus"
  | "paymentMethod"
> & {
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
}

/**
 * Create an unpaid invoice and advance the daily sequence.
 * Payment Module then opens via openPayment(invoice).
 */
export function createInvoice(input: CreateInvoiceInput): RecordedSale {
  const store = readStore()
  const { dateKey, sequence, invoiceId } = peekAllocation()

  const sale: RecordedSale = {
    ...input,
    invoiceId,
    sequence,
    dateKey,
    createdAt: new Date().toISOString(),
    customerName: input.customerName?.trim() || "Walk-in",
    customerId: input.customerId ?? null,
    customerPhone: input.customerPhone ?? null,
    paymentId: null,
    paymentStatus: "Pending",
    paymentMethod: null,
  }

  writeStore({
    version: 2,
    sequencesByDate: {
      ...store.sequencesByDate,
      [dateKey]: sequence,
    },
    sales: [...store.sales, sale],
  })

  return sale
}

/** @deprecated Use createInvoice + Payment Module. Kept for compatibility. */
export type ChargeSaleInput = CreateInvoiceInput

/** @deprecated Use createInvoice. */
export function recordSuccessfulSale(input: ChargeSaleInput): RecordedSale {
  const sale = createInvoice(input)
  return updateInvoicePayment(sale.invoiceId, {
    paymentStatus: "Paid",
    paymentMethod: "Cash",
  }) ?? sale
}

export function updateInvoicePayment(
  invoiceId: string,
  patch: {
    paymentId?: string | null
    paymentStatus?: PaymentStatus | null
    paymentMethod?: PaymentMethod | null
    customerName?: string
    customerId?: string | null
    customerPhone?: string | null
  }
): RecordedSale | null {
  const store = readStore()
  const index = store.sales.findIndex((sale) => sale.invoiceId === invoiceId)
  if (index < 0) return null

  const current = store.sales[index]
  const next: RecordedSale = {
    ...current,
    ...patch,
    customerName: patch.customerName ?? current.customerName,
    customerId:
      patch.customerId !== undefined ? patch.customerId : current.customerId,
    customerPhone:
      patch.customerPhone !== undefined
        ? patch.customerPhone
        : current.customerPhone,
  }
  const sales = [...store.sales]
  sales[index] = next
  writeStore({ ...store, sales })
  return next
}

export function toPayableInvoice(sale: RecordedSale) {
  return {
    invoiceId: sale.invoiceId,
    invoiceNumber: sale.invoiceId,
    dailySequence: sale.sequence,
    amountPaisa: sale.totals.total,
    customerName: sale.customerName ?? "Walk-in",
    customerId: sale.customerId ?? null,
    customerPhone: sale.customerPhone ?? null,
    storeId: sale.storeId ?? null,
    paymentId: sale.paymentId ?? null,
    paymentStatus: sale.paymentStatus ?? null,
    paymentMethod: sale.paymentMethod ?? null,
  }
}
