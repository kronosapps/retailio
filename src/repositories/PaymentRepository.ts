import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type { Payment } from "@/modules/payment/types"
import {
  getPaymentById,
  listPayments,
  savePayment,
  updatePayment,
} from "@/modules/payment/store/paymentStore"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "payments"

/**
 * Owns the `payments` Firestore collection.
 * Payment Module must not talk to Google Sheets — only this repository + events.
 */
export class PaymentRepository {
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
        null
      )
    } else if (saved.status === "Failed") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_FAILED,
        toPaymentSyncPayload(saved),
        null
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
        null
      )
    } else if (updated.status === "Failed") {
      await EventPublisher.publish(
        EventTypes.PAYMENT_FAILED,
        toPaymentSyncPayload(updated),
        null
      )
    }

    return updated
  }

  async getById(paymentId: string): Promise<Payment | null> {
    return getPaymentById(paymentId)
  }

  async list(): Promise<Payment[]> {
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
  }
}

export const paymentRepository = new PaymentRepository()
