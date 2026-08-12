import {
  InventoryService,
  movementTypeLabel,
  signedMovementQty,
  type InventoryMovement,
  type InventoryMovementType,
} from "@/modules/inventory"
import { productRepository } from "@/repositories/ProductRepository"

import type { ReportFilters, ReportResult, ReportSheet } from "../types/report"
import {
  formatReportDateTime,
  reportStoreName,
} from "../utils/report-formatters"
import {
  formatPeriodLabel,
  isInRange,
  resolveReportPeriod,
} from "../utils/report-periods"

export type InventoryReportSummary = {
  openingUnits: number
  purchasedUnits: number
  soldUnits: number
  returnUnits: number
  adjustmentInUnits: number
  adjustmentOutUnits: number
  damageUnits: number
  wastageUnits: number
  closingUnits: number
  movementCount: number
}

export type InventoryMovementReportRow = {
  date: string
  item: string
  sku: string
  category: string
  movementType: string
  quantity: number
  signedQuantity: number
  reference: string
  reason: string
  staff: string
  balanceAfter: number
}

export type InventoryItemSummaryRow = {
  sku: string
  item: string
  category: string
  purchased: number
  sold: number
  returned: number
  damaged: number
  wastage: number
  adjustments: number
  netChange: number
}

export type InventoryReport = ReportResult<
  InventoryReportSummary,
  InventoryMovementReportRow
> & {
  itemSummaries: InventoryItemSummaryRow[]
}

const IN_TYPES: InventoryMovementType[] = [
  "OPENING_STOCK",
  "PURCHASE",
  "RETURN",
  "ADJUSTMENT_IN",
]
const OUT_TYPES: InventoryMovementType[] = [
  "SALE",
  "DAMAGE",
  "WASTAGE",
  "ADJUSTMENT_OUT",
  "PURCHASE_RETURN",
]

/**
 * Read-only inventory movements report.
 */
export class InventoryReportService {
  static async getInventoryReport(
    filters: ReportFilters
  ): Promise<InventoryReport> {
    const period = resolveReportPeriod(filters.preset, {
      start: filters.startDate,
      end: filters.endDate,
    })
    const resolved: ReportFilters = {
      ...filters,
      startDate: period.start,
      endDate: period.end,
    }

    const products = productRepository.list()
    const categoryBySku = new Map(
      products.map((p) => [p.sku.trim().toLowerCase(), p.category] as const)
    )

    const movements = InventoryService.getMovementHistory().filter((m) => {
      if (!isInRange(m.createdAt, resolved.startDate, resolved.endDate)) {
        return false
      }
      if (filters.productSku) {
        const sku = filters.productSku.trim().toLowerCase()
        if (m.sku.toLowerCase() !== sku) return false
      }
      if (filters.category) {
        const cat =
          categoryBySku.get(m.sku.toLowerCase()) || "Uncategorized"
        if (cat !== filters.category) return false
      }
      if (filters.staffId && m.createdBy && m.createdBy !== filters.staffId) {
        return false
      }
      return true
    })

    const summary = emptySummary()
    summary.movementCount = movements.length

    const bySku = new Map<string, InventoryItemSummaryRow>()

    for (const m of movements) {
      applyMovementToSummary(summary, m)
      const key = m.sku
      const row =
        bySku.get(key) ||
        ({
          sku: m.sku,
          item: m.productName,
          category: categoryBySku.get(m.sku.toLowerCase()) || "Uncategorized",
          purchased: 0,
          sold: 0,
          returned: 0,
          damaged: 0,
          wastage: 0,
          adjustments: 0,
          netChange: 0,
        } satisfies InventoryItemSummaryRow)

      row.netChange += signedMovementQty(m.type, m.quantity)
      if (m.type === "PURCHASE" || m.type === "OPENING_STOCK") {
        row.purchased += m.quantity
      } else if (m.type === "SALE") {
        row.sold += m.quantity
      } else if (m.type === "RETURN") {
        row.returned += m.quantity
      } else if (m.type === "DAMAGE") {
        row.damaged += m.quantity
      } else if (m.type === "WASTAGE") {
        row.wastage += m.quantity
      } else if (m.type === "ADJUSTMENT_IN") {
        row.adjustments += m.quantity
      } else if (m.type === "ADJUSTMENT_OUT" || m.type === "PURCHASE_RETURN") {
        row.adjustments -= m.quantity
      }
      bySku.set(key, row)
    }

    // Closing ≈ sum of current stock for touched SKUs (authoritative on-hand)
    const stock = InventoryService.getAllStock({ includeInactive: true })
    const touched = new Set(bySku.keys())
    summary.closingUnits = stock
      .filter((s) => touched.size === 0 || touched.has(s.sku))
      .reduce((sum, s) => sum + Math.max(0, s.quantity), 0)

    // Opening approximation: closing - net change in period
    const netPeriod =
      summary.purchasedUnits +
      summary.returnUnits +
      summary.adjustmentInUnits -
      summary.soldUnits -
      summary.damageUnits -
      summary.wastageUnits -
      summary.adjustmentOutUnits
    summary.openingUnits = Math.max(0, summary.closingUnits - netPeriod)

    const rows: InventoryMovementReportRow[] = movements.map((m) => ({
      date: formatReportDateTime(m.createdAt),
      item: m.productName,
      sku: m.sku,
      category: categoryBySku.get(m.sku.toLowerCase()) || "Uncategorized",
      movementType: movementTypeLabel(m.type),
      quantity: m.quantity,
      signedQuantity: signedMovementQty(m.type, m.quantity),
      reference: m.referenceId || "—",
      reason: m.reason || "—",
      staff: m.createdByName || m.createdBy || "—",
      balanceAfter: m.balanceAfter,
    }))

    const itemSummaries = [...bySku.values()].sort((a, b) =>
      a.item.localeCompare(b.item)
    )

    const breakdowns: Record<string, ReportSheet> = {
      "Item Summary": {
        name: "Item Summary",
        columns: [
          "SKU",
          "Item",
          "Category",
          "Purchased",
          "Sold",
          "Returned",
          "Damaged",
          "Wastage",
          "Adjustments",
          "Net Change",
        ],
        rows: itemSummaries.map((r) => [
          r.sku,
          r.item,
          r.category,
          r.purchased,
          r.sold,
          r.returned,
          r.damaged,
          r.wastage,
          r.adjustments,
          r.netChange,
        ]),
      },
    }

    return {
      reportType: "inventory",
      generatedAt: new Date().toISOString(),
      filters: resolved,
      periodLabel: formatPeriodLabel(resolved.startDate, resolved.endDate),
      storeName: reportStoreName(),
      summary,
      rows,
      itemSummaries,
      breakdowns,
    }
  }
}

function emptySummary(): InventoryReportSummary {
  return {
    openingUnits: 0,
    purchasedUnits: 0,
    soldUnits: 0,
    returnUnits: 0,
    adjustmentInUnits: 0,
    adjustmentOutUnits: 0,
    damageUnits: 0,
    wastageUnits: 0,
    closingUnits: 0,
    movementCount: 0,
  }
}

function applyMovementToSummary(
  summary: InventoryReportSummary,
  m: InventoryMovement
) {
  switch (m.type) {
    case "OPENING_STOCK":
    case "PURCHASE":
      summary.purchasedUnits += m.quantity
      break
    case "SALE":
      summary.soldUnits += m.quantity
      break
    case "RETURN":
      summary.returnUnits += m.quantity
      break
    case "DAMAGE":
      summary.damageUnits += m.quantity
      break
    case "WASTAGE":
      summary.wastageUnits += m.quantity
      break
    case "ADJUSTMENT_IN":
      summary.adjustmentInUnits += m.quantity
      break
    case "ADJUSTMENT_OUT":
      summary.adjustmentOutUnits += m.quantity
      break
    case "PURCHASE_RETURN":
      summary.adjustmentOutUnits += m.quantity
      break
  }
  void IN_TYPES
  void OUT_TYPES
}
