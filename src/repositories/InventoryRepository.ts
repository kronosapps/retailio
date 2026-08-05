import {
  buildInventoryRecord,
  buildSampleRecords,
  deleteLocalInventory,
  getLocalInventory,
  isInventorySeeded,
  listLocalInventory,
  markInventorySeeded,
  upsertLocalInventory,
  type CreateInventoryInput,
  type InventoryRecord,
} from "@/data/inventory"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { removeDocument, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "inventory"

export type { CreateInventoryInput, InventoryRecord }

export type InventorySyncPayload = InventoryRecord & {
  changeType: "created" | "updated" | "deleted"
  deleted?: boolean
  deletedAt?: string
}

/**
 * Owns the `inventory` collection.
 * Local store is primary for the admin UI; Firestore + events are best-effort.
 */
export class InventoryRepository {
  list(): InventoryRecord[] {
    return listLocalInventory()
  }

  getById(id: string): InventoryRecord | null {
    return getLocalInventory(id)
  }

  async create(
    input: CreateInventoryInput,
    actorId: string | null = null
  ): Promise<InventoryRecord> {
    const id = createId("inv")
    const record = buildInventoryRecord(
      { ...input, createdBy: actorId },
      id
    )
    return this.persist(record, "created")
  }

  async save(
    record: InventoryRecord,
    changeType: "created" | "updated" = "updated"
  ): Promise<InventoryRecord> {
    const next: InventoryRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, changeType)
  }

  async updateQuantity(
    id: string,
    quantity: number,
    actorId: string | null = null
  ): Promise<InventoryRecord | null> {
    const existing = getLocalInventory(id)
    if (!existing) return null
    return this.save(
      {
        ...existing,
        quantity,
        updatedBy: actorId,
      },
      "updated"
    )
  }

  async delete(id: string): Promise<InventoryRecord | null> {
    const existing = deleteLocalInventory(id)
    if (!existing) return null

    await removeDocument(COLLECTION, existing.id)

    const payload: InventorySyncPayload = {
      ...existing,
      quantity: 0,
      updatedAt: new Date().toISOString(),
      changeType: "deleted",
      deleted: true,
      deletedAt: new Date().toISOString(),
    }

    await EventPublisher.publish(
      EventTypes.INVENTORY_CHANGED,
      payload,
      existing.storeId
    )

    return existing
  }

  /**
   * Inserts the three sample stock lines once (local + Firestore + Sheets).
   */
  async ensureSamples(
    storeId: string | null,
    actorId: string | null
  ): Promise<InventoryRecord[]> {
    if (isInventorySeeded()) return listLocalInventory()

    const samples = buildSampleRecords(storeId, actorId)
    const saved: InventoryRecord[] = []
    for (const sample of samples) {
      saved.push(await this.persist(sample, "created"))
    }
    markInventorySeeded()
    return listLocalInventory()
  }

  private async persist(
    record: InventoryRecord,
    changeType: "created" | "updated"
  ): Promise<InventoryRecord> {
    upsertLocalInventory(record)
    await upsertDocument(COLLECTION, record.id, record)

    const payload: InventorySyncPayload = {
      ...record,
      changeType,
    }

    await EventPublisher.publish(
      EventTypes.INVENTORY_CHANGED,
      payload,
      record.storeId
    )

    return record
  }
}

export const inventoryRepository = new InventoryRepository()
