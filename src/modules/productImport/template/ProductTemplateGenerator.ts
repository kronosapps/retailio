import ExcelJS from "exceljs"

import { ProductService } from "@/modules/products"
import { DEFAULT_REORDER_LEVEL } from "@/modules/inventory/types"

import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_COLUMN_META,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
} from "../types"

/**
 * Builds the official Product Import .xlsx from the live Product schema samples.
 */
export class ProductTemplateGenerator {
  static async buildWorkbook(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "RetailOS"
    workbook.created = new Date()

    const products = workbook.addWorksheet("Products")
    products.addRow([...PRODUCT_IMPORT_COLUMNS])
    styleHeader(products)

    const samples = ProductService.list().slice(0, 5)
    if (samples.length === 0) {
      products.addRow([
        "MH-SAMPLE-100",
        "890000000001",
        "Sample Halwa 100g",
        "Madugula Halwa",
        "Pavani's Foods",
        100,
        "100",
        80,
        110,
        110,
        5,
        "",
        DEFAULT_REORDER_LEVEL,
        "Yes",
      ])
    } else {
      for (const p of samples) {
        products.addRow([
          p.sku,
          p.barcode || "",
          p.name,
          p.category,
          p.brand || "",
          p.unitSize,
          p.unit,
          p.purchasePrice ?? "",
          p.sellingPrice,
          p.mrp ?? "",
          p.gstRate,
          p.hsnCode || "",
          p.reorderLevel ?? DEFAULT_REORDER_LEVEL,
          p.active ? "Yes" : "No",
        ])
      }
    }

    products.columns.forEach((col) => {
      col.width = 16
    })

    const instructions = workbook.addWorksheet("Instructions")
    instructions.getColumn(1).width = 90
    const lines = [
      `RetailOS Product Import Template — Version ${PRODUCT_IMPORT_TEMPLATE_VERSION}`,
      "",
      "1. Do not rename column headers on the Products sheet.",
      "2. One product per row. Leave unused optional cells blank.",
      "3. SKU must be unique (case-insensitive; stored uppercase).",
      "4. Barcode must be unique when provided.",
      "5. Enter Cost Price, Selling Price, and MRP in rupees (e.g. 110 or 50.50).",
      "6. GST Rate is a percent number (e.g. 5 for 5%).",
      "7. Category is a name string (not an ID). Missing categories are allowed and stored with the product.",
      "8. Do not fill system fields (id, createdAt, updatedAt) — RetailOS generates them.",
      "9. Active accepts Yes/No, TRUE/FALSE, 1/0 (blank = Yes).",
      "10. Save as .xlsx and upload in Inventory → Import.",
      "11. Upload + Validate only previews data. Nothing is written until you click Push to Firestore.",
      "12. Import mode is Add New Products only — existing SKUs are skipped as duplicates.",
      "13. This import does not create inventory stock movements.",
    ]
    lines.forEach((line, i) => {
      instructions.getCell(i + 1, 1).value = line
    })

    const dictionary = workbook.addWorksheet("Data Dictionary")
    dictionary.addRow(["Column", "Required", "Type", "Description"])
    styleHeader(dictionary)
    for (const meta of PRODUCT_IMPORT_COLUMN_META) {
      dictionary.addRow([
        meta.column,
        meta.required ? "Yes" : "No",
        meta.type,
        meta.description,
      ])
    }
    dictionary.getColumn(1).width = 16
    dictionary.getColumn(2).width = 10
    dictionary.getColumn(3).width = 10
    dictionary.getColumn(4).width = 48

    const meta = workbook.addWorksheet("Meta")
    meta.addRow(["Key", "Value"])
    styleHeader(meta)
    meta.addRow(["Template Version", PRODUCT_IMPORT_TEMPLATE_VERSION])
    meta.addRow(["Entity", "products"])
    meta.addRow(["Generated At", new Date().toISOString()])

    return workbook
  }

  static async download(): Promise<void> {
    const workbook = await this.buildWorkbook()
    await this.triggerDownload(
      workbook,
      `retailos-product-import-template-v${PRODUCT_IMPORT_TEMPLATE_VERSION}.xlsx`
    )
  }

  /**
   * Full catalog export using the same Products columns as the import template.
   * Includes Meta version so the file can be re-imported after edits (Add New mode skips existing SKUs).
   */
  static async downloadExport(): Promise<void> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "RetailOS"
    const products = workbook.addWorksheet("Products")
    products.addRow([...PRODUCT_IMPORT_COLUMNS])
    styleHeader(products)
    for (const p of ProductService.list()) {
      products.addRow([
        p.sku,
        p.barcode || "",
        p.name,
        p.category,
        p.brand || "",
        p.unitSize,
        p.unit,
        p.purchasePrice ?? "",
        p.sellingPrice,
        p.mrp ?? "",
        p.gstRate,
        p.hsnCode || "",
        p.reorderLevel ?? DEFAULT_REORDER_LEVEL,
        p.active ? "Yes" : "No",
      ])
    }
    products.columns.forEach((col) => {
      col.width = 16
    })

    const meta = workbook.addWorksheet("Meta")
    meta.addRow(["Key", "Value"])
    styleHeader(meta)
    meta.addRow(["Template Version", PRODUCT_IMPORT_TEMPLATE_VERSION])
    meta.addRow(["Entity", "products"])
    meta.addRow(["Export Type", "catalog"])
    meta.addRow(["Generated At", new Date().toISOString()])

    const note = workbook.addWorksheet("Notes")
    note.getColumn(1).width = 80
    note.getCell(1, 1).value =
      "This is a Product Export (catalog dump), not the sample Import Template."
    note.getCell(2, 1).value =
      "Column headers match the official import template so you can add NEW rows and re-upload."
    note.getCell(3, 1).value =
      "Import mode is Add New only — existing SKUs are skipped as duplicates."

    await this.triggerDownload(
      workbook,
      `retailos-products-export-${new Date().toISOString().slice(0, 10)}.xlsx`
    )
  }

  private static async triggerDownload(
    workbook: ExcelJS.Workbook,
    filename: string
  ) {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1)
  row.font = { bold: true }
  row.commit()
}
