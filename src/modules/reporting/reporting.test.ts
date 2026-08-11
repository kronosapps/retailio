import { describe, expect, it } from "vitest"

import {
  averageOrderValuePaisa,
  saleDiscountPaisa,
} from "@/modules/reporting/utils/report-calculations"
import {
  filtersFromPreset,
  resolveReportPeriod,
} from "@/modules/reporting/utils/report-periods"
import { percentChange } from "@/modules/reporting/utils/report-formatters"
import { ReportExportMapper } from "@/modules/reporting/exporters/ReportExportMapper"
import type { SalesReport } from "@/modules/reporting/services/SalesReportService"
import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"

describe("report periods", () => {
  it("resolves last 7 days as inclusive local window", () => {
    const period = resolveReportPeriod("last_7_days")
    expect(period.label).toBe("Last 7 days")
    expect(period.end.getTime()).toBeGreaterThan(period.start.getTime())
    const days =
      (period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(5)
    expect(days).toBeLessThan(8)
  })

  it("builds filters from preset", () => {
    const filters = filtersFromPreset("today", { storeId: "store-1" })
    expect(filters.preset).toBe("today")
    expect(filters.storeId).toBe("store-1")
  })
})

describe("report calculations", () => {
  it("computes AOV in paisa", () => {
    expect(averageOrderValuePaisa(10000, 4)).toBe(2500)
    expect(averageOrderValuePaisa(10000, 0)).toBe(0)
  })

  it("sums discounts from sale totals", () => {
    const sale = {
      totals: {
        friendsFamilyDiscount: 100,
        occasionDiscount: 50,
        loyaltyDiscount: 25,
      },
    } as never
    expect(saleDiscountPaisa(sale)).toBe(175)
  })

  it("computes percent change", () => {
    expect(percentChange(110, 100)).toBeCloseTo(10)
    expect(percentChange(50, 0)).toBeNull()
  })
})

describe("excel export", () => {
  it("builds workbook blob from sales payload", async () => {
    const report = {
      reportType: "sales",
      generatedAt: new Date().toISOString(),
      periodLabel: "Today",
      storeName: "Test Store",
      filters: {
        preset: "today",
        startDate: new Date(),
        endDate: new Date(),
        storeId: null,
        category: null,
        productSku: null,
        staffId: null,
        paymentMethod: null,
      },
      summary: {
        grossSalesPaisa: 10000,
        discountsPaisa: 500,
        gstPaisa: 450,
        refundsPaisa: 0,
        netSalesPaisa: 9950,
        netRevenuePaisa: 9950,
        invoiceCount: 2,
        averageOrderValuePaisa: 4975,
        unitsSold: 5,
      },
      rows: [
        {
          invoiceId: "INV-1",
          date: "11 Aug 2026",
          time: "10:00",
          createdAt: new Date().toISOString(),
          customer: "Walk-in",
          items: "Halwa ×1",
          grossPaisa: 5000,
          discountPaisa: 0,
          gstPaisa: 225,
          netPaisa: 5225,
          paymentMethod: "UPI",
          staff: "admin",
          status: "Paid",
        },
      ],
      byPaymentMethod: [],
      byStaff: [],
      byCategory: [],
      byItem: [],
      byDate: [],
      breakdowns: {
        "Payment Breakdown": {
          name: "Payment Breakdown",
          columns: ["Name", "Count", "Amount (₹)"],
          rows: [["UPI", 1, 52.25]],
        },
      },
    } satisfies SalesReport

    const payload = ReportExportMapper.fromSales(report)
    expect(payload.sheets.length).toBeGreaterThanOrEqual(2)
    expect(payload.sheets[0].name).toBe("Summary")

    const blob = await ExcelReportExporter.toBlob(payload)
    expect(blob.size).toBeGreaterThan(100)
    expect(blob.type).toContain("spreadsheetml")
  })
})
