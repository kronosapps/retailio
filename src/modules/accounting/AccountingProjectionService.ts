import type { RecordedSale } from "@/data/invoices"
import { BankingService } from "@/modules/banking"
import { InventoryService } from "@/modules/inventory"
import { rupeesToPaisa } from "@/lib/money"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { expenseRepository } from "@/repositories/ExpenseRepository"
import { supplierInvoiceRepository } from "@/repositories/SupplierInvoiceRepository"
import { supplierPaymentRepository } from "@/repositories/SupplierPaymentRepository"
import { purchaseReturnRepository } from "@/repositories/PurchaseReturnRepository"

import { ACCOUNT_CODES } from "./chartOfAccounts"
import { saleCogsPaisa } from "./costBasis"
import { AccountingRules, journalLine } from "./rules/AccountingRules"
import type { JournalEntry } from "./types"

/**
 * Projects journal entries from existing business records (backfill).
 * Posted GL from AccountingEngine takes precedence when merged.
 */
export class AccountingProjectionService {
  static async projectEntries(range: {
    start: Date
    end: Date
  }): Promise<JournalEntry[]> {
    const [invoices, refunds, expenses, purchaseInvoices, supplierPayments, purchaseReturns] =
      await Promise.all([
        invoiceRepository.list(),
        refundRepository.list(),
        expenseRepository.list(),
        Promise.resolve(supplierInvoiceRepository.list()),
        Promise.resolve(supplierPaymentRepository.list()),
        Promise.resolve(purchaseReturnRepository.list()),
      ])

    const entries: JournalEntry[] = []

    const banking = BankingService.getSnapshot()
    entries.push({
      id: "je_opening_cash",
      date: range.start.toISOString().slice(0, 10),
      createdAt: range.start.toISOString(),
      description: "Opening cash (banking)",
      referenceType: "opening",
      referenceId: "banking-opening-cash",
      operatorId: null,
      operatorName: "system",
      paymentMethod: "Cash",
      lines: [
        journalLine(ACCOUNT_CODES.CASH, banking.opening.cashPaisa, 0),
        journalLine(ACCOUNT_CODES.CAPITAL, 0, banking.opening.cashPaisa),
      ],
      source: "projected",
      eventId: null,
    })
    entries.push({
      id: "je_opening_upi",
      date: range.start.toISOString().slice(0, 10),
      createdAt: range.start.toISOString(),
      description: "Opening UPI/bank (banking)",
      referenceType: "opening",
      referenceId: "banking-opening-upi",
      operatorId: null,
      operatorName: "system",
      paymentMethod: "UPI",
      lines: [
        journalLine(ACCOUNT_CODES.UPI, banking.opening.upiPaisa, 0),
        journalLine(ACCOUNT_CODES.CAPITAL, 0, banking.opening.upiPaisa),
      ],
      source: "projected",
      eventId: null,
    })

    for (const sale of invoices) {
      if (sale.paymentStatus !== "Paid" && sale.paymentStatus !== "Refunded") {
        continue
      }
      if (!inRange(sale.createdAt, range.start, range.end)) continue
      entries.push(
        AccountingRules.fromSale(sale as RecordedSale, { source: "projected" })
      )
    }

    for (const refund of refunds) {
      if (!inRange(refund.createdAt, range.start, range.end)) continue
      const amount =
        typeof refund.amountPaisa === "number"
          ? refund.amountPaisa
          : rupeesToPaisa(refund.amount || 0)
      entries.push(
        AccountingRules.fromRefund({
          refundId: refund.refundId,
          invoiceId: refund.invoiceId,
          amountPaisa: amount,
          method: refund.method,
          createdAt: refund.createdAt,
          createdBy: refund.createdBy,
          storeId: refund.storeId,
          source: "projected",
          restockCogsPaisa: refund.restock
            ? (() => {
                const sale = invoices.find((s) => s.invoiceId === refund.invoiceId)
                return sale ? saleCogsPaisa(sale as RecordedSale) : 0
              })()
            : 0,
        })
      )
    }

    for (const expense of expenses) {
      if (!inRange(expense.createdAt, range.start, range.end)) continue
      entries.push(
        AccountingRules.fromExpense(expense, { source: "projected" })
      )
    }

    for (const pin of purchaseInvoices) {
      if (
        pin.status !== "POSTED" &&
        pin.status !== "PARTIAL" &&
        pin.status !== "PAID"
      ) {
        continue
      }
      const when = pin.postedAt || pin.createdAt
      if (!inRange(when, range.start, range.end)) continue
      entries.push(
        AccountingRules.fromPurchaseInvoice(pin, { source: "projected" })
      )
    }

    for (const pay of supplierPayments) {
      if (!inRange(pay.paidAt, range.start, range.end)) continue
      entries.push(
        AccountingRules.fromSupplierPayment(pay, { source: "projected" })
      )
    }

    for (const ret of purchaseReturns) {
      if (ret.status !== "POSTED") continue
      const when = ret.postedAt || ret.createdAt
      if (!inRange(when, range.start, range.end)) continue
      const entry = AccountingRules.fromPurchaseReturn(ret, {
        source: "projected",
      })
      if (entry) entries.push(entry)
    }

    const stock = InventoryService.getAllStock({ includeInactive: false })
    const inventoryValue = stock.reduce((sum, row) => {
      if (row.costPrice == null) return sum
      return sum + Math.max(0, row.quantity) * rupeesToPaisa(row.costPrice)
    }, 0)
    // Skip snapshot when perpetual inventory is in play (purchase invoices /
    // COGS / opening movements). Snapshot would double-count Inventory Asset.
    const hasPerpetualInventory =
      purchaseInvoices.some(
        (p) =>
          p.status === "POSTED" ||
          p.status === "PARTIAL" ||
          p.status === "PAID"
      ) ||
      entries.some(
        (e) =>
          e.referenceType === "sale" ||
          e.referenceType === "purchase_invoice" ||
          e.referenceType === "inventory_movement"
      )
    if (inventoryValue > 0 && !hasPerpetualInventory) {
      entries.push({
        id: "je_inventory_snapshot",
        date: range.end.toISOString().slice(0, 10),
        createdAt: range.end.toISOString(),
        description: "Inventory asset snapshot (cost)",
        referenceType: "inventory",
        referenceId: "inventory-snapshot",
        operatorId: null,
        operatorName: "system",
        paymentMethod: null,
        lines: [
          journalLine(ACCOUNT_CODES.INVENTORY, inventoryValue, 0),
          journalLine(ACCOUNT_CODES.CAPITAL, 0, inventoryValue),
        ],
        source: "projected",
        eventId: null,
      })
    }

    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}

function inRange(iso: string, start: Date, end: Date) {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}
