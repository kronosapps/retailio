import { CHART_OF_ACCOUNTS } from "@/modules/accounting/chartOfAccounts"
import { listLedgerEntries, getBankingStore } from "@/modules/banking/bankingStore"
import { MasterDataService } from "@/modules/masterData/MasterDataService"
import { getPaymentSettings } from "@/modules/payment/settings/paymentSettings"
import { brandRepository } from "@/repositories/BrandRepository"
import { businessDayRepository } from "@/repositories/BusinessDayRepository"
import { cashierShiftRepository } from "@/repositories/CashierShiftRepository"
import { categoryRepository } from "@/repositories/CategoryRepository"
import { creditNoteRepository } from "@/repositories/CreditNoteRepository"
import { customerRepository } from "@/repositories/CustomerRepository"
import { expenseRepository } from "@/repositories/ExpenseRepository"
import { goodsReceiptRepository } from "@/repositories/GoodsReceiptRepository"
import { inventoryLotRepository } from "@/repositories/InventoryLotRepository"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"
import { inventoryRepository } from "@/repositories/InventoryRepository"
import { invoiceRepository } from "@/repositories/InvoiceRepository"
import { journalRepository } from "@/repositories/JournalRepository"
import { paymentRepository } from "@/repositories/PaymentRepository"
import {
  couponRepository,
  priceHistoryRepository,
  promotionRepository,
} from "@/repositories/PricingRepository"
import { productRepository } from "@/repositories/ProductRepository"
import { purchaseOrderRepository } from "@/repositories/PurchaseOrderRepository"
import { purchaseReturnRepository } from "@/repositories/PurchaseReturnRepository"
import { refundRepository } from "@/repositories/RefundRepository"
import { salesReturnRepository } from "@/repositories/SalesReturnRepository"
import { saleTransactionRepository } from "@/repositories/SaleTransactionRepository"
import { stockTakeRepository } from "@/repositories/StockTakeRepository"
import { storeSettingsRepository } from "@/repositories/StoreSettingsRepository"
import { supplierInvoiceRepository } from "@/repositories/SupplierInvoiceRepository"
import { supplierPaymentRepository } from "@/repositories/SupplierPaymentRepository"
import { supplierRepository } from "@/repositories/SupplierRepository"
import { unitRepository } from "@/repositories/UnitRepository"
import { opsAuditRepository } from "@/repositories/OpsAuditRepository"

import type { BackupActor, BackupManifest, DatabaseBackupPayload } from "./types"
import { BACKUP_FORMAT_VERSION } from "./types"

/** Ops noise — never treat as business restore source. */
export const BACKUP_EXCLUDED_KEYS = [
  "retailos.sync.queue.v1",
  "retailos.sync.deadletter.v1",
  "retailos.sync.meta.v1",
  "retailos.events.log.v1",
  "retailos.auth.local",
]

/**
 * Best-effort hydrate of domain repos before snapshot.
 * Failures are ignored so offline devices still export local SOS.
 */
export async function hydrateForBackup(storeId?: string | null) {
  const tasks: Array<Promise<unknown>> = [
    customerRepository.hydrate(),
    supplierRepository.hydrate(),
    purchaseOrderRepository.hydrate(),
    goodsReceiptRepository.hydrate(),
    supplierInvoiceRepository.hydrate(),
    supplierPaymentRepository.hydrate(),
    purchaseReturnRepository.hydrate(),
    invoiceRepository.hydrateFromCloud(true),
    paymentRepository.hydrateFromCloud(true),
    refundRepository.hydrateFromCloud(true),
    inventoryLotRepository.hydrate(),
    stockTakeRepository.hydrate(),
    journalRepository.hydrate(),
    expenseRepository.hydrate(),
    cashierShiftRepository.hydrate(),
    businessDayRepository.hydrate(),
    salesReturnRepository.hydrate(),
    creditNoteRepository.hydrate(),
    promotionRepository.hydrate(),
    couponRepository.hydrate(),
    priceHistoryRepository.hydrate(),
    brandRepository.hydrate(),
    unitRepository.hydrate(),
    saleTransactionRepository.hydrate(),
    opsAuditRepository.hydrate(),
  ]
  if (storeId) {
    tasks.push(storeSettingsRepository.get(storeId))
  }
  await Promise.allSettled(tasks)
}

export async function collectDatabaseCollections(
  storeId?: string | null
): Promise<Record<string, unknown>> {
  const banking = getBankingStore()
  const settings = storeId
    ? storeSettingsRepository.getCached(storeId)
    : null

  const [invoices, payments, refunds] = await Promise.all([
    invoiceRepository.list(),
    paymentRepository.list(),
    refundRepository.list(),
  ])

  return {
    products: productRepository.list(),
    customers: customerRepository.list(),
    suppliers: supplierRepository.list({ includeInactive: true }),
    purchase_orders: purchaseOrderRepository.list(),
    goods_receipts: goodsReceiptRepository.list(),
    purchase_invoices: supplierInvoiceRepository.list(),
    supplier_payments: supplierPaymentRepository.list(),
    purchase_returns: purchaseReturnRepository.list(),
    invoices,
    payments,
    refunds,
    inventory: inventoryRepository.list(),
    inventory_lots: inventoryLotRepository.list(),
    inventory_movements: inventoryMovementRepository.list(),
    stock_takes: stockTakeRepository.list(),
    journal_entries: journalRepository.list(),
    expenses: expenseRepository.list(),
    cashier_shifts: cashierShiftRepository.list(),
    business_days: businessDayRepository.list(),
    sales_returns: salesReturnRepository.list(),
    credit_notes: creditNoteRepository.list(),
    sale_transactions: saleTransactionRepository.list(),
    promotions: promotionRepository.list(),
    coupons: couponRepository.list(),
    price_history: priceHistoryRepository.list(),
    categories: categoryRepository.list(),
    brands: brandRepository.list(),
    units: unitRepository.list(),
    tax_rates: MasterDataService.listTaxRates(),
    payment_methods: MasterDataService.listPaymentMethods(),
    payment_settings: getPaymentSettings(),
    store_settings: settings,
    banking: {
      opening: banking.opening,
      entries: listLedgerEntries(),
    },
    ops_audit: opsAuditRepository.list(),
  }
}

export function countCollections(
  collections: Record<string, unknown>
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(collections)) {
    if (Array.isArray(value)) counts[key] = value.length
    else if (value && typeof value === "object") {
      const entries = (value as { entries?: unknown[] }).entries
      counts[key] = Array.isArray(entries) ? entries.length : 1
    } else {
      counts[key] = value == null ? 0 : 1
    }
  }
  return counts
}

export async function buildDatabaseBackup(
  actor: BackupActor
): Promise<DatabaseBackupPayload> {
  await hydrateForBackup(actor.storeId)
  const collections = await collectDatabaseCollections(actor.storeId)
  const counts = countCollections(collections)
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    kind: "database",
    exportedAt: new Date().toISOString(),
    storeId: actor.storeId ?? null,
    storeName: actor.storeName ?? null,
    counts,
    notes: [
      "Firestore is source of truth when configured; this file mirrors hydrated local + cloud data.",
      "Google Sheets is sync/reporting only — not included and not a restore source.",
      "Sync queue, event log, and auth session keys are excluded.",
    ],
  }
  return {
    manifest,
    collections,
    meta: {
      chartOfAccounts: CHART_OF_ACCOUNTS,
      excluded: BACKUP_EXCLUDED_KEYS,
    },
  }
}
