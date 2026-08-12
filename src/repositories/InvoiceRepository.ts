import {
  createInvoice as createLocalInvoice,
  getRecordedSale,
  listRecordedSales,
  mergeRemoteSales,
  updateInvoicePayment,
  upsertRecordedSale,
  type CreateInvoiceInput,
  type RecordedSale,
} from "@/data/invoices"
import { paisaToRupees } from "@/lib/money"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { getDocument, listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "invoices"
const HYDRATE_TTL_MS = 15_000

/**
 * Owns the `invoices` Firestore collection.
 * Business modules call this — never Firestore from React.
 */
export class InvoiceRepository {
  private hydratedAt = 0

  /**
   * Pull Firestore invoices into localStorage so other browsers see the same sales.
   * No-op when Firebase is unset, offline, or a recent hydrate already ran.
   */
  async hydrateFromCloud(force = false): Promise<void> {
    if (!force && Date.now() - this.hydratedAt < HYDRATE_TTL_MS) return
    const remote = await listDocuments<RecordedSale>(COLLECTION)
    if (remote === null) return
    mergeRemoteSales(remote)
    this.hydratedAt = Date.now()
  }

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
        cashierId: sale.cashierId ?? null,
        cashierName: sale.cashierName ?? null,
        taxableAmount: paisaToRupees(sale.totals.taxableAmount),
        sgstPercent: sale.totals.sgstPercent,
        sgstAmount: paisaToRupees(sale.totals.sgstAmount),
        cgstPercent: sale.totals.cgstPercent,
        cgstAmount: paisaToRupees(sale.totals.cgstAmount),
        gstPercent: sale.totals.gstPercent,
        gstAmount: paisaToRupees(sale.totals.gstAmount),
        total: paisaToRupees(sale.totals.total),
        totalPaisa: sale.totals.total,
        discountPaisa:
          (sale.totals.friendsFamilyDiscount || 0) +
          (sale.totals.occasionDiscount || 0) +
          (sale.totals.loyaltyDiscount || 0) +
          (sale.totals.couponDiscount || 0) +
          (sale.totals.pointsDiscount || 0),
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
    const local = getRecordedSale(invoiceId)
    if (local) return local

    const remote = await getDocument<RecordedSale>(COLLECTION, invoiceId)
    if (!remote) return null
    return upsertRecordedSale({
      ...remote,
      invoiceId: remote.invoiceId || invoiceId,
    })
  }

  async list(): Promise<RecordedSale[]> {
    await this.hydrateFromCloud()
    return listRecordedSales()
  }
}

export const invoiceRepository = new InvoiceRepository()
