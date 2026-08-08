import {
  createLocalRefund,
  getLocalRefund,
  getLocalRefundByInvoice,
  listLocalRefunds,
  mergeRemoteRefunds,
  upsertLocalRefund,
  type RefundRecord,
} from "@/data/refunds"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { paisaToRupees } from "@/lib/money"
import { createId } from "@/utils/id"

import { getDocument, listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "refunds"
const HYDRATE_TTL_MS = 15_000

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
  private hydratedAt = 0

  async hydrateFromCloud(force = false): Promise<void> {
    if (!force && Date.now() - this.hydratedAt < HYDRATE_TTL_MS) return
    const remote = await listDocuments<RefundRecord>(COLLECTION)
    if (remote === null) return
    mergeRemoteRefunds(remote)
    this.hydratedAt = Date.now()
  }

  async list(): Promise<RefundRecord[]> {
    await this.hydrateFromCloud()
    return listLocalRefunds()
  }

  async getById(id: string): Promise<RefundRecord | null> {
    const local = getLocalRefund(id)
    if (local) return local

    const remote = await getDocument<RefundRecord>(COLLECTION, id)
    if (!remote) return null
    return upsertLocalRefund({ ...remote, id: remote.id || id })
  }

  async getByInvoiceId(invoiceId: string): Promise<RefundRecord | null> {
    await this.hydrateFromCloud()
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
