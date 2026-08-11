import {
  findLocalMovementByReference,
  getLocalMovement,
  listLocalMovements,
  listLocalMovementsForSku,
  upsertLocalMovement,
} from "@/data/inventoryMovements"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type { InventoryMovement } from "@/modules/inventory/types"
import { COLLECTIONS } from "@/core/firebase/collections"
import { createId } from "@/utils/id"

import { upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.INVENTORY_MOVEMENTS

export type { InventoryMovement }

export type CreateMovementInput = Omit<InventoryMovement, "id" | "createdAt"> & {
  id?: string
  createdAt?: string
}

/**
 * Owns the `inventory_movements` collection (append-oriented ledger).
 */
export class InventoryMovementRepository {
  list(): InventoryMovement[] {
    return listLocalMovements()
  }

  listForSku(sku: string): InventoryMovement[] {
    return listLocalMovementsForSku(sku)
  }

  getById(id: string): InventoryMovement | null {
    return getLocalMovement(id)
  }

  findByReference(
    referenceId: string,
    type?: InventoryMovement["type"]
  ): InventoryMovement | null {
    return findLocalMovementByReference(referenceId, type)
  }

  async create(input: CreateMovementInput): Promise<InventoryMovement> {
    const record: InventoryMovement = {
      id: input.id || createId("imv"),
      productId: input.productId,
      sku: input.sku,
      productName: input.productName,
      type: input.type,
      quantity: Math.abs(input.quantity),
      balanceAfter: input.balanceAfter,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
      createdByName: input.createdByName ?? null,
      storeId: input.storeId ?? null,
      createdAt: input.createdAt || new Date().toISOString(),
    }

    upsertLocalMovement(record)
    await upsertDocument(COLLECTION, record.id, record)

    await EventPublisher.publish(
      EventTypes.INVENTORY_MOVEMENT_CREATED,
      record,
      record.storeId
    )

    return record
  }
}

export const inventoryMovementRepository = new InventoryMovementRepository()
