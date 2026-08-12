import { InventoryService } from "@/modules/inventory/InventoryService"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"
import { DEFAULT_REORDER_LEVEL } from "@/modules/inventory/types"
import type { InventoryLotRecord } from "@/data/inventoryLots"

export type ReorderSuggestion = {
  sku: string
  name: string
  category: string
  onHand: number
  reorderLevel: number
  /** Suggested purchase qty to reach ~2× reorder level. */
  suggestedQty: number
  status: "low_stock" | "out_of_stock"
  soldLast30Days: number
  daysCover: number | null
}

export type StockHealthRow = {
  sku: string
  name: string
  category: string
  onHand: number
  soldLast30Days: number
  soldLast90Days: number
  /** No sales in 90 days with stock on hand. */
  isDead: boolean
  /** Sales in 90d but cover > 60 days at recent velocity. */
  isSlow: boolean
  daysCover: number | null
}

/**
 * Reorder suggestions + slow/dead stock heuristics from movements + on-hand.
 */
export class StockAnalyticsService {
  static getReorderSuggestions(): ReorderSuggestion[] {
    const stock = InventoryService.getAllStock({ includeInactive: false })
    const sold30 = this.soldBySkuSince(30)
    const rows: ReorderSuggestion[] = []

    for (const row of stock) {
      const reorderLevel = row.reorderLevel ?? DEFAULT_REORDER_LEVEL
      if (row.quantity > reorderLevel) continue
      const soldLast30Days = sold30.get(row.sku.toUpperCase()) || 0
      const target = Math.max(reorderLevel * 2, reorderLevel)
      const suggestedQty = Math.max(1, target - row.quantity)
      const daysCover =
        soldLast30Days > 0
          ? Math.round((row.quantity / soldLast30Days) * 30)
          : null
      rows.push({
        sku: row.sku,
        name: row.name,
        category: row.category,
        onHand: row.quantity,
        reorderLevel,
        suggestedQty,
        status: row.quantity <= 0 ? "out_of_stock" : "low_stock",
        soldLast30Days,
        daysCover,
      })
    }

    return rows.sort(
      (a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name)
    )
  }

  static getStockHealth(): StockHealthRow[] {
    const stock = InventoryService.getAllStock({ includeInactive: false })
    const sold30 = this.soldBySkuSince(30)
    const sold90 = this.soldBySkuSince(90)
    const rows: StockHealthRow[] = []

    for (const row of stock) {
      if (row.quantity <= 0) continue
      const s30 = sold30.get(row.sku.toUpperCase()) || 0
      const s90 = sold90.get(row.sku.toUpperCase()) || 0
      const daysCover =
        s30 > 0 ? Math.round((row.quantity / s30) * 30) : null
      const isDead = s90 === 0
      const isSlow = !isDead && daysCover != null && daysCover > 60
      if (!isDead && !isSlow) continue
      rows.push({
        sku: row.sku,
        name: row.name,
        category: row.category,
        onHand: row.quantity,
        soldLast30Days: s30,
        soldLast90Days: s90,
        isDead,
        isSlow,
        daysCover,
      })
    }

    return rows.sort((a, b) => Number(b.isDead) - Number(a.isDead))
  }

  static getExpiryAlerts(withinDays = 30): {
    expired: InventoryLotRecord[]
    expiringSoon: InventoryLotRecord[]
  } {
    const expired = InventoryService.listExpiredLots()
    const expiringSoon = InventoryService.listExpiringLots(withinDays).filter(
      (l) => !expired.some((e) => e.id === l.id)
    )
    return { expired, expiringSoon }
  }

  private static soldBySkuSince(days: number): Map<string, number> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const map = new Map<string, number>()
    for (const m of inventoryMovementRepository.list()) {
      if (m.type !== "SALE") continue
      if (new Date(m.createdAt).getTime() < since) continue
      const key = m.sku.toUpperCase()
      map.set(key, (map.get(key) || 0) + m.quantity)
    }
    return map
  }
}
