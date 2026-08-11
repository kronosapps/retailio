/**
 * Bulk product import domain — Excel is input only; ProductService owns creation.
 */

export const PRODUCT_IMPORT_TEMPLATE_VERSION = "1.0"

/** Canonical Excel header row (exact match required). */
export const PRODUCT_IMPORT_COLUMNS = [
  "SKU",
  "Barcode",
  "Name",
  "Category",
  "Brand",
  "Unit Size",
  "Unit",
  "Cost Price",
  "Selling Price",
  "MRP",
  "GST Rate",
  "HSN Code",
  "Reorder Level",
  "Active",
] as const

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number]

export type ProductImportRowStatus =
  | "NEW"
  | "DUPLICATE"
  | "INVALID"
  | "READY"

export type ProductImportRow = {
  rowNumber: number
  sku: string
  barcode: string | null
  name: string
  category: string
  brand: string | null
  unitSize: number | null
  unit: string | null
  costPrice: number | null
  sellingPrice: number | null
  mrp: number | null
  gstRate: number | null
  hsnCode: string | null
  reorderLevel: number | null
  active: boolean | null
}

export type ValidatedProductImportRow = ProductImportRow & {
  status: ProductImportRowStatus
  messages: string[]
}

export type ProductImportPreview = {
  templateVersion: string | null
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  newRows: number
  rows: ValidatedProductImportRow[]
}

export type ProductImportProgress = {
  total: number
  imported: number
  skipped: number
  failed: number
  remaining: number
  percent: number
  running: boolean
  done: boolean
}

export type ProductImportResult = {
  imported: number
  skipped: number
  failed: number
  failures: { rowNumber: number; sku: string; message: string }[]
  importedSkus: string[]
}

export type ProductImportColumnMeta = {
  column: ProductImportColumn
  required: boolean
  type: "text" | "number" | "boolean"
  description: string
}

export const PRODUCT_IMPORT_COLUMN_META: ProductImportColumnMeta[] = [
  {
    column: "SKU",
    required: true,
    type: "text",
    description: "Unique sellable identifier (Firestore document id)",
  },
  {
    column: "Barcode",
    required: false,
    type: "text",
    description: "Optional barcode; must be unique if set",
  },
  {
    column: "Name",
    required: true,
    type: "text",
    description: "Product display name",
  },
  {
    column: "Category",
    required: true,
    type: "text",
    description: "Category name (string; created with the product)",
  },
  {
    column: "Brand",
    required: false,
    type: "text",
    description: "Brand / label",
  },
  {
    column: "Unit Size",
    required: false,
    type: "number",
    description: "Pack size number (e.g. 100, 250)",
  },
  {
    column: "Unit",
    required: false,
    type: "text",
    description: "Display unit string (defaults to Unit Size)",
  },
  {
    column: "Cost Price",
    required: false,
    type: "number",
    description: "Purchase/cost price in rupees",
  },
  {
    column: "Selling Price",
    required: true,
    type: "number",
    description: "Retail selling price in rupees",
  },
  {
    column: "MRP",
    required: false,
    type: "number",
    description: "MRP in rupees",
  },
  {
    column: "GST Rate",
    required: false,
    type: "number",
    description: "GST percent (e.g. 5)",
  },
  {
    column: "HSN Code",
    required: false,
    type: "text",
    description: "HSN / SAC code",
  },
  {
    column: "Reorder Level",
    required: false,
    type: "number",
    description: "Low-stock threshold (units)",
  },
  {
    column: "Active",
    required: false,
    type: "boolean",
    description: "Yes/No or TRUE/FALSE (default Yes)",
  },
]
