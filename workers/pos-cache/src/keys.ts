/** Redis key builders + TTL (seconds) for POS cache. */

export const TTL = {
  products: 600,
  inventory: 120,
  customer: 300,
} as const

export type CacheDomain = "products" | "inventory" | "customers"

export function productsKey(storeId: string) {
  return `pos:${storeId}:products:v1`
}

export function inventoryMapKey(storeId: string) {
  return `pos:${storeId}:inventory:map:v1`
}

export function customerPhoneKey(storeId: string, phone: string) {
  return `pos:${storeId}:customer:phone:${phone}:v1`
}

export function keysForDomain(storeId: string, domain: CacheDomain): string[] {
  switch (domain) {
    case "products":
      return [productsKey(storeId)]
    case "inventory":
      return [inventoryMapKey(storeId)]
    case "customers":
      return [`pos:${storeId}:customer:phone:*`]
    default:
      return []
  }
}
