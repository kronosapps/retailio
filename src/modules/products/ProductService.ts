import { rupeesToPaisa } from "@/lib/money"
import {
  productRepository,
  type ProductRecord,
} from "@/repositories/ProductRepository"
import {
  DEFAULT_REORDER_LEVEL,
  type CreateProductInput,
  type UpdateProductInput,
} from "@/modules/inventory/types"

export class ProductError extends Error {
  code: "VALIDATION" | "DUPLICATE" | "NOT_FOUND"

  constructor(code: ProductError["code"], message: string) {
    super(message)
    this.name = "ProductError"
    this.code = code
  }
}

/**
 * Product catalog module.
 * UI / bootstrap → ProductService → ProductRepository → Firestore/local → Sheets.
 */
export class ProductService {
  static list(): ProductRecord[] {
    return productRepository.list()
  }

  static getById(idOrSku: string): ProductRecord | null {
    return productRepository.getById(idOrSku)
  }

  static save(record: ProductRecord, isNew = false) {
    return productRepository.save(record, isNew)
  }

  static delete(id: string) {
    return productRepository.delete(id)
  }

  static ensureCatalogSeeded(
    storeId?: string | null,
    actorId?: string | null
  ) {
    return productRepository.ensureCatalogSeeded(storeId, actorId)
  }

  /** Force push products.json → local + Firestore + Sheets. */
  static syncCatalogFromSeed(
    storeId?: string | null,
    actorId?: string | null
  ) {
    return productRepository.syncCatalogFromSeed(storeId, actorId)
  }

  static async create(input: CreateProductInput): Promise<ProductRecord> {
    const name = input.name.trim()
    const sku = input.sku.trim().toUpperCase()
    if (!name) throw new ProductError("VALIDATION", "Item name is required.")
    if (!sku) throw new ProductError("VALIDATION", "SKU is required.")
    if (input.sellingPrice < 0) {
      throw new ProductError("VALIDATION", "Selling price cannot be negative.")
    }
    if (input.costPrice != null && input.costPrice < 0) {
      throw new ProductError("VALIDATION", "Cost price cannot be negative.")
    }
    const reorderLevel =
      input.reorderLevel == null ? DEFAULT_REORDER_LEVEL : Number(input.reorderLevel)
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      throw new ProductError("VALIDATION", "Reorder level cannot be negative.")
    }
    if (productRepository.getById(sku)) {
      throw new ProductError("DUPLICATE", "SKU already exists.")
    }
    const barcode = input.barcode?.trim() || null
    if (barcode) {
      const clash = productRepository
        .list()
        .find((p) => p.barcode && p.barcode.trim() === barcode)
      if (clash) {
        throw new ProductError("DUPLICATE", "Barcode already exists.")
      }
    }

    const now = new Date().toISOString()
    const unitSize =
      typeof input.unitSize === "number" && Number.isFinite(input.unitSize)
        ? input.unitSize
        : 1
    const gstRate =
      typeof input.gstRate === "number" && Number.isFinite(input.gstRate)
        ? input.gstRate
        : 0
    const purchasePrice =
      input.costPrice == null || !Number.isFinite(input.costPrice)
        ? null
        : input.costPrice

    const mrp =
      input.mrp == null || !Number.isFinite(input.mrp) ? null : input.mrp
    if (mrp != null && mrp < 0) {
      throw new ProductError("VALIDATION", "MRP cannot be negative.")
    }

    const record: ProductRecord = {
      id: sku,
      productId: sku,
      sku,
      barcode,
      name,
      category: input.category.trim() || "Uncategorized",
      brand: input.brand?.trim() || null,
      unitSize,
      unit: input.unit?.trim() || String(unitSize),
      gstRate,
      cgst: gstRate / 2,
      sgst: gstRate / 2,
      hsnCode: input.hsnCode?.trim() || null,
      purchasePricePaisa:
        purchasePrice === null ? null : rupeesToPaisa(purchasePrice),
      sellingPricePaisa: rupeesToPaisa(input.sellingPrice),
      mrpPaisa: mrp === null ? null : rupeesToPaisa(mrp),
      purchasePrice,
      sellingPrice: input.sellingPrice,
      mrp,
      reorderLevel,
      shelfLifeDays:
        input.shelfLifeDays == null || !Number.isFinite(input.shelfLifeDays)
          ? null
          : Math.max(0, Math.floor(input.shelfLifeDays)),
      storeId: input.storeId ?? null,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
    }

    return productRepository.save(record, true)
  }

  static async update(input: UpdateProductInput): Promise<ProductRecord> {
    const existing = productRepository.getById(input.id)
    if (!existing) throw new ProductError("NOT_FOUND", "Item not found.")

    if (input.sellingPrice != null && input.sellingPrice < 0) {
      throw new ProductError("VALIDATION", "Selling price cannot be negative.")
    }
    if (input.costPrice != null && input.costPrice < 0) {
      throw new ProductError("VALIDATION", "Cost price cannot be negative.")
    }
    if (input.reorderLevel != null && input.reorderLevel < 0) {
      throw new ProductError("VALIDATION", "Reorder level cannot be negative.")
    }

    const barcode =
      input.barcode === undefined
        ? existing.barcode
        : input.barcode?.trim() || null
    if (barcode) {
      const clash = productRepository
        .list()
        .find(
          (p) =>
            p.id !== existing.id &&
            p.barcode &&
            p.barcode.trim() === barcode
        )
      if (clash) {
        throw new ProductError("DUPLICATE", "Barcode already exists.")
      }
    }

    const sellingPrice = input.sellingPrice ?? existing.sellingPrice
    const purchasePrice =
      input.costPrice === undefined ? existing.purchasePrice : input.costPrice
    const gstRate = input.gstRate ?? existing.gstRate
    const unitSize = input.unitSize ?? existing.unitSize

    const next: ProductRecord = {
      ...existing,
      name: input.name?.trim() || existing.name,
      barcode,
      category: input.category?.trim() || existing.category,
      unitSize,
      unit: String(unitSize),
      gstRate,
      cgst: gstRate / 2,
      sgst: gstRate / 2,
      purchasePrice,
      purchasePricePaisa:
        purchasePrice === null ? null : rupeesToPaisa(purchasePrice),
      sellingPrice,
      sellingPricePaisa: rupeesToPaisa(sellingPrice),
      reorderLevel: input.reorderLevel ?? existing.reorderLevel,
      shelfLifeDays:
        input.shelfLifeDays === undefined
          ? existing.shelfLifeDays
          : input.shelfLifeDays == null || !Number.isFinite(input.shelfLifeDays)
            ? null
            : Math.max(0, Math.floor(input.shelfLifeDays)),
      active: input.active ?? existing.active,
      updatedBy: input.actorId ?? existing.updatedBy,
    }

    const saved = await productRepository.save(next, false)
    if (existing.sellingPricePaisa !== saved.sellingPricePaisa) {
      const { PricingService } = await import("@/modules/pricing/PricingService")
      await PricingService.recordPriceChange({
        sku: saved.id,
        productName: saved.name,
        oldSellingPricePaisa: existing.sellingPricePaisa,
        newSellingPricePaisa: saved.sellingPricePaisa,
        actorId: input.actorId ?? null,
        storeId: saved.storeId ?? null,
      })
    }
    return saved
  }

  static async setActive(
    id: string,
    active: boolean,
    actorId: string | null = null
  ) {
    return this.update({ id, active, actorId })
  }
}

export type { ProductRecord }
