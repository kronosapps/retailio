import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"

/**
 * Reports module — reads via repositories only.
 * No direct Sheets or Firestore access from UI.
 */
export class ReportsService {
  static async salesSummary() {
    const [invoices, payments] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
    ])
    const paid = payments.filter((p) => p.status === "Paid")
    return {
      invoiceCount: invoices.length,
      paidPaymentCount: paid.length,
      paidTotalRupees: paid.reduce((sum, p) => sum + p.amount, 0),
    }
  }
}
