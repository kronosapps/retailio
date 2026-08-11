import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { journalRepository } from "@/repositories/JournalRepository"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"

import { AccountingRules } from "./rules/AccountingRules"

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
  createdAt?: string
  createdBy?: string | null
}

/**
 * Posts durable journal entries from domain events.
 * Payment / Expense / Refund modules never import accounting — events only.
 */
export class AccountingEngine {
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
      if (journalRepository.getByReference("sale", invoiceId)) return

      const sale = await invoiceRepository.getById(invoiceId)
      if (!sale) return

      const entry = AccountingRules.fromSale(sale, {
        eventId: event.id,
        source: "posted",
      })
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] sale journal failed", err)
      }
    }
  }

  private async onRefund(event: DomainEvent) {
    const payload = event.payload as RefundPayload
    if (!payload.refundId) return

    try {
      if (journalRepository.getByReference("refund", payload.refundId)) return

      const entry = AccountingRules.fromRefundPayload({
        refundId: payload.refundId,
        invoiceId: payload.invoiceId,
        amount: payload.amount,
        amountPaisa: payload.amountPaisa,
        method: payload.method,
        storeId: payload.storeId,
        createdAt: payload.createdAt,
        createdBy: payload.createdBy,
        eventId: event.id,
      })
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] refund journal failed", err)
      }
    }
  }

  private async onExpense(event: DomainEvent) {
    const expense = event.payload as ExpenseRecord
    if (!expense?.id) return

    try {
      if (journalRepository.getByReference("expense", expense.id)) return

      const entry = AccountingRules.fromExpense(expense, {
        eventId: event.id,
        source: "posted",
      })
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] expense journal failed", err)
      }
    }
  }
}

export const accountingEngine = new AccountingEngine()
