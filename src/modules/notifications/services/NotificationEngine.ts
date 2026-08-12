import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { notificationRepository } from "@/repositories/NotificationRepository"
import { AlertService } from "./AlertService"

type PaymentReceivedPayload = {
  paymentId?: string
  invoiceNumber?: string
  invoiceId?: string
  customerName?: string
  customerId?: string | null
  customerPhone?: string | null
  status?: string
}

type RefundPayload = {
  invoiceId?: string
  paymentId?: string | null
  customerId?: string | null
  customerName?: string
  customerPhone?: string | null
  amount?: number
  amountPaisa?: number
  refundId?: string
}

const AGING_INTERVAL_MS = 15 * 60 * 1000

/**
 * In-process Notification Engine.
 * - Customer WhatsApp/SMS queue from payment events
 * - Staff soft alerts from business triggers (AlertService)
 *
 * Delivery (WhatsApp) happens in Cloud Functions — not here.
 * Payment Module never imports this module.
 */
export class NotificationEngine {
  private subscriber = new EventSubscriber()
  private started = false
  private agingTimer: ReturnType<typeof setInterval> | null = null

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      void this.onPaymentReceived(event)
      void AlertService.onPaymentReceived(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_REFUNDED, (event) => {
      void this.onPaymentRefunded(event)
      void AlertService.onPaymentRefunded(event)
    })
    this.subscriber.on(EventTypes.ORDER_CANCELLED, (event) => {
      void this.onOrderCancelled(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_FAILED, (event) => {
      void AlertService.onPaymentFailed(event)
    })
    this.subscriber.on(EventTypes.SHIFT_CLOSED, (event) => {
      void AlertService.onShiftClosed(event)
    })
    this.subscriber.on(EventTypes.SYNC_FAILED, (event) => {
      void AlertService.onSyncFailed(event)
    })
    this.subscriber.on(EventTypes.INVENTORY_CHANGED, (event) => {
      void AlertService.onInventoryChanged(event)
    })
    this.subscriber.on(EventTypes.STOCK_ADJUSTED, (event) => {
      void AlertService.onInventoryChanged(event)
    })
    this.subscriber.on(EventTypes.PURCHASE_ORDER_ISSUED, (event) => {
      void AlertService.onPurchaseChanged(event)
    })
    this.subscriber.on(EventTypes.PURCHASE_ORDER_UPDATED, (event) => {
      void AlertService.onPurchaseChanged(event)
    })
    this.subscriber.on(EventTypes.GOODS_RECEIVED, (event) => {
      void AlertService.onPurchaseChanged(event)
    })
    this.subscriber.on(EventTypes.PURCHASE_INVOICE_POSTED, (event) => {
      void AlertService.onPurchaseChanged(event)
    })
    this.subscriber.on(EventTypes.SUPPLIER_PAYMENT_RECORDED, (event) => {
      void AlertService.onPurchaseChanged(event)
    })
    this.subscriber.on(EventTypes.CUSTOMER_AR_SETTLED, (event) => {
      void AlertService.onCustomerArChanged(event)
    })
    this.subscriber.on(EventTypes.CUSTOMER_UPDATED, (event) => {
      void AlertService.onCustomerArChanged(event)
    })
    this.subscriber.on(EventTypes.CREDIT_NOTE_ISSUED, (event) => {
      void AlertService.onCustomerArChanged(event)
    })

    void AlertService.runAgingScans()
    this.agingTimer = setInterval(() => {
      void AlertService.runAgingScans()
    }, AGING_INTERVAL_MS)
  }

  stop() {
    this.subscriber.dispose()
    if (this.agingTimer) {
      clearInterval(this.agingTimer)
      this.agingTimer = null
    }
    this.started = false
  }

  private async onPaymentReceived(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload
    if (payload.status && payload.status !== "Paid") return

    const invoiceId = payload.invoiceNumber || payload.invoiceId
    if (!invoiceId) return

    const phone = (payload.customerPhone || "").replace(/\D/g, "")
    // Walk-in without phone: queue skipped (nothing to deliver).
    if (phone.length < 8) return

    try {
      await notificationRepository.queue({
        invoiceId,
        paymentId: payload.paymentId ?? null,
        customerId: payload.customerId ?? null,
        customerName: payload.customerName || "Walk-in",
        customerPhone: phone,
        storeId: event.storeId,
        messageType: "receipt",
        channel: "whatsapp",
        templateName: "receipt_notification",
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[NotificationEngine] queue failed", err)
      }
    }
  }

  private async onPaymentRefunded(event: DomainEvent) {
    const payload = event.payload as RefundPayload
    if (!payload.invoiceId) return
    const phone = (payload.customerPhone || "").replace(/\D/g, "")
    if (phone.length < 8) return
    try {
      await notificationRepository.queue({
        invoiceId: payload.invoiceId,
        paymentId: payload.paymentId ?? null,
        customerId: payload.customerId ?? null,
        customerName: payload.customerName || "Walk-in",
        customerPhone: phone,
        storeId: event.storeId,
        messageType: "refund",
        channel: "whatsapp",
        templateName: "refund_notification",
        forceNew: true,
      })
    } catch {
      // ignore
    }
  }

  private async onOrderCancelled(event: DomainEvent) {
    const payload = event.payload as { invoiceId?: string }
    if (!payload.invoiceId) return
    // Placeholder — future SMS/email cancel notice.
    void event
  }
}

export const notificationEngine = new NotificationEngine()
