import { rupeesToPaisa } from "@/lib/money"
import type {
  SupplierPaymentMethod,
  SupplierPaymentRecord,
} from "@/data/supplierPayments"
import { supplierPaymentRepository } from "@/repositories/SupplierPaymentRepository"

import {
  SupplierInvoiceError,
  SupplierInvoiceService,
} from "./SupplierInvoiceService"

export class SupplierPaymentError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: SupplierPaymentError["code"], message: string) {
    super(message)
    this.name = "SupplierPaymentError"
    this.code = code
  }
}

export type PayInvoiceInput = {
  purchaseInvoiceId: string
  amountRupees: number
  method: SupplierPaymentMethod
  notes?: string | null
  paidAt?: string
  actorId?: string | null
}

/**
 * Supplier payments — clear AP against a single purchase invoice.
 */
export class SupplierPaymentService {
  static list(): SupplierPaymentRecord[] {
    return supplierPaymentRepository.list()
  }

  static getById(id: string): SupplierPaymentRecord | null {
    return supplierPaymentRepository.getById(id)
  }

  static hydrate() {
    return supplierPaymentRepository.hydrate()
  }

  static listForInvoice(purchaseInvoiceId: string): SupplierPaymentRecord[] {
    return this.list().filter((p) => p.purchaseInvoiceId === purchaseInvoiceId)
  }

  static listForSupplier(supplierId: string): SupplierPaymentRecord[] {
    return this.list().filter((p) => p.supplierId === supplierId)
  }

  static async payInvoice(
    input: PayInvoiceInput
  ): Promise<SupplierPaymentRecord> {
    const inv = SupplierInvoiceService.getById(input.purchaseInvoiceId)
    if (!inv) {
      throw new SupplierPaymentError(
        "NOT_FOUND",
        "Purchase invoice not found."
      )
    }
    if (inv.status !== "POSTED" && inv.status !== "PARTIAL") {
      throw new SupplierPaymentError(
        "INVALID_STATUS",
        `Invoice ${inv.invoiceNumber} is ${inv.status} and cannot accept payment.`
      )
    }

    const amountPaisa = rupeesToPaisa(Number(input.amountRupees))
    if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) {
      throw new SupplierPaymentError(
        "VALIDATION",
        "Payment amount must be a positive number."
      )
    }
    if (input.method !== "Cash" && input.method !== "UPI") {
      throw new SupplierPaymentError(
        "VALIDATION",
        "Payment method must be Cash or UPI."
      )
    }

    try {
      await SupplierInvoiceService.applyPayment(
        inv.id,
        amountPaisa,
        input.actorId ?? null
      )
    } catch (err) {
      if (err instanceof SupplierInvoiceError) {
        throw new SupplierPaymentError(err.code, err.message)
      }
      throw err
    }

    return supplierPaymentRepository.create({
      supplierId: inv.supplierId,
      supplierName: inv.supplierName,
      purchaseInvoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amountPaisa,
      method: input.method,
      paidAt: input.paidAt,
      notes: input.notes,
      storeId: inv.storeId,
      actorId: input.actorId,
    })
  }
}

export type { SupplierPaymentRecord }
