import {
  getLocalPurchaseReturn,
  listLocalPurchaseReturns,
  nextPurchaseReturnNumber,
  upsertLocalPurchaseReturn,
  type CreatePurchaseReturnInput,
  type PurchaseReturnRecord,
} from "@/data/purchaseReturns"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.PURCHASE_RETURNS

export type { CreatePurchaseReturnInput, PurchaseReturnRecord }

/**
 * Owns `purchase_returns` (+ local fallback).
 * Stock / AP application is owned by PurchaseReturnService.
 */
export class PurchaseReturnRepository {
  list(): PurchaseReturnRecord[] {
    return listLocalPurchaseReturns()
  }

  getById(id: string): PurchaseReturnRecord | null {
    return getLocalPurchaseReturn(id)
  }

  async hydrate(): Promise<PurchaseReturnRecord[]> {
    const remote = await listDocuments<PurchaseReturnRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalPurchaseReturn(row)
      }
    }
    return this.list()
  }

  async createDraft(
    input: CreatePurchaseReturnInput
  ): Promise<PurchaseReturnRecord> {
    const now = new Date().toISOString()
    const lines = input.lines.map((l) => {
      const qty = Number(l.quantity)
      const unit = Math.round(Number(l.unitCostPaisa))
      return {
        sku: l.sku.trim().toUpperCase(),
        productName: (l.productName || l.sku).trim(),
        quantity: qty,
        unitCostPaisa: unit,
        lineTotalPaisa: Math.round(qty * unit),
      }
    })
    const total = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)
    const record: PurchaseReturnRecord = {
      id: createId("prn"),
      returnNumber: nextPurchaseReturnNumber(),
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      goodsReceiptId: input.goodsReceiptId ?? null,
      grnNumber: input.grnNumber?.trim() || null,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      status: "DRAFT",
      returnedAt: input.returnedAt || now,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      lines,
      subtotalPaisa: total,
      totalPaisa: total,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      postedAt: null,
    }
    return this.persist(record, "created")
  }

  async save(
    record: PurchaseReturnRecord,
    event: "updated" | "posted" | "created" = "updated"
  ): Promise<PurchaseReturnRecord> {
    const next = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, event)
  }

  private async persist(
    record: PurchaseReturnRecord,
    event: "created" | "updated" | "posted"
  ): Promise<PurchaseReturnRecord> {
    const next = upsertLocalPurchaseReturn(record)
    await upsertDocument(COLLECTION, next.id, next)
    const type =
      event === "created"
        ? EventTypes.PURCHASE_RETURN_CREATED
        : event === "posted"
          ? EventTypes.PURCHASE_RETURN_POSTED
          : EventTypes.PURCHASE_RETURN_UPDATED
    await EventPublisher.publish(type, toSheetsPayload(next), next.storeId)
    return next
  }
}

function toSheetsPayload(record: PurchaseReturnRecord) {
  return {
    id: record.id,
    returnNumber: record.returnNumber,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    goodsReceiptId: record.goodsReceiptId,
    grnNumber: record.grnNumber,
    purchaseInvoiceId: record.purchaseInvoiceId,
    invoiceNumber: record.invoiceNumber,
    status: record.status,
    returnedAt: record.returnedAt,
    reason: record.reason,
    lineCount: record.lines.length,
    totalQty: record.lines.reduce((s, l) => s + l.quantity, 0),
    totalPaisa: record.totalPaisa,
    storeId: record.storeId,
    postedAt: record.postedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export const purchaseReturnRepository = new PurchaseReturnRepository()
