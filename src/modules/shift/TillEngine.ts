import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { rupeesToPaisa } from "@/lib/money"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"

import { ShiftService } from "./ShiftService"

type PaymentReceivedPayload = {
  paymentId?: string
  invoiceId?: string
  invoiceNumber?: string
  amount?: number
  paymentMethod?: string
  status?: string
  storeId?: string | null
}

type RefundPayload = {
  refundId?: string
  invoiceId?: string
  amount?: number
  amountPaisa?: number
  method?: string
  storeId?: string | null
}

type SupplierPaymentPayload = {
  id?: string
  paymentId?: string
  amount?: number
  amountPaisa?: number
  paymentMethod?: string
  method?: string
  status?: string
  createdBy?: string | null
  invoiceNumber?: string
}

/**
 * Posts cash till movements onto the cashier's open shift.
 * Payment / Expense / Refund never import Shift — events only.
 */
export class TillEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PAYMENT_RECEIVED, (event) => {
      void this.onPaymentReceived(event)
    })
    this.subscriber.on(EventTypes.REFUND_CREATED, (event) => {
      void this.onRefund(event)
    })
    this.subscriber.on(EventTypes.PAYMENT_REFUNDED, (event) => {
      void this.onRefund(event)
    })
    this.subscriber.on(EventTypes.EXPENSE_CREATED, (event) => {
      void this.onExpense(event)
    })
    this.subscriber.on(EventTypes.SUPPLIER_PAYMENT_RECORDED, (event) => {
      void this.onSupplierPayment(event)
    })
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private async onPaymentReceived(event: DomainEvent) {
    const payload = event.payload as PaymentReceivedPayload
    if (payload.status && payload.status !== "Paid") return
    if (payload.paymentMethod !== "Cash") return
    if (typeof payload.amount !== "number" || !payload.paymentId) return

    try {
      const invoiceId = payload.invoiceId || payload.invoiceNumber
      const sale = invoiceId
        ? await invoiceRepository.getById(invoiceId)
        : null
      const cashierId = sale?.cashierId
      if (!cashierId) return

      await ShiftService.recordAutomatedMovement({
        cashierId,
        type: "CASH_SALE",
        amountPaisa: rupeesToPaisa(payload.amount),
        referenceId: `pay:${payload.paymentId}`,
        note: `Sale ${invoiceId || ""}`.trim(),
        actorId: cashierId,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[TillEngine] cash sale failed", err)
      }
    }
  }

  private async onRefund(event: DomainEvent) {
    const payload = event.payload as RefundPayload
    if (!payload.refundId) return
    if (payload.method && payload.method !== "Cash") return

    try {
      const sale = payload.invoiceId
        ? await invoiceRepository.getById(payload.invoiceId)
        : null
      // Default to cash when method omitted and original tender was Cash.
      const method =
        payload.method ||
        sale?.paymentMethod ||
        null
      if (method && method !== "Cash") return

      const cashierId = sale?.cashierId
      if (!cashierId) return

      const amountPaisa =
        typeof payload.amountPaisa === "number"
          ? payload.amountPaisa
          : typeof payload.amount === "number"
            ? rupeesToPaisa(payload.amount)
            : null
      if (amountPaisa == null || amountPaisa <= 0) return

      await ShiftService.recordAutomatedMovement({
        cashierId,
        type: "CASH_REFUND",
        amountPaisa,
        referenceId: `refund:${payload.refundId}`,
        note: `Refund ${payload.invoiceId || ""}`.trim(),
        actorId: cashierId,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[TillEngine] cash refund failed", err)
      }
    }
  }

  private async onExpense(event: DomainEvent) {
    const expense = event.payload as ExpenseRecord
    if (!expense?.id) return
    if (expense.paymentMethod && expense.paymentMethod !== "Cash") return

    try {
      const cashierId = expense.createdBy
      if (!cashierId) return
      if (!expense.amountPaisa || expense.amountPaisa <= 0) return

      await ShiftService.recordAutomatedMovement({
        cashierId,
        type: "CASH_EXPENSE",
        amountPaisa: expense.amountPaisa,
        referenceId: `exp:${expense.id}`,
        note: expense.title || "Expense",
        actorId: cashierId,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[TillEngine] cash expense failed", err)
      }
    }
  }

  private async onSupplierPayment(event: DomainEvent) {
    const payload = event.payload as SupplierPaymentPayload
    const method = payload.paymentMethod || payload.method
    if (method !== "Cash") return
    const paymentId = payload.paymentId || payload.id
    if (!paymentId) return

    try {
      const cashierId = payload.createdBy
      if (!cashierId) return

      const amountPaisa =
        typeof payload.amountPaisa === "number"
          ? payload.amountPaisa
          : typeof payload.amount === "number"
            ? rupeesToPaisa(payload.amount)
            : null
      if (amountPaisa == null || amountPaisa <= 0) return

      await ShiftService.recordAutomatedMovement({
        cashierId,
        type: "SUPPLIER_CASH",
        amountPaisa,
        referenceId: `spay:${paymentId}`,
        note: `Supplier ${payload.invoiceNumber || ""}`.trim(),
        actorId: cashierId,
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[TillEngine] supplier cash failed", err)
      }
    }
  }
}

export const tillEngine = new TillEngine()
