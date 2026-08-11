import {
  InventoryService,
  stockStatusLabel,
  type StockStatus,
} from "@/modules/inventory"
import { rupeesToPaisa } from "@/lib/money"

import type { ReportFilters, ReportResult, ReportSheet } from "../types/report"
import {
  paisaAsRupeesNumber,
  reportStoreName,
} from "../utils/report-formatters"
import { formatPeriodLabel, resolveReportPeriod } from "../utils/report-periods"

export type StockReportSummary = {
  totalItems: number
  totalUnits: number
  stockValuePaisa: number
  potentialSalesValuePaisa: number
  lowStockCount: number
  outOfStockCount: number
  inStockCount: number
}

export type StockReportRow = {
  item: string
  sku: string
  category: string
  currentStock: number
  reorderLevel: number
  status: StockStatus
  statusLabel: string
  costPricePaisa: number | null
  sellingPricePaisa: number
  stockValuePaisa: number
  potentialSalesValuePaisa: number
}

export type StockReport = ReportResult<StockReportSummary, StockReportRow>

/**
 * Read-only current stock position — reuses InventoryService.getAllStock.
 */
export class StockReportService {
  static async getStockReport(filters: ReportFilters): Promise<StockReport> {
    const period = resolveReportPeriod(filters.preset, {
      start: filters.startDate,
      end: filters.endDate,
    })
    const resolved: ReportFilters = {
      ...filters,
      startDate: period.start,
      endDate: period.end,
    }

    let rows: StockReportRow[] = InventoryService.getAllStock({
      includeInactive: false,
    }).map((s) => {
      const costPaisa =
        s.costPrice == null ? null : rupeesToPaisa(s.costPrice)
      const sellPaisa = rupeesToPaisa(s.sellingPrice)
      const qty = Math.max(0, s.quantity)
      return {
        item: s.name,
        sku: s.sku,
        category: s.category,
        currentStock: s.quantity,
        reorderLevel: s.reorderLevel,
        status: s.status,
        statusLabel: stockStatusLabel(s.status),
        costPricePaisa: costPaisa,
        sellingPricePaisa: sellPaisa,
        stockValuePaisa: costPaisa == null ? 0 : qty * costPaisa,
        potentialSalesValuePaisa: qty * sellPaisa,
      }
    })

    if (filters.category) {
      rows = rows.filter((r) => r.category === filters.category)
    }
    if (filters.productSku) {
      const sku = filters.productSku.trim().toLowerCase()
      rows = rows.filter((r) => r.sku.toLowerCase() === sku)
    }

    rows.sort((a, b) => a.item.localeCompare(b.item))

    const summary: StockReportSummary = {
      totalItems: rows.length,
      totalUnits: rows.reduce((s, r) => s + Math.max(0, r.currentStock), 0),
      stockValuePaisa: rows.reduce((s, r) => s + r.stockValuePaisa, 0),
      potentialSalesValuePaisa: rows.reduce(
        (s, r) => s + r.potentialSalesValuePaisa,
        0
      ),
      lowStockCount: rows.filter((r) => r.status === "low_stock").length,
      outOfStockCount: rows.filter((r) => r.status === "out_of_stock").length,
      inStockCount: rows.filter((r) => r.status === "in_stock").length,
    }

    const low = rows.filter((r) => r.status === "low_stock")
    const out = rows.filter((r) => r.status === "out_of_stock")

    const breakdowns: Record<string, ReportSheet> = {
      "Low Stock": stockSheet(low),
      "Out of Stock": stockSheet(out),
    }

    return {
      reportType: "stock",
      generatedAt: new Date().toISOString(),
      filters: resolved,
      periodLabel: formatPeriodLabel(resolved.startDate, resolved.endDate),
      storeName: reportStoreName(),
      summary,
      rows,
      breakdowns,
    }
  }
}

function stockSheet(rows: StockReportRow[]): ReportSheet {
  return {
    name: "Stock",
    columns: [
      "Item",
      "SKU",
      "Category",
      "Current Stock",
      "Reorder Level",
      "Status",
      "Stock Value (₹)",
      "Potential Sales (₹)",
    ],
    rows: rows.map((r) => [
      r.item,
      r.sku,
      r.category,
      r.currentStock,
      r.reorderLevel,
      r.statusLabel,
      paisaAsRupeesNumber(r.stockValuePaisa),
      paisaAsRupeesNumber(r.potentialSalesValuePaisa),
    ]),
  }
}
