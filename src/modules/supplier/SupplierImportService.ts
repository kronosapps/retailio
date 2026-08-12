import ExcelJS from "exceljs"

import { SupplierService } from "@/modules/supplier"

export const SUPPLIER_IMPORT_COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "GSTIN",
  "Address",
  "City",
  "State",
  "PIN",
  "Payment Terms",
  "Notes",
] as const

export type SupplierImportRowStatus = "NEW" | "DUPLICATE" | "INVALID"

export type ValidatedSupplierImportRow = {
  rowNumber: number
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  address: string | null
  city: string | null
  state: string | null
  pin: string | null
  paymentTerms: string | null
  notes: string | null
  status: SupplierImportRowStatus
  messages: string[]
}

export type SupplierImportPreview = {
  totalRows: number
  newRows: number
  duplicateRows: number
  invalidRows: number
  rows: ValidatedSupplierImportRow[]
}

export type SupplierImportResult = {
  imported: number
  skipped: number
  failed: number
  errors: Array<{ rowNumber: number; message: string }>
}

function cellStr(v: unknown): string {
  if (v == null) return ""
  return String(v).trim()
}

/**
 * Bulk supplier import — Excel template → validate → SupplierService.create.
 */
export class SupplierImportService {
  static async downloadTemplate(): Promise<void> {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet("Suppliers")
    ws.addRow([...SUPPLIER_IMPORT_COLUMNS])
    ws.getRow(1).font = { bold: true }
    ws.addRow([
      "Acme Traders",
      "9876543210",
      "orders@acme.example",
      "22AAAAA0000A1Z5",
      "12 Market Road",
      "Pune",
      "MH",
      "411001",
      "Net 15",
      "",
    ])
    SUPPLIER_IMPORT_COLUMNS.forEach((_, i) => {
      ws.getColumn(i + 1).width = 16
    })
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "supplier-import-template.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  static async parseAndValidate(file: File): Promise<SupplierImportPreview> {
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const ws = workbook.worksheets[0]
    if (!ws) {
      return {
        totalRows: 0,
        newRows: 0,
        duplicateRows: 0,
        invalidRows: 0,
        rows: [],
      }
    }

    const existingNames = new Set(
      SupplierService.list({ includeInactive: true }).map((s) =>
        s.name.trim().toLowerCase()
      )
    )
    const seenInFile = new Set<string>()
    const rows: ValidatedSupplierImportRow[] = []

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = SUPPLIER_IMPORT_COLUMNS.map((_, i) =>
        cellStr(row.getCell(i + 1).value)
      )
      const [
        name,
        phone,
        email,
        gstin,
        address,
        city,
        state,
        pin,
        paymentTerms,
        notes,
      ] = values

      const messages: string[] = []
      let status: SupplierImportRowStatus = "NEW"

      if (!name) {
        status = "INVALID"
        messages.push("Name is required.")
      } else {
        const key = name.toLowerCase()
        if (existingNames.has(key) || seenInFile.has(key)) {
          status = "DUPLICATE"
          messages.push("Supplier name already exists.")
        } else {
          seenInFile.add(key)
        }
      }

      if (gstin && gstin.length !== 15) {
        status = "INVALID"
        messages.push("GSTIN must be 15 characters when provided.")
      }

      if (!name && values.every((v) => !v)) return

      rows.push({
        rowNumber,
        name,
        phone: phone || null,
        email: email || null,
        gstin: gstin ? gstin.toUpperCase() : null,
        address: address || null,
        city: city || null,
        state: state || null,
        pin: pin || null,
        paymentTerms: paymentTerms || null,
        notes: notes || null,
        status,
        messages,
      })
    })

    return {
      totalRows: rows.length,
      newRows: rows.filter((r) => r.status === "NEW").length,
      duplicateRows: rows.filter((r) => r.status === "DUPLICATE").length,
      invalidRows: rows.filter((r) => r.status === "INVALID").length,
      rows,
    }
  }

  static async push(
    preview: SupplierImportPreview,
    opts: { storeId?: string | null; actorId?: string | null }
  ): Promise<SupplierImportResult> {
    let imported = 0
    let skipped = 0
    let failed = 0
    const errors: SupplierImportResult["errors"] = []

    for (const row of preview.rows) {
      if (row.status !== "NEW") {
        skipped += 1
        continue
      }
      try {
        await SupplierService.create(
          {
            name: row.name,
            phone: row.phone ?? undefined,
            email: row.email ?? undefined,
            gstin: row.gstin ?? undefined,
            address: row.address ?? undefined,
            city: row.city ?? undefined,
            state: row.state ?? undefined,
            pin: row.pin ?? undefined,
            paymentTerms: row.paymentTerms ?? undefined,
            notes: row.notes ?? undefined,
            storeId: opts.storeId,
            active: true,
          },
          opts.actorId ?? undefined
        )
        imported += 1
      } catch (err) {
        failed += 1
        errors.push({
          rowNumber: row.rowNumber,
          message: err instanceof Error ? err.message : "Import failed.",
        })
      }
    }

    return { imported, skipped, failed, errors }
  }
}
