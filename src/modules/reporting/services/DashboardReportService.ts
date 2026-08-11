import { DashboardAnalyticsService } from "@/modules/dashboard/services/DashboardAnalyticsService"
import type { DashboardRangePreset } from "@/modules/dashboard/types/dashboard"

import type { ReportFilters, ReportResult, ReportSheet } from "../types/report"
import {
  paisaAsRupeesNumber,
  percentChange,
  reportStoreName,
} from "../utils/report-formatters"
import { formatPeriodLabel, resolveReportPeriod } from "../utils/report-periods"

export type DashboardReportSummary = {
  totalSalesPaisa: number
  previousSalesPaisa: number
  salesChangePercent: number | null
  invoiceCount: number
  previousInvoiceCount: number
  invoiceChangePercent: number | null
  averageOrderValuePaisa: number
  previousAovPaisa: number
  aovChangePercent: number | null
  refundsPaisa: number
  discountsPaisa: number
  gstPaisa: number
  itemsSold: number
  lowStockCount: number
  outOfStockCount: number
}

export type DashboardKpiRow = {
  metric: string
  current: string | number
  previous: string | number
  changePercent: number | null
}

export type DashboardReport = ReportResult<
  DashboardReportSummary,
  DashboardKpiRow
> & {
  topItems: { name: string; qty: number; revenuePaisa: number }[]
  paymentBreakdown: { method: string; amountPaisa: number }[]
  topCategories: { name: string; amountPaisa: number }[]
}

/**
 * Read-only dashboard snapshot report — reuses DashboardAnalyticsService.
 */
export class DashboardReportService {
  static async getDashboardReport(
    filters: ReportFilters
  ): Promise<DashboardReport> {
    const period = resolveReportPeriod(filters.preset, {
      start: filters.startDate,
      end: filters.endDate,
    })
    const resolved: ReportFilters = {
      ...filters,
      startDate: period.start,
      endDate: period.end,
    }

    const preset = toDashboardPreset(filters.preset)
    const metrics = await DashboardAnalyticsService.load({
      storeId: filters.storeId ?? null,
      preset,
      customStart: period.start,
      customEnd: period.end,
    })

    const totalSalesPaisa = metrics.kpis.totalRevenue.value
    const previousSalesPaisa = metrics.kpis.totalRevenue.previousValue
    const invoiceCount = metrics.kpis.orders.value
    const previousInvoiceCount = metrics.kpis.orders.previousValue
    const aov = metrics.kpis.averageOrderValue.value
    const prevAov = metrics.kpis.averageOrderValue.previousValue
    const refundsPaisa = metrics.kpis.refunds.value

    // Approximate discounts/GST/units from charts is not available — leave 0
    // unless we recompute; keep focused on shared dashboard KPIs.
    const summary: DashboardReportSummary = {
      totalSalesPaisa,
      previousSalesPaisa,
      salesChangePercent: percentChange(totalSalesPaisa, previousSalesPaisa),
      invoiceCount,
      previousInvoiceCount,
      invoiceChangePercent: percentChange(invoiceCount, previousInvoiceCount),
      averageOrderValuePaisa: aov,
      previousAovPaisa: prevAov,
      aovChangePercent: percentChange(aov, prevAov),
      refundsPaisa,
      discountsPaisa: 0,
      gstPaisa: 0,
      itemsSold: metrics.tables.topProducts.reduce((s, p) => s + p.qtySold, 0),
      lowStockCount: metrics.inventory.lowStockCount,
      outOfStockCount: metrics.inventory.outOfStockCount,
    }

    const rows: DashboardKpiRow[] = [
      {
        metric: "Total Sales",
        current: paisaAsRupeesNumber(totalSalesPaisa),
        previous: paisaAsRupeesNumber(previousSalesPaisa),
        changePercent: summary.salesChangePercent,
      },
      {
        metric: "Invoices",
        current: invoiceCount,
        previous: previousInvoiceCount,
        changePercent: summary.invoiceChangePercent,
      },
      {
        metric: "Average Order Value",
        current: paisaAsRupeesNumber(aov),
        previous: paisaAsRupeesNumber(prevAov),
        changePercent: summary.aovChangePercent,
      },
      {
        metric: "Refunds",
        current: paisaAsRupeesNumber(refundsPaisa),
        previous: paisaAsRupeesNumber(metrics.kpis.refunds.previousValue),
        changePercent: percentChange(
          refundsPaisa,
          metrics.kpis.refunds.previousValue
        ),
      },
      {
        metric: "Low Stock Items",
        current: summary.lowStockCount,
        previous: "—",
        changePercent: null,
      },
      {
        metric: "Out of Stock Items",
        current: summary.outOfStockCount,
        previous: "—",
        changePercent: null,
      },
    ]

    const topItems = metrics.tables.topProducts.map((p) => ({
      name: `${p.name} ${p.weight}`,
      qty: p.qtySold,
      revenuePaisa: p.revenuePaisa,
    }))

    const paymentBreakdown = metrics.charts.paymentMethods.map((m) => ({
      method: m.name,
      // chart values are already in rupees in dashboard — convert back carefully
      amountPaisa: Math.round(m.value * 100),
    }))

    const topCategories = metrics.charts.categorySales.map((c) => ({
      name: c.name,
      amountPaisa: Math.round(c.value * 100),
    }))

    const breakdowns: Record<string, ReportSheet> = {
      KPIs: {
        name: "KPIs",
        columns: ["Metric", "Current", "Previous", "Change %"],
        rows: rows.map((r) => [
          r.metric,
          r.current,
          r.previous,
          r.changePercent == null ? "—" : Number(r.changePercent.toFixed(1)),
        ]),
      },
      "Top Items": {
        name: "Top Items",
        columns: ["Item", "Qty", "Revenue (₹)"],
        rows: topItems.map((t) => [
          t.name,
          t.qty,
          paisaAsRupeesNumber(t.revenuePaisa),
        ]),
      },
      "Payment Breakdown": {
        name: "Payment Breakdown",
        columns: ["Method", "Amount (₹)"],
        rows: paymentBreakdown.map((p) => [
          p.method,
          paisaAsRupeesNumber(p.amountPaisa),
        ]),
      },
    }

    return {
      reportType: "dashboard",
      generatedAt: new Date().toISOString(),
      filters: resolved,
      periodLabel: formatPeriodLabel(resolved.startDate, resolved.endDate),
      storeName: reportStoreName(),
      summary,
      rows,
      topItems,
      paymentBreakdown,
      topCategories,
      breakdowns,
    }
  }
}

function toDashboardPreset(
  preset: ReportFilters["preset"]
): DashboardRangePreset {
  if (
    preset === "last_7_days" ||
    preset === "last_30_days"
  ) {
    return "custom"
  }
  return preset
}
