import ExcelJS from "exceljs"

import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_TEMPLATE_VERSION,
  type ProductImportRow,
} from "../types"

export class ProductImportParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProductImportParseError"
  }
}

export type ParsedProductWorkbook = {
  templateVersion: string | null
  rows: ProductImportRow[]
}

/**
 * Parses an official Product Import workbook into normalized rows.
 */
export class ExcelProductParser {
  static async parseFile(file: File): Promise<ParsedProductWorkbook> {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      throw new ProductImportParseError("Only .xlsx files are supported.")
    }
    const buffer = await file.arrayBuffer()
    return this.parseBuffer(buffer)
  }

  static async parseBuffer(buffer: ArrayBuffer): Promise<ParsedProductWorkbook> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const meta = workbook.getWorksheet("Meta")
    const templateVersion = readMetaVersion(meta)
    if (
      templateVersion &&
      templateVersion !== PRODUCT_IMPORT_TEMPLATE_VERSION
    ) {
      throw new ProductImportParseError(
        `This template version (${templateVersion}) is not supported. Please download the latest RetailOS Product Import Template (v${PRODUCT_IMPORT_TEMPLATE_VERSION}).`
      )
    }

    const sheet = workbook.getWorksheet("Products")
    if (!sheet) {
      throw new ProductImportParseError(
        'Missing "Products" sheet. Please download the official template.'
      )
    }

    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.text || cell.value || "").trim()
    })

    // Trim trailing empty header slots
    while (headers.length && !headers[headers.length - 1]) headers.pop()

    validateHeaders(headers)

    const colIndex = new Map(
      PRODUCT_IMPORT_COLUMNS.map((name) => [name, headers.indexOf(name)])
    )

    const rows: ProductImportRow[] = []
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      const values = PRODUCT_IMPORT_COLUMNS.map((col) => {
        const idx = colIndex.get(col)!
        const cell = row.getCell(idx + 1)
        return cellValue(cell)
      })
      if (values.every((v) => v === "" || v == null)) return

      rows.push({
        rowNumber,
        sku: asString(values[0]),
        barcode: asOptionalString(values[1]),
        name: asString(values[2]),
        category: asString(values[3]),
        brand: asOptionalString(values[4]),
        unitSize: asOptionalNumber(values[5]),
        unit: asOptionalString(values[6]),
        costPrice: asOptionalNumber(values[7]),
        sellingPrice: asOptionalNumber(values[8]),
        mrp: asOptionalNumber(values[9]),
        gstRate: asOptionalNumber(values[10]),
        hsnCode: asOptionalString(values[11]),
        reorderLevel: asOptionalNumber(values[12]),
        active: asOptionalBoolean(values[13]),
      })
    })

    return {
      templateVersion: templateVersion || PRODUCT_IMPORT_TEMPLATE_VERSION,
      rows,
    }
  }
}

function validateHeaders(headers: string[]) {
  const expected = [...PRODUCT_IMPORT_COLUMNS]
  if (headers.length < expected.length) {
    throw new ProductImportParseError(
      "Unexpected or missing columns detected. Please download the latest RetailOS Product Import Template."
    )
  }
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      throw new ProductImportParseError(
        `Column mismatch at position ${i + 1}: expected "${expected[i]}", got "${headers[i] || ""}". Please download the latest template.`
      )
    }
  }
}

function readMetaVersion(sheet: ExcelJS.Worksheet | undefined): string | null {
  if (!sheet) return null
  let version: string | null = null
  sheet.eachRow((row) => {
    const key = String(row.getCell(1).text || "").trim()
    if (key === "Template Version") {
      version = String(row.getCell(2).text || row.getCell(2).value || "").trim()
    }
  })
  return version
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value
  if (v == null) return ""
  if (typeof v === "object" && v !== null && "text" in v) {
    return String((v as { text: string }).text)
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    return (v as { result: unknown }).result
  }
  return v
}

function asString(value: unknown): string {
  if (value == null) return ""
  return String(value).trim()
}

function asOptionalString(value: unknown): string | null {
  const s = asString(value)
  return s ? s : null
}

function asOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  const n = Number(String(value).replace(/,/g, "").trim())
  return Number.isFinite(n) ? n : Number.NaN
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (value == null || value === "") return null
  if (typeof value === "boolean") return value
  const s = String(value).trim().toLowerCase()
  if (["yes", "y", "true", "1"].includes(s)) return true
  if (["no", "n", "false", "0"].includes(s)) return false
  return null
}
