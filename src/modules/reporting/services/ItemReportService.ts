import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { productRepository } from "@/repositories/ProductRepository"
import {
  InventoryService,
  stockStatusLabel,
} from "@/modules/inventory"
import { rupeesToPaisa } from "@/lib/money"

import type { ReportFilters, ReportResult, ReportSheet } from "../types/report"
import {
  saleDiscountPaisa,
  saleGstPaisa,
  saleNetPaisa,
} from "../utils/report-calculations"
import {
  paisaAsRupeesNumber,
  reportStoreName,
} from "../utils/report-formatters"
import {
  formatPeriodLabel,
  isInRange,
  resolveReportPeriod,
} from "../utils/report-periods"

export type ItemSort =
  | "top_selling"
  | "lowest_selling"
  | "highest_revenue"
  | "lowest_revenue"
  | "highest_stock"
  | "lowest_stock"

export type ItemReportSummary = {
  itemCount: number
  unitsSold: number
  grossSalesPaisa: number
  netSalesPaisa: number
  discountPaisa: number
  gstPaisa: number
}

export type ItemReportRow = {
  item: string
  sku: string
  category: string
  unitsSold: number
  grossSalesPaisa: number
  discountPaisa: number
  gstPaisa: number
  netSalesPaisa: number
  averageSellingPricePaisa: number
  currentStock: number
  stockValuePaisa: number
  statusLabel: string
}

export type ItemReport = ReportResult<ItemReportSummary, ItemReportRow> & {
  sort: ItemSort
  categoryPerformance: {
    category: string
    unitsSold: number
    netSalesPaisa: number
  }[]
}

/**
 * Read-only item performance report.
 */
export class ItemReportService {
  static async getItemReport(
    filters: ReportFilters,
    sort: ItemSort = "highest_revenue"
  ): Promise<ItemReport> {
    const period = resolveReportPeriod(filters.preset, {
      start: filters.startDate,
      end: filters.endDate,
    })
    const resolved: ReportFilters = {
      ...filters,
      startDate: period.start,
      endDate: period.end,
    }

    const [invoices, products, stock] = await Promise.all([
      invoiceRepository.list(),
      Promise.resolve(productRepository.list()),
      Promise.resolve(InventoryService.getAllStock({ includeInactive: true })),
    ])

    const stockBySku = new Map(stock.map((s) => [s.sku.toLowerCase(), s]))
    const productBySku = new Map(
      products.map((p) => [p.sku.toLowerCase(), p] as const)
    )

    type Agg = {
      item: string
      sku: string
      category: string
      unitsSold: number
      grossSalesPaisa: number
      discountPaisa: number
      gstPaisa: number
      netSalesPaisa: number
    }

    const bySku = new Map<string, Agg>()

    for (const sale of invoices) {
      if (sale.paymentStatus !== "Paid" && sale.paymentStatus !== "Refunded") {
        continue
      }
      if (!isInRange(sale.createdAt, resolved.startDate, resolved.endDate)) {
        continue
      }
      if (filters.storeId && sale.storeId && sale.storeId !== filters.storeId) {
        continue
      }

      const discount = saleDiscountPaisa(sale)
      const gst = saleGstPaisa(sale)
      const net = saleNetPaisa(sale)
      const lineTotal = sale.lines
        .filter((l) => !l.isLoyaltyReward)
        .reduce((s, l) => s + l.lineTotalPaisa, 0)

      for (const line of sale.lines) {
        if (line.isLoyaltyReward || line.qty <= 0) continue
        const sku =
          (line.sku || "").trim() ||
          productBySku.get(line.itemId.toLowerCase())?.sku ||
          line.itemId
        const product = productBySku.get(sku.toLowerCase())
        const category = product?.category || "Uncategorized"
        if (filters.category && category !== filters.category) continue
        if (
          filters.productSku &&
          sku.toLowerCase() !== filters.productSku.trim().toLowerCase()
        ) {
          continue
        }

        const share =
          lineTotal > 0 ? line.lineTotalPaisa / lineTotal : 0
        const key = sku.toLowerCase()
        const cur =
          bySku.get(key) ||
          ({
            item: line.name,
            sku,
            category,
            unitsSold: 0,
            grossSalesPaisa: 0,
            discountPaisa: 0,
            gstPaisa: 0,
            netSalesPaisa: 0,
          } satisfies Agg)

        cur.unitsSold += line.qty
        cur.grossSalesPaisa += line.lineTotalPaisa
        cur.discountPaisa += Math.round(discount * share)
        cur.gstPaisa += Math.round(gst * share)
        cur.netSalesPaisa += Math.round(net * share)
        bySku.set(key, cur)
      }
    }

    // Include catalog items with zero sales when not filtering to a single SKU
    for (const product of products) {
      if (!product.active) continue
      if (filters.category && product.category !== filters.category) continue
      if (
        filters.productSku &&
        product.sku.toLowerCase() !== filters.productSku.trim().toLowerCase()
      ) {
        continue
      }
      const key = product.sku.toLowerCase()
      if (bySku.has(key)) continue
      bySku.set(key, {
        item: product.name,
        sku: product.sku,
        category: product.category,
        unitsSold: 0,
        grossSalesPaisa: 0,
        discountPaisa: 0,
        gstPaisa: 0,
        netSalesPaisa: 0,
      })
    }

    let rows: ItemReportRow[] = [...bySku.values()].map((a) => {
      const st = stockBySku.get(a.sku.toLowerCase())
      const cost = st?.costPrice == null ? 0 : rupeesToPaisa(st.costPrice)
      const qty = st?.quantity ?? 0
      return {
        item: a.item,
        sku: a.sku,
        category: a.category,
        unitsSold: a.unitsSold,
        grossSalesPaisa: a.grossSalesPaisa,
        discountPaisa: a.discountPaisa,
        gstPaisa: a.gstPaisa,
        netSalesPaisa: a.netSalesPaisa,
        averageSellingPricePaisa:
          a.unitsSold > 0 ? Math.round(a.grossSalesPaisa / a.unitsSold) : 0,
        currentStock: qty,
        stockValuePaisa: Math.max(0, qty) * cost,
        statusLabel: st ? stockStatusLabel(st.status) : "—",
      }
    })

    rows = sortRows(rows, sort)

    const categoryMap = new Map<
      string,
      { unitsSold: number; netSalesPaisa: number }
    >()
    for (const row of rows) {
      const cur = categoryMap.get(row.category) || {
        unitsSold: 0,
        netSalesPaisa: 0,
      }
      cur.unitsSold += row.unitsSold
      cur.netSalesPaisa += row.netSalesPaisa
      categoryMap.set(row.category, cur)
    }

    const categoryPerformance = [...categoryMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.netSalesPaisa - a.netSalesPaisa)

    const summary: ItemReportSummary = {
      itemCount: rows.length,
      unitsSold: rows.reduce((s, r) => s + r.unitsSold, 0),
      grossSalesPaisa: rows.reduce((s, r) => s + r.grossSalesPaisa, 0),
      netSalesPaisa: rows.reduce((s, r) => s + r.netSalesPaisa, 0),
      discountPaisa: rows.reduce((s, r) => s + r.discountPaisa, 0),
      gstPaisa: rows.reduce((s, r) => s + r.gstPaisa, 0),
    }

    const breakdowns: Record<string, ReportSheet> = {
      "Category Performance": {
        name: "Category Performance",
        columns: ["Category", "Units Sold", "Net Sales (₹)"],
        rows: categoryPerformance.map((c) => [
          c.category,
          c.unitsSold,
          paisaAsRupeesNumber(c.netSalesPaisa),
        ]),
      },
    }

    return {
      reportType: "items",
      generatedAt: new Date().toISOString(),
      filters: resolved,
      periodLabel: formatPeriodLabel(resolved.startDate, resolved.endDate),
      storeName: reportStoreName(),
      summary,
      rows,
      sort,
      categoryPerformance,
      breakdowns,
    }
  }
}

function sortRows(rows: ItemReportRow[], sort: ItemSort): ItemReportRow[] {
  const copy = [...rows]
  switch (sort) {
    case "top_selling":
      return copy.sort((a, b) => b.unitsSold - a.unitsSold)
    case "lowest_selling":
      return copy.sort((a, b) => a.unitsSold - b.unitsSold)
    case "highest_revenue":
      return copy.sort((a, b) => b.netSalesPaisa - a.netSalesPaisa)
    case "lowest_revenue":
      return copy.sort((a, b) => a.netSalesPaisa - b.netSalesPaisa)
    case "highest_stock":
      return copy.sort((a, b) => b.currentStock - a.currentStock)
    case "lowest_stock":
      return copy.sort((a, b) => a.currentStock - b.currentStock)
  }
}
