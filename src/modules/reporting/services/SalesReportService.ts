import type { RecordedSale } from "@/data/invoices"
import type { RefundRecord } from "@/data/refunds"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { rupeesToPaisa } from "@/lib/money"

import type { NamedAmount, ReportFilters, ReportResult, ReportSheet } from "../types/report"
import {
  averageOrderValuePaisa,
  saleDiscountPaisa,
  saleGrossPaisa,
  saleGstPaisa,
  saleNetPaisa,
  saleUnits,
} from "../utils/report-calculations"
import {
  formatReportDate,
  formatReportTime,
  paisaAsRupeesNumber,
  reportStoreName,
} from "../utils/report-formatters"
import {
  formatPeriodLabel,
  isInRange,
  resolveReportPeriod,
} from "../utils/report-periods"

export type SalesReportSummary = {
  grossSalesPaisa: number
  discountsPaisa: number
  gstPaisa: number
  refundsPaisa: number
  netSalesPaisa: number
  netRevenuePaisa: number
  invoiceCount: number
  averageOrderValuePaisa: number
  unitsSold: number
}

export type SalesReportRow = {
  invoiceId: string
  date: string
  time: string
  createdAt: string
  customer: string
  items: string
  grossPaisa: number
  discountPaisa: number
  gstPaisa: number
  netPaisa: number
  paymentMethod: string
  staff: string
  status: string
}

export type SalesReport = ReportResult<SalesReportSummary, SalesReportRow> & {
  byPaymentMethod: NamedAmount[]
  byStaff: NamedAmount[]
  byCategory: NamedAmount[]
  byItem: NamedAmount[]
  byDate: NamedAmount[]
}

function matchesFilters(sale: RecordedSale, filters: ReportFilters): boolean {
  if (filters.storeId && sale.storeId && sale.storeId !== filters.storeId) {
    return false
  }
  if (filters.staffId && sale.cashierId && sale.cashierId !== filters.staffId) {
    return false
  }
  if (
    filters.paymentMethod &&
    sale.paymentMethod &&
    sale.paymentMethod !== filters.paymentMethod
  ) {
    return false
  }
  if (filters.category) {
    const hit = sale.lines.some(
      (l) =>
        !l.isLoyaltyReward &&
        // category may live on product; line has name/weight only — match loosely via product later
        true
    )
    if (!hit) return false
  }
  if (filters.productSku) {
    const sku = filters.productSku.trim().toLowerCase()
    const hit = sale.lines.some(
      (l) =>
        (l.sku || "").toLowerCase() === sku ||
        l.itemId.toLowerCase() === sku
    )
    if (!hit) return false
  }
  return isInRange(sale.createdAt, filters.startDate, filters.endDate)
}

/**
 * Read-only sales report from invoices + refunds.
 */
export class SalesReportService {
  static async getSalesReport(filters: ReportFilters): Promise<SalesReport> {
    const period = resolveReportPeriod(filters.preset, {
      start: filters.startDate,
      end: filters.endDate,
    })
    const resolved: ReportFilters = {
      ...filters,
      startDate: period.start,
      endDate: period.end,
    }

    const [invoices, refunds] = await Promise.all([
      invoiceRepository.list(),
      refundRepository.list(),
    ])

    const sales = invoices.filter(
      (s) =>
        (s.paymentStatus === "Paid" || s.paymentStatus === "Refunded") &&
        matchesFilters(s, resolved)
    )

    const periodRefunds = refunds.filter((r) =>
      isInRange(r.createdAt, resolved.startDate, resolved.endDate)
    )

    let grossSalesPaisa = 0
    let discountsPaisa = 0
    let gstPaisa = 0
    let netSalesPaisa = 0
    let unitsSold = 0

    const byPayment = new Map<string, { amountPaisa: number; count: number }>()
    const byStaff = new Map<string, { amountPaisa: number; count: number }>()
    const byCategory = new Map<string, { amountPaisa: number; count: number }>()
    const byItem = new Map<string, { amountPaisa: number; count: number }>()
    const byDate = new Map<string, { amountPaisa: number; count: number }>()

    const rows: SalesReportRow[] = []

    for (const sale of sales) {
      const gross = saleGrossPaisa(sale)
      const discount = saleDiscountPaisa(sale)
      const gst = saleGstPaisa(sale)
      const net = saleNetPaisa(sale)
      const units = saleUnits(sale)

      grossSalesPaisa += gross
      discountsPaisa += discount
      gstPaisa += gst
      netSalesPaisa += net
      unitsSold += units

      const method = sale.paymentMethod || "Unknown"
      bump(byPayment, method, net)
      bump(byStaff, sale.cashierName || sale.cashierId || "Unknown", net)
      bump(byDate, formatReportDate(sale.createdAt), net)

      for (const line of sale.lines) {
        if (line.isLoyaltyReward) continue
        const itemKey = `${line.name} ${line.weight}`.trim()
        bump(byItem, itemKey, line.lineTotalPaisa, line.qty)
        // Category not on line — bucket under Uncategorized unless product lookup later
        bump(byCategory, "Sales lines", line.lineTotalPaisa, line.qty)
      }

      rows.push({
        invoiceId: sale.invoiceId,
        date: formatReportDate(sale.createdAt),
        time: formatReportTime(sale.createdAt),
        createdAt: sale.createdAt,
        customer: sale.customerName || "Walk-in",
        items: sale.lines
          .filter((l) => !l.isLoyaltyReward)
          .map((l) => `${l.name} ×${l.qty}`)
          .join(", "),
        grossPaisa: gross,
        discountPaisa: discount,
        gstPaisa: gst,
        netPaisa: net,
        paymentMethod: method,
        staff: sale.cashierName || sale.cashierId || "—",
        status: sale.paymentStatus || "—",
      })
    }

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const refundsPaisa = periodRefunds.reduce(
      (sum, r) => sum + refundAmountPaisa(r),
      0
    )

    const summary: SalesReportSummary = {
      grossSalesPaisa,
      discountsPaisa,
      gstPaisa,
      refundsPaisa,
      netSalesPaisa,
      netRevenuePaisa: netSalesPaisa - refundsPaisa,
      invoiceCount: sales.length,
      averageOrderValuePaisa: averageOrderValuePaisa(netSalesPaisa, sales.length),
      unitsSold,
    }

    const breakdowns: Record<string, ReportSheet> = {
      "Payment Breakdown": namedToSheet(byPayment),
      "Staff Breakdown": namedToSheet(byStaff),
      "Item Breakdown": namedToSheet(byItem),
      "Daily Breakdown": namedToSheet(byDate),
    }

    return {
      reportType: "sales",
      generatedAt: new Date().toISOString(),
      filters: resolved,
      periodLabel: formatPeriodLabel(resolved.startDate, resolved.endDate),
      storeName: reportStoreName(),
      summary,
      rows,
      byPaymentMethod: toNamed(byPayment),
      byStaff: toNamed(byStaff),
      byCategory: toNamed(byCategory),
      byItem: toNamed(byItem),
      byDate: toNamed(byDate),
      breakdowns,
    }
  }
}

function bump(
  map: Map<string, { amountPaisa: number; count: number }>,
  key: string,
  amountPaisa: number,
  count = 1
) {
  const cur = map.get(key) || { amountPaisa: 0, count: 0 }
  cur.amountPaisa += amountPaisa
  cur.count += count
  map.set(key, cur)
}

function toNamed(
  map: Map<string, { amountPaisa: number; count: number }>
): NamedAmount[] {
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      amountPaisa: v.amountPaisa,
      count: v.count,
    }))
    .sort((a, b) => b.amountPaisa - a.amountPaisa)
}

function namedToSheet(
  map: Map<string, { amountPaisa: number; count: number }>
): ReportSheet {
  return {
    name: "Breakdown",
    columns: ["Name", "Count", "Amount (₹)"],
    rows: toNamed(map).map((r) => [
      r.name,
      r.count ?? 0,
      paisaAsRupeesNumber(r.amountPaisa),
    ]),
  }
}

function refundAmountPaisa(refund: RefundRecord): number {
  if (typeof refund.amountPaisa === "number" && Number.isFinite(refund.amountPaisa)) {
    return refund.amountPaisa
  }
  if (typeof refund.amount === "number" && Number.isFinite(refund.amount)) {
    return rupeesToPaisa(refund.amount)
  }
  return 0
}
