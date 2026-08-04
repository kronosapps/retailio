import type { Paisa } from "@/lib/money"

const STORAGE_KEY = "retailos.invoices.v1"
const INVOICE_PREFIX = "INV-"
const INVOICE_PAD = 6

export type RecordedSaleLine = {
  itemId: string
  name: string
  weight: string
  qty: number
  unitPricePaisa: Paisa
  lineTotalPaisa: Paisa
  isLoyaltyReward?: boolean
}

export type RecordedSale = {
  invoiceId: string
  sequence: number
  createdAt: string
  cashierId: string | null
  cashierName: string | null
  storeId: string | null
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
    total: Paisa
  }
  loyalty: {
    mode: "off" | "percent" | "item"
    freeItemId: string | null
    freeItemName: string | null
  }
}

type InvoiceStore = {
  nextSequence: number
  sales: RecordedSale[]
}

function emptyStore(): InvoiceStore {
  return { nextSequence: 1, sales: [] }
}

function readStore(): InvoiceStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<InvoiceStore>
    const nextSequence =
      typeof parsed.nextSequence === "number" &&
      Number.isFinite(parsed.nextSequence) &&
      parsed.nextSequence >= 1
        ? Math.floor(parsed.nextSequence)
        : 1
    const sales = Array.isArray(parsed.sales) ? parsed.sales : []
    return { nextSequence, sales }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: InvoiceStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function formatInvoiceId(sequence: number) {
  return `${INVOICE_PREFIX}${String(sequence).padStart(INVOICE_PAD, "0")}`
}

/** Peek the next invoice ID without consuming it. */
export function peekNextInvoiceId() {
  return formatInvoiceId(readStore().nextSequence)
}

export function listRecordedSales() {
  return [...readStore().sales].sort((a, b) => b.sequence - a.sequence)
}

export function getRecordedSale(invoiceId: string) {
  return readStore().sales.find((sale) => sale.invoiceId === invoiceId) ?? null
}

export type ChargeSaleInput = Omit<RecordedSale, "invoiceId" | "sequence" | "createdAt">

/**
 * Allocate the next invoice ID, persist the sale, and return the recorded sale.
 * Sequence only advances after a successful write.
 */
export function recordSuccessfulSale(input: ChargeSaleInput): RecordedSale {
  const store = readStore()
  const sequence = store.nextSequence
  const sale: RecordedSale = {
    ...input,
    invoiceId: formatInvoiceId(sequence),
    sequence,
    createdAt: new Date().toISOString(),
  }

  const nextStore: InvoiceStore = {
    nextSequence: sequence + 1,
    sales: [...store.sales, sale],
  }
  writeStore(nextStore)
  return sale
}
