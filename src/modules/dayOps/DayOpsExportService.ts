import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"
import { formatReportMoney } from "@/modules/reporting/utils/report-formatters"
import type { ReportExportPayload } from "@/modules/reporting/types/report"
import { StoreSettingsService } from "@/modules/notifications/services/StoreSettingsService"

import type { DayClosingPreview } from "./types"

function money(p: number) {
  return formatReportMoney(p)
}

/**
 * Day-close pack — Excel download + browser print.
 */
export class DayOpsExportService {
  static async exportClosingPreviewExcel(
    preview: DayClosingPreview,
    storeId?: string | null
  ) {
    const settings = await StoreSettingsService.get(storeId || "store-1")
    const storeName =
      settings.tradeName || settings.businessName || settings.legalName || "Store"

    const summaryRows: string[][] = [
      ["Sales invoices", String(preview.sales.invoiceCount)],
      ["Paid invoices", String(preview.sales.paidInvoiceCount)],
      ["Sales total", money(preview.sales.salesTotalPaisa)],
      ["Paid sales", money(preview.sales.paidSalesPaisa)],
      ["Cash in", money(preview.cash.inPaisa)],
      ["Cash refunds", money(preview.cash.refundsPaisa)],
      ["Cash net", money(preview.cash.netPaisa)],
      ["UPI in", money(preview.upi.inPaisa)],
      ["UPI refunds", money(preview.upi.refundsPaisa)],
      ["UPI net", money(preview.upi.netPaisa)],
      ["Refunds count", String(preview.refunds.count)],
      ["Refunds total", money(preview.refunds.totalPaisa)],
      ["Discounts", money(preview.discounts.totalDiscountPaisa)],
      ["Expenses", money(preview.expenses.totalPaisa)],
      ["Stock exceptions", String(preview.stockExceptions.length)],
      ["Open shifts", String(preview.openShiftsCount)],
      ["Banking cash", money(preview.bankingClosingCashPaisa)],
      ["Banking UPI", money(preview.bankingClosingUpiPaisa)],
    ]

    const payload: ReportExportPayload = {
      reportType: "utility",
      title: `Day close · ${preview.label}`,
      storeName,
      generatedAt: new Date().toISOString(),
      periodLabel: preview.label,
      filters: {
        preset: "custom",
        startDate: preview.periodStart,
        endDate: preview.periodEnd,
        storeId: storeId ?? null,
        category: null,
        productSku: null,
        staffId: null,
        paymentMethod: null,
      },
      sheets: [
        {
          name: "Summary",
          columns: ["Metric", "Value"],
          rows: summaryRows,
        },
        {
          name: "Cashier variance",
          columns: [
            "Shift",
            "Cashier",
            "Status",
            "Expected",
            "Actual",
            "Variance",
          ],
          rows: preview.cashierVariance.map((r) => [
            r.shiftNumber,
            r.cashierName,
            r.status,
            money(r.expectedCashPaisa),
            r.actualCashPaisa == null ? "—" : money(r.actualCashPaisa),
            r.variancePaisa == null ? "—" : money(r.variancePaisa),
          ]),
        },
        {
          name: "Stock exceptions",
          columns: ["Kind", "Label", "Lines", "At"],
          rows: preview.stockExceptions.map((s) => [
            s.kind,
            s.label,
            String(s.varianceLines),
            s.at,
          ]),
        },
      ],
    }

    await ExcelReportExporter.download(
      payload,
      `day-close-${preview.dayKey}.xlsx`
    )
  }

  /** Opens a printable day-close pack in a new window. */
  static printClosingPack(preview: DayClosingPreview) {
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700")
    if (!w) return
    const rows = (items: [string, string][]) =>
      items
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 8px;color:#555">${k}</td><td style="padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums">${v}</td></tr>`
        )
        .join("")

    w.document.write(`<!doctype html><html><head><title>Day close ${preview.date}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 8px}
  table{border-collapse:collapse;width:100%;max-width:420px;margin-bottom:8px}
  .meta{color:#666;font-size:12px;margin-bottom:16px}
  @media print{button{display:none}}
</style></head><body>
<button onclick="window.print()">Print</button>
<h1>Day close pack · ${preview.label}</h1>
<p class="meta">${preview.date} · generated ${new Date().toLocaleString("en-IN")}</p>
<h2>Sales</h2>
<table>${rows([
  ["Invoices", String(preview.sales.invoiceCount)],
  ["Paid invoices", String(preview.sales.paidInvoiceCount)],
  ["Sales total", money(preview.sales.salesTotalPaisa)],
  ["Paid sales", money(preview.sales.paidSalesPaisa)],
])}</table>
<h2>Cash</h2>
<table>${rows([
  ["In", money(preview.cash.inPaisa)],
  ["Refunds", money(preview.cash.refundsPaisa)],
  ["Net", money(preview.cash.netPaisa)],
])}</table>
<h2>UPI</h2>
<table>${rows([
  ["In", money(preview.upi.inPaisa)],
  ["Refunds", money(preview.upi.refundsPaisa)],
  ["Net", money(preview.upi.netPaisa)],
])}</table>
<h2>Refunds / Discounts / Expenses</h2>
<table>${rows([
  ["Refunds", `${preview.refunds.count} · ${money(preview.refunds.totalPaisa)}`],
  ["Discounts", money(preview.discounts.totalDiscountPaisa)],
  ["Expenses", `${preview.expenses.count} · ${money(preview.expenses.totalPaisa)}`],
])}</table>
<h2>Stock exceptions (${preview.stockExceptions.length})</h2>
<ul>${preview.stockExceptions.map((s) => `<li>${s.label} (${s.kind})</li>`).join("") || "<li>None</li>"}</ul>
<h2>Cashier variance</h2>
<table><thead><tr><th align="left">Shift</th><th align="left">Cashier</th><th>Status</th><th align="right">Variance</th></tr></thead>
<tbody>${preview.cashierVariance
      .map(
        (r) =>
          `<tr><td>${r.shiftNumber}</td><td>${r.cashierName}</td><td>${r.status}</td><td align="right">${r.variancePaisa == null ? "—" : money(r.variancePaisa)}</td></tr>`
      )
      .join("")}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`)
    w.document.close()
  }
}
