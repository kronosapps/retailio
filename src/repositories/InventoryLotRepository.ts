import {
  getLocalInventoryLot,
  listLocalInventoryLots,
  listLocalLotsBySku,
  nextLotNumber,
  sortLotsFefo,
  upsertLocalInventoryLot,
  type CreateInventoryLotInput,
  type InventoryLotRecord,
} from "@/data/inventoryLots"
import { COLLECTIONS } from "@/core/firebase/collections"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.INVENTORY_LOTS

export type { CreateInventoryLotInput, InventoryLotRecord }

/**
 * Owns `inventory_lots` (+ local fallback).
 */
export class InventoryLotRepository {
  list(): InventoryLotRecord[] {
    return listLocalInventoryLots()
  }

  getById(id: string): InventoryLotRecord | null {
    return getLocalInventoryLot(id)
  }

  listBySku(sku: string): InventoryLotRecord[] {
    return listLocalLotsBySku(sku)
  }

  listOpenBySkuFefo(sku: string): InventoryLotRecord[] {
    return sortLotsFefo(this.listBySku(sku).filter((l) => l.quantity > 0))
  }

  async hydrate(): Promise<InventoryLotRecord[]> {
    const remote = await listDocuments<InventoryLotRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalInventoryLot(row)
      }
    }
    return this.list()
  }

  async create(input: CreateInventoryLotInput): Promise<InventoryLotRecord> {
    const now = new Date().toISOString()
    const qty = Math.max(0, Number(input.quantity) || 0)
    const record: InventoryLotRecord = {
      id: createId("lot"),
      lotNumber: nextLotNumber(),
      sku: input.sku.trim().toUpperCase(),
      productName: input.productName.trim(),
      quantity: qty,
      initialQuantity: qty,
      expiryDate: input.expiryDate?.slice(0, 10) || null,
      receivedAt: input.receivedAt || now,
      batchCode: input.batchCode?.trim() || null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
    }
    return this.persist(record)
  }

  async save(record: InventoryLotRecord): Promise<InventoryLotRecord> {
    return this.persist({
      ...record,
      updatedAt: new Date().toISOString(),
    })
  }

  private async persist(
    record: InventoryLotRecord
  ): Promise<InventoryLotRecord> {
    const next = upsertLocalInventoryLot(record)
    await upsertDocument(COLLECTION, next.id, next)
    return next
  }
}

export const inventoryLotRepository = new InventoryLotRepository()
