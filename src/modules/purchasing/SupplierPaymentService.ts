import { rupeesToPaisa } from "@/lib/money"
import type {
  SupplierPaymentAllocation,
  SupplierPaymentMethod,
  SupplierPaymentRecord,
} from "@/data/supplierPayments"
import { supplierPaymentRepository } from "@/repositories/SupplierPaymentRepository"
import { SupplierService } from "@/modules/supplier"

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

export type PayInvoicesAllocationInput = {
  purchaseInvoiceId: string
  amountRupees: number
}

export type PayInvoicesInput = {
  supplierId: string
  method: SupplierPaymentMethod
  allocations: PayInvoicesAllocationInput[]
  notes?: string | null
  paidAt?: string
  actorId?: string | null
  storeId?: string | null
}

/**
 * Supplier payments — clear AP against one or many purchase invoices.
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
    return this.list().filter(
      (p) =>
        p.purchaseInvoiceId === purchaseInvoiceId ||
        p.allocations.some((a) => a.purchaseInvoiceId === purchaseInvoiceId)
    )
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
    return this.payInvoices({
      supplierId: inv.supplierId,
      method: input.method,
      allocations: [
        {
          purchaseInvoiceId: inv.id,
          amountRupees: input.amountRupees,
        },
      ],
      notes: input.notes,
      paidAt: input.paidAt,
      actorId: input.actorId,
      storeId: inv.storeId,
    })
  }

  /** Allocate one payment across multiple invoices of the same supplier. */
  static async payInvoices(
    input: PayInvoicesInput
  ): Promise<SupplierPaymentRecord> {
    if (input.method !== "Cash" && input.method !== "UPI") {
      throw new SupplierPaymentError(
        "VALIDATION",
        "Payment method must be Cash or UPI."
      )
    }
    if (!input.allocations.length) {
      throw new SupplierPaymentError(
        "VALIDATION",
        "Select at least one invoice allocation."
      )
    }

    const supplier =
      SupplierService.getById(input.supplierId) ||
      (() => {
        const first = SupplierInvoiceService.getById(
          input.allocations[0].purchaseInvoiceId
        )
        return first
          ? { id: first.supplierId, name: first.supplierName, storeId: first.storeId }
          : null
      })()
    if (!supplier) {
      throw new SupplierPaymentError("NOT_FOUND", "Supplier not found.")
    }

    const allocations: SupplierPaymentAllocation[] = []
    for (const row of input.allocations) {
      const amountPaisa = rupeesToPaisa(Number(row.amountRupees))
      if (!Number.isFinite(amountPaisa) || amountPaisa <= 0) continue

      const inv = SupplierInvoiceService.getById(row.purchaseInvoiceId)
      if (!inv) {
        throw new SupplierPaymentError(
          "NOT_FOUND",
          `Purchase invoice not found: ${row.purchaseInvoiceId}.`
        )
      }
      if (inv.supplierId !== supplier.id) {
        throw new SupplierPaymentError(
          "VALIDATION",
          "All allocated invoices must belong to the same supplier."
        )
      }
      if (inv.status !== "POSTED" && inv.status !== "PARTIAL") {
        throw new SupplierPaymentError(
          "INVALID_STATUS",
          `Invoice ${inv.invoiceNumber} is ${inv.status} and cannot accept payment.`
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

      allocations.push({
        purchaseInvoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountPaisa,
      })
    }

    if (!allocations.length) {
      throw new SupplierPaymentError(
        "VALIDATION",
        "Payment amount must be a positive number."
      )
    }

    return supplierPaymentRepository.create({
      supplierId: supplier.id,
      supplierName: supplier.name,
      allocations,
      method: input.method,
      paidAt: input.paidAt,
      notes: input.notes,
      storeId: input.storeId ?? ("storeId" in supplier ? supplier.storeId : null),
      actorId: input.actorId,
    })
  }
}

export type { SupplierPaymentRecord }
