import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = "inventory"

export type InventoryRecord = {
  id: string
  productId: string
  sku?: string
  name: string
  quantity: number
  storeId: string | null
  updatedAt: string
}

/**
 * Owns the `inventory` collection. Stub-ready for the Inventory module.
 */
export class InventoryRepository {
  async save(record: InventoryRecord): Promise<InventoryRecord> {
    const next = { ...record, updatedAt: new Date().toISOString() }
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      EventTypes.INVENTORY_CHANGED,
      next,
      next.storeId
    )
    return next
  }
}

export const inventoryRepository = new InventoryRepository()
