import {
  createInvoice as createLocalInvoice,
  getRecordedSale,
  listRecordedSales,
  updateInvoicePayment,
  type CreateInvoiceInput,
  type RecordedSale,
} from "@/data/invoices"
import { paisaToRupees } from "@/lib/money"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "invoices"

/**
 * Owns the `invoices` Firestore collection.
 * Business modules call this — never Firestore from React.
 */
export class InvoiceRepository {
  /**
   * Persist a new unpaid invoice (local + Firestore when configured),
   * then publish INVOICE_CREATED for the sync layer.
   */
  async save(input: CreateInvoiceInput): Promise<RecordedSale> {
    const sale = createLocalInvoice(input)

    await upsertDocument(COLLECTION, sale.invoiceId, {
      ...sale,
      id: sale.invoiceId,
    })

    await EventPublisher.publish(
      EventTypes.INVOICE_CREATED,
      {
        invoiceId: sale.invoiceId,
        invoiceNumber: sale.invoiceId,
        customerName: sale.customerName ?? "Walk-in",
        customerId: sale.customerId ?? null,
        customerPhone: sale.customerPhone ?? null,
        paymentStatus: sale.paymentStatus,
        createdAt: sale.createdAt,
        storeId: sale.storeId,
        taxableAmount: paisaToRupees(sale.totals.taxableAmount),
        sgstPercent: sale.totals.sgstPercent,
        sgstAmount: paisaToRupees(sale.totals.sgstAmount),
        cgstPercent: sale.totals.cgstPercent,
        cgstAmount: paisaToRupees(sale.totals.cgstAmount),
        gstPercent: sale.totals.gstPercent,
        gstAmount: paisaToRupees(sale.totals.gstAmount),
        total: paisaToRupees(sale.totals.total),
        totalPaisa: sale.totals.total,
      },
      sale.storeId
    )

    return sale
  }

  async updatePaymentFields(
    invoiceId: string,
    patch: Parameters<typeof updateInvoicePayment>[1]
  ): Promise<RecordedSale | null> {
    const sale = updateInvoicePayment(invoiceId, patch)
    if (!sale) return null

    await upsertDocument(COLLECTION, sale.invoiceId, {
      ...sale,
      id: sale.invoiceId,
    })

    await EventPublisher.publish(
      EventTypes.INVOICE_UPDATED,
      {
        invoiceId: sale.invoiceId,
        paymentId: sale.paymentId,
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
        customerId: sale.customerId ?? null,
        customerName: sale.customerName ?? "Walk-in",
        customerPhone: sale.customerPhone ?? null,
        updatedAt: new Date().toISOString(),
      },
      sale.storeId
    )

    return sale
  }

  async getById(invoiceId: string): Promise<RecordedSale | null> {
    return getRecordedSale(invoiceId)
  }

  async list(): Promise<RecordedSale[]> {
    return listRecordedSales()
  }
}

export const invoiceRepository = new InvoiceRepository()
