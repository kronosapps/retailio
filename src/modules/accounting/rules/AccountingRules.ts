import type { RecordedSale } from "@/data/invoices"
import type { PurchaseInvoiceRecord } from "@/data/purchaseInvoices"
import type { PurchaseReturnRecord } from "@/data/purchaseReturns"
import type { SupplierPaymentRecord } from "@/data/supplierPayments"
import { rupeesToPaisa } from "@/lib/money"
import type { InventoryMovement } from "@/modules/inventory/types"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"

import { movementCostPaisa, saleCogsPaisa } from "../costBasis"
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
    opts?: {
      eventId?: string | null
      source?: JournalEntry["source"]
      /** Override catalog-derived COGS (tests). */
      cogsPaisa?: number
      /** Store credit applied toward this sale (paisa). */
      storeCreditAppliedPaisa?: number
    }
  ): JournalEntry {
    const taxable = sale.totals.taxableAmount || 0
    const gst = sale.totals.gstAmount || 0
    const total = sale.totals.total || taxable + gst
    const creditApplied = Math.min(
      total,
      Math.max(
        0,
        Math.round(
          opts?.storeCreditAppliedPaisa ??
            sale.totals.storeCreditAppliedPaisa ??
            0
        )
      )
    )
    const tenderAmount = Math.max(0, total - creditApplied)
    const tender = tenderAccount(sale.paymentMethod)
    const cogs =
      typeof opts?.cogsPaisa === "number"
        ? Math.max(0, Math.round(opts.cogsPaisa))
        : saleCogsPaisa(sale)
    const lines = balanceLines([
      ...(tenderAmount > 0 ? [journalLine(tender, tenderAmount, 0)] : []),
      ...(creditApplied > 0
        ? [journalLine(ACCOUNT_CODES.CUSTOMER_CREDIT, creditApplied, 0)]
        : []),
      journalLine(ACCOUNT_CODES.SALES, 0, taxable),
      ...(gst > 0 ? [journalLine(ACCOUNT_CODES.GST_PAYABLE, 0, gst)] : []),
      ...(cogs > 0
        ? [
            journalLine(ACCOUNT_CODES.COGS, cogs, 0),
            journalLine(ACCOUNT_CODES.INVENTORY, 0, cogs),
          ]
        : []),
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
    /** When stock was returned, reverse COGS / restore Inventory. */
    restockCogsPaisa?: number
  }): JournalEntry {
    const amount = Math.max(0, Math.round(input.amountPaisa))
    const tender = tenderAccount(input.method)
    const restockCogs = Math.max(0, Math.round(input.restockCogsPaisa || 0))
    const lines: JournalLine[] = [
      journalLine(ACCOUNT_CODES.SALES_RETURNS, amount, 0),
      journalLine(tender, 0, amount),
    ]
    if (restockCogs > 0) {
      lines.push(journalLine(ACCOUNT_CODES.INVENTORY, restockCogs, 0))
      lines.push(journalLine(ACCOUNT_CODES.COGS, 0, restockCogs))
    }
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
      lines,
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

  /** Posted purchase invoice → Dr Inventory (+ GST Input) / Cr Accounts Payable. */
  static fromPurchaseInvoice(
    invoice: PurchaseInvoiceRecord,
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry {
    const taxable = Math.max(
      0,
      Math.round(invoice.subtotalPaisa ?? invoice.totalPaisa)
    )
    const gst = Math.max(0, Math.round(invoice.gstPaisa || 0))
    const amount = Math.max(0, Math.round(invoice.totalPaisa))
    const date = (invoice.postedAt || invoice.billDate || invoice.createdAt).slice(
      0,
      10
    )
    const lines =
      gst > 0
        ? [
            journalLine(ACCOUNT_CODES.INVENTORY, taxable, 0),
            journalLine(ACCOUNT_CODES.GST_INPUT, gst, 0),
            journalLine(ACCOUNT_CODES.AP, 0, amount),
          ]
        : [
            journalLine(ACCOUNT_CODES.INVENTORY, amount, 0),
            journalLine(ACCOUNT_CODES.AP, 0, amount),
          ]
    return {
      id: `je_pin_${invoice.id}`,
      date,
      createdAt: invoice.postedAt || invoice.createdAt,
      description: `Purchase invoice ${invoice.invoiceNumber}`,
      referenceType: "purchase_invoice",
      referenceId: invoice.id,
      operatorId: invoice.updatedBy ?? invoice.createdBy,
      operatorName: null,
      paymentMethod: null,
      lines,
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: invoice.storeId,
    }
  }

  /** Supplier payment → Dr Accounts Payable / Cr Cash|UPI. */
  static fromSupplierPayment(
    payment: SupplierPaymentRecord,
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry {
    const amount = Math.max(0, Math.round(payment.amountPaisa))
    const tender = tenderAccount(payment.method)
    return {
      id: `je_spay_${payment.id}`,
      date: payment.paidAt.slice(0, 10),
      createdAt: payment.paidAt,
      description: `Supplier payment ${payment.paymentNumber} (${payment.invoiceNumber})`,
      referenceType: "supplier_payment",
      referenceId: payment.id,
      operatorId: payment.createdBy,
      operatorName: null,
      paymentMethod: payment.method,
      lines: [
        journalLine(ACCOUNT_CODES.AP, amount, 0),
        journalLine(tender, 0, amount),
      ],
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: payment.storeId,
    }
  }

  /** Posted purchase return → Dr AP / Cr Inventory (+ GST Input when billed with tax). */
  static fromPurchaseReturn(
    ret: PurchaseReturnRecord,
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry | null {
    // Unbilled GRN-only returns have no AP to reverse.
    if (!ret.purchaseInvoiceId || ret.totalPaisa <= 0) return null
    const amount = Math.max(0, Math.round(ret.totalPaisa))
    const gst = Math.max(0, Math.round(ret.gstPaisa || 0))
    const taxable = Math.max(0, amount - gst)
    const date = (ret.postedAt || ret.returnedAt || ret.createdAt).slice(0, 10)
    const lines =
      gst > 0
        ? [
            journalLine(ACCOUNT_CODES.AP, amount, 0),
            journalLine(ACCOUNT_CODES.INVENTORY, 0, taxable),
            journalLine(ACCOUNT_CODES.GST_INPUT, 0, gst),
          ]
        : [
            journalLine(ACCOUNT_CODES.AP, amount, 0),
            journalLine(ACCOUNT_CODES.INVENTORY, 0, amount),
          ]
    return {
      id: `je_prn_${ret.id}`,
      date,
      createdAt: ret.postedAt || ret.createdAt,
      description: `Purchase return ${ret.returnNumber}`,
      referenceType: "purchase_return",
      referenceId: ret.id,
      operatorId: ret.updatedBy ?? ret.createdBy,
      operatorName: null,
      paymentMethod: null,
      lines,
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: ret.storeId,
    }
  }

  /**
   * Stock movements not covered by sale / purchase invoice / refund /
   * purchase-return journals. PURCHASE / SALE / RETURN / PURCHASE_RETURN → null.
   */
  static fromInventoryMovement(
    movement: InventoryMovement,
    opts?: {
      eventId?: string | null
      source?: JournalEntry["source"]
      costPaisa?: number
    }
  ): JournalEntry | null {
    const skip = new Set([
      "PURCHASE",
      "SALE",
      "RETURN",
      "PURCHASE_RETURN",
    ])
    if (skip.has(movement.type)) return null

    const cost =
      typeof opts?.costPaisa === "number"
        ? Math.max(0, Math.round(opts.costPaisa))
        : movementCostPaisa(movement.sku, movement.quantity)
    if (cost <= 0) return null

    let lines: JournalLine[]
    switch (movement.type) {
      case "OPENING_STOCK":
      case "ADJUSTMENT_IN":
        lines = [
          journalLine(ACCOUNT_CODES.INVENTORY, cost, 0),
          journalLine(ACCOUNT_CODES.CAPITAL, 0, cost),
        ]
        break
      case "ADJUSTMENT_OUT":
      case "DAMAGE":
      case "WASTAGE":
        lines = [
          journalLine(ACCOUNT_CODES.COGS, cost, 0),
          journalLine(ACCOUNT_CODES.INVENTORY, 0, cost),
        ]
        break
      default:
        return null
    }

    return {
      id: `je_imv_${movement.id}`,
      date: movement.createdAt.slice(0, 10),
      createdAt: movement.createdAt,
      description: `${movement.type} ${movement.sku} × ${movement.quantity}`,
      referenceType: "inventory_movement",
      referenceId: movement.id,
      operatorId: movement.createdBy,
      operatorName: movement.createdByName,
      paymentMethod: null,
      lines,
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: movement.storeId,
    }
  }

  /**
   * Posted sales return — revenue reverse + optional COGS reverse.
   * REFUND: Cr Cash/UPI (money already also via REFUND_CREATED — skip cash here
   *   when refundId set; AccountingEngine prefers refund journal for cash).
   * CREDIT_NOTE / EXCHANGE (return leg): Cr Customer Credits.
   */
  static fromSalesReturn(
    ret: {
      id: string
      returnNumber: string
      settlement: "REFUND" | "CREDIT_NOTE" | "EXCHANGE"
      totalPaisa: number
      restock: boolean
      refundId: string | null
      postedAt: string | null
      createdAt: string
      storeId: string | null
      createdBy: string | null
      updatedBy: string | null
    },
    opts?: {
      eventId?: string | null
      source?: JournalEntry["source"]
      restockCogsPaisa?: number
      /** When true, skip tender line (refund event posts cash separately). */
      skipTender?: boolean
    }
  ): JournalEntry | null {
    const amount = Math.max(0, Math.round(ret.totalPaisa))
    if (amount <= 0) return null
    const restockCogs = Math.max(0, Math.round(opts?.restockCogsPaisa || 0))
    const skipTender =
      opts?.skipTender === true ||
      (ret.settlement === "REFUND" && Boolean(ret.refundId))

    const lines: JournalLine[] = [
      journalLine(ACCOUNT_CODES.SALES_RETURNS, amount, 0),
    ]
    if (skipTender || ret.settlement === "CREDIT_NOTE" || ret.settlement === "EXCHANGE") {
      lines.push(journalLine(ACCOUNT_CODES.CUSTOMER_CREDIT, 0, amount))
    } else {
      lines.push(journalLine(ACCOUNT_CODES.CASH, 0, amount))
    }
    if (ret.restock && restockCogs > 0) {
      lines.push(journalLine(ACCOUNT_CODES.INVENTORY, restockCogs, 0))
      lines.push(journalLine(ACCOUNT_CODES.COGS, 0, restockCogs))
    }

    const created = ret.postedAt || ret.createdAt
    return {
      id: `je_srn_${ret.id}`,
      date: created.slice(0, 10),
      createdAt: created,
      description: `Sales return ${ret.returnNumber} (${ret.settlement})`,
      referenceType: "sales_return",
      referenceId: ret.id,
      operatorId: ret.updatedBy ?? ret.createdBy,
      operatorName: null,
      paymentMethod: null,
      lines,
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: ret.storeId,
    }
  }

  static fromCreditNote(
    note: {
      id: string
      creditNoteNumber: string
      amountPaisa: number
      createdAt: string
      storeId: string | null
      createdBy: string | null
      reason: string | null
    },
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry | null {
    // Issued via sales return journal; standalone issue still needs a balanced entry.
    const amount = Math.max(0, Math.round(note.amountPaisa))
    if (amount <= 0) return null
    return {
      id: `je_cn_${note.id}`,
      date: note.createdAt.slice(0, 10),
      createdAt: note.createdAt,
      description: note.reason || `Credit note ${note.creditNoteNumber}`,
      referenceType: "credit_note",
      referenceId: note.id,
      operatorId: note.createdBy,
      operatorName: null,
      paymentMethod: null,
      lines: [
        journalLine(ACCOUNT_CODES.SALES_RETURNS, amount, 0),
        journalLine(ACCOUNT_CODES.CUSTOMER_CREDIT, 0, amount),
      ],
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: note.storeId,
    }
  }

  /** When store credit is applied toward a sale — Dr Customer Credits / Cr Sales. */
  static fromCreditNoteApplied(
    input: {
      id: string
      creditNoteNumber?: string
      amountPaisa: number
      invoiceId?: string | null
      storeId?: string | null
      appliedAt?: string
    },
    opts?: { eventId?: string | null; source?: JournalEntry["source"] }
  ): JournalEntry | null {
    const amount = Math.max(0, Math.round(input.amountPaisa))
    if (amount <= 0) return null
    const at = input.appliedAt || new Date().toISOString()
    return {
      id: `je_cna_${input.id}_${Math.round(amount)}`,
      date: at.slice(0, 10),
      createdAt: at,
      description: `Store credit applied${
        input.invoiceId ? ` on ${input.invoiceId}` : ""
      }`,
      referenceType: "credit_note_applied",
      referenceId: `${input.id}:${input.invoiceId || at}`,
      operatorId: null,
      operatorName: null,
      paymentMethod: null,
      lines: [
        journalLine(ACCOUNT_CODES.CUSTOMER_CREDIT, amount, 0),
        journalLine(ACCOUNT_CODES.SALES, 0, amount),
      ],
      source: opts?.source ?? "posted",
      eventId: opts?.eventId ?? null,
      storeId: input.storeId ?? null,
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
    restockCogsPaisa?: number
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
      restockCogsPaisa: payload.restockCogsPaisa,
    })
  }
}
