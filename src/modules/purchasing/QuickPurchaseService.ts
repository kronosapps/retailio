import type { GoodsReceiptRecord } from "@/data/goodsReceipts"
import type { PurchaseInvoiceRecord } from "@/data/purchaseInvoices"
import type { SupplierPaymentRecord } from "@/data/supplierPayments"
import type { SupplierPaymentMethod } from "@/data/supplierPayments"
import { paisaToRupees } from "@/lib/money"

import {
  PurchaseReceivingError,
  PurchaseReceivingService,
} from "./PurchaseReceivingService"
import {
  SupplierInvoiceError,
  SupplierInvoiceService,
} from "./SupplierInvoiceService"
import {
  SupplierPaymentError,
  SupplierPaymentService,
} from "./SupplierPaymentService"

export class QuickPurchaseError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS" | "STOCK"

  constructor(code: QuickPurchaseError["code"], message: string) {
    super(message)
    this.name = "QuickPurchaseError"
    this.code = code
  }
}

export type QuickPurchaseLineInput = {
  sku: string
  quantity: number
  unitCostRupees: number
  gstRate?: number | null
  notes?: string | null
}

export type QuickPurchaseInput = {
  supplierId: string
  lines: QuickPurchaseLineInput[]
  supplierBillNumber?: string | null
  notes?: string | null
  defaultGstRate?: number | null
  /** Optional immediate settlement (full remaining if amount omitted). */
  pay?: {
    method: SupplierPaymentMethod
    amountRupees?: number | null
  } | null
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
}

export type QuickPurchaseResult = {
  grn: GoodsReceiptRecord
  invoice: PurchaseInvoiceRecord
  payment: SupplierPaymentRecord | null
}

/**
 * One-shot: ad-hoc GRN (stock) → posted purchase invoice (AP) → optional payment.
 */
export class QuickPurchaseService {
  static async execute(input: QuickPurchaseInput): Promise<QuickPurchaseResult> {
    if (!input.supplierId) {
      throw new QuickPurchaseError("VALIDATION", "Select a supplier.")
    }
    if (!input.lines.length) {
      throw new QuickPurchaseError("VALIDATION", "Add at least one line.")
    }

    let grn: GoodsReceiptRecord
    try {
      grn = await PurchaseReceivingService.receiveAdHoc({
        supplierId: input.supplierId,
        notes: input.notes,
        lines: input.lines.map((l) => ({
          sku: l.sku,
          quantity: l.quantity,
          unitCostRupees: l.unitCostRupees,
          notes: l.notes,
        })),
        storeId: input.storeId,
        actorId: input.actorId,
        actorName: input.actorName,
        draftOnly: false,
      })
    } catch (err) {
      if (err instanceof PurchaseReceivingError) {
        const code =
          err.code === "ALREADY_POSTED"
            ? "INVALID_STATUS"
            : err.code === "STOCK"
              ? "STOCK"
              : err.code === "NOT_FOUND"
                ? "NOT_FOUND"
                : "VALIDATION"
        throw new QuickPurchaseError(code, err.message)
      }
      throw err
    }

    let invoice: PurchaseInvoiceRecord
    try {
      invoice = await SupplierInvoiceService.createFromGrns({
        goodsReceiptIds: [grn.id],
        supplierBillNumber: input.supplierBillNumber,
        notes: input.notes,
        defaultGstRate: input.defaultGstRate,
        storeId: input.storeId,
        actorId: input.actorId,
        issueAndPost: true,
      })
    } catch (err) {
      if (err instanceof SupplierInvoiceError) {
        throw new QuickPurchaseError(err.code, err.message)
      }
      throw err
    }

    let payment: SupplierPaymentRecord | null = null
    if (input.pay) {
      const remaining = SupplierInvoiceService.remainingPayablePaisa(invoice)
      const amountRupees =
        input.pay.amountRupees != null &&
        Number.isFinite(Number(input.pay.amountRupees))
          ? Number(input.pay.amountRupees)
          : paisaToRupees(remaining)
      try {
        payment = await SupplierPaymentService.payInvoice({
          purchaseInvoiceId: invoice.id,
          amountRupees,
          method: input.pay.method,
          notes: input.notes,
          actorId: input.actorId,
        })
        invoice = SupplierInvoiceService.getById(invoice.id) || invoice
      } catch (err) {
        if (err instanceof SupplierPaymentError) {
          throw new QuickPurchaseError(err.code, err.message)
        }
        throw err
      }
    }

    return { grn, invoice, payment }
  }
}
