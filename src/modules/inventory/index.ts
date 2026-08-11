export {
  InventoryService,
  InventoryError,
  type StockRow,
  type StockStatus,
  type InventorySummary,
  type InventoryMovement,
} from "./InventoryService"
export type {
  CreateInventoryInput,
  InventoryRecord,
} from "@/repositories/InventoryRepository"
export { inventoryEngine } from "./InventoryEngine"
export {
  INVENTORY_MOVEMENT_TYPES,
  DEFAULT_REORDER_LEVEL,
  movementTypeLabel,
  stockStatusLabel,
  resolveStockStatus,
  type InventoryMovementType,
  type CategoryRecord,
  type ExportRow,
  type AddStockInput,
  type AdjustStockInput,
  type CreateProductInput,
  type UpdateProductInput,
} from "./types"
