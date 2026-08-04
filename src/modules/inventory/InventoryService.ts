import {
  inventoryRepository,
  type InventoryRecord,
} from "@/repositories/InventoryRepository"

/** Inventory business module — repository only. */
export class InventoryService {
  static save(record: InventoryRecord) {
    return inventoryRepository.save(record)
  }
}
