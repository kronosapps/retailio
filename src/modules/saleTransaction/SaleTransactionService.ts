import { toPayableInvoice } from "@/data/invoices"
import { InventoryService } from "@/modules/inventory/InventoryService"
import type { PayableInvoice } from "@/modules/payment/types"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { saleTransactionRepository } from "@/repositories/SaleTransactionRepository"
import {
  getPaymentByInvoiceId,
  listPaymentsForInvoice,
  appendPaymentLog,
} from "@/modules/payment/store/paymentStore"
import {
  INCOMPLETE_SALE_STATUSES,
  isSaleTerminal,
  type BeginSaleTransactionInput,
  type SaleTransactionRecord,
  type SaleTransactionStatus,
} from "./types"

/**
 * Coordinates POS sale integrity states.
 * Does not replace invoice/payment — overlays recoverable boundaries.
 * Stock still deducts only after PAYMENT_RECEIVED (InventoryEngine).
 */
export class SaleTransactionService {
  static list(): SaleTransactionRecord[] {
    return saleTransactionRepository.list()
  }

  static hydrate() {
    return saleTransactionRepository.hydrate()
  }

  static getById(id: string) {
    return saleTransactionRepository.getById(id)
  }

  static getByInvoiceId(invoiceId: string) {
    return saleTransactionRepository.getByInvoiceId(invoiceId)
  }

  static listIncomplete(storeId?: string | null): SaleTransactionRecord[] {
    return saleTransactionRepository.list().filter((row) => {
      if (!INCOMPLETE_SALE_STATUSES.includes(row.status)) return false
      if (storeId && row.storeId && row.storeId !== storeId) return false
      return true
    })
  }

  static begin(input: BeginSaleTransactionInput) {
    return saleTransactionRepository.begin(input)
  }

  static async markInvoicePending(id: string) {
    return saleTransactionRepository.advance(id, "InvoicePending")
  }

  static async attachInvoice(
    id: string,
    invoiceId: string,
    amountPaisa?: number | null
  ) {
    return saleTransactionRepository.advance(id, "InvoiceCreated", {
      invoiceId,
      amountPaisa: amountPaisa ?? undefined,
    })
  }

  static async attachPayment(invoiceId: string, paymentId: string) {
    const txn =
      saleTransactionRepository.getByInvoiceId(invoiceId) ||
      (await this.ensureForInvoice(invoiceId))
    if (!txn || isSaleTerminal(txn.status)) return txn
    return saleTransactionRepository.advance(txn.id, "PaymentPending", {
      paymentId,
    })
  }

  static async confirmPayment(invoiceId: string, paymentId?: string | null) {
    const txn =
      saleTransactionRepository.getByInvoiceId(invoiceId) ||
      (await this.ensureForInvoice(invoiceId))
    if (!txn || isSaleTerminal(txn.status)) return txn
    return saleTransactionRepository.advance(txn.id, "PaymentConfirmed", {
      paymentId: paymentId ?? txn.paymentId,
    })
  }

  static async finalizeInvoice(invoiceId: string) {
    const txn =
      saleTransactionRepository.getByInvoiceId(invoiceId) ||
      (await this.ensureForInvoice(invoiceId))
    if (!txn || isSaleTerminal(txn.status)) return txn
    const next = await saleTransactionRepository.advance(
      txn.id,
      "InvoiceFinalized"
    )
    return this.tryComplete(next?.id ?? txn.id)
  }

  static async finalizeStock(invoiceId: string) {
    const txn =
      saleTransactionRepository.getByInvoiceId(invoiceId) ||
      (await this.ensureForInvoice(invoiceId))
    if (!txn || isSaleTerminal(txn.status)) return txn

    const sale = await invoiceRepository.getById(invoiceId)
    const paid = sale?.paymentStatus === "Paid"
    let current = txn

    if (
      paid &&
      (current.status === "PaymentPending" ||
        current.status === "InvoiceCreated" ||
        current.status === "Failed")
    ) {
      current =
        (await saleTransactionRepository.advance(
          current.id,
          "PaymentConfirmed",
          { paymentId: current.paymentId }
        )) || current
    }
    if (current.status === "PaymentConfirmed") {
      current =
        (await saleTransactionRepository.advance(
          current.id,
          "InvoiceFinalized"
        )) || current
    }
    const next = await saleTransactionRepository.advance(
      current.id,
      "StockFinalized"
    )
    return this.tryComplete(next?.id ?? current.id)
  }

  static async markSideEffect(
    invoiceId: string,
    flag: "bankingOk" | "accountingOk" | "tillOk",
    ok: boolean
  ) {
    const txn = saleTransactionRepository.getByInvoiceId(invoiceId)
    if (!txn || isSaleTerminal(txn.status)) return txn
    return saleTransactionRepository.save({
      ...txn,
      steps: { ...txn.steps, [flag]: ok },
    })
  }

  static async fail(
    invoiceIdOrTxnId: string,
    reason: string,
    byInvoice = true
  ) {
    const txn = byInvoice
      ? saleTransactionRepository.getByInvoiceId(invoiceIdOrTxnId)
      : saleTransactionRepository.getById(invoiceIdOrTxnId)
    if (!txn || isSaleTerminal(txn.status)) return txn
    return saleTransactionRepository.advance(txn.id, "Failed", {
      failureReason: reason,
    })
  }

  static async cancel(invoiceId: string, reason?: string) {
    const txn = saleTransactionRepository.getByInvoiceId(invoiceId)
    if (!txn || isSaleTerminal(txn.status)) return txn
    if (
      txn.status === "PaymentConfirmed" ||
      txn.status === "InvoiceFinalized" ||
      txn.status === "StockFinalized"
    ) {
      return saleTransactionRepository.advance(txn.id, "Failed", {
        failureReason:
          reason ||
          "Cannot cancel after payment confirmed — use returns/refund.",
      })
    }
    return saleTransactionRepository.advance(txn.id, "Cancelled", {
      failureReason: reason ?? null,
    })
  }

  /**
   * Abandon unpaid checkout: cancel open payment sessions + mark Cancelled.
   * Stock was never deducted (payment not confirmed).
   */
  static async cancelUnpaid(invoiceId: string, reason?: string) {
    const sale = await invoiceRepository.getById(invoiceId)
    if (sale?.paymentStatus === "Paid") {
      throw new Error("Invoice is paid — cancel unpaid is not allowed.")
    }
    for (const prior of listPaymentsForInvoice(invoiceId)) {
      if (prior.status !== "Pending" && prior.status !== "Expired") continue
      await paymentRepository.update(prior.paymentId, { status: "Cancelled" })
      appendPaymentLog({
        paymentId: prior.paymentId,
        invoiceId: prior.invoiceId,
        event: "CANCELLED",
        message: "Cancelled from incomplete sale recovery.",
      })
    }
    if (sale && sale.paymentStatus !== "Cancelled") {
      await invoiceRepository.updatePaymentFields(invoiceId, {
        paymentStatus: "Cancelled",
      })
    }
    return this.cancel(invoiceId, reason || "Cancelled unpaid sale")
  }

  /** Build payable for resume payment UI (invoice must exist, not paid). */
  static async resumePayment(invoiceId: string): Promise<PayableInvoice> {
    const sale = await invoiceRepository.getById(invoiceId)
    if (!sale) throw new Error("Invoice not found.")
    if (sale.paymentStatus === "Paid") {
      throw new Error("Invoice is already paid.")
    }
    if (sale.paymentStatus === "Cancelled" || sale.paymentStatus === "Refunded") {
      throw new Error(`Invoice is ${sale.paymentStatus} — cannot resume payment.`)
    }
    const txn = saleTransactionRepository.getByInvoiceId(invoiceId)
    if (txn && isSaleTerminal(txn.status)) {
      throw new Error(`Sale transaction is ${txn.status}.`)
    }
    return toPayableInvoice(sale)
  }

  static async tryComplete(txnId: string) {
    const txn = saleTransactionRepository.getById(txnId)
    if (!txn || isSaleTerminal(txn.status)) return txn
    if (
      txn.status === "StockFinalized" &&
      txn.steps.paymentConfirmedAt &&
      txn.steps.invoiceFinalizedAt &&
      txn.steps.stockFinalizedAt
    ) {
      return saleTransactionRepository.advance(txn.id, "Completed")
    }
    return txn
  }

  /**
   * Replay stock deduct for paid sales stuck before StockFinalized.
   */
  static async retryStock(invoiceId: string, actorId?: string | null) {
    const sale = await invoiceRepository.getById(invoiceId)
    if (!sale) {
      throw new Error("Invoice not found.")
    }
    if (sale.paymentStatus !== "Paid") {
      throw new Error("Invoice is not paid — stock must not deduct yet.")
    }
    await InventoryService.deductForSale(sale, actorId ?? null, null)
    return this.finalizeStock(invoiceId)
  }

  /** Backfill a txn row when engines see an invoice without overlay. */
  static async ensureForInvoice(
    invoiceId: string
  ): Promise<SaleTransactionRecord | null> {
    const existing = saleTransactionRepository.getByInvoiceId(invoiceId)
    if (existing) return existing
    const sale = await invoiceRepository.getById(invoiceId)
    if (!sale) return null
    const begun = await saleTransactionRepository.begin({
      storeId: sale.storeId,
      cashierId: sale.cashierId,
      cashierName: sale.cashierName,
      customerName: sale.customerName,
      amountPaisa: sale.totals.total,
    })
    return saleTransactionRepository.advance(begun.id, "InvoiceCreated", {
      invoiceId,
      amountPaisa: sale.totals.total,
    })
  }

  static canResumePayment(row: SaleTransactionRecord): boolean {
    return (
      Boolean(row.invoiceId) &&
      (row.status === "InvoiceCreated" ||
        row.status === "PaymentPending" ||
        row.status === "Failed")
    )
  }

  static canCancelUnpaid(row: SaleTransactionRecord): boolean {
    if (!row.invoiceId) return false
    if (row.steps.paymentConfirmedAt) return false
    return (
      row.status === "CheckoutStarted" ||
      row.status === "InvoicePending" ||
      row.status === "InvoiceCreated" ||
      row.status === "PaymentPending" ||
      row.status === "Failed"
    )
  }

  static canRetryStock(row: SaleTransactionRecord): boolean {
    if (!row.invoiceId) return false
    if (
      row.status === "PaymentConfirmed" ||
      row.status === "InvoiceFinalized"
    ) {
      return true
    }
    return (
      row.status === "Failed" && Boolean(row.steps.paymentConfirmedAt)
    )
  }

  static activePaymentId(invoiceId: string): string | null {
    return getPaymentByInvoiceId(invoiceId)?.paymentId ?? null
  }

  static statusLabel(status: SaleTransactionStatus) {
    return status
  }
}
