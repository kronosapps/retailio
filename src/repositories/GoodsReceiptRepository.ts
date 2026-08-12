import {
  getLocalGoodsReceipt,
  listLocalGoodsReceipts,
  nextGrnNumber,
  upsertLocalGoodsReceipt,
  type CreateGoodsReceiptInput,
  type GoodsReceiptRecord,
} from "@/data/goodsReceipts"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.GOODS_RECEIPTS

export type { CreateGoodsReceiptInput, GoodsReceiptRecord }

/**
 * Owns `goods_receipts` (+ local fallback).
 * Stock application is owned by PurchaseReceivingService, not this repository.
 */
export class GoodsReceiptRepository {
  list(): GoodsReceiptRecord[] {
    return listLocalGoodsReceipts()
  }

  getById(id: string): GoodsReceiptRecord | null {
    return getLocalGoodsReceipt(id)
  }

  async hydrate(): Promise<GoodsReceiptRecord[]> {
    const remote = await listDocuments<GoodsReceiptRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalGoodsReceipt(row)
      }
    }
    return this.list()
  }

  async saveDraft(input: CreateGoodsReceiptInput): Promise<GoodsReceiptRecord> {
    const now = new Date().toISOString()
    const record: GoodsReceiptRecord = {
      id: createId("grn"),
      grnNumber: nextGrnNumber(),
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      purchaseOrderId: input.purchaseOrderId ?? null,
      status: "DRAFT",
      receivedAt: input.receivedAt || now,
      notes: input.notes?.trim() || null,
      lines: input.lines.map((l) => ({
        sku: l.sku.trim().toUpperCase(),
        productName: (l.productName || l.sku).trim(),
        quantity: Number(l.quantity),
        unitCostRupees: l.unitCostRupees ?? null,
        expiryDate: l.expiryDate?.slice(0, 10) || null,
        batchCode: l.batchCode?.trim() || null,
        notes: l.notes?.trim() || null,
      })),
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      postedAt: null,
    }
    return this.persist(record, false)
  }

  async save(record: GoodsReceiptRecord): Promise<GoodsReceiptRecord> {
    const next = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    const publishReceived = next.status === "POSTED"
    return this.persist(next, publishReceived)
  }

  private async persist(
    record: GoodsReceiptRecord,
    publishGoodsReceived: boolean
  ): Promise<GoodsReceiptRecord> {
    const next = upsertLocalGoodsReceipt(record)
    await upsertDocument(COLLECTION, next.id, next)
    if (publishGoodsReceived) {
      await EventPublisher.publish(
        EventTypes.GOODS_RECEIVED,
        toSheetsPayload(next),
        next.storeId
      )
    }
    return next
  }
}

function toSheetsPayload(record: GoodsReceiptRecord) {
  return {
    id: record.id,
    grnNumber: record.grnNumber,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    purchaseOrderId: record.purchaseOrderId,
    status: record.status,
    receivedAt: record.receivedAt,
    lineCount: record.lines.length,
    totalQty: record.lines.reduce((s, l) => s + l.quantity, 0),
    storeId: record.storeId,
    postedAt: record.postedAt,
    createdAt: record.createdAt,
  }
}

export const goodsReceiptRepository = new GoodsReceiptRepository()
