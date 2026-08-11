import ExcelJS from "exceljs"

import { ProductError, ProductService } from "@/modules/products"

import {
  ExcelProductParser,
  ProductImportParseError,
} from "../parser/ExcelProductParser"
import { ProductTemplateGenerator } from "../template/ProductTemplateGenerator"
import { ProductImportValidator } from "../validation/ProductImportValidator"
import type {
  ProductImportPreview,
  ProductImportProgress,
  ProductImportResult,
  ValidatedProductImportRow,
} from "../types"

const BATCH_SIZE = 20

/**
 * Orchestrates template → parse → validate → push via ProductService.
 * UI must never call Firestore directly.
 */
export class ProductImportService {
  static downloadTemplate() {
    return ProductTemplateGenerator.download()
  }

  /** Export current catalog in the same column layout as the import template. */
  static downloadExport() {
    return ProductTemplateGenerator.downloadExport()
  }

  static async parseAndValidate(file: File): Promise<ProductImportPreview> {
    const parsed = await ExcelProductParser.parseFile(file)
    return ProductImportValidator.validate(
      parsed.rows,
      parsed.templateVersion
    )
  }

  static async downloadErrorReport(preview: ProductImportPreview) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Errors")
    sheet.addRow([
      "Original Row",
      "SKU",
      "Name",
      "Status",
      "Error Type",
      "Error Message",
    ])
    const header = sheet.getRow(1)
    header.font = { bold: true }

    for (const row of preview.rows) {
      if (row.status === "NEW") continue
      for (const message of row.messages.length ? row.messages : ["Unknown"]) {
        const safeMessage = sanitizeCell(message)
        sheet.addRow([
          row.rowNumber,
          sanitizeCell(row.sku),
          sanitizeCell(row.name),
          row.status,
          row.status === "DUPLICATE" ? "Duplicate" : "Validation",
          safeMessage,
        ])
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "retailos-product-import-errors.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Import NEW rows only through ProductService.create (batched).
   */
  static async pushToFirestore(
    preview: ProductImportPreview,
    options: {
      storeId: string | null
      actorId: string | null
      onProgress?: (progress: ProductImportProgress) => void
    }
  ): Promise<ProductImportResult> {
    const toImport = preview.rows.filter((r) => r.status === "NEW")
    const skipped = preview.rows.filter((r) => r.status !== "NEW").length

    const result: ProductImportResult = {
      imported: 0,
      skipped,
      failed: 0,
      failures: [],
      importedSkus: [],
    }

    const total = toImport.length
    let remaining = total

    const report = (running: boolean, done: boolean) => {
      options.onProgress?.({
        total,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        remaining,
        percent: total === 0 ? 100 : Math.round(((total - remaining) / total) * 100),
        running,
        done,
      })
    }

    report(true, false)

    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE)
      for (const row of batch) {
        try {
          await this.createOne(row, options.storeId, options.actorId)
          result.imported += 1
          result.importedSkus.push(row.sku)
        } catch (err) {
          result.failed += 1
          result.failures.push({
            rowNumber: row.rowNumber,
            sku: row.sku,
            message:
              err instanceof ProductError || err instanceof Error
                ? err.message
                : "Import failed.",
          })
        }
        remaining -= 1
        report(true, false)
      }
      // Yield to keep UI responsive
      await new Promise((r) => setTimeout(r, 0))
    }

    report(false, true)
    return result
  }

  private static async createOne(
    row: ValidatedProductImportRow,
    storeId: string | null,
    actorId: string | null
  ) {
    // ProductService.create expects rupees and owns paisa conversion + events.
    return ProductService.create({
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      category: row.category,
      brand: row.brand,
      unitSize: row.unitSize ?? 1,
      unit: row.unit ?? undefined,
      costPrice: row.costPrice,
      sellingPrice: row.sellingPrice ?? 0,
      mrp: row.mrp,
      gstRate: row.gstRate ?? 0,
      hsnCode: row.hsnCode,
      reorderLevel: row.reorderLevel ?? undefined,
      active: row.active ?? true,
      storeId,
      actorId,
    })
  }
}

export { ProductImportParseError }

/** Neutralize Excel formula injection on user-controlled export cells. */
function sanitizeCell(value: string): string {
  const s = String(value ?? "")
  if (/^[=+\-@]/.test(s)) return `'${s}`
  return s
}
