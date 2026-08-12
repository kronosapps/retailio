import { AuditService } from "@/modules/audit"
import { CHART_OF_ACCOUNTS } from "@/modules/accounting/chartOfAccounts"
import { InventoryService } from "@/modules/inventory/InventoryService"
import { ExcelReportExporter } from "@/modules/reporting/exporters/ExcelReportExporter"
import type { ReportExportPayload, ReportSheet } from "@/modules/reporting/types/report"
import { customerRepository } from "@/repositories/CustomerRepository"
import { expenseRepository } from "@/repositories/ExpenseRepository"
import { inventoryLotRepository } from "@/repositories/InventoryLotRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { journalRepository } from "@/repositories/JournalRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import { productRepository } from "@/repositories/ProductRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { stockTakeRepository } from "@/repositories/StockTakeRepository"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"

import {
  buildDatabaseBackup,
  hydrateForBackup,
} from "./collectSnapshot"
import { backupFilename, downloadJson } from "./download"
import type { BackupActor, BackupKind } from "./types"
import { BACKUP_FORMAT_VERSION, BACKUP_KIND_LABELS } from "./types"

function emptyFilters(storeId: string | null) {
  const now = new Date().toISOString()
  return {
    preset: "custom" as const,
    startDate: now,
    endDate: now,
    storeId,
    category: null,
    productSku: null,
    staffId: null,
    paymentMethod: null,
  }
}

function sheetFromRows(
  name: string,
  rows: Array<Record<string, unknown>>
): ReportSheet {
  if (rows.length === 0) {
    return { name, columns: ["(empty)"], rows: [["No rows"]] }
  }
  const columns = Object.keys(rows[0])
  return {
    name,
    columns,
    rows: rows.map((row) => columns.map((c) => cell(row[c]))),
  }
}

function cell(value: unknown): string | number | boolean | null {
  if (value == null) return null
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  return JSON.stringify(value)
}

function excelPayload(
  title: string,
  storeName: string,
  storeId: string | null,
  sheets: ReportSheet[]
): ReportExportPayload {
  return {
    reportType: "utility",
    title,
    storeName: storeName || "Store",
    generatedAt: new Date().toISOString(),
    periodLabel: "Backup export",
    filters: emptyFilters(storeId),
    sheets,
  }
}

async function recordExport(
  kind: BackupKind,
  actor: BackupActor,
  counts: Record<string, number>
) {
  await AuditService.record({
    kind: "BACKUP_EXPORTED",
    message: `${BACKUP_KIND_LABELS[kind]} downloaded`,
    actorId: actor.actorId ?? null,
    actorName: actor.actorName ?? null,
    storeId: actor.storeId ?? null,
    entityType: "backup",
    entityId: kind,
    meta: { kind, counts, formatVersion: BACKUP_FORMAT_VERSION },
  })
}

/**
 * Admin backup exports — local download only (no Sheets).
 */
export class BackupService {
  static async exportDatabase(actor: BackupActor) {
    const payload = await buildDatabaseBackup(actor)
    downloadJson(
      backupFilename("database", "json", actor.storeId),
      payload
    )
    await recordExport("database", actor, payload.manifest.counts)
    return payload.manifest
  }

  static async exportProducts(actor: BackupActor) {
    await hydrateForBackup(actor.storeId)
    const products = productRepository.list()
    const tabular = InventoryService.exportProductsData()
    downloadJson(backupFilename("products", "json", actor.storeId), {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: "products",
      exportedAt: new Date().toISOString(),
      storeId: actor.storeId ?? null,
      products,
    })
    await ExcelReportExporter.download(
      excelPayload(
        "Product Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [sheetFromRows("Products", tabular)]
      ),
      backupFilename("products", "xlsx", actor.storeId)
    )
    const counts = { products: products.length }
    await recordExport("products", actor, counts)
    return counts
  }

  static async exportCustomers(actor: BackupActor) {
    await hydrateForBackup(actor.storeId)
    const customers = customerRepository.list()
    downloadJson(backupFilename("customers", "json", actor.storeId), {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: "customers",
      exportedAt: new Date().toISOString(),
      storeId: actor.storeId ?? null,
      customers,
    })
    const tabular = customers.map((c) => ({
      ID: c.id,
      Name: c.name,
      Phone: c.phone ?? "",
      Email: c.email ?? "",
      "Store credit (paisa)": c.storeCreditPaisa ?? 0,
      "Created At": c.createdAt,
      "Updated At": c.updatedAt,
    }))
    await ExcelReportExporter.download(
      excelPayload(
        "Customer Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [sheetFromRows("Customers", tabular)]
      ),
      backupFilename("customers", "xlsx", actor.storeId)
    )
    const counts = { customers: customers.length }
    await recordExport("customers", actor, counts)
    return counts
  }

  static async exportInvoices(actor: BackupActor) {
    await hydrateForBackup(actor.storeId)
    const [invoices, payments, refunds] = await Promise.all([
      invoiceRepository.list(),
      paymentRepository.list(),
      refundRepository.list(),
    ])
    downloadJson(backupFilename("invoices", "json", actor.storeId), {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: "invoices",
      exportedAt: new Date().toISOString(),
      storeId: actor.storeId ?? null,
      invoices,
      payments,
      refunds,
    })
    const invoiceRows = invoices.map((s) => ({
      Invoice: s.invoiceId,
      Customer: s.customerName,
      Phone: s.customerPhone ?? "",
      Status: s.paymentStatus ?? "",
      Method: s.paymentMethod ?? "",
      "Total (paisa)": s.totals.total,
      "GST (paisa)": s.totals.gstAmount,
      Cashier: s.cashierName ?? "",
      Created: s.createdAt,
    }))
    const paymentRows = payments.map((p) => ({
      Payment: p.paymentId,
      Invoice: p.invoiceId,
      Status: p.status,
      Method: p.paymentMethod,
      "Amount (paisa)": p.amountPaisa,
      PaidAt: p.paidAt ?? "",
    }))
    await ExcelReportExporter.download(
      excelPayload(
        "Invoice Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [
          sheetFromRows("Invoices", invoiceRows),
          sheetFromRows("Payments", paymentRows),
        ]
      ),
      backupFilename("invoices", "xlsx", actor.storeId)
    )
    const counts = {
      invoices: invoices.length,
      payments: payments.length,
      refunds: refunds.length,
    }
    await recordExport("invoices", actor, counts)
    return counts
  }

  static async exportInventory(actor: BackupActor) {
    await hydrateForBackup(actor.storeId)
    const stock = InventoryService.exportCurrentStockData()
    const movements = InventoryService.exportInventoryMovementsData()
    const lots = inventoryLotRepository.list()
    const takes = stockTakeRepository.list()
    downloadJson(backupFilename("inventory", "json", actor.storeId), {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: "inventory",
      exportedAt: new Date().toISOString(),
      storeId: actor.storeId ?? null,
      stock: InventoryService.getAllStock(),
      lots,
      movements: inventoryMovementRepository.list(),
      stock_takes: takes,
    })
    await ExcelReportExporter.download(
      excelPayload(
        "Inventory Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [
          sheetFromRows("Stock", stock),
          sheetFromRows("Movements", movements),
          sheetFromRows(
            "Lots",
            lots.map((l) => ({
              ID: l.id,
              SKU: l.sku,
              Qty: l.quantity,
              Expiry: l.expiryDate ?? "",
              Batch: l.batchCode ?? "",
            }))
          ),
        ]
      ),
      backupFilename("inventory", "xlsx", actor.storeId)
    )
    const counts = {
      stock: stock.length,
      movements: movements.length,
      lots: lots.length,
      stock_takes: takes.length,
    }
    await recordExport("inventory", actor, counts)
    return counts
  }

  static async exportAccounting(actor: BackupActor) {
    await hydrateForBackup(actor.storeId)
    const journals = journalRepository.list()
    const expenses = expenseRepository.list()
    downloadJson(backupFilename("accounting", "json", actor.storeId), {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: "accounting",
      exportedAt: new Date().toISOString(),
      storeId: actor.storeId ?? null,
      journal_entries: journals,
      expenses,
      chart_of_accounts: CHART_OF_ACCOUNTS,
    })
    const journalRows = journals.map((j) => ({
      ID: j.id,
      Date: j.date || j.createdAt,
      Reference: `${j.referenceType}:${j.referenceId}`,
      Description: j.description ?? "",
      Lines: j.lines.length,
      "Debit (paisa)": j.lines.reduce((s, l) => s + (l.debitPaisa || 0), 0),
      "Credit (paisa)": j.lines.reduce((s, l) => s + (l.creditPaisa || 0), 0),
    }))
    const expenseRows = expenses.map((e) => ({
      ID: e.id,
      Title: e.title,
      Date: e.createdAt,
      Category: e.category ?? "",
      "Amount (paisa)": e.amountPaisa,
      Method: e.paymentMethod ?? "",
    }))
    await ExcelReportExporter.download(
      excelPayload(
        "Accounting Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [
          sheetFromRows("Journals", journalRows),
          sheetFromRows("Expenses", expenseRows),
          sheetFromRows(
            "ChartOfAccounts",
            CHART_OF_ACCOUNTS.map((a) => ({
              Code: a.code,
              Name: a.name,
              Type: a.type,
              "Normal balance": a.normalBalance,
            }))
          ),
        ]
      ),
      backupFilename("accounting", "xlsx", actor.storeId)
    )
    const counts = {
      journal_entries: journals.length,
      expenses: expenses.length,
      chart_of_accounts: CHART_OF_ACCOUNTS.length,
    }
    await recordExport("accounting", actor, counts)
    return counts
  }

  static async exportFullBusiness(actor: BackupActor) {
    const db = await buildDatabaseBackup({
      ...actor,
    })
    // Override kind in a copy for the full pack filename/manifest.
    const fullPayload = {
      ...db,
      manifest: {
        ...db.manifest,
        kind: "full_business" as const,
        notes: [
          ...db.manifest.notes,
          "Paired with Full Business Excel workbook for human review.",
        ],
      },
    }
    downloadJson(
      backupFilename("full-business", "json", actor.storeId),
      fullPayload
    )

    const products = InventoryService.exportProductsData()
    const stock = InventoryService.exportCurrentStockData()
    const customers = customerRepository.list().map((c) => ({
      ID: c.id,
      Name: c.name,
      Phone: c.phone ?? "",
      "Store credit (paisa)": c.storeCreditPaisa ?? 0,
    }))
    const invoices = (await invoiceRepository.list()).map((s) => ({
      Invoice: s.invoiceId,
      Customer: s.customerName,
      Status: s.paymentStatus ?? "",
      "Total (paisa)": s.totals.total,
      Created: s.createdAt,
    }))
    const journals = journalRepository.list().map((j) => ({
      ID: j.id,
      Reference: `${j.referenceType}:${j.referenceId}`,
      Date: j.date || j.createdAt,
      Description: j.description ?? "",
      Lines: j.lines.length,
    }))

    await ExcelReportExporter.download(
      excelPayload(
        "Full Business Export",
        actor.storeName || "Store",
        actor.storeId ?? null,
        [
          sheetFromRows("Products", products),
          sheetFromRows("Customers", customers),
          sheetFromRows("Invoices", invoices),
          sheetFromRows("Stock", stock),
          sheetFromRows("Journals", journals),
        ]
      ),
      backupFilename("full-business", "xlsx", actor.storeId)
    )

    await recordExport("full_business", actor, fullPayload.manifest.counts)
    return fullPayload.manifest
  }

  static async run(kind: BackupKind, actor: BackupActor) {
    switch (kind) {
      case "database":
        return this.exportDatabase(actor)
      case "products":
        return this.exportProducts(actor)
      case "customers":
        return this.exportCustomers(actor)
      case "invoices":
        return this.exportInvoices(actor)
      case "inventory":
        return this.exportInventory(actor)
      case "accounting":
        return this.exportAccounting(actor)
      case "full_business":
        return this.exportFullBusiness(actor)
      default: {
        const _exhaustive: never = kind
        throw new Error(`Unknown backup kind: ${_exhaustive}`)
      }
    }
  }
}
