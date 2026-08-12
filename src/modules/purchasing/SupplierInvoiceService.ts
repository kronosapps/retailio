import { rupeesToPaisa } from "@/lib/money"
import {
  deriveInvoicePaymentStatus,
  remainingPayablePaisa,
  type PurchaseInvoiceRecord,
} from "@/data/purchaseInvoices"
import {
  supplierInvoiceRepository,
  type CreatePurchaseInvoiceInput,
} from "@/repositories/SupplierInvoiceRepository"
import { goodsReceiptRepository } from "@/repositories/GoodsReceiptRepository"
import type { GoodsReceiptRecord } from "@/data/goodsReceipts"

export class SupplierInvoiceError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: SupplierInvoiceError["code"], message: string) {
    super(message)
    this.name = "SupplierInvoiceError"
    this.code = code
  }
}

export type CreateFromGrnsInput = {
  goodsReceiptIds: string[]
  supplierBillNumber?: string | null
  dueAt?: string | null
  notes?: string | null
  billDate?: string
  storeId?: string | null
  actorId?: string | null
  /** If true, create as POSTED immediately (AP journal via event). */
  issueAndPost?: boolean
}

/**
 * Purchase invoices / AP — commercial bill after GRN. Does not change stock.
 */
export class SupplierInvoiceService {
  static list(): PurchaseInvoiceRecord[] {
    return supplierInvoiceRepository.list()
  }

  static getById(id: string): PurchaseInvoiceRecord | null {
    return supplierInvoiceRepository.getById(id)
  }

  static hydrate() {
    return supplierInvoiceRepository.hydrate()
  }

  static remainingPayablePaisa(inv: PurchaseInvoiceRecord): number {
    return remainingPayablePaisa(inv)
  }

  /** Posted GRNs not yet on any non-cancelled purchase invoice. */
  static listUnbilledPostedGrns(
    supplierId?: string | null
  ): GoodsReceiptRecord[] {
    const billed = new Set<string>()
    for (const inv of this.list()) {
      if (inv.status === "CANCELLED") continue
      for (const id of inv.goodsReceiptIds) billed.add(id)
    }
    return goodsReceiptRepository.list().filter((g) => {
      if (g.status !== "POSTED") return false
      if (billed.has(g.id)) return false
      if (supplierId && g.supplierId !== supplierId) return false
      return true
    })
  }

  static async createFromGrns(
    input: CreateFromGrnsInput
  ): Promise<PurchaseInvoiceRecord> {
    if (!input.goodsReceiptIds.length) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "Select at least one posted goods receipt."
      )
    }

    const grns: GoodsReceiptRecord[] = []
    for (const id of input.goodsReceiptIds) {
      const grn = goodsReceiptRepository.getById(id)
      if (!grn) {
        throw new SupplierInvoiceError(
          "NOT_FOUND",
          `Goods receipt not found: ${id}.`
        )
      }
      if (grn.status !== "POSTED") {
        throw new SupplierInvoiceError(
          "VALIDATION",
          `GRN ${grn.grnNumber} must be posted before invoicing.`
        )
      }
      grns.push(grn)
    }

    const supplierId = grns[0].supplierId
    if (grns.some((g) => g.supplierId !== supplierId)) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "All goods receipts on one invoice must share the same supplier."
      )
    }

    const unbilled = new Set(this.listUnbilledPostedGrns().map((g) => g.id))
    for (const grn of grns) {
      if (!unbilled.has(grn.id)) {
        throw new SupplierInvoiceError(
          "VALIDATION",
          `GRN ${grn.grnNumber} is already billed on another invoice.`
        )
      }
    }

    const lines: CreatePurchaseInvoiceInput["lines"] = []
    for (const grn of grns) {
      for (const line of grn.lines) {
        if (line.unitCostRupees == null) {
          throw new SupplierInvoiceError(
            "VALIDATION",
            `Unit cost required for ${line.sku} on ${grn.grnNumber} before invoicing.`
          )
        }
        const unitCostPaisa = rupeesToPaisa(line.unitCostRupees)
        if (unitCostPaisa < 0) {
          throw new SupplierInvoiceError(
            "VALIDATION",
            `Unit cost for ${line.sku} cannot be negative.`
          )
        }
        lines.push({
          sku: line.sku,
          productName: line.productName,
          quantity: line.quantity,
          unitCostPaisa,
          goodsReceiptId: grn.id,
        })
      }
    }

    if (!lines.length) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "Selected goods receipts have no lines."
      )
    }

    const poIds = [
      ...new Set(grns.map((g) => g.purchaseOrderId).filter(Boolean)),
    ] as string[]

    const draft = await supplierInvoiceRepository.createDraft({
      supplierId,
      supplierName: grns[0].supplierName,
      goodsReceiptIds: grns.map((g) => g.id),
      purchaseOrderId: poIds.length === 1 ? poIds[0] : null,
      supplierBillNumber: input.supplierBillNumber,
      billDate: input.billDate,
      dueAt: input.dueAt,
      notes: input.notes,
      lines,
      storeId: input.storeId ?? grns[0].storeId,
      actorId: input.actorId,
    })

    if (input.issueAndPost) {
      return this.post(draft.id, input.actorId ?? null)
    }
    return draft
  }

  static async post(
    invoiceId: string,
    actorId: string | null = null
  ): Promise<PurchaseInvoiceRecord> {
    const existing = supplierInvoiceRepository.getById(invoiceId)
    if (!existing) {
      throw new SupplierInvoiceError("NOT_FOUND", "Purchase invoice not found.")
    }
    if (existing.status !== "DRAFT") {
      throw new SupplierInvoiceError(
        "INVALID_STATUS",
        "Only draft invoices can be posted."
      )
    }
    if (!existing.lines.length || existing.totalPaisa <= 0) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "Invoice must have lines and a positive total before posting."
      )
    }
    for (const line of existing.lines) {
      if (line.unitCostPaisa < 0) {
        throw new SupplierInvoiceError(
          "VALIDATION",
          `Invalid unit cost for ${line.sku}.`
        )
      }
    }

    const now = new Date().toISOString()
    return supplierInvoiceRepository.save(
      {
        ...existing,
        status: "POSTED",
        postedAt: now,
        updatedBy: actorId,
      },
      "posted"
    )
  }

  static async cancel(
    invoiceId: string,
    actorId: string | null = null
  ): Promise<PurchaseInvoiceRecord> {
    const existing = supplierInvoiceRepository.getById(invoiceId)
    if (!existing) {
      throw new SupplierInvoiceError("NOT_FOUND", "Purchase invoice not found.")
    }
    if (existing.status === "CANCELLED") return existing
    if (existing.amountPaidPaisa > 0) {
      throw new SupplierInvoiceError(
        "INVALID_STATUS",
        "Invoices with payments cannot be cancelled."
      )
    }
    if (
      existing.status !== "DRAFT" &&
      existing.status !== "POSTED"
    ) {
      throw new SupplierInvoiceError(
        "INVALID_STATUS",
        "Only draft or unpaid posted invoices can be cancelled."
      )
    }

    return supplierInvoiceRepository.save(
      {
        ...existing,
        status: "CANCELLED",
        updatedBy: actorId,
      },
      "updated"
    )
  }

  /** Apply a debit-note / purchase-return credit (called by PurchaseReturnService). */
  static async applyCredit(
    invoiceId: string,
    amountPaisa: number,
    actorId: string | null = null
  ): Promise<PurchaseInvoiceRecord> {
    const existing = supplierInvoiceRepository.getById(invoiceId)
    if (!existing) {
      throw new SupplierInvoiceError("NOT_FOUND", "Purchase invoice not found.")
    }
    if (
      existing.status !== "POSTED" &&
      existing.status !== "PARTIAL" &&
      existing.status !== "PAID"
    ) {
      throw new SupplierInvoiceError(
        "INVALID_STATUS",
        "Credits can only be applied to posted invoices."
      )
    }
    const remaining = remainingPayablePaisa(existing)
    if (amountPaisa <= 0) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "Credit amount must be positive."
      )
    }
    // Debit notes may exceed remaining payable (creates supplier credit / negative AP).
    void remaining

    const amountCreditedPaisa =
      (existing.amountCreditedPaisa || 0) + amountPaisa
    const status = deriveInvoicePaymentStatus({
      ...existing,
      amountCreditedPaisa,
      status: existing.status,
    })

    return supplierInvoiceRepository.save(
      {
        ...existing,
        amountCreditedPaisa,
        status,
        updatedBy: actorId,
      },
      "updated"
    )
  }

  /** Apply a payment amount (called by SupplierPaymentService). */
  static async applyPayment(
    invoiceId: string,
    amountPaisa: number,
    actorId: string | null = null
  ): Promise<PurchaseInvoiceRecord> {
    const existing = supplierInvoiceRepository.getById(invoiceId)
    if (!existing) {
      throw new SupplierInvoiceError("NOT_FOUND", "Purchase invoice not found.")
    }
    if (
      existing.status !== "POSTED" &&
      existing.status !== "PARTIAL"
    ) {
      throw new SupplierInvoiceError(
        "INVALID_STATUS",
        "Payments can only be applied to posted or partially paid invoices."
      )
    }
    const remaining = remainingPayablePaisa(existing)
    if (amountPaisa <= 0) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        "Payment amount must be positive."
      )
    }
    if (amountPaisa > remaining) {
      throw new SupplierInvoiceError(
        "VALIDATION",
        `Overpayment blocked: remaining ₹${(remaining / 100).toFixed(2)}, tried ₹${(amountPaisa / 100).toFixed(2)}.`
      )
    }

    const amountPaidPaisa = existing.amountPaidPaisa + amountPaisa
    const status = deriveInvoicePaymentStatus({
      ...existing,
      amountPaidPaisa,
      status: existing.status,
    })

    return supplierInvoiceRepository.save(
      {
        ...existing,
        amountPaidPaisa,
        status,
        updatedBy: actorId,
      },
      "updated"
    )
  }
}

export type { PurchaseInvoiceRecord }
