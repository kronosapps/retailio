import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type { Payment } from "@/modules/payment/types"
import {
  getPaymentById,
  listPayments,
  mergeRemotePayments,
  savePayment,
  updatePayment,
} from "@/modules/payment/store/paymentStore"

import { getDocument, listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "payments"
const HYDRATE_TTL_MS = 15_000

/**
 * Owns the `payments` Firestore collection.
 * Payment Module must not talk to Google Sheets — only this repository + events.
 */
export class PaymentRepository {
  private hydratedAt = 0

  async hydrateFromCloud(force = false): Promise<void> {
    if (!force && Date.now() - this.hydratedAt < HYDRATE_TTL_MS) return
    const remote = await listDocuments<Payment>(COLLECTION)
    if (remote === null) return
    mergeRemotePayments(remote)
    this.hydratedAt = Date.now()
  }

  /** Create or overwrite a payment session document. */
  async save(payment: Payment): Promise<Payment> {
    const saved = savePayment(payment)

    await upsertDocument(COLLECTION, saved.paymentId, {
      ...saved,
      id: saved.paymentId,
    })

    if (saved.status === "Paid") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_RECEIVED,
        toPaymentSyncPayload(saved),
        saved.storeId ?? null
      )
    } else if (saved.status === "Failed") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_FAILED,
        toPaymentSyncPayload(saved),
        saved.storeId ?? null
      )
    }

    return saved
  }

  async update(
    paymentId: string,
    patch: Partial<Payment>
  ): Promise<Payment> {
    const updated = updatePayment(paymentId, patch)

    await upsertDocument(COLLECTION, updated.paymentId, {
      ...updated,
      id: updated.paymentId,
    })

    if (updated.status === "Paid") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_RECEIVED,
        toPaymentSyncPayload(updated),
        updated.storeId ?? null
      )
    } else if (updated.status === "Failed") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_FAILED,
        toPaymentSyncPayload(updated),
        updated.storeId ?? null
      )
    }

    return updated
  }

  async getById(paymentId: string): Promise<Payment | null> {
    const local = getPaymentById(paymentId)
    if (local) return local

    const remote = await getDocument<Payment>(COLLECTION, paymentId)
    if (!remote) return null
    const payment = {
      ...remote,
      paymentId: remote.paymentId || paymentId,
    } as Payment
    return savePayment(payment)
  }

  async list(): Promise<Payment[]> {
    await this.hydrateFromCloud()
    return listPayments()
  }
}

function toPaymentSyncPayload(payment: Payment) {
  return {
    invoiceNumber: payment.invoiceNumber,
    transactionReference: payment.transactionReference,
    paymentId: payment.paymentId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    status: payment.status,
    paidAt: payment.paidAt,
    customerName: payment.customerName,
    customerId: payment.customerId,
    customerPhone: payment.customerPhone,
    storeId: payment.storeId ?? null,
    upiTxnLast4: payment.upiTxnLast4,
    cashReceiptNumber: payment.cashReceiptNumber,
    cashReceiptId: payment.cashReceiptId,
  }
}

export const paymentRepository = new PaymentRepository()
