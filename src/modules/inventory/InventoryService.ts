import {
  inventoryRepository,
  type CreateInventoryInput,
  type InventoryRecord,
} from "@/repositories/InventoryRepository"

/**
 * Inventory business module.
 * UI → InventoryService → InventoryRepository → Firestore/local → EventBus → Sheets.
 */
export class InventoryService {
  static list(): InventoryRecord[] {
    return inventoryRepository.list()
  }

  static getById(id: string): InventoryRecord | null {
    return inventoryRepository.getById(id)
  }

  static create(input: CreateInventoryInput, actorId: string | null = null) {
    return inventoryRepository.create(input, actorId)
  }

  static save(record: InventoryRecord) {
    return inventoryRepository.save(record, "updated")
  }

  static delete(id: string) {
    return inventoryRepository.delete(id)
  }

  static ensureSamples(storeId: string | null, actorId: string | null) {
    return inventoryRepository.ensureSamples(storeId, actorId)
  }
}

export type { CreateInventoryInput, InventoryRecord }
