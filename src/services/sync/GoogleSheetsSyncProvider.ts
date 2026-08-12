import {
  getGoogleScriptUrl,
  postToGoogleSheets,
} from "@/googleSheets/GoogleSheetsClient"
import { getPaymentSettings } from "@/modules/payment/settings/paymentSettings"

import { sheetUpsertKeyField } from "./syncIdempotency"
import type { SyncProvider } from "./SyncProvider"

function asRecord(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return { value: data }
}

function resolveScriptUrl(explicit?: string): string {
  const fromEnv = getGoogleScriptUrl()
  if (fromEnv) return fromEnv
  // Backward-compatible fallback (legacy Payment Settings field)
  return getPaymentSettings().sheetsWebhookUrl?.trim() || explicit?.trim() || ""
}

/**
 * SyncProvider implementation for Google Apps Script → Sheets.
 * Primary URL: VITE_GOOGLE_SCRIPT_URL (never hardcoded).
 * Prefer upsert by business key so retries do not duplicate rows.
 */
export class GoogleSheetsSyncProvider implements SyncProvider {
  readonly id = "google-sheets"
  readonly name = "Google Sheets"
  private readonly scriptUrl: string

  constructor(scriptUrl = resolveScriptUrl()) {
    this.scriptUrl = scriptUrl
  }

  isConfigured(): boolean {
    return Boolean(resolveScriptUrl(this.scriptUrl))
  }

  private async send(sheet: string, data: unknown) {
    const url = resolveScriptUrl(this.scriptUrl)
    if (!url) {
      // Quiet skip when unset — local POS still works.
      return
    }
    const keyField = sheetUpsertKeyField(sheet)
    const record = asRecord(data)
    if (keyField && record[keyField] != null && record[keyField] !== "") {
      await postToGoogleSheets(url, {
        action: "upsert",
        sheet,
        data: record,
        keyField,
      })
      return
    }
    await postToGoogleSheets(url, {
      action: "insert",
      sheet,
      data: record,
    })
  }

  private async sendBatch(sheet: string, rows: unknown[]) {
    const url = resolveScriptUrl(this.scriptUrl)
    if (!url) return
    if (rows.length === 0) return

    const records = rows.map(asRecord)
    const keyField = sheetUpsertKeyField(sheet)
    if (keyField) {
      await postToGoogleSheets(url, {
        action: "batchUpsert",
        sheet,
        rows: records,
        keyField,
      })
      return
    }
    await postToGoogleSheets(url, {
      action: "batchInsert",
      sheet,
      rows: records,
    })
  }

  syncInvoice(data: unknown) {
    return this.send("Invoices", data)
  }

  syncPayment(data: unknown) {
    return this.send("Payments", data)
  }

  syncInventory(data: unknown) {
    return this.send("Inventory", data)
  }

  syncInventoryMovement(data: unknown) {
    return this.send("InventoryMovements", data)
  }

  syncProduct(data: unknown) {
    return this.send("Products", data)
  }

  syncCategory(data: unknown) {
    return this.send("Categories", data)
  }

  syncCustomer(data: unknown) {
    return this.send("Customers", data)
  }

  syncRefund(data: unknown) {
    return this.send("Refunds", data)
  }

  syncSupplier(data: unknown) {
    return this.send("Suppliers", data)
  }

  syncPurchaseOrder(data: unknown) {
    return this.send("PurchaseOrders", data)
  }

  syncGoodsReceipt(data: unknown) {
    return this.send("GoodsReceipts", data)
  }

  syncPurchaseInvoice(data: unknown) {
    return this.send("PurchaseInvoices", data)
  }

  syncSupplierPayment(data: unknown) {
    return this.send("SupplierPayments", data)
  }

  syncPurchaseReturn(data: unknown) {
    return this.send("PurchaseReturns", data)
  }

  syncExpense(data: unknown) {
    return this.send("Expenses", data)
  }

  syncCashierShift(data: unknown) {
    return this.send("CashierShifts", data)
  }

  syncBatch(sheet: string, rows: unknown[]) {
    return this.sendBatch(sheet, rows)
  }

  syncDailyClose(data: unknown) {
    return this.send("DailyClose", data)
  }
}

export const googleSheetsSyncProvider = new GoogleSheetsSyncProvider()
