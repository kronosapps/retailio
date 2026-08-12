import {
  buildCatalogRecords,
  deleteLocalProduct,
  getLocalProduct,
  listLocalProducts,
  markProductCatalogSeeded,
  needsProductCatalogResync,
  PRODUCT_CATALOG_VERSION,
  replaceLocalProducts,
  upsertLocalProduct,
  type ProductRecord,
} from "@/data/products"
import { env } from "@/core/config/env"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"

import { removeDocument, upsertDocument } from "./firestoreHelpers"

const COLLECTION = "products"

export type { ProductRecord }

/**
 * Owns the `products` Firestore collection.
 * Document id = SKU (unique sellable unit). `productId` groups pack sizes.
 */
export class ProductRepository {
  list(): ProductRecord[] {
    return listLocalProducts()
  }

  getById(idOrSku: string): ProductRecord | null {
    return getLocalProduct(idOrSku)
  }

  async save(
    record: ProductRecord,
    isNew = false
  ): Promise<ProductRecord> {
    const next: ProductRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    upsertLocalProduct(next)
    await upsertDocument(COLLECTION, next.id, next)
    await EventPublisher.publish(
      isNew ? EventTypes.PRODUCT_CREATED : EventTypes.PRODUCT_UPDATED,
      toSheetsPayload(next),
      next.storeId
    )
    return next
  }

  async delete(id: string): Promise<ProductRecord | null> {
    const existing = deleteLocalProduct(id)
    if (!existing) return null
    await removeDocument(COLLECTION, existing.id)
    await EventPublisher.publish(
      EventTypes.PRODUCT_UPDATED,
      {
        ...toSheetsPayload(existing),
        active: false,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      existing.storeId
    )
    return existing
  }

  /**
   * Seeds / re-syncs products.json → local + Firestore + Sheets.
   * Re-runs when PRODUCT_CATALOG_VERSION increases (e.g. new cgst/sgst fields).
   */
  async ensureCatalogSeeded(
    storeId: string | null = env.storeId || null,
    actorId: string | null = "system"
  ): Promise<ProductRecord[]> {
    if (!needsProductCatalogResync()) {
      return listLocalProducts()
    }

    return this.syncCatalogFromSeed(storeId, actorId)
  }

  /** Always push the bundled products.json to local, Firestore, and Sheets. */
  async syncCatalogFromSeed(
    storeId: string | null = env.storeId || null,
    actorId: string | null = "system"
  ): Promise<ProductRecord[]> {
    const catalog = buildCatalogRecords(storeId, actorId)
    replaceLocalProducts(catalog, PRODUCT_CATALOG_VERSION)

    for (const product of catalog) {
      await upsertDocument(COLLECTION, product.id, product)
      await EventPublisher.publish(
        EventTypes.PRODUCT_UPDATED,
        toSheetsPayload(product),
        product.storeId
      )
    }

    markProductCatalogSeeded(PRODUCT_CATALOG_VERSION)
    return listLocalProducts()
  }
}

/** Flat payload so Sheets gets cgst/sgst columns clearly. */
function toSheetsPayload(product: ProductRecord) {
  return {
    productId: product.productId,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unitSize: product.unitSize,
    unit: product.unit,
    gstRate: product.gstRate,
    cgst: product.cgst,
    sgst: product.sgst,
    hsnCode: product.hsnCode,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    mrp: product.mrp,
    reorderLevel: product.reorderLevel,
    storeId: product.storeId,
    active: product.active,
    updatedAt: product.updatedAt,
    createdBy: product.createdBy ?? null,
    updatedBy: product.updatedBy ?? null,
  }
}

export const productRepository = new ProductRepository()
