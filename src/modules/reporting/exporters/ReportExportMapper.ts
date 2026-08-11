import type { ReportExportPayload, ReportSheet } from "../types/report"
import type { SalesReport } from "../services/SalesReportService"
import type { InventoryReport } from "../services/InventoryReportService"
import type { StockReport } from "../services/StockReportService"
import type { ItemReport } from "../services/ItemReportService"
import type { DashboardReport } from "../services/DashboardReportService"
import { paisaAsRupeesNumber } from "../utils/report-formatters"

/** Build normalized multi-sheet export payloads from report results. */
export class ReportExportMapper {
  static fromSales(report: SalesReport): ReportExportPayload {
    return base(report, [
      {
        name: "Summary",
        columns: ["Metric", "Value (₹ / count)"],
        rows: [
          ["Gross Sales", paisaAsRupeesNumber(report.summary.grossSalesPaisa)],
          ["Discounts", paisaAsRupeesNumber(report.summary.discountsPaisa)],
          ["GST", paisaAsRupeesNumber(report.summary.gstPaisa)],
          ["Refunds", paisaAsRupeesNumber(report.summary.refundsPaisa)],
          ["Net Sales", paisaAsRupeesNumber(report.summary.netSalesPaisa)],
          ["Net Revenue", paisaAsRupeesNumber(report.summary.netRevenuePaisa)],
          ["Invoices", report.summary.invoiceCount],
          [
            "Average Order Value",
            paisaAsRupeesNumber(report.summary.averageOrderValuePaisa),
          ],
          ["Units Sold", report.summary.unitsSold],
        ],
      },
      {
        name: "Sales",
        columns: [
          "Invoice ID",
          "Date",
          "Time",
          "Customer",
          "Items",
          "Gross (₹)",
          "Discount (₹)",
          "GST (₹)",
          "Net (₹)",
          "Payment Method",
          "Staff",
          "Status",
        ],
        rows: report.rows.map((r) => [
          r.invoiceId,
          r.date,
          r.time,
          r.customer,
          r.items,
          paisaAsRupeesNumber(r.grossPaisa),
          paisaAsRupeesNumber(r.discountPaisa),
          paisaAsRupeesNumber(r.gstPaisa),
          paisaAsRupeesNumber(r.netPaisa),
          r.paymentMethod,
          r.staff,
          r.status,
        ]),
      },
      renameSheet(report.breakdowns?.["Payment Breakdown"], "Payment Breakdown"),
      renameSheet(report.breakdowns?.["Item Breakdown"], "Item Breakdown"),
    ].filter(Boolean) as ReportSheet[])
  }

  static fromInventory(report: InventoryReport): ReportExportPayload {
    return base(report, [
      {
        name: "Summary",
        columns: ["Metric", "Units"],
        rows: [
          ["Opening Stock", report.summary.openingUnits],
          ["Purchased", report.summary.purchasedUnits],
          ["Sold", report.summary.soldUnits],
          ["Returns", report.summary.returnUnits],
          ["Damage", report.summary.damageUnits],
          ["Wastage", report.summary.wastageUnits],
          ["Adjustment In", report.summary.adjustmentInUnits],
          ["Adjustment Out", report.summary.adjustmentOutUnits],
          ["Closing Stock", report.summary.closingUnits],
          ["Movements", report.summary.movementCount],
        ],
      },
      {
        name: "Inventory Movements",
        columns: [
          "Date",
          "Item",
          "SKU",
          "Category",
          "Type",
          "Qty",
          "Signed Qty",
          "Reference",
          "Reason",
          "Staff",
          "Balance After",
        ],
        rows: report.rows.map((r) => [
          r.date,
          r.item,
          r.sku,
          r.category,
          r.movementType,
          r.quantity,
          r.signedQuantity,
          r.reference,
          r.reason,
          r.staff,
          r.balanceAfter,
        ]),
      },
      renameSheet(report.breakdowns?.["Item Summary"], "Item Summary"),
    ].filter(Boolean) as ReportSheet[])
  }

  static fromStock(report: StockReport): ReportExportPayload {
    return base(report, [
      {
        name: "Stock Summary",
        columns: [
          "Item",
          "SKU",
          "Category",
          "Current Stock",
          "Reorder Level",
          "Status",
          "Cost (₹)",
          "Stock Value (₹)",
          "Selling (₹)",
          "Potential Sales (₹)",
        ],
        rows: report.rows.map((r) => [
          r.item,
          r.sku,
          r.category,
          r.currentStock,
          r.reorderLevel,
          r.statusLabel,
          r.costPricePaisa == null
            ? null
            : paisaAsRupeesNumber(r.costPricePaisa),
          paisaAsRupeesNumber(r.stockValuePaisa),
          paisaAsRupeesNumber(r.sellingPricePaisa),
          paisaAsRupeesNumber(r.potentialSalesValuePaisa),
        ]),
      },
      renameSheet(report.breakdowns?.["Low Stock"], "Low Stock"),
      renameSheet(report.breakdowns?.["Out of Stock"], "Out of Stock"),
    ].filter(Boolean) as ReportSheet[])
  }

  static fromItems(report: ItemReport): ReportExportPayload {
    return base(report, [
      {
        name: "Item Performance",
        columns: [
          "Item",
          "SKU",
          "Category",
          "Units Sold",
          "Gross (₹)",
          "Discount (₹)",
          "GST (₹)",
          "Net (₹)",
          "Avg Selling (₹)",
          "Current Stock",
          "Stock Value (₹)",
          "Status",
        ],
        rows: report.rows.map((r) => [
          r.item,
          r.sku,
          r.category,
          r.unitsSold,
          paisaAsRupeesNumber(r.grossSalesPaisa),
          paisaAsRupeesNumber(r.discountPaisa),
          paisaAsRupeesNumber(r.gstPaisa),
          paisaAsRupeesNumber(r.netSalesPaisa),
          paisaAsRupeesNumber(r.averageSellingPricePaisa),
          r.currentStock,
          paisaAsRupeesNumber(r.stockValuePaisa),
          r.statusLabel,
        ]),
      },
      renameSheet(
        report.breakdowns?.["Category Performance"],
        "Category Performance"
      ),
    ].filter(Boolean) as ReportSheet[])
  }

  static fromDashboard(report: DashboardReport): ReportExportPayload {
    return base(report, [
      {
        name: "Summary",
        columns: ["Metric", "Value"],
        rows: [
          ["Total Sales (₹)", paisaAsRupeesNumber(report.summary.totalSalesPaisa)],
          ["Invoices", report.summary.invoiceCount],
          [
            "AOV (₹)",
            paisaAsRupeesNumber(report.summary.averageOrderValuePaisa),
          ],
          ["Refunds (₹)", paisaAsRupeesNumber(report.summary.refundsPaisa)],
          ["Low Stock", report.summary.lowStockCount],
          ["Out of Stock", report.summary.outOfStockCount],
        ],
      },
      renameSheet(report.breakdowns?.KPIs, "KPIs"),
      renameSheet(report.breakdowns?.["Top Items"], "Top Items"),
      renameSheet(
        report.breakdowns?.["Payment Breakdown"],
        "Payment Breakdown"
      ),
    ].filter(Boolean) as ReportSheet[])
  }
}

function base(
  report: {
    reportType: ReportExportPayload["reportType"]
    generatedAt: string
    periodLabel: string
    storeName: string
    filters: {
      preset: ReportExportPayload["filters"]["preset"]
      startDate: Date
      endDate: Date
      storeId?: string | null
      category?: string | null
      productSku?: string | null
      staffId?: string | null
      paymentMethod?: string | null
    }
  },
  sheets: ReportSheet[]
): ReportExportPayload {
  return {
    reportType: report.reportType,
    title: titleFor(report.reportType),
    storeName: report.storeName,
    generatedAt: report.generatedAt,
    periodLabel: report.periodLabel,
    filters: {
      preset: report.filters.preset,
      startDate: report.filters.startDate.toISOString(),
      endDate: report.filters.endDate.toISOString(),
      storeId: report.filters.storeId ?? null,
      category: report.filters.category ?? null,
      productSku: report.filters.productSku ?? null,
      staffId: report.filters.staffId ?? null,
      paymentMethod: report.filters.paymentMethod ?? null,
    },
    sheets,
  }
}

function titleFor(type: ReportExportPayload["reportType"]): string {
  switch (type) {
    case "sales":
      return "Sales Report"
    case "inventory":
      return "Inventory Report"
    case "stock":
      return "Stock Report"
    case "items":
      return "Item Report"
    case "dashboard":
      return "Dashboard Report"
    case "utility":
      return "Utilities Report"
  }
}

function renameSheet(
  sheet: ReportSheet | undefined,
  name: string
): ReportSheet | null {
  if (!sheet) return null
  return { ...sheet, name }
}
