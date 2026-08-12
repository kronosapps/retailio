import type { RecordedSale } from "@/data/invoices"
import type { ProductRecord } from "@/data/products"
import {
  addDaysToDateKey,
  type InventoryLotRecord,
} from "@/data/inventoryLots"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { categoryRepository } from "@/repositories/CategoryRepository"
import { inventoryRepository } from "@/repositories/InventoryRepository"
import { inventoryLotRepository } from "@/repositories/InventoryLotRepository"
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
      expiryDate: input.expiryDate ?? null,
      batchCode: input.batchCode ?? null,
      receivedAt: input.receivedAt ?? null,
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

  /** Opening stock receive — creates OPENING_STOCK movement + lot. */
  static async addOpeningStock(input: {
    sku: string
    quantity: number
    expiryDate?: string | null
    batchCode?: string | null
    notes?: string | null
    actorId?: string | null
    actorName?: string | null
    storeId?: string | null
  }) {
    return this.addStock({
      ...input,
      type: "OPENING_STOCK",
      reason: "Opening stock",
      referenceId: `opening:${input.sku}:${Date.now()}`,
    })
  }

  static listLots(sku?: string): InventoryLotRecord[] {
    if (sku) return inventoryLotRepository.listBySku(sku)
    return inventoryLotRepository.list()
  }

  static listExpiringLots(withinDays = 30): InventoryLotRecord[] {
    const today = new Date().toISOString().slice(0, 10)
    const cutoff = addDaysToDateKey(today, withinDays)
    return inventoryLotRepository
      .list()
      .filter(
        (l) =>
          l.quantity > 0 &&
          l.expiryDate != null &&
          l.expiryDate <= cutoff
      )
      .sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || ""))
  }

  static listExpiredLots(): InventoryLotRecord[] {
    const today = new Date().toISOString().slice(0, 10)
    return inventoryLotRepository
      .list()
      .filter((l) => l.quantity > 0 && l.expiryDate != null && l.expiryDate < today)
  }

  /** Write off remaining qty on an expired (or any) lot as WASTAGE. */
  static async writeOffLot(input: {
    lotId: string
    reason?: string | null
    actorId?: string | null
    actorName?: string | null
  }) {
    const lot = inventoryLotRepository.getById(input.lotId)
    if (!lot) {
      throw new InventoryError("NOT_FOUND", "Lot not found.")
    }
    if (lot.quantity <= 0) {
      throw new InventoryError("VALIDATION", "Lot has no remaining quantity.")
    }
    return this.recordMovement({
      sku: lot.sku,
      type: "WASTAGE",
      quantity: lot.quantity,
      reason: input.reason ?? `Expired lot ${lot.lotNumber}`,
      referenceId: lot.id,
      notes: lot.expiryDate ? `Expiry ${lot.expiryDate}` : null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      storeId: lot.storeId,
      preferLotId: lot.id,
    })
  }

  static hydrateLots() {
    return inventoryLotRepository.hydrate()
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
    expiryDate?: string | null
    batchCode?: string | null
    receivedAt?: string | null
    /** Force consume/write-off from a specific lot. */
    preferLotId?: string | null
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

    // Lot layer: receive → create lot; consume → FEFO (or preferLotId).
    if (delta > 0) {
      await this.receiveIntoLot({
        sku,
        productName: inventory.name,
        quantity: qty,
        type: input.type,
        referenceId: input.referenceId ?? input.idempotentKey ?? null,
        expiryDate: input.expiryDate,
        batchCode: input.batchCode,
        receivedAt: input.receivedAt,
        storeId: input.storeId ?? inventory.storeId,
        actorId: input.actorId,
        product,
      })
    } else if (delta < 0) {
      await this.consumeFromLots({
        sku,
        quantity: qty,
        allowNegative: Boolean(input.allowNegative),
        preferLotId: input.preferLotId ?? null,
        inventoryQty: inventory.quantity,
        productName: inventory.name,
        storeId: input.storeId ?? inventory.storeId,
        actorId: input.actorId,
      })
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

  private static lotSourceType(
    type: InventoryMovementType
  ): "OPENING_STOCK" | "PURCHASE" | "ADJUSTMENT_IN" | "RETURN" {
    if (type === "OPENING_STOCK") return "OPENING_STOCK"
    if (type === "RETURN") return "RETURN"
    if (type === "ADJUSTMENT_IN") return "ADJUSTMENT_IN"
    return "PURCHASE"
  }

  private static async receiveIntoLot(input: {
    sku: string
    productName: string
    quantity: number
    type: InventoryMovementType
    referenceId: string | null
    expiryDate?: string | null
    batchCode?: string | null
    receivedAt?: string | null
    storeId: string | null
    actorId?: string | null
    product: ProductRecord | null
  }) {
    const receivedAt = input.receivedAt || new Date().toISOString()
    let expiryDate = input.expiryDate?.slice(0, 10) || null
    if (!expiryDate && input.product?.shelfLifeDays) {
      const base = receivedAt.slice(0, 10)
      expiryDate = addDaysToDateKey(base, input.product.shelfLifeDays)
    }
    await inventoryLotRepository.create({
      sku: input.sku,
      productName: input.productName,
      quantity: input.quantity,
      expiryDate,
      receivedAt,
      batchCode: input.batchCode,
      sourceType: this.lotSourceType(input.type),
      sourceId: input.referenceId,
      storeId: input.storeId,
      actorId: input.actorId,
    })
  }

  private static async consumeFromLots(input: {
    sku: string
    quantity: number
    allowNegative: boolean
    preferLotId: string | null
    inventoryQty: number
    productName: string
    storeId: string | null
    actorId?: string | null
  }) {
    await this.ensureLegacyLotIfNeeded(input)

    let remaining = input.quantity
    const lots = input.preferLotId
      ? (() => {
          const one = inventoryLotRepository.getById(input.preferLotId!)
          return one && one.quantity > 0 ? [one] : []
        })()
      : inventoryLotRepository.listOpenBySkuFefo(input.sku)

    for (const lot of lots) {
      if (remaining <= 0) break
      const take = Math.min(lot.quantity, remaining)
      if (take <= 0) continue
      await inventoryLotRepository.save({
        ...lot,
        quantity: lot.quantity - take,
      })
      remaining -= take
    }

    if (remaining > 0 && !input.allowNegative) {
      throw new InventoryError(
        "INSUFFICIENT_STOCK",
        `Insufficient lot quantity for ${input.sku}. Short ${remaining}.`
      )
    }
    // Oversell path: ignore leftover lot deficit (header qty already allows negative).
  }

  /** Backfill a LEGACY lot when header qty exists but no open lots. */
  private static async ensureLegacyLotIfNeeded(input: {
    sku: string
    inventoryQty: number
    productName: string
    storeId: string | null
    actorId?: string | null
  }) {
    const open = inventoryLotRepository.listBySku(input.sku)
    const lotSum = open.reduce((s, l) => s + l.quantity, 0)
    if (lotSum > 0 || input.inventoryQty <= 0) return
    await inventoryLotRepository.create({
      sku: input.sku,
      productName: input.productName,
      quantity: input.inventoryQty,
      expiryDate: null,
      sourceType: "LEGACY",
      sourceId: null,
      storeId: input.storeId,
      actorId: input.actorId,
    })
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

  /**
   * Restock selected lines for a posted sales return.
   * Idempotent per salesReturnId+sku.
   */
  static async restockForSalesReturn(input: {
    salesReturnId: string
    invoiceId: string
    storeId?: string | null
    actorId?: string | null
    actorName?: string | null
    lines: Array<{
      sku: string | null
      itemId: string
      name: string
      quantity: number
    }>
  }): Promise<number> {
    let count = 0
    for (const line of input.lines) {
      if (line.quantity <= 0) continue
      const sku = resolveLineSku({
        sku: line.sku,
        itemId: line.itemId,
        name: line.name,
        weight: "",
      })
      if (!sku) continue
      const ref = `sale-return:${input.salesReturnId}:${sku}`
      try {
        await this.recordMovement({
          sku,
          type: "RETURN",
          quantity: line.quantity,
          reason: `Sales return ${input.salesReturnId}`,
          referenceId: input.invoiceId,
          idempotentKey: ref,
          notes: line.name,
          actorId: input.actorId ?? null,
          actorName: input.actorName ?? null,
          storeId: input.storeId ?? null,
          allowNegative: false,
        })
        count += 1
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(
            "[InventoryService] sales return restock failed",
            sku,
            err
          )
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
