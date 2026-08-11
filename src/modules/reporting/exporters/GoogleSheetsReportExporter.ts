import { googleSheetsSyncProvider } from "@/services/sync/GoogleSheetsSyncProvider"

import type { ReportExportPayload } from "../types/report"

export type GoogleSheetsExportResult = {
  configured: boolean
  sheetsSynced: string[]
  errors: string[]
}

/**
 * Pushes report sheets through the existing Google Sheets SyncProvider.
 * Does not create a second HTTP transport.
 */
export class GoogleSheetsReportExporter {
  static isConfigured(): boolean {
    return googleSheetsSyncProvider.isConfigured()
  }

  static async export(
    payload: ReportExportPayload
  ): Promise<GoogleSheetsExportResult> {
    const errors: string[] = []
    const sheetsSynced: string[] = []

    if (!googleSheetsSyncProvider.isConfigured()) {
      return {
        configured: false,
        sheetsSynced,
        errors: [
          "Google Sheets is not configured. Set VITE_GOOGLE_SCRIPT_URL.",
        ],
      }
    }

    // Meta row
    try {
      await googleSheetsSyncProvider.syncBatch("ReportExports", [
        {
          reportType: payload.reportType,
          title: payload.title,
          storeName: payload.storeName,
          periodLabel: payload.periodLabel,
          generatedAt: payload.generatedAt,
          sheetCount: payload.sheets.length,
        },
      ])
      sheetsSynced.push("ReportExports")
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : "Failed to sync ReportExports"
      )
    }

    for (const sheet of payload.sheets) {
      const target = `Report_${payload.reportType}_${sheet.name}`
        .replace(/\s+/g, "_")
        .slice(0, 80)
      const rows = sheet.rows.map((cells) => {
        const obj: Record<string, string | number | boolean | null> = {
          reportType: payload.reportType,
          generatedAt: payload.generatedAt,
          periodLabel: payload.periodLabel,
        }
        sheet.columns.forEach((col, i) => {
          obj[col] = cells[i] ?? null
        })
        return obj
      })

      try {
        if (rows.length === 0) {
          await googleSheetsSyncProvider.syncBatch(target, [
            {
              reportType: payload.reportType,
              generatedAt: payload.generatedAt,
              note: "No rows for this sheet",
            },
          ])
        } else {
          await googleSheetsSyncProvider.syncBatch(target, rows)
        }
        sheetsSynced.push(target)
      } catch (err) {
        errors.push(
          err instanceof Error
            ? `${target}: ${err.message}`
            : `Failed to sync ${target}`
        )
      }
    }

    return { configured: true, sheetsSynced, errors }
  }
}
