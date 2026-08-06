import {
  createLocalRefund,
  getLocalRefund,
  getLocalRefundByInvoice,
  listLocalRefunds,
  upsertLocalRefund,
  type RefundRecord,
} from "@/data/refunds"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { paisaToRupees } from "@/lib/money"
import { createId } from "@/utils/id"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "refunds"

export type { RefundRecord }

export type CreateRefundInput = Omit<
  RefundRecord,
  "id" | "refundId" | "createdAt" | "updatedAt" | "status" | "amount"
> & {
  status?: RefundRecord["status"]
}

/**
 * Owns the `refunds` collection.
 * Local store is primary; Firestore + events are best-effort.
 */
export class RefundRepository {
  list(): RefundRecord[] {
    return listLocalRefunds()
  }

  getById(id: string): RefundRecord | null {
    return getLocalRefund(id)
  }

  getByInvoiceId(invoiceId: string): RefundRecord | null {
    return getLocalRefundByInvoice(invoiceId)
  }

  async create(input: CreateRefundInput): Promise<RefundRecord> {
    const record = createLocalRefund({
      ...input,
      id: createId("refund"),
      amount: paisaToRupees(input.amountPaisa),
      status: input.status ?? "Completed",
    })

    await upsertDocument(COLLECTION, record.id, record)
    await EventPublisher.publish(
      EventTypes.REFUND_CREATED,
      toRefundSyncPayload(record),
      record.storeId
    )
    return record
  }

  async save(record: RefundRecord): Promise<RefundRecord> {
    const next: RefundRecord = {
      ...record,
      amount: paisaToRupees(record.amountPaisa),
      updatedAt: new Date().toISOString(),
    }
    upsertLocalRefund(next)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      EventTypes.REFUND_UPDATED,
      toRefundSyncPayload(next),
      next.storeId
    )
    return next
  }
}

function toRefundSyncPayload(record: RefundRecord) {
  return {
    refundId: record.refundId,
    invoiceId: record.invoiceId,
    paymentId: record.paymentId,
    customerId: record.customerId,
    customerName: record.customerName,
    amount: record.amount,
    amountPaisa: record.amountPaisa,
    method: record.method,
    reason: record.reason,
    restock: record.restock,
    restockedSkuCount: record.restockedSkuCount,
    status: record.status,
    storeId: record.storeId,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  }
}

export const refundRepository = new RefundRepository()
