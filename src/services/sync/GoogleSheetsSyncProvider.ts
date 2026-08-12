import {
  getGoogleScriptUrl,
  postToGoogleSheets,
} from "@/googleSheets/GoogleSheetsClient"
import { getPaymentSettings } from "@/modules/payment/settings/paymentSettings"

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
    await postToGoogleSheets(url, {
      action: "insert",
      sheet,
      data: asRecord(data),
    })
  }

  private async sendBatch(sheet: string, rows: unknown[]) {
    const url = resolveScriptUrl(this.scriptUrl)
    if (!url) return
    if (rows.length === 0) return

    const records = rows.map(asRecord)
    // Prefer one batch POST; Apps Script falls back to per-row if needed.
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

  syncGoodsReceipt(data: unknown) {
    return this.send("GoodsReceipts", data)
  }

  syncExpense(data: unknown) {
    return this.send("Expenses", data)
  }

  syncBatch(sheet: string, rows: unknown[]) {
    return this.sendBatch(sheet, rows)
  }

  syncDailyClose(data: unknown) {
    return this.send("DailyClose", data)
  }
}

export const googleSheetsSyncProvider = new GoogleSheetsSyncProvider()
