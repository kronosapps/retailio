import type { ReportExportPayload, ReportType } from "../types/report"
import type { SalesReport } from "../services/SalesReportService"
import type { InventoryReport } from "../services/InventoryReportService"
import type { StockReport } from "../services/StockReportService"
import type { ItemReport } from "../services/ItemReportService"
import type { DashboardReport } from "../services/DashboardReportService"
import { ExcelReportExporter } from "./ExcelReportExporter"
import { GoogleSheetsReportExporter } from "./GoogleSheetsReportExporter"
import { ReportExportMapper } from "./ReportExportMapper"

type AnyReport =
  | SalesReport
  | InventoryReport
  | StockReport
  | ItemReport
  | DashboardReport

/**
 * Facade: report result → Excel and/or Google Sheets.
 * Excel and Sheets sit side-by-side — neither depends on the other.
 */
export class ReportExportService {
  static toPayload(report: AnyReport): ReportExportPayload {
    switch (report.reportType as ReportType) {
      case "sales":
        return ReportExportMapper.fromSales(report as SalesReport)
      case "inventory":
        return ReportExportMapper.fromInventory(report as InventoryReport)
      case "stock":
        return ReportExportMapper.fromStock(report as StockReport)
      case "items":
        return ReportExportMapper.fromItems(report as ItemReport)
      case "dashboard":
        return ReportExportMapper.fromDashboard(report as DashboardReport)
      default:
        throw new Error(`Unsupported report type: ${report.reportType}`)
    }
  }

  static async exportExcel(report: AnyReport, filename?: string) {
    const payload = this.toPayload(report)
    await ExcelReportExporter.download(payload, filename)
    return payload
  }

  static async exportGoogleSheets(report: AnyReport) {
    const payload = this.toPayload(report)
    const result = await GoogleSheetsReportExporter.export(payload)
    return { payload, result }
  }
}
