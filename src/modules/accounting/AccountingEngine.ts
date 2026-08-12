import type { PurchaseInvoiceRecord } from "@/data/purchaseInvoices"
import type { PurchaseReturnRecord } from "@/data/purchaseReturns"
import type { SupplierPaymentRecord } from "@/data/supplierPayments"
import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import type { InventoryMovement } from "@/modules/inventory/types"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { journalRepository } from "@/repositories/JournalRepository"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"
import { purchaseReturnRepository } from "@/repositories/PurchaseReturnRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { supplierInvoiceRepository } from "@/repositories/SupplierInvoiceRepository"
import { supplierPaymentRepository } from "@/repositories/SupplierPaymentRepository"

import { saleCogsPaisa } from "./costBasis"
import { AccountingRules, journalLine } from "./rules/AccountingRules"
import { ACCOUNT_CODES } from "./chartOfAccounts"
import { salesReturnRepository } from "@/repositories/SalesReturnRepository"
import { creditNoteRepository } from "@/repositories/CreditNoteRepository"

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
  restock?: boolean
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
    this.subscriber.on(EventTypes.PURCHASE_INVOICE_POSTED, (event) => {
      void this.onPurchaseInvoicePosted(event)
    })
    this.subscriber.on(EventTypes.SUPPLIER_PAYMENT_RECORDED, (event) => {
      void this.onSupplierPayment(event)
    })
    this.subscriber.on(EventTypes.PURCHASE_RETURN_POSTED, (event) => {
      void this.onPurchaseReturnPosted(event)
    })
    this.subscriber.on(EventTypes.INVENTORY_MOVEMENT_CREATED, (event) => {
      void this.onInventoryMovement(event)
    })
    this.subscriber.on(EventTypes.SALE_RETURN_POSTED, (event) => {
      void this.onSalesReturnPosted(event)
    })
    this.subscriber.on(EventTypes.CREDIT_NOTE_ISSUED, (event) => {
      void this.onCreditNoteIssued(event)
    })
    this.subscriber.on(EventTypes.CREDIT_NOTE_APPLIED, (event) => {
      void this.onCreditNoteApplied(event)
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

      const refund = await refundRepository.getById(payload.refundId)
      const restock = refund?.restock ?? payload.restock !== false
      let restockCogsPaisa = 0
      if (restock && (payload.invoiceId || refund?.invoiceId)) {
        const sale = await invoiceRepository.getById(
          payload.invoiceId || refund!.invoiceId
        )
        if (sale) restockCogsPaisa = saleCogsPaisa(sale)
      }

      const entry = AccountingRules.fromRefundPayload({
        refundId: payload.refundId,
        invoiceId: payload.invoiceId || refund?.invoiceId,
        amount: payload.amount ?? refund?.amount,
        amountPaisa: payload.amountPaisa ?? refund?.amountPaisa,
        method: payload.method ?? refund?.method,
        storeId: payload.storeId ?? refund?.storeId,
        createdAt: payload.createdAt || refund?.createdAt,
        createdBy: payload.createdBy ?? refund?.createdBy,
        eventId: event.id,
        restockCogsPaisa,
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

  private async onPurchaseInvoicePosted(event: DomainEvent) {
    const payload = event.payload as { id?: string }
    const invoiceId = payload?.id
    if (!invoiceId) return

    try {
      if (journalRepository.getByReference("purchase_invoice", invoiceId)) {
        return
      }

      const invoice =
        supplierInvoiceRepository.getById(invoiceId) ||
        (payload as PurchaseInvoiceRecord)
      if (!invoice?.id || !invoice.totalPaisa) return
      if (
        invoice.status !== "POSTED" &&
        invoice.status !== "PARTIAL" &&
        invoice.status !== "PAID"
      ) {
        return
      }

      const entry = AccountingRules.fromPurchaseInvoice(invoice, {
        eventId: event.id,
        source: "posted",
      })
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] purchase invoice journal failed", err)
      }
    }
  }

  private async onSupplierPayment(event: DomainEvent) {
    const payload = event.payload as {
      id?: string
      paymentId?: string
      amountPaisa?: number
      amount?: number
      paymentMethod?: string
      method?: string
      purchaseInvoiceId?: string
      invoiceNumber?: string
      paidAt?: string
      storeId?: string | null
      createdBy?: string | null
      paymentNumber?: string
      supplierId?: string
      supplierName?: string
      status?: string
    }
    const paymentId = payload.paymentId || payload.id
    if (!paymentId) return

    try {
      if (journalRepository.getByReference("supplier_payment", paymentId)) {
        return
      }

      let payment = supplierPaymentRepository.getById(paymentId)
      if (!payment) {
        const amountPaisa =
          typeof payload.amountPaisa === "number"
            ? payload.amountPaisa
            : typeof payload.amount === "number"
              ? Math.round(payload.amount * 100)
              : null
        if (amountPaisa == null) return
        payment = {
          id: paymentId,
          paymentNumber: payload.paymentNumber || paymentId,
          supplierId: payload.supplierId || "",
          supplierName: payload.supplierName || "",
          purchaseInvoiceId: payload.purchaseInvoiceId || "",
          invoiceNumber: payload.invoiceNumber || "",
          amountPaisa,
          allocations: [
            {
              purchaseInvoiceId: payload.purchaseInvoiceId || "",
              invoiceNumber: payload.invoiceNumber || "",
              amountPaisa,
            },
          ],
          method: payload.paymentMethod === "Cash" || payload.method === "Cash"
            ? "Cash"
            : "UPI",
          status: "Paid",
          paidAt: payload.paidAt || new Date().toISOString(),
          notes: null,
          storeId: payload.storeId ?? null,
          createdAt: payload.paidAt || new Date().toISOString(),
          updatedAt: payload.paidAt || new Date().toISOString(),
          createdBy: payload.createdBy ?? null,
        } satisfies SupplierPaymentRecord
      }

      const entry = AccountingRules.fromSupplierPayment(payment, {
        eventId: event.id,
        source: "posted",
      })
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] supplier payment journal failed", err)
      }
    }
  }

  private async onPurchaseReturnPosted(event: DomainEvent) {
    const payload = event.payload as { id?: string }
    const returnId = payload?.id
    if (!returnId) return

    try {
      if (journalRepository.getByReference("purchase_return", returnId)) {
        return
      }

      const ret =
        purchaseReturnRepository.getById(returnId) ||
        (payload as PurchaseReturnRecord)
      if (!ret?.id) return
      if (ret.status !== "POSTED") return

      const entry = AccountingRules.fromPurchaseReturn(ret, {
        eventId: event.id,
        source: "posted",
      })
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] purchase return journal failed", err)
      }
    }
  }

  private async onInventoryMovement(event: DomainEvent) {
    const movement = event.payload as InventoryMovement
    if (!movement?.id) return

    try {
      if (
        journalRepository.getByReference("inventory_movement", movement.id)
      ) {
        return
      }

      const entry = AccountingRules.fromInventoryMovement(movement, {
        eventId: event.id,
        source: "posted",
      })
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] inventory movement journal failed", err)
      }
    }
  }

  private async onSalesReturnPosted(event: DomainEvent) {
    const payload = event.payload as { id?: string }
    const id = payload?.id
    if (!id) return

    try {
      if (journalRepository.getByReference("sales_return", id)) return

      const ret = salesReturnRepository.getById(id)
      if (!ret || ret.status !== "POSTED") return

      const sale = await invoiceRepository.getById(ret.invoiceId)
      let restockCogs = 0
      if (ret.restock && sale) {
        // Pro-rate catalog COGS by returned qty / sold qty per line.
        for (const line of ret.lines) {
          const sold = sale.lines.find(
            (l) =>
              (l.sku || l.itemId).toUpperCase() ===
              (line.sku || line.itemId).toUpperCase()
          )
          if (!sold || sold.qty <= 0) continue
          const full = saleCogsPaisa({
            ...sale,
            lines: [sold],
          })
          restockCogs += Math.round((full * line.quantity) / sold.qty)
        }
      }

      if (ret.settlement === "REFUND" && ret.refundId) {
        // Cash reverse is on the refund journal; post COGS reverse only.
        if (ret.restock && restockCogs > 0) {
          await journalRepository.savePosted({
            id: `je_srn_${ret.id}`,
            date: (ret.postedAt || ret.createdAt).slice(0, 10),
            createdAt: ret.postedAt || ret.createdAt,
            description: `Sales return ${ret.returnNumber} COGS reverse`,
            referenceType: "sales_return",
            referenceId: ret.id,
            operatorId: ret.updatedBy ?? ret.createdBy,
            operatorName: null,
            paymentMethod: null,
            lines: [
              journalLine(ACCOUNT_CODES.INVENTORY, restockCogs, 0),
              journalLine(ACCOUNT_CODES.COGS, 0, restockCogs),
            ],
            source: "posted",
            eventId: event.id,
            storeId: ret.storeId,
          })
        }
        return
      }

      const entry = AccountingRules.fromSalesReturn(ret, {
        eventId: event.id,
        source: "posted",
        restockCogsPaisa: restockCogs,
      })
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] sales return journal failed", err)
      }
    }
  }

  private async onCreditNoteIssued(event: DomainEvent) {
    const payload = event.payload as {
      id?: string
      salesReturnId?: string | null
    }
    if (!payload?.id) return

    try {
      // Prefer the sales-return journal when this note was issued from a return.
      if (
        payload.salesReturnId &&
        journalRepository.getByReference("sales_return", payload.salesReturnId)
      ) {
        return
      }
      if (journalRepository.getByReference("credit_note", payload.id)) return

      const note = creditNoteRepository.getById(payload.id)
      if (!note) return
      if (note.salesReturnId) {
        // Wait for SALE_RETURN_POSTED to own the GL.
        return
      }

      const entry = AccountingRules.fromCreditNote(note, {
        eventId: event.id,
        source: "posted",
      })
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] credit note journal failed", err)
      }
    }
  }

  private async onCreditNoteApplied(event: DomainEvent) {
    const payload = event.payload as {
      id?: string
      creditNoteNumber?: string
      amountPaisa?: number
      invoiceId?: string | null
      storeId?: string | null
    }
    // When applied on a sale, fromSale already Dr Customer Credits.
    if (!payload?.id || payload.invoiceId) return
    if (typeof payload.amountPaisa !== "number" || payload.amountPaisa <= 0) {
      return
    }

    try {
      const refId = `${payload.id}:manual`
      if (journalRepository.getByReference("credit_note_applied", refId)) return
      const entry = AccountingRules.fromCreditNoteApplied(
        {
          id: payload.id,
          creditNoteNumber: payload.creditNoteNumber,
          amountPaisa: payload.amountPaisa,
          invoiceId: null,
          storeId: payload.storeId ?? null,
        },
        { eventId: event.id, source: "posted" }
      )
      if (!entry) return
      await journalRepository.savePosted(entry)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AccountingEngine] credit apply journal failed", err)
      }
    }
  }
}

export const accountingEngine = new AccountingEngine()
