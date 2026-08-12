import {
  getLocalPurchaseOrder,
  listLocalPurchaseOrders,
  nextPoNumber,
  upsertLocalPurchaseOrder,
  type CreatePurchaseOrderInput,
  type PurchaseOrderRecord,
} from "@/data/purchaseOrders"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.PURCHASE_ORDERS

export type { CreatePurchaseOrderInput, PurchaseOrderRecord }

/**
 * Owns `purchase_orders` (+ local fallback).
 * Does not touch inventory — GRN posting owns stock-in.
 */
export class PurchaseOrderRepository {
  list(): PurchaseOrderRecord[] {
    return listLocalPurchaseOrders()
  }

  getById(id: string): PurchaseOrderRecord | null {
    return getLocalPurchaseOrder(id)
  }

  async hydrate(): Promise<PurchaseOrderRecord[]> {
    const remote = await listDocuments<PurchaseOrderRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalPurchaseOrder(row)
      }
    }
    return this.list()
  }

  async createDraft(
    input: CreatePurchaseOrderInput
  ): Promise<PurchaseOrderRecord> {
    const now = new Date().toISOString()
    const record: PurchaseOrderRecord = {
      id: createId("po"),
      poNumber: nextPoNumber(),
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      status: "DRAFT",
      orderedAt: null,
      expectedAt: input.expectedAt ?? null,
      notes: input.notes?.trim() || null,
      lines: input.lines.map((l) => ({
        sku: l.sku.trim().toUpperCase(),
        productName: (l.productName || l.sku).trim(),
        quantityOrdered: Number(l.quantityOrdered),
        quantityReceived: 0,
        unitCostRupees: l.unitCostRupees ?? null,
        notes: l.notes?.trim() || null,
      })),
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      issuedAt: null,
      cancelledAt: null,
    }
    return this.persist(record, "created")
  }

  async save(
    record: PurchaseOrderRecord,
    event: "updated" | "issued" | "created" = "updated"
  ): Promise<PurchaseOrderRecord> {
    const next = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, event)
  }

  private async persist(
    record: PurchaseOrderRecord,
    event: "created" | "updated" | "issued"
  ): Promise<PurchaseOrderRecord> {
    const next = upsertLocalPurchaseOrder(record)
    await upsertDocument(COLLECTION, next.id, next)
    const type =
      event === "created"
        ? EventTypes.PURCHASE_ORDER_CREATED
        : event === "issued"
          ? EventTypes.PURCHASE_ORDER_ISSUED
          : EventTypes.PURCHASE_ORDER_UPDATED
    await EventPublisher.publish(type, toSheetsPayload(next), next.storeId)
    return next
  }
}

function toSheetsPayload(record: PurchaseOrderRecord) {
  return {
    id: record.id,
    poNumber: record.poNumber,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    status: record.status,
    orderedAt: record.orderedAt,
    expectedAt: record.expectedAt,
    lineCount: record.lines.length,
    totalOrdered: record.lines.reduce((s, l) => s + l.quantityOrdered, 0),
    totalReceived: record.lines.reduce((s, l) => s + l.quantityReceived, 0),
    storeId: record.storeId,
    issuedAt: record.issuedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository()
