import ExcelJS from "exceljs"

import type { ReportExportPayload } from "../types/report"

/**
 * Converts a normalized ReportExportPayload into a downloadable .xlsx blob.
 * Owns workbook/worksheet formatting only — does not fetch business data.
 */
export class ExcelReportExporter {
  static async toBlob(payload: ReportExportPayload): Promise<Blob> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "RetailOS"
    workbook.created = new Date(payload.generatedAt)

    const meta = workbook.addWorksheet("Report Info")
    meta.columns = [
      { header: "Field", key: "field", width: 22 },
      { header: "Value", key: "value", width: 48 },
    ]
    meta.addRows([
      { field: "Report", value: payload.title },
      { field: "Store", value: payload.storeName },
      { field: "Period", value: payload.periodLabel },
      {
        field: "Generated",
        value: new Date(payload.generatedAt).toLocaleString("en-IN"),
      },
      { field: "Report Type", value: payload.reportType },
    ])
    styleHeader(meta)

    for (const sheet of payload.sheets) {
      const ws = workbook.addWorksheet(safeSheetName(sheet.name))
      ws.addRow(sheet.columns)
      styleHeader(ws)
      for (const row of sheet.rows) {
        ws.addRow(row)
      }
      ws.views = [{ state: "frozen", ySplit: 1 }]
      sheet.columns.forEach((_, i) => {
        const col = ws.getColumn(i + 1)
        col.width = Math.min(
          40,
          Math.max(
            12,
            ...sheet.rows.map((r) => String(r[i] ?? "").length + 2),
            sheet.columns[i].length + 2
          )
        )
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  }

  static async download(
    payload: ReportExportPayload,
    filename?: string
  ): Promise<void> {
    const blob = await this.toBlob(payload)
    const name =
      filename ||
      `${payload.reportType}-report-${payload.filters.startDate.slice(0, 10)}.xlsx`
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1)
  row.font = { bold: true }
  row.commit()
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/*/?:[\]]/g, " ").slice(0, 31) || "Sheet"
}
