import { DayOpsService } from "@/modules/dayOps"

/**
 * @deprecated Prefer DayOpsService.getClosingPreview / SalesReportService.
 * Kept for backward compatibility — returns today's DayOps sales/payment slice.
 */
export class ReportsService {
  static async salesSummary(storeId: string | null = null) {
    const preview = await DayOpsService.getClosingPreview("today", storeId)
    return {
      invoiceCount: preview.sales.invoiceCount,
      paidPaymentCount: preview.tenders.paymentCount,
      paidTotalRupees: preview.sales.paidSalesPaisa / 100,
      /** Extra DayOps fields for callers that want richer day totals. */
      cashNetPaisa: preview.cash.netPaisa,
      upiNetPaisa: preview.upi.netPaisa,
      discountsPaisa: preview.discounts.totalDiscountPaisa,
    }
  }
}
