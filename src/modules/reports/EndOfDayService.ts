import type { RecordedSale } from "@/data/invoices"
import type { RefundRecord } from "@/data/refunds"
import { paisaToRupees } from "@/lib/money"
import {
  isInRange,
  resolveDashboardRange,
} from "@/modules/dashboard/services/dateRanges"
import type { Payment } from "@/modules/payment/types"
import type { CustomerRecord } from "@/repositories/CustomerRepository"
import { customerRepository } from "@/repositories/CustomerRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { googleSheetsSyncProvider } from "@/services/sync/GoogleSheetsSyncProvider"

const EOD_STORAGE_KEY = "retailos.eod.v1"

export type EndOfDayDay = "today" | "yesterday"

export type EndOfDayRunRecord = {
  dayKey: string
  dayLabel: string
  ranAt: string
  invoicesSynced: number
  paymentsSynced: number
  refundsSynced: number
  customersSynced: number
}

export type EndOfDayResult = EndOfDayRunRecord & {
  summarySynced: boolean
  errors: string[]
  sheetsConfigured: boolean
}

type EodStore = {
  lastRun: EndOfDayRunRecord | null
  history: EndOfDayRunRecord[]
}

function readEodStore(): EodStore {
  try {
    const raw = localStorage.getItem(EOD_STORAGE_KEY)
    if (!raw) return { lastRun: null, history: [] }
    const parsed = JSON.parse(raw) as Partial<EodStore>
    return {
      lastRun: parsed.lastRun ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    }
  } catch {
    return { lastRun: null, history: [] }
  }
}

function writeEodStore(store: EodStore) {
  localStorage.setItem(EOD_STORAGE_KEY, JSON.stringify(store))
}

function dayKeyFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}${m}${d}`
}

function toInvoicePayload(sale: RecordedSale) {
  return {
    invoiceId: sale.invoiceId,
    invoiceNumber: sale.invoiceId,
    customerName: sale.customerName ?? "Walk-in",
    customerId: sale.customerId ?? null,
    customerPhone: sale.customerPhone ?? null,
    paymentStatus: sale.paymentStatus,
    paymentMethod: sale.paymentMethod,
    paymentId: sale.paymentId,
    createdAt: sale.createdAt,
    storeId: sale.storeId,
    taxableAmount: paisaToRupees(sale.totals.taxableAmount),
    sgstPercent: sale.totals.sgstPercent,
    sgstAmount: paisaToRupees(sale.totals.sgstAmount),
    cgstPercent: sale.totals.cgstPercent,
    cgstAmount: paisaToRupees(sale.totals.cgstAmount),
    gstPercent: sale.totals.gstPercent,
    gstAmount: paisaToRupees(sale.totals.gstAmount),
    total: paisaToRupees(sale.totals.total),
    totalPaisa: sale.totals.total,
    eodSync: true,
  }
}

function toPaymentPayload(payment: Payment) {
  return {
    invoiceNumber: payment.invoiceNumber,
    transactionReference: payment.transactionReference,
    paymentId: payment.paymentId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    customerName: payment.customerName,
    customerId: payment.customerId,
    customerPhone: payment.customerPhone,
    upiTxnLast4: payment.upiTxnLast4,
    cashReceiptNumber: payment.cashReceiptNumber,
    cashReceiptId: payment.cashReceiptId,
    eodSync: true,
  }
}

function toRefundPayload(refund: RefundRecord) {
  return {
    refundId: refund.refundId,
    invoiceId: refund.invoiceId,
    paymentId: refund.paymentId,
    customerId: refund.customerId,
    customerName: refund.customerName,
    amount: refund.amount,
    amountPaisa: refund.amountPaisa,
    method: refund.method,
    reason: refund.reason,
    restock: refund.restock,
    restockedSkuCount: refund.restockedSkuCount,
    status: refund.status,
    storeId: refund.storeId,
    createdAt: refund.createdAt,
    createdBy: refund.createdBy,
    eodSync: true,
  }
}

function toCustomerPayload(customer: CustomerRecord) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    notes: customer.notes ?? null,
    storeId: customer.storeId,
    totalSpendPaisa: customer.totalSpendPaisa,
    visitCount: customer.visitCount,
    lastPurchaseAt: customer.lastPurchaseAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    eodSync: true,
  }
}

async function pushSheet(
  sheet: string,
  rows: Record<string, unknown>[],
  errors: string[]
): Promise<number> {
  if (rows.length === 0) return 0
  try {
    if (googleSheetsSyncProvider.syncBatch) {
      await googleSheetsSyncProvider.syncBatch(sheet, rows)
    } else {
      for (const row of rows) {
        if (sheet === "Invoices") await googleSheetsSyncProvider.syncInvoice(row)
        else if (sheet === "Payments")
          await googleSheetsSyncProvider.syncPayment(row)
        else if (sheet === "Refunds")
          await googleSheetsSyncProvider.syncRefund(row)
        else if (sheet === "Customers")
          await googleSheetsSyncProvider.syncCustomer(row)
      }
    }
    return rows.length
  } catch (err) {
    errors.push(
      `${sheet}: ${err instanceof Error ? err.message : "Sync failed"}`
    )
    return 0
  }
}

/**
 * End-of-day Google Sheets sync.
 * Reads repositories (source of truth) and pushes the selected day's reports.
 * Live per-sale Sheets sync is disabled for invoices/payments/refunds/customers.
 */
export class EndOfDayService {
  static isSheetsConfigured(): boolean {
    return googleSheetsSyncProvider.isConfigured()
  }

  static getLastRun(): EndOfDayRunRecord | null {
    return readEodStore().lastRun
  }

  static getHistory(): EndOfDayRunRecord[] {
    return readEodStore().history
  }

  static async run(
    day: EndOfDayDay = "today",
    storeId: string | null = null
  ): Promise<EndOfDayResult> {
    const errors: string[] = []
    const sheetsConfigured = this.isSheetsConfigured()
    const range = resolveDashboardRange(day)
    const dayKey = dayKeyFromDate(range.start)

    if (!sheetsConfigured) {
      return {
        dayKey,
        dayLabel: range.label,
        ranAt: new Date().toISOString(),
        invoicesSynced: 0,
        paymentsSynced: 0,
        refundsSynced: 0,
        customersSynced: 0,
        summarySynced: false,
        errors: [
          "Google Sheets is not configured. Set VITE_GOOGLE_SCRIPT_URL (or the Sheets webhook in payment settings).",
        ],
        sheetsConfigured: false,
      }
    }

    const [invoices, payments, refunds, customers] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
      refundRepository.list(),
      Promise.resolve(customerRepository.list()),
    ])

    const filterStore = <T extends { storeId?: string | null }>(items: T[]) =>
      !storeId
        ? items
        : items.filter((item) => !item.storeId || item.storeId === storeId)

    const dayInvoices = filterStore(invoices).filter((sale) =>
      isInRange(sale.createdAt, range.start, range.end)
    )
    const dayPayments = payments.filter((payment) => {
      const when = payment.paidAt || payment.createdAt
      return isInRange(when, range.start, range.end)
    })
    const dayRefunds = filterStore(refunds).filter((refund) =>
      isInRange(refund.createdAt, range.start, range.end)
    )
    const dayCustomers = filterStore(customers).filter((customer) =>
      isInRange(customer.createdAt, range.start, range.end)
    )

    const invoicesSynced = await pushSheet(
      "Invoices",
      dayInvoices.map(toInvoicePayload),
      errors
    )
    const paymentsSynced = await pushSheet(
      "Payments",
      dayPayments.map(toPaymentPayload),
      errors
    )
    const refundsSynced = await pushSheet(
      "Refunds",
      dayRefunds.map(toRefundPayload),
      errors
    )
    const customersSynced = await pushSheet(
      "Customers",
      dayCustomers.map(toCustomerPayload),
      errors
    )

    const paidPayments = dayPayments.filter((p) => p.status === "Paid")
    const paidTotal = paidPayments.reduce((sum, p) => sum + p.amountPaisa, 0)
    const refundTotal = dayRefunds
      .filter((r) => r.status === "Completed")
      .reduce((sum, r) => sum + r.amountPaisa, 0)

    let summarySynced = false
    try {
      await googleSheetsSyncProvider.syncDailyClose?.({
        dayKey,
        dayLabel: range.label,
        date: range.start.toISOString().slice(0, 10),
        storeId,
        invoiceCount: dayInvoices.length,
        paymentCount: dayPayments.length,
        paidPaymentCount: paidPayments.length,
        paidTotalRupees: paisaToRupees(paidTotal),
        refundCount: dayRefunds.length,
        refundTotalRupees: paisaToRupees(refundTotal),
        customerCount: dayCustomers.length,
        closedAt: new Date().toISOString(),
        eodSync: true,
      })
      summarySynced = true
    } catch (err) {
      errors.push(
        `DailyClose: ${err instanceof Error ? err.message : "Sync failed"}`
      )
    }

    const ranAt = new Date().toISOString()
    const record: EndOfDayRunRecord = {
      dayKey,
      dayLabel: range.label,
      ranAt,
      invoicesSynced,
      paymentsSynced,
      refundsSynced,
      customersSynced,
    }

    const store = readEodStore()
    writeEodStore({
      lastRun: record,
      history: [record, ...store.history].slice(0, 30),
    })

    return {
      ...record,
      summarySynced,
      errors,
      sheetsConfigured: true,
    }
  }
}
