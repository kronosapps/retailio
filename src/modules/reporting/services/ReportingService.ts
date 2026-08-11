import type { ReportFilters, ReportType } from "../types/report"
import { DashboardReportService } from "./DashboardReportService"
import { InventoryReportService } from "./InventoryReportService"
import {
  ItemReportService,
  type ItemSort,
} from "./ItemReportService"
import { SalesReportService } from "./SalesReportService"
import { StockReportService } from "./StockReportService"

/**
 * Reporting facade — UI calls this only.
 * Read-only; never mutates business entities.
 */
export class ReportingService {
  static getSalesReport(filters: ReportFilters) {
    return SalesReportService.getSalesReport(filters)
  }

  static getInventoryReport(filters: ReportFilters) {
    return InventoryReportService.getInventoryReport(filters)
  }

  static getStockReport(filters: ReportFilters) {
    return StockReportService.getStockReport(filters)
  }

  static getItemReport(filters: ReportFilters, sort?: ItemSort) {
    return ItemReportService.getItemReport(filters, sort)
  }

  static getDashboardReport(filters: ReportFilters) {
    return DashboardReportService.getDashboardReport(filters)
  }

  static async generate(type: ReportType, filters: ReportFilters, sort?: ItemSort) {
    switch (type) {
      case "sales":
        return this.getSalesReport(filters)
      case "inventory":
        return this.getInventoryReport(filters)
      case "stock":
        return this.getStockReport(filters)
      case "items":
        return this.getItemReport(filters, sort)
      case "dashboard":
        return this.getDashboardReport(filters)
    }
  }
}
