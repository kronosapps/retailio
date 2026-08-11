import type { RecordedSale } from "@/data/invoices"
import { rupeesToPaisa } from "@/lib/money"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"

import { ACCOUNT_CODES } from "../chartOfAccounts"
import type { JournalEntry, JournalLine } from "../types"

export function journalLine(
  accountCode: string,
  debitPaisa = 0,
  creditPaisa = 0
): JournalLine {
  return {
    accountCode,
    debitPaisa: Math.max(0, Math.round(debitPaisa)),
    creditPaisa: Math.max(0, Math.round(creditPaisa)),
  }
}

export function tenderAccount(method: string | null | undefined): string {
  return method === "UPI" ? ACCOUNT_CODES.UPI : ACCOUNT_CODES.CASH
}

export function isBalanced(entry: Pick<JournalEntry, "lines">): boolean {
  const debit = entry.lines.reduce((s, l) => s + l.debitPaisa, 0)
  const credit = entry.lines.reduce((s, l) => s + l.creditPaisa, 0)
  return debit === credit
}

function balanceLines(lines: JournalLine[]): JournalLine[] {
  const d = lines.reduce((s, l) => s + l.debitPaisa, 0)
  const c = lines.reduce((s, l) => s + l.creditPaisa, 0)
  if (d === c) return lines
  const diff = d - c
  if (diff > 0) lines.push(journalLine(ACCOUNT_CODES.SALES, 0, diff))
  else lines.push(journalLine(ACCOUNT_CODES.SALES, -diff, 0))
  return lines
}

/**
 * Explicit accounting rules: business facts → balanced journal entries.
 */
export class AccountingRules {
  static fromSale(
    sale: RecordedSale,
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry {
    const taxable = sale.totals.taxableAmount || 0
    const gst = sale.totals.gstAmount || 0
    const total = sale.totals.total || taxable + gst
    const tender = tenderAccount(sale.paymentMethod)
    const lines = balanceLines([
      journalLine(tender, total, 0),
      journalLine(ACCOUNT_CODES.SALES, 0, taxable),
      ...(gst > 0 ? [journalLine(ACCOUNT_CODES.GST_PAYABLE, 0, gst)] : []),
    ])

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
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: sale.storeId ?? null,
    }
  }

  static fromRefund(input: {
    refundId: string
    invoiceId: string
    amountPaisa: number
    method: string | null
    createdAt: string
    createdBy?: string | null
    storeId?: string | null
    eventId?: string | null
    source?: JournalEntry["source"]
  }): JournalEntry {
    const amount = Math.max(0, Math.round(input.amountPaisa))
    const tender = tenderAccount(input.method)
    return {
      id: `je_refund_${input.refundId}`,
      date: input.createdAt.slice(0, 10),
      createdAt: input.createdAt,
      description: `Refund ${input.invoiceId}`,
      referenceType: "refund",
      referenceId: input.refundId,
      operatorId: input.createdBy ?? null,
      operatorName: null,
      paymentMethod: input.method,
      lines: [
        journalLine(ACCOUNT_CODES.SALES_RETURNS, amount, 0),
        journalLine(tender, 0, amount),
      ],
      source: input.source ?? "posted",
      eventId: input.eventId ?? null,
      storeId: input.storeId ?? null,
    }
  }

  static fromExpense(
    expense: ExpenseRecord,
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry {
    const tender = tenderAccount(expense.paymentMethod)
    return {
      id: `je_exp_${expense.id}`,
      date: expense.createdAt.slice(0, 10),
      createdAt: expense.createdAt,
      description: expense.title,
      referenceType: "expense",
      referenceId: expense.id,
      operatorId: expense.createdBy ?? null,
      operatorName: null,
      paymentMethod: expense.paymentMethod ?? "Cash",
      lines: [
        journalLine(ACCOUNT_CODES.EXPENSES, expense.amountPaisa, 0),
        journalLine(tender, 0, expense.amountPaisa),
      ],
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: expense.storeId,
    }
  }

  /** Build refund entry when only rupee amount is known (event payload). */
  static fromRefundPayload(payload: {
    refundId: string
    invoiceId?: string
    amount?: number
    amountPaisa?: number
    method?: string | null
    createdAt?: string
    createdBy?: string | null
    storeId?: string | null
    eventId?: string | null
  }): JournalEntry | null {
    if (!payload.refundId) return null
    const amountPaisa =
      typeof payload.amountPaisa === "number"
        ? payload.amountPaisa
        : typeof payload.amount === "number"
          ? rupeesToPaisa(payload.amount)
          : null
    if (amountPaisa == null) return null
    return this.fromRefund({
      refundId: payload.refundId,
      invoiceId: payload.invoiceId || "unknown",
      amountPaisa,
      method: payload.method ?? null,
      createdAt: payload.createdAt || new Date().toISOString(),
      createdBy: payload.createdBy,
      storeId: payload.storeId,
      eventId: payload.eventId,
    })
  }
}
