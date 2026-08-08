import type { RecordedSale } from "@/data/invoices"
import type { RefundRecord } from "@/data/refunds"
import {
  isInRange,
  resolveDashboardRange,
} from "@/modules/dashboard/services/dateRanges"
import type { Payment } from "@/modules/payment/types"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"

export type TransactionDay = "today" | "yesterday"

export type DayTransactions = {
  day: TransactionDay
  label: string
  start: Date
  end: Date
  sales: RecordedSale[]
  payments: Payment[]
  refunds: RefundRecord[]
  totals: {
    salesCount: number
    paidSalesPaisa: number
    paymentsCount: number
    paidPaymentsPaisa: number
    refundsCount: number
    refundsPaisa: number
  }
}

function filterStoreSales(
  sales: RecordedSale[],
  storeId: string | null
): RecordedSale[] {
  if (!storeId) return sales
  return sales.filter((s) => !s.storeId || s.storeId === storeId)
}

function filterStoreRefunds(
  refunds: RefundRecord[],
  storeId: string | null
): RefundRecord[] {
  if (!storeId) return refunds
  return refunds.filter((r) => !r.storeId || r.storeId === storeId)
}

/**
 * Admin Transactions — reads repositories only.
 * Today and yesterday are built as separate day buckets (never mixed).
 */
export class TransactionsService {
  static async loadDay(
    day: TransactionDay,
    storeId: string | null = null
  ): Promise<DayTransactions> {
    const range = resolveDashboardRange(day)
    const [invoices, payments, refunds] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
      refundRepository.list(),
    ])

    const sales = filterStoreSales(invoices, storeId)
      .filter((sale) => isInRange(sale.createdAt, range.start, range.end))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const dayPayments = payments
      .filter((payment) => {
        // Abandoned / superseded sessions (common when regenerating UPI QR)
        if (payment.status === "Cancelled" || payment.status === "Expired") {
          return false
        }
        const when = payment.paidAt || payment.createdAt
        return isInRange(when, range.start, range.end)
      })
      .sort((a, b) =>
        (b.paidAt || b.createdAt).localeCompare(a.paidAt || a.createdAt)
      )

    const dayRefunds = filterStoreRefunds(refunds, storeId)
      .filter((refund) => isInRange(refund.createdAt, range.start, range.end))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const paidSales = sales.filter(
      (s) => s.paymentStatus === "Paid" || s.paymentStatus === "Refunded"
    )
    const paidPayments = dayPayments.filter((p) => p.status === "Paid")
    const completedRefunds = dayRefunds.filter((r) => r.status === "Completed")

    return {
      day,
      label: range.label,
      start: range.start,
      end: range.end,
      sales,
      payments: dayPayments,
      refunds: dayRefunds,
      totals: {
        salesCount: sales.length,
        paidSalesPaisa: paidSales
          .filter((s) => s.paymentStatus === "Paid")
          .reduce((sum, s) => sum + s.totals.total, 0),
        paymentsCount: dayPayments.length,
        paidPaymentsPaisa: paidPayments.reduce(
          (sum, p) => sum + p.amountPaisa,
          0
        ),
        refundsCount: completedRefunds.length,
        refundsPaisa: completedRefunds.reduce(
          (sum, r) => sum + r.amountPaisa,
          0
        ),
      },
    }
  }

  static async loadTodayAndYesterday(
    storeId: string | null = null
  ): Promise<{ today: DayTransactions; yesterday: DayTransactions }> {
    const [today, yesterday] = await Promise.all([
      this.loadDay("today", storeId),
      this.loadDay("yesterday", storeId),
    ])
    return { today, yesterday }
  }
}
