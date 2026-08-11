import { AccountingService } from "@/modules/accounting"
import { FinancialYearService } from "@/modules/financialYear"
import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"
import { formatReportMoney } from "@/modules/reporting/utils/report-formatters"
import {
  filtersFromPreset,
  formatPeriodLabel,
} from "@/modules/reporting/utils/report-periods"
import type { ReportExportPayload } from "@/modules/reporting/types/report"
import { UtilitiesAnalysisService } from "@/modules/utilities/UtilitiesAnalysisService"
import { StatutoryService } from "@/modules/statutory"
import { StoreSettingsService } from "@/modules/notifications/services/StoreSettingsService"
import { ReportingService } from "@/modules/reporting/services/ReportingService"
import { ReportExportService } from "@/modules/reporting/exporters/ReportExportService"

function basePayload(
  title: string,
  storeName: string,
  periodLabel: string,
  sheets: ReportExportPayload["sheets"]
): ReportExportPayload {
  const fy = FinancialYearService.getActive()
  const { start, end } = FinancialYearService.getRange(fy)
  return {
    reportType: "utility",
    title,
    storeName,
    generatedAt: new Date().toISOString(),
    periodLabel,
    filters: {
      preset: "custom",
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      storeId: null,
      category: null,
      productSku: null,
      staffId: null,
      paymentMethod: null,
    },
    sheets,
  }
}

async function storeName(storeId: string | null | undefined) {
  if (!storeId) return "RetailOS"
  try {
    const s = await StoreSettingsService.get(storeId)
    return s.businessName || "RetailOS"
  } catch {
    return "RetailOS"
  }
}

/**
 * Utilities Excel export — reuses ExcelReportExporter (no second stack).
 */
export class UtilitiesExportService {
  static async exportDaybook(storeId?: string | null) {
    const rows = await AccountingService.getDaybook()
    const name = await storeName(storeId)
    const payload = basePayload("Daybook", name, "Active FY", [
      {
        name: "Daybook",
        columns: [
          "Date",
          "Time",
          "Type",
          "Description",
          "Debit",
          "Credit",
          "Operator",
          "Method",
          "Reference",
        ],
        rows: rows.map((r) => [
          r.date,
          r.time,
          r.type,
          r.description,
          formatReportMoney(r.debitPaisa),
          formatReportMoney(r.creditPaisa),
          r.operator,
          r.paymentMethod,
          r.reference,
        ]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-daybook.xlsx")
  }

  static async exportAllTransactions(storeId?: string | null) {
    return this.exportDaybook(storeId)
  }

  static async exportTrialBalance(storeId?: string | null) {
    const tb = await AccountingService.getTrialBalance()
    const name = await storeName(storeId)
    const payload = basePayload("Trial Balance", name, tb.periodLabel, [
      {
        name: "Trial Balance",
        columns: ["Code", "Account", "Type", "Debit", "Credit"],
        rows: tb.rows.map((r) => [
          r.accountCode,
          r.accountName,
          r.accountType,
          formatReportMoney(r.debitPaisa),
          formatReportMoney(r.creditPaisa),
        ]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-trial-balance.xlsx")
  }

  static async exportBalanceSheet(storeId?: string | null) {
    const bs = await AccountingService.getBalanceSheet()
    const name = await storeName(storeId)
    const payload = basePayload("Balance Sheet", name, bs.periodLabel, [
      {
        name: "Assets",
        columns: ["Code", "Account", "Amount"],
        rows: bs.assets.map((r) => [
          r.accountCode,
          r.accountName,
          formatReportMoney(r.amountPaisa),
        ]),
      },
      {
        name: "Liabilities",
        columns: ["Code", "Account", "Amount"],
        rows: bs.liabilities.map((r) => [
          r.accountCode,
          r.accountName,
          formatReportMoney(r.amountPaisa),
        ]),
      },
      {
        name: "Equity",
        columns: ["Code", "Account", "Amount"],
        rows: bs.equity.map((r) => [
          r.accountCode,
          r.accountName,
          formatReportMoney(r.amountPaisa),
        ]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-balance-sheet.xlsx")
  }

  static async exportCashFlow(storeId?: string | null) {
    const cf = await AccountingService.getCashFlow()
    const name = await storeName(storeId)
    const payload = basePayload("Cash Flow", name, cf.periodLabel, [
      {
        name: "Cash Flow",
        columns: ["Metric", "Amount"],
        rows: [
          ["Opening Cash", formatReportMoney(cf.openingCashPaisa)],
          ["Opening UPI", formatReportMoney(cf.openingUpiPaisa)],
          ["Cash In", formatReportMoney(cf.cashInPaisa)],
          ["Cash Out", formatReportMoney(cf.cashOutPaisa)],
          ["UPI In", formatReportMoney(cf.upiInPaisa)],
          ["UPI Out", formatReportMoney(cf.upiOutPaisa)],
          ["Closing Cash", formatReportMoney(cf.closingCashPaisa)],
          ["Closing UPI", formatReportMoney(cf.closingUpiPaisa)],
        ],
      },
    ])
    await ExcelReportExporter.download(payload, "utility-cash-flow.xlsx")
  }

  static async exportAccountStatement(
    accountCode: string,
    storeId?: string | null
  ) {
    const stmt = await AccountingService.getAccountStatement(accountCode)
    const name = await storeName(storeId)
    const payload = basePayload(
      `Account Statement — ${stmt.accountName}`,
      name,
      stmt.periodLabel,
      [
        {
          name: "Statement",
          columns: ["Date", "Description", "Reference", "Debit", "Credit", "Balance"],
          rows: stmt.lines.map((l) => [
            l.date,
            l.description,
            l.referenceId,
            formatReportMoney(l.debitPaisa),
            formatReportMoney(l.creditPaisa),
            formatReportMoney(l.balancePaisa),
          ]),
        },
      ]
    )
    await ExcelReportExporter.download(
      payload,
      `utility-account-${accountCode}.xlsx`
    )
  }

  static async exportOperatorReport(storeId?: string | null) {
    const rows = await UtilitiesAnalysisService.operatorReport()
    const name = await storeName(storeId)
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const payload = basePayload(
      "Report by Operator",
      name,
      formatPeriodLabel(start, end),
      [
        {
          name: "Operators",
          columns: [
            "Operator",
            "Role",
            "Invoices",
            "Net Sales",
            "Cash",
            "UPI",
            "Refunds",
            "AOV",
          ],
          rows: rows.map((r) => [
            r.operatorName,
            r.role,
            r.invoices,
            formatReportMoney(r.netSalesPaisa),
            formatReportMoney(r.cashSalesPaisa),
            formatReportMoney(r.upiSalesPaisa),
            formatReportMoney(r.refundsPaisa),
            formatReportMoney(r.averageTransactionPaisa),
          ]),
        },
      ]
    )
    await ExcelReportExporter.download(payload, "utility-operator-report.xlsx")
  }

  static async exportRoleReport(storeId?: string | null) {
    const rows = await UtilitiesAnalysisService.roleReport()
    const name = await storeName(storeId)
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const payload = basePayload(
      "Report by Role",
      name,
      formatPeriodLabel(start, end),
      [
        {
          name: "Roles",
          columns: ["Role", "Transactions", "Sales", "Refunds"],
          rows: rows.map((r) => [
            r.role,
            r.transactions,
            formatReportMoney(r.salesPaisa),
            formatReportMoney(r.refundsPaisa),
          ]),
        },
      ]
    )
    await ExcelReportExporter.download(payload, "utility-role-report.xlsx")
  }

  static async exportExpenseReport(storeId?: string | null) {
    const { summary, rows } = await UtilitiesAnalysisService.expenseReport()
    const name = await storeName(storeId)
    const fy = FinancialYearService.getActive()
    const { start, end } = FinancialYearService.getRange(fy)
    const payload = basePayload(
      "Expense Report",
      name,
      formatPeriodLabel(start, end),
      [
        {
          name: "Expenses",
          columns: ["Date", "Title", "Category", "Method", "Amount"],
          rows: rows.map((r) => [
            r.createdAt,
            r.title,
            r.category || "",
            r.paymentMethod || "",
            formatReportMoney(r.amountPaisa),
          ]),
        },
        {
          name: "By Category",
          columns: ["Category", "Count", "Amount"],
          rows: summary.byCategory.map((c) => [
            c.category,
            c.count,
            formatReportMoney(c.amountPaisa),
          ]),
        },
      ]
    )
    await ExcelReportExporter.download(payload, "utility-expenses.xlsx")
  }

  static async exportGstReport(storeId?: string | null) {
    const data = await StatutoryService.getGstSummary(storeId)
    const name = await storeName(storeId)
    const payload = basePayload("GST Report", name, data.periodLabel, [
      {
        name: "Summary",
        columns: ["Metric", "Value"],
        rows: [
          ["Taxable", formatReportMoney(data.taxablePaisa)],
          ["CGST", formatReportMoney(data.cgstPaisa)],
          ["SGST", formatReportMoney(data.sgstPaisa)],
          ["IGST", formatReportMoney(data.igstPaisa)],
          ["Total GST", formatReportMoney(data.gstPaisa)],
          ["Invoices", data.invoiceCount],
          ["Filing ready", "false"],
        ],
      },
      {
        name: "By Rate",
        columns: ["Rate", "Taxable", "CGST", "SGST", "GST"],
        rows: data.byRate.map((r) => [
          r.rate,
          formatReportMoney(r.taxablePaisa),
          formatReportMoney(r.cgstPaisa),
          formatReportMoney(r.sgstPaisa),
          formatReportMoney(r.gstPaisa),
        ]),
      },
      {
        name: "By Party",
        columns: ["Bucket", "Invoices", "Taxable", "GST"],
        rows: data.byParty.map((r) => [
          r.bucket,
          r.invoiceCount,
          formatReportMoney(r.taxablePaisa),
          formatReportMoney(r.gstPaisa),
        ]),
      },
      {
        name: "Missing Fields",
        columns: ["Field"],
        rows: data.meta.missingFields.map((f) => [f]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-gst.xlsx")
  }

  static async exportTcsReport(storeId: string) {
    const data = await StatutoryService.getTcsScaffold(storeId)
    const name = await storeName(storeId)
    const payload = basePayload("TCS Report (scaffold)", name, data.periodLabel, [
      {
        name: "Notes",
        columns: ["Note"],
        rows: [
          ...data.meta.notes.map((n) => [n]),
          ...data.meta.missingFields.map((f) => [`Missing: ${f}`]),
        ],
      },
      {
        name: "Transactions",
        columns: ["Date", "Party", "PAN", "Taxable", "Rate", "TCS", "Status"],
        rows: data.transactions.map((t) => [
          t.date,
          t.partyName,
          t.partyPan,
          t.taxablePaisa,
          t.tcsRatePercent,
          t.tcsAmountPaisa,
          t.status,
        ]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-tcs.xlsx")
  }

  static async exportForm27Eq(storeId: string) {
    const data = await StatutoryService.getForm27EqScaffold(storeId)
    const name = await storeName(storeId)
    const payload = basePayload("Form 27EQ (scaffold)", name, data.periodLabel, [
      {
        name: "Header",
        columns: ["Field", "Value"],
        rows: [
          ["Deductor TAN", data.deductorTan],
          ["Deductor Name", data.deductorName],
          ["Filing ready", "false"],
        ],
      },
      {
        name: "Missing Fields",
        columns: ["Field"],
        rows: data.meta.missingFields.map((f) => [f]),
      },
      {
        name: "Rows",
        columns: [
          "S.No",
          "Party",
          "PAN",
          "Amount",
          "TCS",
          "Code",
          "Challan",
          "BSR",
          "Deposit",
        ],
        rows: data.rows.map((r) => [
          r.serial,
          r.partyName,
          r.partyPan,
          r.amountPaidPaisa,
          r.tcsCollectedPaisa,
          r.collectionCode,
          r.challanNumber,
          r.bsrCode,
          r.depositDate,
        ]),
      },
    ])
    await ExcelReportExporter.download(payload, "utility-form-27eq.xlsx")
  }

  static async exportItemReport(storeId?: string | null) {
    const filters = filtersFromPreset("this_month", {
      storeId: storeId ?? null,
    })
    const report = await ReportingService.getItemReport(
      filters,
      "highest_revenue"
    )
    await ReportExportService.exportExcel(report)
  }
}
