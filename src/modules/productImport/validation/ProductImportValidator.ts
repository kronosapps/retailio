import { ProductService } from "@/modules/products"

import type {
  ProductImportPreview,
  ProductImportRow,
  ValidatedProductImportRow,
} from "../types"

/**
 * Validates normalized import rows against ProductService business rules.
 * Mode: Add New only — existing SKUs are DUPLICATE (skipped, not updated).
 */
export class ProductImportValidator {
  static validate(
    rows: ProductImportRow[],
    templateVersion: string | null
  ): ProductImportPreview {
    const existingSkus = new Set(
      ProductService.list().map((p) => p.sku.trim().toUpperCase())
    )
    const existingBarcodes = new Map(
      ProductService.list()
        .filter((p) => p.barcode)
        .map((p) => [p.barcode!.trim(), p.sku.trim().toUpperCase()] as const)
    )

    const seenSkus = new Map<string, number>()
    const seenBarcodes = new Map<string, number>()

    const validated: ValidatedProductImportRow[] = rows.map((row) => {
      const messages: string[] = []
      const fieldErrors: string[] = []
      const sku = row.sku.trim().toUpperCase()

      if (!sku) fieldErrors.push("SKU is required.")
      if (!row.name.trim()) fieldErrors.push("Name is required.")
      if (!row.category.trim()) fieldErrors.push("Category is required.")

      if (row.sellingPrice == null || Number.isNaN(row.sellingPrice)) {
        fieldErrors.push("Selling Price must be a number.")
      } else if (row.sellingPrice < 0) {
        fieldErrors.push("Selling price cannot be negative.")
      }

      if (row.costPrice != null) {
        if (Number.isNaN(row.costPrice)) {
          fieldErrors.push("Cost Price must be a number.")
        } else if (row.costPrice < 0) {
          fieldErrors.push("Cost price cannot be negative.")
        }
      }

      if (row.mrp != null) {
        if (Number.isNaN(row.mrp)) fieldErrors.push("MRP must be a number.")
        else if (row.mrp < 0) fieldErrors.push("MRP cannot be negative.")
      }

      if (row.gstRate != null) {
        if (Number.isNaN(row.gstRate)) {
          fieldErrors.push("GST Rate must be a number.")
        } else if (row.gstRate < 0 || row.gstRate > 100) {
          fieldErrors.push("GST Rate must be between 0 and 100.")
        }
      }

      if (row.unitSize != null) {
        if (Number.isNaN(row.unitSize) || row.unitSize <= 0) {
          fieldErrors.push("Unit Size must be a positive number.")
        }
      }

      if (row.reorderLevel != null) {
        if (Number.isNaN(row.reorderLevel) || row.reorderLevel < 0) {
          fieldErrors.push("Reorder Level cannot be negative.")
        }
      }

      let isDuplicate = false

      if (sku) {
        const prior = seenSkus.get(sku)
        if (prior != null) {
          messages.push(`Duplicate SKU in Excel (also row ${prior}).`)
          isDuplicate = true
        } else {
          seenSkus.set(sku, row.rowNumber)
        }
        if (existingSkus.has(sku)) {
          messages.push("SKU already exists in RetailOS (will be skipped).")
          isDuplicate = true
        }
      }

      if (row.barcode) {
        const priorB = seenBarcodes.get(row.barcode)
        if (priorB != null) {
          fieldErrors.push(`Duplicate barcode in Excel (also row ${priorB}).`)
        } else {
          seenBarcodes.set(row.barcode, row.rowNumber)
        }
        const ownerSku = existingBarcodes.get(row.barcode)
        if (ownerSku && ownerSku !== sku) {
          fieldErrors.push("Barcode already exists on another product.")
        }
      }

      messages.push(...fieldErrors)

      let status: ValidatedProductImportRow["status"]
      if (fieldErrors.length > 0) status = "INVALID"
      else if (isDuplicate) status = "DUPLICATE"
      else status = "NEW"

      return {
        ...row,
        sku,
        status,
        messages,
      }
    })

    return {
      templateVersion,
      totalRows: validated.length,
      validRows: validated.filter((r) => r.status === "NEW").length,
      invalidRows: validated.filter((r) => r.status === "INVALID").length,
      duplicateRows: validated.filter((r) => r.status === "DUPLICATE").length,
      newRows: validated.filter((r) => r.status === "NEW").length,
      rows: validated,
    }
  }
}
