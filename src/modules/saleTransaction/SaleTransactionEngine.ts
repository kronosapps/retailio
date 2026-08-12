import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { SaleTransactionService } from "./SaleTransactionService"

/**
 * Advances sale-transaction boundaries from domain events.
 * Does not change stock/payment policy — observability + recovery only.
 */
export class SaleTransactionEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.INVOICE_CREATED, (event) => {
      void this.onInvoiceCreated(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      void this.onPaymentReceived(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_FAILED, (event) => {
      void this.onPaymentFailed(event)
    })
    this.subscriber.on(EventTypes.SALE_CANCELLED, (event) => {
      void this.onSaleCancelled(event)
    })
    this.subscriber.on(EventTypes.ORDER_CANCELLED, (event) => {
      void this.onSaleCancelled(event)
    })
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private async onInvoiceCreated(event: DomainEvent) {
    const p = event.payload as {
      invoiceId?: string
      invoiceNumber?: string
      totalPaisa?: number
      cashierId?: string | null
      cashierName?: string | null
      customerName?: string
      storeId?: string | null
    }
    const invoiceId = p.invoiceId || p.invoiceNumber
    if (!invoiceId) return
    const existing = SaleTransactionService.getByInvoiceId(invoiceId)
    if (existing) {
      if (
        existing.status === "CheckoutStarted" ||
        existing.status === "InvoicePending"
      ) {
        await SaleTransactionService.attachInvoice(
          existing.id,
          invoiceId,
          p.totalPaisa ?? null
        )
      }
      return
    }
    // Prefer the in-flight POS checkout row (begin before create) over a twin.
    const orphan = SaleTransactionService.list().find(
      (row) =>
        !row.invoiceId &&
        (row.status === "CheckoutStarted" ||
          row.status === "InvoicePending") &&
        (!p.storeId || !row.storeId || row.storeId === p.storeId)
    )
    if (orphan) {
      await SaleTransactionService.attachInvoice(
        orphan.id,
        invoiceId,
        p.totalPaisa ?? null
      )
      return
    }
    await SaleTransactionService.ensureForInvoice(invoiceId)
  }

  private async onPaymentReceived(event: DomainEvent) {
    const p = event.payload as {
      invoiceId?: string
      invoiceNumber?: string
      paymentId?: string
      status?: string
    }
    if (p.status && p.status !== "Paid") return
    const invoiceId = p.invoiceId || p.invoiceNumber
    if (!invoiceId) return
    await SaleTransactionService.confirmPayment(invoiceId, p.paymentId ?? null)
    await SaleTransactionService.finalizeInvoice(invoiceId)
  }

  private async onPaymentFailed(event: DomainEvent) {
    const p = event.payload as {
      invoiceId?: string
      invoiceNumber?: string
    }
    const invoiceId = p.invoiceId || p.invoiceNumber
    if (!invoiceId) return
    await SaleTransactionService.fail(invoiceId, "Payment failed")
  }

  private async onSaleCancelled(event: DomainEvent) {
    const p = event.payload as { invoiceId?: string }
    if (!p.invoiceId) return
    await SaleTransactionService.cancel(p.invoiceId, "Sale cancelled")
  }
}

export const saleTransactionEngine = new SaleTransactionEngine()
