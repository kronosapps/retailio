/**
 * POS Redis cache client (Cloudflare Worker + Upstash).
 * Never throws — returns null on failure so local repos remain primary.
 */

import { env } from "@/core/config/env"
import { auth, isFirebaseConfigured } from "@/core/firebase"
import type { CustomerRecord } from "@/data/customers"
import type { InventoryRecord } from "@/data/inventory"
import type { ProductRecord } from "@/data/products"

export type CacheDomain = "products" | "inventory" | "customers"

export type CatalogCacheResponse = {
  storeId: string
  products: ProductRecord[] | null
  source: "redis" | "miss"
  cachedAt?: string
}

export type StockCacheResponse = {
  storeId: string
  stock: Record<string, number> | null
  source: "redis" | "miss"
}

export type CustomerCacheResponse = {
  storeId: string
  phone: string
  customer: CustomerRecord | null
  source: "redis" | "miss"
}

function workerBaseUrl(): string {
  return env.posCache.workerUrl.replace(/\/$/, "")
}

function isEnabled(): boolean {
  return (
    env.posCache.enabled &&
    Boolean(env.posCache.workerUrl) &&
    isFirebaseConfigured &&
    Boolean(auth?.currentUser)
  )
}

async function authHeaders(): Promise<HeadersInit | null> {
  if (!auth?.currentUser) return null
  try {
    const token = await auth.currentUser.getIdToken()
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
    if (env.posCache.apiKey) {
      headers["X-Cache-Api-Key"] = env.posCache.apiKey
    }
    return headers
  } catch {
    return null
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T | null> {
  if (!isEnabled()) return null
  const headers = await authHeaders()
  if (!headers) return null

  try {
    const res = await fetch(`${workerBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    })
    if (!res.ok) {
      if (env.dev) {
        console.warn(`[PosCache] ${path} failed`, res.status)
      }
      return null
    }
    return (await res.json()) as T
  } catch (error) {
    if (env.dev) {
      console.warn(`[PosCache] ${path} error`, error)
    }
    return null
  }
}

export const PosCacheClient = {
  isEnabled,

  async fetchCatalog(storeId: string): Promise<CatalogCacheResponse | null> {
    const id = storeId || env.storeId
    return request<CatalogCacheResponse>(
      `/v1/catalog?storeId=${encodeURIComponent(id)}`
    )
  },

  async fetchStock(
    storeId: string,
    skus?: string[]
  ): Promise<StockCacheResponse | null> {
    const id = storeId || env.storeId
    const skuPart =
      skus && skus.length > 0
        ? `&skus=${encodeURIComponent(skus.join(","))}`
        : ""
    return request<StockCacheResponse>(
      `/v1/stock?storeId=${encodeURIComponent(id)}${skuPart}`
    )
  },

  async lookupCustomerByPhone(
    storeId: string,
    phone: string
  ): Promise<CustomerCacheResponse | null> {
    const normalized = phone.replace(/\D/g, "")
    if (!normalized) return null
    const id = storeId || env.storeId
    return request<CustomerCacheResponse>(
      `/v1/customer?storeId=${encodeURIComponent(id)}&phone=${encodeURIComponent(normalized)}`
    )
  },

  async warmProducts(storeId: string, products: ProductRecord[]): Promise<void> {
    const id = storeId || env.storeId
    const filtered = products.filter(
      (p) => !p.storeId || p.storeId === id
    )
    await request(`/v1/cache/warm`, {
      method: "POST",
      body: JSON.stringify({
        storeId: id,
        domain: "products",
        payload: filtered,
      }),
    })
  },

  async warmInventory(
    storeId: string,
    records: InventoryRecord[]
  ): Promise<void> {
    const id = storeId || env.storeId
    const stock: Record<string, number> = {}
    for (const row of records) {
      if (row.storeId && row.storeId !== id) continue
      const sku = row.sku?.trim()
      if (!sku) continue
      stock[sku] = row.quantity
    }
    await request(`/v1/cache/warm`, {
      method: "POST",
      body: JSON.stringify({
        storeId: id,
        domain: "inventory",
        payload: stock,
      }),
    })
  },

  async warmCustomer(
    storeId: string,
    customer: CustomerRecord
  ): Promise<void> {
    const phone = customer.phone?.replace(/\D/g, "")
    if (!phone) return
    const id = storeId || env.storeId
    await request(`/v1/cache/warm`, {
      method: "POST",
      body: JSON.stringify({
        storeId: id,
        domain: "customers",
        phone,
        payload: customer,
      }),
    })
  },

  async invalidate(
    storeId: string,
    domain: CacheDomain,
    phone?: string
  ): Promise<void> {
    const id = storeId || env.storeId
    await request(`/v1/cache/invalidate`, {
      method: "POST",
      body: JSON.stringify({
        storeId: id,
        domain,
        phone: phone?.replace(/\D/g, "") || undefined,
      }),
    })
  },
}
