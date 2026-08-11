import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { invoiceRepository } from "@/repositories/InvoiceRepository"

import { InventoryService } from "./InventoryService"

type PaymentReceivedPayload = {
  paymentId?: string
  invoiceId?: string
  invoiceNumber?: string
  status?: string
  storeId?: string | null
  createdBy?: string | null
}

/**
 * Subscribes to payment events and deducts stock via InventoryService.
 * Payment / POS never import inventory — events only.
 */
export class InventoryEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      void this.onPaymentReceived(event)
    })
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private async onPaymentReceived(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload
    if (payload.status && payload.status !== "Paid") return

    const invoiceId = payload.invoiceId || payload.invoiceNumber
    if (!invoiceId) return

    try {
      const sale = await invoiceRepository.getById(invoiceId)
      if (!sale) return
      // Payment may land before invoice paymentStatus patch finishes; still deduct.

      await InventoryService.deductForSale(
        sale,
        payload.createdBy ?? null,
        null
      )
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[InventoryEngine] sale stock deduct failed", err)
      }
    }
  }
}

export const inventoryEngine = new InventoryEngine()
