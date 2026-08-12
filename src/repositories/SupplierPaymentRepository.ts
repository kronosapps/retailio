import {
  getLocalSupplierPayment,
  listLocalSupplierPayments,
  nextSupplierPaymentNumber,
  upsertLocalSupplierPayment,
  type CreateSupplierPaymentInput,
  type SupplierPaymentRecord,
} from "@/data/supplierPayments"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { paisaToRupees } from "@/lib/money"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.SUPPLIER_PAYMENTS

export type { CreateSupplierPaymentInput, SupplierPaymentRecord }

/**
 * Owns `supplier_payments` (+ local fallback).
 */
export class SupplierPaymentRepository {
  list(): SupplierPaymentRecord[] {
    return listLocalSupplierPayments()
  }

  getById(id: string): SupplierPaymentRecord | null {
    return getLocalSupplierPayment(id)
  }

  async hydrate(): Promise<SupplierPaymentRecord[]> {
    const remote = await listDocuments<SupplierPaymentRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalSupplierPayment(row)
      }
    }
    return this.list()
  }

  async create(
    input: CreateSupplierPaymentInput
  ): Promise<SupplierPaymentRecord> {
    const now = new Date().toISOString()
    const allocations = input.allocations.map((a) => ({
      purchaseInvoiceId: a.purchaseInvoiceId,
      invoiceNumber: a.invoiceNumber,
      amountPaisa: Math.round(a.amountPaisa),
    }))
    const amountPaisa = allocations.reduce((s, a) => s + a.amountPaisa, 0)
    const primary = allocations[0]
    const record: SupplierPaymentRecord = {
      id: createId("spay"),
      paymentNumber: nextSupplierPaymentNumber(),
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      purchaseInvoiceId: primary?.purchaseInvoiceId || "",
      invoiceNumber:
        allocations.length > 1
          ? allocations.map((a) => a.invoiceNumber).join(", ")
          : primary?.invoiceNumber || "",
      amountPaisa,
      allocations,
      method: input.method,
      status: "Paid",
      paidAt: input.paidAt || now,
      notes: input.notes?.trim() || null,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
    }
    return this.persist(record)
  }

  private async persist(
    record: SupplierPaymentRecord
  ): Promise<SupplierPaymentRecord> {
    const next = upsertLocalSupplierPayment(record)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      EventTypes.SUPPLIER_PAYMENT_RECORDED,
      toEventPayload(next),
      next.storeId
    )
    return next
  }
}

function toEventPayload(record: SupplierPaymentRecord) {
  return {
    id: record.id,
    paymentId: record.id,
    paymentNumber: record.paymentNumber,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    purchaseInvoiceId: record.purchaseInvoiceId,
    invoiceNumber: record.invoiceNumber,
    allocations: record.allocations,
    amountPaisa: record.amountPaisa,
    /** Rupees — banking engine parity with sale payments. */
    amount: paisaToRupees(record.amountPaisa),
    paymentMethod: record.method,
    method: record.method,
    status: record.status,
    paidAt: record.paidAt,
    storeId: record.storeId,
    createdAt: record.createdAt,
  }
}

export const supplierPaymentRepository = new SupplierPaymentRepository()
