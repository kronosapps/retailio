import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { StaffService } from "@/modules/staff"
import type { UserRole } from "@/types/user"
import { FinancialYearService } from "@/modules/financialYear"
import {
  saleDiscountPaisa,
  saleNetPaisa,
  saleUnits,
} from "@/modules/reporting/utils/report-calculations"
import { isInRange } from "@/modules/reporting/utils/report-periods"
import { ExpenseService } from "@/modules/expense/ExpenseService"
import type { ExpenseRecord } from "@/repositories/ExpenseRepository"
import { ProductService } from "@/modules/products"
import { StatutoryService } from "@/modules/statutory"
import type { GstSummary } from "@/modules/statutory"

export type OperatorReportRow = {
  operatorId: string
  operatorName: string
  role: UserRole | "unknown"
  invoices: number
  itemsSold: number
  grossSalesPaisa: number
  discountsPaisa: number
  refundsPaisa: number
  netSalesPaisa: number
  cashSalesPaisa: number
  upiSalesPaisa: number
  averageTransactionPaisa: number
}

export type RoleReportRow = {
  role: UserRole | "unknown"
  transactions: number
  salesPaisa: number
  refundsPaisa: number
}

export type ExpenseReportSummary = {
  totalPaisa: number
  count: number
  byCategory: { category: string; amountPaisa: number; count: number }[]
}

export type GstReportSummary = GstSummary

/**
 * Analysis helpers used by Utilities — read-only, reuse domain sources.
 */
export class UtilitiesAnalysisService {
  static async operatorReport(): Promise<OperatorReportRow[]> {
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const [invoices, refunds, staff] = await Promise.all([
      invoiceRepository.list(),
      refundRepository.list(),
      StaffService.list().catch(() => []),
    ])
    const roleById = new Map(staff.map((s) => [s.id, s.role] as const))
    const nameById = new Map(
      staff.map((s) => [s.id, s.displayName || s.username] as const)
    )

    type Agg = Omit<OperatorReportRow, "averageTransactionPaisa">
    const map = new Map<string, Agg>()

    for (const sale of invoices) {
      if (sale.paymentStatus !== "Paid" && sale.paymentStatus !== "Refunded") {
        continue
      }
      if (!isInRange(sale.createdAt, start, end)) continue
      const id = sale.cashierId || "unknown"
      const cur =
        map.get(id) ||
        ({
          operatorId: id,
          operatorName:
            sale.cashierName || nameById.get(id) || id || "Unknown",
          role: roleById.get(id) || "unknown",
          invoices: 0,
          itemsSold: 0,
          grossSalesPaisa: 0,
          discountsPaisa: 0,
          refundsPaisa: 0,
          netSalesPaisa: 0,
          cashSalesPaisa: 0,
          upiSalesPaisa: 0,
        } satisfies Agg)
      cur.invoices += 1
      cur.itemsSold += saleUnits(sale)
      cur.grossSalesPaisa += sale.totals.grossSubtotal || 0
      cur.discountsPaisa += saleDiscountPaisa(sale)
      cur.netSalesPaisa += saleNetPaisa(sale)
      if (sale.paymentMethod === "UPI") cur.upiSalesPaisa += saleNetPaisa(sale)
      else cur.cashSalesPaisa += saleNetPaisa(sale)
      map.set(id, cur)
    }

    for (const refund of refunds) {
      if (!isInRange(refund.createdAt, start, end)) continue
      const id = refund.createdBy || "unknown"
      const cur =
        map.get(id) ||
        ({
          operatorId: id,
          operatorName: nameById.get(id) || id,
          role: roleById.get(id) || "unknown",
          invoices: 0,
          itemsSold: 0,
          grossSalesPaisa: 0,
          discountsPaisa: 0,
          refundsPaisa: 0,
          netSalesPaisa: 0,
          cashSalesPaisa: 0,
          upiSalesPaisa: 0,
        } satisfies Agg)
      cur.refundsPaisa += refund.amountPaisa || 0
      map.set(id, cur)
    }

    return [...map.values()]
      .map((r) => ({
        ...r,
        averageTransactionPaisa:
          r.invoices > 0 ? Math.round(r.netSalesPaisa / r.invoices) : 0,
      }))
      .sort((a, b) => b.netSalesPaisa - a.netSalesPaisa)
  }

  static async roleReport(): Promise<RoleReportRow[]> {
    const operators = await this.operatorReport()
    const map = new Map<UserRole | "unknown", RoleReportRow>()
    for (const op of operators) {
      const cur = map.get(op.role) || {
        role: op.role,
        transactions: 0,
        salesPaisa: 0,
        refundsPaisa: 0,
      }
      cur.transactions += op.invoices
      cur.salesPaisa += op.netSalesPaisa
      cur.refundsPaisa += op.refundsPaisa
      map.set(op.role, cur)
    }
    return [...map.values()].sort((a, b) => b.salesPaisa - a.salesPaisa)
  }

  static async expenseReport(): Promise<{
    summary: ExpenseReportSummary
    rows: ExpenseRecord[]
  }> {
    await ExpenseService.hydrate()
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const rows = ExpenseService.list().filter((e) =>
      isInRange(e.createdAt, start, end)
    )
    const byCat = new Map<string, { amountPaisa: number; count: number }>()
    let totalPaisa = 0
    for (const row of rows) {
      totalPaisa += row.amountPaisa
      const key = row.category || "Uncategorized"
      const cur = byCat.get(key) || { amountPaisa: 0, count: 0 }
      cur.amountPaisa += row.amountPaisa
      cur.count += 1
      byCat.set(key, cur)
    }
    return {
      summary: {
        totalPaisa,
        count: rows.length,
        byCategory: [...byCat.entries()].map(([category, v]) => ({
          category,
          ...v,
        })),
      },
      rows,
    }
  }

  static async gstReport(storeId?: string | null): Promise<GstReportSummary> {
    return StatutoryService.getGstSummary(storeId)
  }

  static inactiveProducts() {
    return ProductService.list().filter((p) => !p.active)
  }
}
