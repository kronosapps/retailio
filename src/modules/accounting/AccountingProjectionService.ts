import type { RecordedSale } from "@/data/invoices"
import { BankingService } from "@/modules/banking"
import { InventoryService } from "@/modules/inventory"
import { rupeesToPaisa } from "@/lib/money"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import {
  expenseRepository,
  type ExpenseRecord,
} from "@/repositories/ExpenseRepository"

import { ACCOUNT_CODES } from "./chartOfAccounts"
import type { JournalEntry, JournalLine } from "./types"

function line(accountCode: string, debitPaisa = 0, creditPaisa = 0): JournalLine {
  return {
    accountCode,
    debitPaisa: Math.max(0, Math.round(debitPaisa)),
    creditPaisa: Math.max(0, Math.round(creditPaisa)),
  }
}

function tenderAccount(method: string | null | undefined): string {
  return method === "UPI" ? ACCOUNT_CODES.UPI : ACCOUNT_CODES.CASH
}

/**
 * Projects journal entries from existing business records.
 * Not a posted general ledger — a reproducible accounting projection.
 */
export class AccountingProjectionService {
  static async projectEntries(range: {
    start: Date
    end: Date
  }): Promise<JournalEntry[]> {
    const [invoices, refunds, expenses] = await Promise.all([
      invoiceRepository.list(),
      refundRepository.list(),
      expenseRepository.list(),
    ])

    const entries: JournalEntry[] = []

    // Opening balances from banking
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
        line(ACCOUNT_CODES.CASH, banking.opening.cashPaisa, 0),
        line(ACCOUNT_CODES.CAPITAL, 0, banking.opening.cashPaisa),
      ],
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
        line(ACCOUNT_CODES.UPI, banking.opening.upiPaisa, 0),
        line(ACCOUNT_CODES.CAPITAL, 0, banking.opening.upiPaisa),
      ],
    })

    for (const sale of invoices) {
      if (sale.paymentStatus !== "Paid" && sale.paymentStatus !== "Refunded") {
        continue
      }
      if (!inRange(sale.createdAt, range.start, range.end)) continue
      entries.push(saleEntry(sale))
    }

    for (const refund of refunds) {
      if (!inRange(refund.createdAt, range.start, range.end)) continue
      const amount =
        typeof refund.amountPaisa === "number"
          ? refund.amountPaisa
          : rupeesToPaisa(refund.amount || 0)
      const tender = tenderAccount(refund.method)
      entries.push({
        id: `je_refund_${refund.refundId}`,
        date: refund.createdAt.slice(0, 10),
        createdAt: refund.createdAt,
        description: `Refund ${refund.invoiceId}`,
        referenceType: "refund",
        referenceId: refund.refundId,
        operatorId: refund.createdBy,
        operatorName: null,
        paymentMethod: refund.method,
        lines: [
          line(ACCOUNT_CODES.SALES_RETURNS, amount, 0),
          line(tender, 0, amount),
        ],
      })
    }

    for (const expense of expenses) {
      if (!inRange(expense.createdAt, range.start, range.end)) continue
      entries.push(expenseEntry(expense))
    }

    // Inventory asset snapshot (period-end valuation) — informational equity offset
    const stock = InventoryService.getAllStock({ includeInactive: false })
    const inventoryValue = stock.reduce((sum, row) => {
      if (row.costPrice == null) return sum
      return sum + Math.max(0, row.quantity) * rupeesToPaisa(row.costPrice)
    }, 0)
    if (inventoryValue > 0) {
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
          line(ACCOUNT_CODES.INVENTORY, inventoryValue, 0),
          line(ACCOUNT_CODES.CAPITAL, 0, inventoryValue),
        ],
      })
    }

    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}

function saleEntry(sale: RecordedSale): JournalEntry {
  const taxable = sale.totals.taxableAmount || 0
  const gst = sale.totals.gstAmount || 0
  const total = sale.totals.total || taxable + gst
  const tender = tenderAccount(sale.paymentMethod)
  const lines: JournalLine[] = [
    line(tender, total, 0),
    line(ACCOUNT_CODES.SALES, 0, taxable),
  ]
  if (gst > 0) lines.push(line(ACCOUNT_CODES.GST_PAYABLE, 0, gst))
  // Balancing if rounding
  const d = lines.reduce((s, l) => s + l.debitPaisa, 0)
  const c = lines.reduce((s, l) => s + l.creditPaisa, 0)
  if (d !== c) {
    const diff = d - c
    if (diff > 0) lines.push(line(ACCOUNT_CODES.SALES, 0, diff))
    else lines.push(line(ACCOUNT_CODES.SALES, -diff, 0))
  }

  return {
    id: `je_sale_${sale.invoiceId}`,
    date: sale.createdAt.slice(0, 10),
    createdAt: sale.createdAt,
    description: `Sale ${sale.invoiceId}`,
    referenceType: "sale",
    referenceId: sale.invoiceId,
    operatorId: sale.cashierId,
    operatorName: sale.cashierName,
    paymentMethod: sale.paymentMethod ?? null,
    lines,
  }
}

function expenseEntry(expense: ExpenseRecord): JournalEntry {
  return {
    id: `je_exp_${expense.id}`,
    date: expense.createdAt.slice(0, 10),
    createdAt: expense.createdAt,
    description: expense.title,
    referenceType: "expense",
    referenceId: expense.id,
    operatorId: null,
    operatorName: null,
    paymentMethod: "Cash",
    lines: [
      line(ACCOUNT_CODES.EXPENSES, expense.amountPaisa, 0),
      line(ACCOUNT_CODES.CASH, 0, expense.amountPaisa),
    ],
  }
}

function inRange(iso: string, start: Date, end: Date) {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}
