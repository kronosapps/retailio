import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { notificationRepository } from "@/repositories/NotificationRepository"

type PaymentReceivedPayload = {
  paymentId?: string
  invoiceNumber?: string
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
  amount?: number
}

/**
 * In-process Notification Engine.
 * Subscribes to domain events and queues channel-agnostic notifications.
 * Delivery (WhatsApp / SMS / Email) happens in Cloud Functions — not here.
 *
 * Payment Module never imports this module.
 */
export class NotificationEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      void this.onPaymentReceived(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_REFUNDED, (event) => {
      void this.onPaymentRefunded(event)
    })
    this.subscriber.on(EventTypes.ORDER_CANCELLED, (event) => {
      void this.onOrderCancelled(event)
    })
    // Future: INVOICE_CREATED → optional invoice WhatsApp
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private async onPaymentReceived(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload
    if (payload.status && payload.status !== "Paid") return

    const invoiceId = payload.invoiceNumber
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
    const payload = event.payload as RefundPayload & {
      customerPhone?: string | null
    }
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
