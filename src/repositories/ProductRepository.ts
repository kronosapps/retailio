import {
  buildCatalogRecords,
  deleteLocalProduct,
  getLocalProduct,
  isProductCatalogSeeded,
  listLocalProducts,
  markProductCatalogSeeded,
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
      next,
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
        ...existing,
        active: false,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      existing.storeId
    )
    return existing
  }

  /**
   * Seeds the full Pavani's Foods catalog once into local + Firestore + Sheets.
   */
  async ensureCatalogSeeded(
    storeId: string | null = env.storeId || null,
    actorId: string | null = "system"
  ): Promise<ProductRecord[]> {
    if (isProductCatalogSeeded()) {
      return listLocalProducts()
    }

    const catalog = buildCatalogRecords(storeId, actorId)
    // Local first so the UI has data even if cloud/sync is slow
    replaceLocalProducts(catalog)

    for (const product of catalog) {
      await upsertDocument(COLLECTION, product.id, product)
      await EventPublisher.publish(
        EventTypes.PRODUCT_CREATED,
        product,
        product.storeId
      )
    }

    markProductCatalogSeeded()
    return listLocalProducts()
  }
}

export const productRepository = new ProductRepository()
