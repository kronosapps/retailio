import type { RecordedSale, RecordedSaleLine } from "@/data/invoices"
import type {
  ExchangeLine,
  SalesReturnLine,
  SalesReturnRecord,
  SalesReturnSettlement,
} from "@/data/salesReturns"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { paisaToRupees, rupeesToPaisa } from "@/lib/money"
import { InventoryService } from "@/modules/inventory"
import { InvoiceService } from "@/modules/invoice"
import type { PaymentMethod } from "@/modules/payment/types"
import { customerRepository } from "@/repositories/CustomerRepository"
import { creditNoteRepository } from "@/repositories/CreditNoteRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import {
  salesReturnRepository,
  type CreateSalesReturnDraftInput,
} from "@/repositories/SalesReturnRepository"
import { createId } from "@/utils/id"

export class SalesReturnError extends Error {
  code:
    | "VALIDATION"
    | "NOT_FOUND"
    | "NOT_PAID"
    | "INVALID_STATUS"
    | "OVER_RETURN"

  constructor(code: SalesReturnError["code"], message: string) {
    super(message)
    this.name = "SalesReturnError"
    this.code = code
  }
}

export type ReturnLineInput = {
  itemId: string
  sku?: string | null
  quantity: number
}

export type ExchangeLineInput = {
  itemId: string
  sku?: string | null
  name: string
  quantity: number
  unitPriceRupees: number
}

export type CreateSalesReturnInput = {
  invoiceId: string
  settlement: SalesReturnSettlement
  lines: ReturnLineInput[]
  /** Required when settlement is EXCHANGE. */
  exchangeLines?: ExchangeLineInput[]
  reason?: string | null
  notes?: string | null
  restock?: boolean
  /** Cash/UPI for REFUND settlement (and exchange net refund). */
  refundMethod?: PaymentMethod
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  draftOnly?: boolean
}

/**
 * Sales returns & exchanges — goods document + settlement.
 * RefundService remains cash/UPI money-out only (restock already done here).
 */
export class SalesReturnService {
  static list(): SalesReturnRecord[] {
    return salesReturnRepository.list()
  }

  static getById(id: string): SalesReturnRecord | null {
    return salesReturnRepository.getById(id)
  }

  static hydrate() {
    return salesReturnRepository.hydrate()
  }

  static returnedQtyBySkuForInvoice(invoiceId: string): Record<string, number> {
    const map: Record<string, number> = {}
    for (const ret of this.list()) {
      if (ret.status !== "POSTED") continue
      if (ret.invoiceId !== invoiceId) continue
      for (const line of ret.lines) {
        const key = (line.sku || line.itemId).toUpperCase()
        map[key] = (map[key] || 0) + line.quantity
      }
    }
    return map
  }

  static remainingReturnable(sale: RecordedSale): Array<{
    itemId: string
    sku: string | null
    name: string
    soldQty: number
    returnedQty: number
    remainingQty: number
    unitPricePaisa: number
    lineTotalPaisa: number
  }> {
    const returned = this.returnedQtyBySkuForInvoice(sale.invoiceId)
    return sale.lines
      .filter((l) => !l.isLoyaltyReward && l.qty > 0)
      .map((l) => {
        const key = (l.sku || l.itemId).toUpperCase()
        const returnedQty = returned[key] || 0
        return {
          itemId: l.itemId,
          sku: l.sku ?? null,
          name: l.name,
          soldQty: l.qty,
          returnedQty,
          remainingQty: Math.max(0, l.qty - returnedQty),
          unitPricePaisa: l.unitPricePaisa,
          lineTotalPaisa: l.lineTotalPaisa,
        }
      })
  }

  static async create(
    input: CreateSalesReturnInput
  ): Promise<SalesReturnRecord> {
    const sale = await invoiceRepository.getById(input.invoiceId)
    if (!sale) throw new SalesReturnError("NOT_FOUND", "Invoice not found.")

    if (
      sale.paymentStatus !== "Paid" &&
      sale.paymentStatus !== "PartiallyRefunded"
    ) {
      throw new SalesReturnError(
        "NOT_PAID",
        "Only paid (or partially returned) invoices can be returned."
      )
    }

    if (!input.lines.length) {
      throw new SalesReturnError("VALIDATION", "Add at least one return line.")
    }

    const remaining = this.remainingReturnable(sale)
    const remainingByKey = new Map(
      remaining.map((r) => [(r.sku || r.itemId).toUpperCase(), r])
    )

    const builtLines: SalesReturnLine[] = []
    for (const raw of input.lines) {
      const key = (raw.sku || raw.itemId).trim().toUpperCase()
      const avail = remainingByKey.get(key)
      if (!avail) {
        throw new SalesReturnError(
          "VALIDATION",
          `Item ${key} is not on this invoice.`
        )
      }
      const qty = Math.floor(Number(raw.quantity) || 0)
      if (qty <= 0) continue
      if (qty > avail.remainingQty) {
        throw new SalesReturnError(
          "OVER_RETURN",
          `${avail.name}: only ${avail.remainingQty} left to return.`
        )
      }
      const unit = avail.unitPricePaisa
      const lineTotal = Math.round(
        (avail.lineTotalPaisa / avail.soldQty) * qty
      )
      builtLines.push({
        itemId: avail.itemId,
        sku: avail.sku,
        name: avail.name,
        soldQty: avail.soldQty,
        quantity: qty,
        unitPricePaisa: unit,
        lineTotalPaisa: lineTotal,
      })
    }
    if (!builtLines.length) {
      throw new SalesReturnError("VALIDATION", "Enter return quantities.")
    }

    const subtotal = builtLines.reduce((s, l) => s + l.lineTotalPaisa, 0)
    const taxable = sale.totals.taxableAmount || 0
    const gst =
      taxable > 0
        ? Math.round((sale.totals.gstAmount || 0) * (subtotal / taxable))
        : 0
    const total = subtotal + gst

    let exchangeLines: ExchangeLine[] = []
    let exchangeTotal = 0
    if (input.settlement === "EXCHANGE") {
      if (!input.exchangeLines?.length) {
        throw new SalesReturnError(
          "VALIDATION",
          "Add exchange products (new merchandise)."
        )
      }
      exchangeLines = input.exchangeLines.map((l) => {
        const qty = Math.floor(Number(l.quantity) || 0)
        const unit = rupeesToPaisa(l.unitPriceRupees)
        return {
          itemId: l.itemId,
          sku: l.sku ?? null,
          name: l.name.trim(),
          quantity: qty,
          unitPricePaisa: unit,
          lineTotalPaisa: Math.round(unit * qty),
        }
      }).filter((l) => l.quantity > 0 && l.lineTotalPaisa > 0)
      if (!exchangeLines.length) {
        throw new SalesReturnError(
          "VALIDATION",
          "Exchange lines need quantity and price."
        )
      }
      exchangeTotal = exchangeLines.reduce((s, l) => s + l.lineTotalPaisa, 0)
    }

    if (input.settlement === "CREDIT_NOTE" && !sale.customerId) {
      throw new SalesReturnError(
        "VALIDATION",
        "Credit notes need a customer on the original sale."
      )
    }

    const draftInput: CreateSalesReturnDraftInput = {
      invoiceId: sale.invoiceId,
      settlement: input.settlement,
      customerId: sale.customerId ?? null,
      customerName: sale.customerName || "Walk-in",
      reason: input.reason,
      notes: input.notes,
      restock: input.restock !== false,
      lines: builtLines,
      exchangeLines,
      subtotalPaisa: subtotal,
      gstPaisa: gst,
      totalPaisa: total,
      exchangeTotalPaisa: exchangeTotal,
      storeId: input.storeId ?? sale.storeId,
      actorId: input.actorId,
    }

    const draft = await salesReturnRepository.createDraft(draftInput)
    if (input.draftOnly) return draft

    return this.post(draft.id, {
      refundMethod: input.refundMethod,
      actorId: input.actorId,
      actorName: input.actorName,
    })
  }

  static async post(
    returnId: string,
    opts?: {
      refundMethod?: PaymentMethod
      actorId?: string | null
      actorName?: string | null
    }
  ): Promise<SalesReturnRecord> {
    const draft = salesReturnRepository.getById(returnId)
    if (!draft) throw new SalesReturnError("NOT_FOUND", "Return not found.")
    if (draft.status !== "DRAFT") {
      throw new SalesReturnError("INVALID_STATUS", "Return is not a draft.")
    }

    const sale = await invoiceRepository.getById(draft.invoiceId)
    if (!sale) throw new SalesReturnError("NOT_FOUND", "Invoice not found.")

    if (draft.restock) {
      await InventoryService.restockForSalesReturn({
        salesReturnId: draft.id,
        invoiceId: draft.invoiceId,
        storeId: draft.storeId,
        actorId: opts?.actorId ?? draft.createdBy,
        actorName: opts?.actorName ?? null,
        lines: draft.lines,
      })
    }

    let refundId: string | null = null
    let creditNoteId: string | null = null
    let exchangeInvoiceId: string | null = null

    if (draft.settlement === "REFUND") {
      refundId = await this.settleCashRefund({
        sale,
        draft,
        amountPaisa: draft.totalPaisa,
        method: opts?.refundMethod,
        actorId: opts?.actorId,
      })
    } else if (draft.settlement === "CREDIT_NOTE") {
      creditNoteId = await this.settleCreditNote({
        sale,
        draft,
        amountPaisa: draft.totalPaisa,
        actorId: opts?.actorId,
      })
    } else if (draft.settlement === "EXCHANGE") {
      const exchange = await this.settleExchange({
        sale,
        draft,
        refundMethod: opts?.refundMethod,
        actorId: opts?.actorId,
        actorName: opts?.actorName,
      })
      exchangeInvoiceId = exchange.exchangeInvoiceId
      refundId = exchange.refundId
      creditNoteId = exchange.creditNoteId
    }

    const now = new Date().toISOString()
    const posted = await salesReturnRepository.save(
      {
        ...draft,
        status: "POSTED",
        postedAt: now,
        refundId,
        creditNoteId,
        exchangeInvoiceId,
        updatedBy: opts?.actorId ?? draft.updatedBy,
      },
      "posted"
    )

    await this.refreshInvoiceReturnStatus(sale.invoiceId)
    return posted
  }

  /** Cancel an unpaid sale (no stock was taken on pay). */
  static async cancelUnpaidSale(input: {
    invoiceId: string
    reason?: string | null
    actorId?: string | null
  }) {
    const sale = await invoiceRepository.getById(input.invoiceId)
    if (!sale) throw new SalesReturnError("NOT_FOUND", "Invoice not found.")
    if (sale.paymentStatus === "Paid" || sale.paymentStatus === "Refunded") {
      throw new SalesReturnError(
        "INVALID_STATUS",
        "Paid sales must use Returns — not cancel."
      )
    }
    if (sale.paymentStatus === "Cancelled") {
      return sale
    }
    const updated = await invoiceRepository.updatePaymentFields(
      sale.invoiceId,
      { paymentStatus: "Cancelled" }
    )
    await EventPublisher.publish(
      EventTypes.SALE_CANCELLED,
      {
        invoiceId: sale.invoiceId,
        reason: input.reason ?? null,
        actorId: input.actorId ?? null,
        storeId: sale.storeId,
      },
      sale.storeId
    )
    return updated
  }

  private static async settleCashRefund(input: {
    sale: RecordedSale
    draft: SalesReturnRecord
    amountPaisa: number
    method?: PaymentMethod
    actorId?: string | null
  }): Promise<string> {
    const method: PaymentMethod =
      input.method ||
      input.sale.paymentMethod ||
      "Cash"
    const refund = await refundRepository.create({
      invoiceId: input.sale.invoiceId,
      paymentId: input.sale.paymentId ?? null,
      customerId: input.sale.customerId ?? null,
      customerName: input.sale.customerName || "Walk-in",
      amountPaisa: input.amountPaisa,
      method,
      reason:
        input.draft.reason ||
        `Sales return ${input.draft.returnNumber}`,
      restock: false,
      restockedSkuCount: 0,
      storeId: input.draft.storeId,
      lines: input.draft.lines.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        weight: "",
        qty: l.quantity,
      })),
      createdBy: input.actorId ?? null,
    })

    await EventPublisher.publish(
      EventTypes.PAYMENT_REFUNDED,
      {
        invoiceId: input.sale.invoiceId,
        paymentId: refund.paymentId,
        customerId: input.sale.customerId ?? null,
        customerName: input.sale.customerName || "Walk-in",
        amount: paisaToRupees(input.amountPaisa),
        amountPaisa: input.amountPaisa,
        refundId: refund.refundId,
        restock: false,
        method,
        salesReturnId: input.draft.id,
      },
      input.draft.storeId
    )
    return refund.refundId
  }

  private static async settleCreditNote(input: {
    sale: RecordedSale
    draft: SalesReturnRecord
    amountPaisa: number
    actorId?: string | null
  }): Promise<string> {
    const customerId = input.sale.customerId
    if (!customerId) {
      throw new SalesReturnError(
        "VALIDATION",
        "Credit notes need a customer on the sale."
      )
    }
    const note = await creditNoteRepository.issue({
      customerId,
      customerName: input.sale.customerName || "Customer",
      amountPaisa: input.amountPaisa,
      invoiceId: input.sale.invoiceId,
      salesReturnId: input.draft.id,
      reason: input.draft.reason,
      storeId: input.draft.storeId,
      actorId: input.actorId,
    })
    const customer = customerRepository.getById(customerId)
    if (customer) {
      await customerRepository.save(
        {
          ...customer,
          storeCreditPaisa:
            (customer.storeCreditPaisa || 0) + input.amountPaisa,
        },
        false
      )
    }
    return note.id
  }

  private static async settleExchange(input: {
    sale: RecordedSale
    draft: SalesReturnRecord
    refundMethod?: PaymentMethod
    actorId?: string | null
    actorName?: string | null
  }): Promise<{
    exchangeInvoiceId: string
    refundId: string | null
    creditNoteId: string | null
  }> {
    const exchangeSale = await InvoiceService.create({
      cashierId: input.actorId ?? input.sale.cashierId,
      cashierName: input.actorName ?? input.sale.cashierName,
      storeId: input.draft.storeId ?? input.sale.storeId,
      customerName: input.sale.customerName,
      customerId: input.sale.customerId,
      customerPhone: input.sale.customerPhone,
      lines: input.draft.exchangeLines.map(
        (l): RecordedSaleLine => ({
          itemId: l.itemId,
          sku: l.sku,
          name: l.name,
          weight: "",
          qty: l.quantity,
          unitPricePaisa: l.unitPricePaisa,
          lineTotalPaisa: l.lineTotalPaisa,
        })
      ),
      totals: {
        grossSubtotal: input.draft.exchangeTotalPaisa,
        friendsFamilyDiscount: 0,
        friendsFamilyPercent: 0,
        occasionDiscount: 0,
        occasionPercent: 0,
        occasionName: null,
        loyaltyDiscount: 0,
        loyaltyLabel: null,
        taxableAmount: input.draft.exchangeTotalPaisa,
        gstAmount: 0,
        gstPercent: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        cgstPercent: 0,
        sgstPercent: 0,
        total: input.draft.exchangeTotalPaisa,
      },
      loyalty: { mode: "off", freeItemId: null, freeItemName: null },
    })

    const delta = input.draft.netDeltaPaisa
    let refundId: string | null = null
    let creditNoteId: string | null = null

    if (delta > 0) {
      // Customer pays the difference.
      const paymentId = createId("pay")
      await paymentRepository.save({
        paymentId,
        invoiceId: exchangeSale.invoiceId,
        invoiceNumber: exchangeSale.invoiceId,
        transactionReference: `EX-${input.draft.returnNumber}`,
        merchantUPI: "",
        merchantName: "RetailOS",
        amountPaisa: delta,
        amount: paisaToRupees(delta),
        currency: "INR",
        paymentMethod: input.refundMethod || input.sale.paymentMethod || "Cash",
        status: "Paid",
        createdAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        remarks: `Exchange top-up for ${input.draft.returnNumber}`,
        upiUrl: null,
        qrGeneratedAt: null,
        qrExpiresAt: null,
        customerName: input.sale.customerName || "Walk-in",
        customerId: input.sale.customerId,
        storeId: input.draft.storeId,
        attempt: 1,
        upiTxnLast4: null,
        cashReceiptNumber: null,
        cashReceiptId: null,
      })
      await invoiceRepository.updatePaymentFields(exchangeSale.invoiceId, {
        paymentId,
        paymentStatus: "Paid",
        paymentMethod: input.refundMethod || input.sale.paymentMethod || "Cash",
      })
    } else if (delta < 0) {
      // We owe the customer the difference.
      const owed = Math.abs(delta)
      refundId = await this.settleCashRefund({
        sale: input.sale,
        draft: input.draft,
        amountPaisa: owed,
        method: input.refundMethod || input.sale.paymentMethod || "Cash",
        actorId: input.actorId,
      })
      await invoiceRepository.updatePaymentFields(exchangeSale.invoiceId, {
        paymentStatus: "Paid",
        paymentMethod: input.sale.paymentMethod || "Cash",
      })
      await InventoryService.deductForSale(
        { ...exchangeSale, paymentStatus: "Paid" },
        input.actorId ?? null,
        input.actorName ?? null
      )
      const { AccountingRules } = await import(
        "@/modules/accounting/rules/AccountingRules"
      )
      const { journalRepository } = await import(
        "@/repositories/JournalRepository"
      )
      const entry = AccountingRules.fromSale(
        { ...exchangeSale, paymentStatus: "Paid" },
        { source: "posted" }
      )
      if (!journalRepository.getByReference("sale", exchangeSale.invoiceId)) {
        await journalRepository.savePosted(entry)
      }
    } else {
      await invoiceRepository.updatePaymentFields(exchangeSale.invoiceId, {
        paymentStatus: "Paid",
        paymentMethod: input.sale.paymentMethod || "Cash",
      })
      await InventoryService.deductForSale(
        { ...exchangeSale, paymentStatus: "Paid" },
        input.actorId ?? null,
        input.actorName ?? null
      )
      const { AccountingRules } = await import(
        "@/modules/accounting/rules/AccountingRules"
      )
      const { journalRepository } = await import(
        "@/repositories/JournalRepository"
      )
      const entry = AccountingRules.fromSale(
        { ...exchangeSale, paymentStatus: "Paid" },
        { source: "posted" }
      )
      if (!journalRepository.getByReference("sale", exchangeSale.invoiceId)) {
        await journalRepository.savePosted(entry)
      }
    }

    return {
      exchangeInvoiceId: exchangeSale.invoiceId,
      refundId,
      creditNoteId,
    }
  }

  private static async refreshInvoiceReturnStatus(invoiceId: string) {
    const sale = await invoiceRepository.getById(invoiceId)
    if (!sale) return
    const remaining = this.remainingReturnable(sale)
    const allReturned = remaining.every((r) => r.remainingQty === 0)
    const anyReturned = remaining.some((r) => r.returnedQty > 0)
    if (allReturned && anyReturned) {
      await invoiceRepository.updatePaymentFields(invoiceId, {
        paymentStatus: "Refunded",
      })
    } else if (anyReturned) {
      await invoiceRepository.updatePaymentFields(invoiceId, {
        paymentStatus: "PartiallyRefunded",
      })
    }
  }
}
