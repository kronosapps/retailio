import type { RecordedSale } from "@/data/invoices"
import type { ProductRecord } from "@/data/products"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { categoryRepository } from "@/repositories/CategoryRepository"
import { inventoryRepository } from "@/repositories/InventoryRepository"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"
import { productRepository } from "@/repositories/ProductRepository"

import {
  DEFAULT_REORDER_LEVEL,
  resolveStockStatus,
  signedMovementQty,
  type AddStockInput,
  type AdjustStockInput,
  type CategoryRecord,
  type CreateCategoryInput,
  type ExportRow,
  type InventoryMovement,
  type InventoryMovementType,
  type InventorySummary,
  type StockRow,
  type StockStatus,
} from "./types"

export class InventoryError extends Error {
  code:
    | "NOT_FOUND"
    | "INVALID_QTY"
    | "INSUFFICIENT_STOCK"
    | "DUPLICATE"
    | "VALIDATION"

  constructor(code: InventoryError["code"], message: string) {
    super(message)
    this.name = "InventoryError"
    this.code = code
  }
}

/**
 * Inventory business module.
 * UI → InventoryService → repositories → Firestore/local → EventBus → Sheets.
 */
export class InventoryService {
  static list() {
    return inventoryRepository.list()
  }

  static getById(id: string) {
    return inventoryRepository.getById(id)
  }

  static create(
    input: Parameters<typeof inventoryRepository.create>[0],
    actorId: string | null = null
  ) {
    return inventoryRepository.create(input, actorId)
  }

  static save(
    record: Parameters<typeof inventoryRepository.save>[0]
  ) {
    return inventoryRepository.save(record, "updated")
  }

  static delete(id: string) {
    return inventoryRepository.delete(id)
  }

  static ensureSamples(storeId: string | null, actorId: string | null) {
    return inventoryRepository.ensureSamples(storeId, actorId)
  }

  static getCurrentStock(skuOrProductId: string): number {
    const row = this.resolveInventoryRow(skuOrProductId)
    return row?.quantity ?? 0
  }

  static getAllStock(options?: {
    includeInactive?: boolean
  }): StockRow[] {
    const includeInactive = options?.includeInactive ?? true
    const products = productRepository.list()
    const inventory = inventoryRepository.list()
    const bySku = new Map(
      inventory
        .filter((row) => row.sku)
        .map((row) => [row.sku!.trim().toLowerCase(), row])
    )

    const rows: StockRow[] = products
      .filter((p) => includeInactive || p.active)
      .map((product) => {
        const inv =
          bySku.get(product.sku.trim().toLowerCase()) ??
          inventoryRepository.findByProductId(product.productId)
        const quantity = inv?.quantity ?? 0
        const reorderLevel = product.reorderLevel ?? DEFAULT_REORDER_LEVEL
        return toStockRow(product, quantity, inv?.id ?? null, inv?.updatedAt ?? null, reorderLevel)
      })

    // Include orphan inventory lines (samples / non-catalog) not in products.
    for (const inv of inventory) {
      const skuKey = (inv.sku || "").trim().toLowerCase()
      if (skuKey && products.some((p) => p.sku.trim().toLowerCase() === skuKey)) {
        continue
      }
      if (
        products.some(
          (p) => p.productId.trim().toLowerCase() === inv.productId.trim().toLowerCase()
        )
      ) {
        continue
      }
      rows.push({
        productId: inv.productId,
        sku: inv.sku || inv.productId,
        name: inv.name,
        category: inv.category || "Uncategorized",
        barcode: null,
        unit: inv.unit,
        sellingPrice: 0,
        costPrice: null,
        gstRate: 0,
        reorderLevel: DEFAULT_REORDER_LEVEL,
        active: true,
        quantity: inv.quantity,
        status: resolveStockStatus(inv.quantity, DEFAULT_REORDER_LEVEL),
        inventoryId: inv.id,
        updatedAt: inv.updatedAt,
      })
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }

  static getLowStockItems(): StockRow[] {
    return this.getAllStock({ includeInactive: false }).filter(
      (row) => row.status === "low_stock" || row.status === "out_of_stock"
    )
  }

  static getInventorySummary(): InventorySummary {
    const rows = this.getAllStock({ includeInactive: true })
    return {
      totalItems: rows.length,
      totalUnits: rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
      lowStockCount: rows.filter((r) => r.status === "low_stock").length,
      outOfStockCount: rows.filter((r) => r.status === "out_of_stock").length,
      inactiveCount: rows.filter((r) => !r.active).length,
    }
  }

  static getMovementHistory(sku?: string): InventoryMovement[] {
    if (sku) return inventoryMovementRepository.listForSku(sku)
    return inventoryMovementRepository.list()
  }

  static async addStock(input: AddStockInput) {
    const qty = Number(input.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError("INVALID_QTY", "Quantity must be a positive number.")
    }
    const type = input.type || "PURCHASE"
    return this.recordMovement({
      sku: input.sku,
      type,
      quantity: qty,
      reason: input.reason ?? "Stock received",
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      storeId: input.storeId ?? null,
      allowNegative: false,
    })
  }

  static async removeStock(input: {
    sku: string
    quantity: number
    reason?: string | null
    referenceId?: string | null
    notes?: string | null
    actorId?: string | null
    actorName?: string | null
    storeId?: string | null
    type?: Extract<
      InventoryMovementType,
      "SALE" | "DAMAGE" | "WASTAGE" | "ADJUSTMENT_OUT" | "PURCHASE_RETURN"
    >
  }) {
    const qty = Number(input.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError("INVALID_QTY", "Quantity must be a positive number.")
    }
    return this.recordMovement({
      sku: input.sku,
      type: input.type || "ADJUSTMENT_OUT",
      quantity: qty,
      reason: input.reason ?? "Stock removed",
      referenceId: input.referenceId ?? null,
      notes: input.notes ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      storeId: input.storeId ?? null,
      allowNegative: false,
    })
  }

  static async adjustStock(input: AdjustStockInput) {
    const qty = Number(input.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError("INVALID_QTY", "Quantity must be a positive number.")
    }

    let type: InventoryMovementType
    if (input.mode === "add") {
      type = "ADJUSTMENT_IN"
    } else if (input.reason === "Damaged") {
      type = "DAMAGE"
    } else if (input.reason === "Wastage") {
      type = "WASTAGE"
    } else {
      type = "ADJUSTMENT_OUT"
    }

    const result = await this.recordMovement({
      sku: input.sku,
      type,
      quantity: qty,
      reason: input.reason,
      referenceId: null,
      notes: input.notes ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      storeId: input.storeId ?? null,
      allowNegative: false,
    })

    await EventPublisher.publish(
      EventTypes.STOCK_ADJUSTED,
      {
        sku: input.sku,
        mode: input.mode,
        quantity: qty,
        reason: input.reason,
        movementId: result.movement.id,
        balanceAfter: result.movement.balanceAfter,
      },
      result.inventory.storeId
    )

    return result
  }

  static async recordMovement(input: {
    sku: string
    type: InventoryMovementType
    quantity: number
    reason?: string | null
    referenceId?: string | null
    notes?: string | null
    actorId?: string | null
    actorName?: string | null
    storeId?: string | null
    allowNegative?: boolean
    /** When set, skip if a movement with this reference+type already exists. */
    idempotentKey?: string | null
  }): Promise<{ inventory: Awaited<ReturnType<typeof inventoryRepository.save>>; movement: InventoryMovement }> {
    const qty = Math.abs(Number(input.quantity))
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new InventoryError("INVALID_QTY", "Quantity must be a positive number.")
    }

    const sku = input.sku.trim()
    if (!sku) {
      throw new InventoryError("VALIDATION", "SKU is required.")
    }

    if (input.idempotentKey) {
      const existing = inventoryMovementRepository.findByReference(
        input.idempotentKey,
        input.type
      )
      if (existing) {
        const inv =
          inventoryRepository.findBySku(sku) ||
          (await this.ensureInventoryRow(sku, input.storeId ?? null, input.actorId ?? null))
        return { inventory: inv, movement: existing }
      }
    }

    const product = productRepository.getById(sku)
    const inventory = await this.ensureInventoryRow(
      sku,
      input.storeId ?? product?.storeId ?? null,
      input.actorId ?? null,
      product
    )

    const delta = signedMovementQty(input.type, qty)
    const nextQty = inventory.quantity + delta
    if (!input.allowNegative && nextQty < 0) {
      throw new InventoryError(
        "INSUFFICIENT_STOCK",
        `Insufficient stock for ${sku}. On hand: ${inventory.quantity}.`
      )
    }

    const updated = await inventoryRepository.save(
      {
        ...inventory,
        quantity: nextQty,
        updatedBy: input.actorId ?? null,
        storeId: input.storeId ?? inventory.storeId,
      },
      "updated"
    )

    const movement = await inventoryMovementRepository.create({
      productId: inventory.productId,
      sku,
      productName: inventory.name,
      type: input.type,
      quantity: qty,
      balanceAfter: nextQty,
      referenceId: input.idempotentKey ?? input.referenceId ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      createdBy: input.actorId ?? null,
      createdByName: input.actorName ?? null,
      storeId: updated.storeId,
    })

    return { inventory: updated, movement }
  }

  /**
   * Deduct stock for a paid sale. Idempotent per invoice line reference.
   */
  static async deductForSale(
    sale: RecordedSale,
    actorId: string | null = null,
    actorName: string | null = null
  ): Promise<number> {
    let count = 0
    for (const line of sale.lines) {
      if (line.isLoyaltyReward || line.qty <= 0) continue
      const sku = resolveLineSku(line)
      if (!sku) continue

      const ref = `${sale.invoiceId}:${sku}`
      try {
        await this.recordMovement({
          sku,
          type: "SALE",
          quantity: line.qty,
          reason: `Sale ${sale.invoiceId}`,
          referenceId: sale.invoiceId,
          idempotentKey: ref,
          notes: line.name,
          actorId,
          actorName,
          storeId: sale.storeId ?? null,
          allowNegative: false,
        })
        count += 1
      } catch (err) {
        if (err instanceof InventoryError && err.code === "INSUFFICIENT_STOCK") {
          // Allow sale to complete; record oversell as adjustment out to zero then note.
          // Prefer recording SALE with allowNegative for audit when stock missing.
          await this.recordMovement({
            sku,
            type: "SALE",
            quantity: line.qty,
            reason: `Sale ${sale.invoiceId} (oversell)`,
            referenceId: sale.invoiceId,
            idempotentKey: ref,
            notes: line.name,
            actorId,
            actorName,
            storeId: sale.storeId ?? null,
            allowNegative: true,
          })
          count += 1
        } else if (import.meta.env.DEV) {
          console.warn("[InventoryService] sale deduct failed", sku, err)
        }
      }
    }
    return count
  }

  /**
   * Restock from refund. Idempotent per invoice+sku RETURN movement.
   */
  static async restockForRefund(
    sale: RecordedSale,
    actorId: string | null = null,
    actorName: string | null = null
  ): Promise<number> {
    let count = 0
    for (const line of sale.lines) {
      if (line.isLoyaltyReward || line.qty <= 0) continue
      const sku = resolveLineSku(line)
      if (!sku) continue

      const ref = `refund:${sale.invoiceId}:${sku}`
      try {
        await this.recordMovement({
          sku,
          type: "RETURN",
          quantity: line.qty,
          reason: `Refund ${sale.invoiceId}`,
          referenceId: sale.invoiceId,
          idempotentKey: ref,
          notes: line.name,
          actorId,
          actorName,
          storeId: sale.storeId ?? null,
          allowNegative: false,
        })
        count += 1
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[InventoryService] refund restock failed", sku, err)
        }
      }
    }
    return count
  }

  // —— Categories ——

  static listCategories(): CategoryRecord[] {
    return categoryRepository.list()
  }

  static async createCategory(input: CreateCategoryInput) {
    return categoryRepository.create(input)
  }

  static async updateCategory(
    id: string,
    patch: { name?: string; active?: boolean },
    actorId: string | null = null
  ) {
    const existing = categoryRepository.getById(id)
    if (!existing) throw new InventoryError("NOT_FOUND", "Category not found.")
    if (patch.name && patch.name.trim() !== existing.name) {
      const clash = categoryRepository.findByName(patch.name)
      if (clash && clash.id !== id) {
        throw new InventoryError("DUPLICATE", "A category with that name already exists.")
      }
    }
    return categoryRepository.save({
      ...existing,
      name: patch.name?.trim() || existing.name,
      active: patch.active ?? existing.active,
      updatedBy: actorId,
    })
  }

  static async setCategoryActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ) {
    return categoryRepository.setActive(id, active, actorId)
  }

  /** Seed category records from distinct product category strings (idempotent). */
  static async ensureCategoriesFromProducts(
    storeId: string | null,
    actorId: string | null
  ) {
    const names = new Set(
      productRepository.list().map((p) => p.category.trim()).filter(Boolean)
    )
    for (const name of names) {
      if (!categoryRepository.findByName(name)) {
        await categoryRepository.create({
          name,
          storeId,
          createdBy: actorId,
        })
      }
    }
    return categoryRepository.list()
  }

  // —— Export-ready tabular data ——

  static exportProductsData(): ExportRow[] {
    return productRepository.list().map((p) => ({
      SKU: p.sku,
      Item: p.name,
      Category: p.category,
      Barcode: p.barcode,
      Unit: p.unit,
      "Cost Price": p.purchasePrice,
      "Selling Price": p.sellingPrice,
      GST: p.gstRate,
      "Reorder Level": p.reorderLevel ?? DEFAULT_REORDER_LEVEL,
      Active: p.active,
      "Created At": p.createdAt,
      "Updated At": p.updatedAt,
    }))
  }

  static exportCurrentStockData(): ExportRow[] {
    return this.getAllStock().map((row) => ({
      SKU: row.sku,
      Item: row.name,
      "Current Stock": row.quantity,
      "Reorder Level": row.reorderLevel,
      "Stock Status": row.status,
      "Last Updated": row.updatedAt,
    }))
  }

  static exportInventoryMovementsData(): ExportRow[] {
    return inventoryMovementRepository.list().map((m) => ({
      Date: m.createdAt,
      Item: m.productName,
      SKU: m.sku,
      "Movement Type": m.type,
      Quantity: signedMovementQty(m.type, m.quantity),
      Reference: m.referenceId,
      Reason: m.reason,
      Staff: m.createdByName || m.createdBy,
    }))
  }

  private static resolveInventoryRow(skuOrProductId: string) {
    return (
      inventoryRepository.findBySku(skuOrProductId) ||
      inventoryRepository.findByProductId(skuOrProductId) ||
      inventoryRepository.getById(skuOrProductId)
    )
  }

  private static async ensureInventoryRow(
    sku: string,
    storeId: string | null,
    actorId: string | null,
    product?: ProductRecord | null
  ) {
    const existing = inventoryRepository.findBySku(sku)
    if (existing) return existing

    const catalog = product || productRepository.getById(sku)
    if (catalog) {
      return inventoryRepository.create(
        {
          name: catalog.name,
          quantity: 0,
          unit: catalog.unit || "pcs",
          sku: catalog.sku,
          category: catalog.category,
          productId: catalog.productId,
          storeId: storeId ?? catalog.storeId,
        },
        actorId
      )
    }

    return inventoryRepository.create(
      {
        name: sku,
        quantity: 0,
        unit: "pcs",
        sku,
        productId: sku,
        storeId,
      },
      actorId
    )
  }
}

function toStockRow(
  product: ProductRecord,
  quantity: number,
  inventoryId: string | null,
  updatedAt: string | null,
  reorderLevel: number
): StockRow {
  return {
    productId: product.productId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    barcode: product.barcode,
    unit: product.unit,
    sellingPrice: product.sellingPrice,
    costPrice: product.purchasePrice,
    gstRate: product.gstRate,
    reorderLevel,
    active: product.active,
    quantity,
    status: resolveStockStatus(quantity, reorderLevel),
    inventoryId,
    updatedAt,
  }
}

function resolveLineSku(line: {
  sku?: string | null
  itemId: string
  name: string
  weight: string
}): string | null {
  if (line.sku?.trim()) return line.sku.trim()

  const bySku = productRepository.getById(line.itemId)
  if (bySku) return bySku.sku

  const products = productRepository.list().filter(
    (p) => p.productId === line.itemId || p.name === line.name
  )
  if (products.length === 1) return products[0].sku

  const byWeight = products.find(
    (p) =>
      String(p.unitSize) === line.weight ||
      p.unit === line.weight ||
      `${p.unitSize}g` === line.weight
  )
  if (byWeight) return byWeight.sku

  const inv =
    inventoryRepository.findByProductId(line.itemId) ||
    inventoryRepository.list().find(
      (item) =>
        item.name.trim().toLowerCase() === line.name.trim().toLowerCase()
    )
  return inv?.sku || inv?.productId || null
}

export type { StockRow, StockStatus, InventorySummary, InventoryMovement }
