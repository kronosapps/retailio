/**
 * Best-effort cache sync after repository writes.
 * Fire-and-forget — never blocks POS flows.
 */

import {
  listLocalCustomers,
  normalizeCustomerPhone,
  upsertLocalCustomer,
  type CustomerRecord,
} from "@/data/customers"
import {
  findLocalInventoryBySku,
  listLocalInventory,
  upsertLocalInventory,
} from "@/data/inventory"
import { listLocalProducts, upsertLocalProduct, type ProductRecord } from "@/data/products"

import { PosCacheClient } from "./PosCacheClient"

function runAsync(task: () => Promise<void>) {
  void task().catch((error) => {
    if (import.meta.env.DEV) {
      console.warn("[PosCache] sync failed", error)
    }
  })
}

export function posCacheWarmProducts(storeId: string | null | undefined) {
  if (!PosCacheClient.isEnabled()) return
  const id = storeId ?? null
  runAsync(async () => {
    const products = listLocalProducts().filter(
      (p) => !id || !p.storeId || p.storeId === id
    )
    await PosCacheClient.warmProducts(id ?? "", products)
  })
}

export function posCacheWarmInventory(storeId: string | null | undefined) {
  if (!PosCacheClient.isEnabled()) return
  const id = storeId ?? null
  runAsync(async () => {
    const rows = listLocalInventory().filter(
      (r) => !id || !r.storeId || r.storeId === id
    )
    await PosCacheClient.warmInventory(id ?? "", rows)
  })
}

export function posCacheWarmCustomer(record: CustomerRecord) {
  if (!PosCacheClient.isEnabled()) return
  if (!record.phone) return
  runAsync(async () => {
    await PosCacheClient.warmCustomer(record.storeId ?? "", record)
  })
}

export function posCacheInvalidateProducts(storeId: string | null | undefined) {
  if (!PosCacheClient.isEnabled()) return
  runAsync(async () => {
    await PosCacheClient.invalidate(storeId ?? "", "products")
    posCacheWarmProducts(storeId)
  })
}

export function posCacheInvalidateInventory(storeId: string | null | undefined) {
  if (!PosCacheClient.isEnabled()) return
  runAsync(async () => {
    await PosCacheClient.invalidate(storeId ?? "", "inventory")
    posCacheWarmInventory(storeId)
  })
}

export function posCacheInvalidateCustomer(
  storeId: string | null | undefined,
  phone?: string | null
) {
  if (!PosCacheClient.isEnabled()) return
  const normalized = phone ? normalizeCustomerPhone(phone) : null
  runAsync(async () => {
    await PosCacheClient.invalidate(
      storeId ?? "",
      "customers",
      normalized ?? undefined
    )
  })
}

export function mergeProductsFromCache(products: ProductRecord[]) {
  for (const p of products) {
    upsertLocalProduct(p)
  }
}

export function mergeStockFromCache(stock: Record<string, number>) {
  for (const [sku, quantity] of Object.entries(stock)) {
    const existing = findLocalInventoryBySku(sku)
    if (existing) {
      upsertLocalInventory({
        ...existing,
        quantity,
        updatedAt: new Date().toISOString(),
      })
    }
  }
}

export function mergeCustomerFromCache(customer: CustomerRecord) {
  upsertLocalCustomer(customer)
}

/** Full POS hydrate: catalog + stock from Redis. */
export async function hydratePosFromCache(
  storeId: string | null
): Promise<boolean> {
  if (!PosCacheClient.isEnabled()) return false

  const id = storeId ?? ""
  const [catalog, stock] = await Promise.all([
    PosCacheClient.fetchCatalog(id),
    PosCacheClient.fetchStock(id),
  ])

  let updated = false
  if (catalog?.products && catalog.source === "redis") {
    mergeProductsFromCache(catalog.products)
    updated = true
  }
  if (stock?.stock && stock.source === "redis") {
    mergeStockFromCache(stock.stock)
    updated = true
  }
  return updated
}

/** Warm full local snapshots to Redis (after bootstrap seed). */
export function posCacheWarmAll(storeId: string | null | undefined) {
  posCacheWarmProducts(storeId)
  posCacheWarmInventory(storeId)
  if (!PosCacheClient.isEnabled()) return
  runAsync(async () => {
    const id = storeId ?? null
    for (const c of listLocalCustomers()) {
      if (id && c.storeId && c.storeId !== id) continue
      if (c.phone) await PosCacheClient.warmCustomer(id ?? "", c)
    }
  })
}
