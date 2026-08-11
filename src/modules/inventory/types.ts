/**
 * Inventory domain types — movements, stock status, export rows.
 * Product/Item definitions live in ProductRecord; stock qty is cached on InventoryRecord.
 */

export const INVENTORY_MOVEMENT_TYPES = [
  "OPENING_STOCK",
  "PURCHASE",
  "SALE",
  "RETURN",
  "DAMAGE",
  "WASTAGE",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number]

/** Positive types increase on-hand stock; negative types decrease it. */
export const MOVEMENT_STOCK_EFFECT: Record<InventoryMovementType, 1 | -1> = {
  OPENING_STOCK: 1,
  PURCHASE: 1,
  SALE: -1,
  RETURN: 1,
  DAMAGE: -1,
  WASTAGE: -1,
  ADJUSTMENT_IN: 1,
  ADJUSTMENT_OUT: -1,
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock"

export type InventoryMovement = {
  id: string
  productId: string
  sku: string
  productName: string
  type: InventoryMovementType
  /** Always positive; signed effect comes from MOVEMENT_STOCK_EFFECT[type]. */
  quantity: number
  /** Quantity after this movement was applied. */
  balanceAfter: number
  referenceId: string | null
  reason: string | null
  notes: string | null
  createdBy: string | null
  createdByName: string | null
  storeId: string | null
  createdAt: string
}

export type CategoryRecord = {
  id: string
  name: string
  active: boolean
  storeId: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

export type StockRow = {
  productId: string
  sku: string
  name: string
  category: string
  barcode: string | null
  unit: string
  sellingPrice: number
  costPrice: number | null
  gstRate: number
  reorderLevel: number
  active: boolean
  quantity: number
  status: StockStatus
  inventoryId: string | null
  updatedAt: string | null
}

export type InventorySummary = {
  totalItems: number
  totalUnits: number
  lowStockCount: number
  outOfStockCount: number
  inactiveCount: number
}

export type ExportRow = Record<string, string | number | boolean | null>

export type AddStockInput = {
  sku: string
  quantity: number
  type?: Extract<
    InventoryMovementType,
    "PURCHASE" | "OPENING_STOCK" | "ADJUSTMENT_IN"
  >
  reason?: string | null
  referenceId?: string | null
  notes?: string | null
  actorId?: string | null
  actorName?: string | null
  storeId?: string | null
}

export type AdjustStockInput = {
  sku: string
  /** Absolute quantity to add (direction via mode). */
  quantity: number
  mode: "add" | "remove"
  reason:
    | "Damaged"
    | "Wastage"
    | "Physical Count"
    | "Correction"
    | "Other"
  notes?: string | null
  actorId?: string | null
  actorName?: string | null
  storeId?: string | null
}

export type CreateCategoryInput = {
  name: string
  storeId?: string | null
  createdBy?: string | null
}

export type CreateProductInput = {
  name: string
  sku: string
  barcode?: string | null
  category: string
  brand?: string | null
  unitSize?: number
  unit?: string
  costPrice?: number | null
  sellingPrice: number
  mrp?: number | null
  gstRate?: number
  hsnCode?: string | null
  reorderLevel?: number
  active?: boolean
  storeId?: string | null
  actorId?: string | null
}

export type UpdateProductInput = {
  id: string
  name?: string
  barcode?: string | null
  category?: string
  unitSize?: number
  costPrice?: number | null
  sellingPrice?: number
  gstRate?: number
  reorderLevel?: number
  active?: boolean
  actorId?: string | null
}

export const DEFAULT_REORDER_LEVEL = 10

export function movementTypeLabel(type: InventoryMovementType): string {
  switch (type) {
    case "OPENING_STOCK":
      return "Opening Stock"
    case "PURCHASE":
      return "Purchase"
    case "SALE":
      return "Sale"
    case "RETURN":
      return "Return"
    case "DAMAGE":
      return "Damage"
    case "WASTAGE":
      return "Wastage"
    case "ADJUSTMENT_IN":
      return "Adjustment In"
    case "ADJUSTMENT_OUT":
      return "Adjustment Out"
  }
}

export function stockStatusLabel(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "In Stock"
    case "low_stock":
      return "Low Stock"
    case "out_of_stock":
      return "Out of Stock"
  }
}

export function resolveStockStatus(
  quantity: number,
  reorderLevel: number
): StockStatus {
  if (quantity <= 0) return "out_of_stock"
  if (quantity <= reorderLevel) return "low_stock"
  return "in_stock"
}

export function signedMovementQty(
  type: InventoryMovementType,
  quantity: number
): number {
  return MOVEMENT_STOCK_EFFECT[type] * Math.abs(quantity)
}
