import {
  productRepository,
  type ProductRecord,
} from "@/repositories/ProductRepository"

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
}

export type { ProductRecord }
