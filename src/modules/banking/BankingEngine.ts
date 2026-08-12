import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"

import { BankingService } from "./BankingService"

type PaymentReceivedPayload = {
  paymentId?: string
  invoiceNumber?: string
  amount?: number
  paymentMethod?: string
  status?: string
  paidAt?: string | null
  storeId?: string | null
}

type RefundPayload = {
  refundId?: string
  invoiceId?: string
  amount?: number
  method?: string
  storeId?: string | null
  createdAt?: string
}

/**
 * Subscribes to payment/refund domain events and updates the banking ledger.
 * Payment Module never imports Banking — events only.
 */
export class BankingEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      this.onPaymentReceived(event)
    })
    this.subscriber.on(EventTypes.REFUND_CREATED, (event) => {
      this.onRefund(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_REFUNDED, (event) => {
      this.onRefund(event)
    })
    this.subscriber.on(EventTypes.SUPPLIER_PAYMENT_RECORDED, (event) => {
      this.onSupplierPayment(event)
    })
    this.subscriber.on(EventTypes.CUSTOMER_AR_SETTLED, (event) => {
      this.onArSettled(event)
    })
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private onPaymentReceived(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload
    if (payload.status && payload.status !== "Paid") return
    if (!payload.paymentId || typeof payload.amount !== "number") return
    // Charge-account sales — no cash/UPI movement until AR is settled.
    if (payload.paymentMethod === "OnAccount") return

    try {
      BankingService.recordSalePayment({
        paymentId: payload.paymentId,
        amountRupees: payload.amount,
        paymentMethod: payload.paymentMethod || "UPI",
        invoiceNumber: payload.invoiceNumber,
        storeId: payload.storeId ?? event.storeId,
        paidAt: payload.paidAt,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[BankingEngine] sale ledger failed", err)
      }
    }
  }

  private onRefund(event: DomainEvent) {
    const payload = event.payload as RefundPayload
    if (!payload.refundId || typeof payload.amount !== "number") return

    try {
      BankingService.recordRefund({
        refundId: payload.refundId,
        amountRupees: payload.amount,
        method: payload.method || "Cash",
        invoiceId: payload.invoiceId,
        storeId: payload.storeId ?? event.storeId,
        createdAt: payload.createdAt,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[BankingEngine] refund ledger failed", err)
      }
    }
  }

  private onSupplierPayment(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload & {
      id?: string
    }
    const paymentId = payload.paymentId || payload.id
    if (!paymentId || typeof payload.amount !== "number") return
    if (payload.status && payload.status !== "Paid") return

    try {
      BankingService.recordSupplierPayment({
        paymentId,
        amountRupees: payload.amount,
        paymentMethod: payload.paymentMethod || "UPI",
        invoiceNumber: payload.invoiceNumber,
        storeId: payload.storeId ?? event.storeId,
        paidAt: payload.paidAt,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[BankingEngine] supplier payment ledger failed", err)
      }
    }
  }

  private onArSettled(event: DomainEvent) {
    const payload = event.payload as {
      id?: string
      amount?: number
      amountPaisa?: number
      method?: string
      paymentMethod?: string
      settledAt?: string | null
      storeId?: string | null
      customerName?: string
    }
    if (!payload?.id) return
    const amountRupees =
      typeof payload.amount === "number"
        ? payload.amount
        : typeof payload.amountPaisa === "number"
          ? payload.amountPaisa / 100
          : null
    if (amountRupees == null || amountRupees <= 0) return

    try {
      BankingService.recordSalePayment({
        paymentId: payload.id,
        amountRupees,
        paymentMethod:
          payload.method === "Cash" || payload.paymentMethod === "Cash"
            ? "Cash"
            : "UPI",
        invoiceNumber: payload.customerName
          ? `AR ${payload.customerName}`
          : "AR settlement",
        storeId: payload.storeId ?? event.storeId,
        paidAt: payload.settledAt,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[BankingEngine] AR settlement ledger failed", err)
      }
    }
  }
}

export const bankingEngine = new BankingEngine()
