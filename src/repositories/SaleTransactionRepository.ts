import {
  getLocalSaleTransaction,
  getLocalSaleTransactionByInvoice,
  listLocalSaleTransactions,
  upsertLocalSaleTransaction,
} from "@/data/saleTransactions"
import { COLLECTIONS } from "@/core/firebase/collections"
import { createId } from "@/utils/id"
import {
  emptySaleSteps,
  type BeginSaleTransactionInput,
  type SaleTransactionRecord,
  type SaleTransactionStatus,
} from "@/modules/saleTransaction/types"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.SALE_TRANSACTIONS

/** Happy-path + recovery edges. Failed can re-enter for retryStock. */
const ALLOWED: Partial<
  Record<SaleTransactionStatus, SaleTransactionStatus[]>
> = {
  CheckoutStarted: ["InvoicePending", "InvoiceCreated", "Failed", "Cancelled"],
  InvoicePending: ["InvoiceCreated", "Failed", "Cancelled"],
  InvoiceCreated: [
    "PaymentPending",
    "PaymentConfirmed",
    "Failed",
    "Cancelled",
  ],
  PaymentPending: [
    "PaymentConfirmed",
    "Failed",
    "Cancelled",
    "InvoiceFinalized", // race: inventory before payment engine
    "StockFinalized",
  ],
  PaymentConfirmed: ["InvoiceFinalized", "StockFinalized", "Failed"],
  InvoiceFinalized: ["StockFinalized", "Completed", "Failed"],
  StockFinalized: ["Completed", "Failed"],
  Failed: [
    "PaymentPending",
    "PaymentConfirmed",
    "InvoiceFinalized",
    "StockFinalized",
    "Completed",
    "Cancelled",
  ],
  Completed: [],
  Cancelled: [],
}

export class SaleTransactionRepository {
  list(): SaleTransactionRecord[] {
    return listLocalSaleTransactions()
  }

  getById(id: string): SaleTransactionRecord | null {
    return getLocalSaleTransaction(id)
  }

  getByInvoiceId(invoiceId: string): SaleTransactionRecord | null {
    return getLocalSaleTransactionByInvoice(invoiceId)
  }

  async begin(input: BeginSaleTransactionInput): Promise<SaleTransactionRecord> {
    const now = new Date().toISOString()
    const record: SaleTransactionRecord = {
      id: createId("stx"),
      status: "CheckoutStarted",
      invoiceId: null,
      paymentId: null,
      posLaneId: input.posLaneId ?? null,
      storeId: input.storeId ?? null,
      cashierId: input.cashierId ?? null,
      cashierName: input.cashierName ?? null,
      customerName: input.customerName ?? null,
      amountPaisa: input.amountPaisa ?? null,
      failureReason: null,
      steps: {
        ...emptySaleSteps(),
        checkoutStartedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    }
    return this.persist(record)
  }

  async save(record: SaleTransactionRecord): Promise<SaleTransactionRecord> {
    const next = { ...record, updatedAt: new Date().toISOString() }
    return this.persist(next)
  }

  async advance(
    id: string,
    status: SaleTransactionStatus,
    patch: Partial<SaleTransactionRecord> = {}
  ): Promise<SaleTransactionRecord | null> {
    const existing = getLocalSaleTransaction(id)
    if (!existing) return null
    if (existing.status === status) {
      // Idempotent re-entry — still apply patch (e.g. paymentId).
      if (Object.keys(patch).length === 0) return existing
      return this.persist({
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      })
    }
    const allowed = ALLOWED[existing.status] ?? []
    if (!allowed.includes(status)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[SaleTransaction] blocked ${existing.status} → ${status}`,
          id
        )
      }
      return existing
    }
    const now = new Date().toISOString()
    const steps = { ...existing.steps }
    switch (status) {
      case "InvoicePending":
        steps.invoicePendingAt = steps.invoicePendingAt || now
        break
      case "InvoiceCreated":
        steps.invoiceCreatedAt = steps.invoiceCreatedAt || now
        break
      case "PaymentPending":
        steps.paymentPendingAt = steps.paymentPendingAt || now
        break
      case "PaymentConfirmed":
        steps.paymentConfirmedAt = steps.paymentConfirmedAt || now
        break
      case "InvoiceFinalized":
        steps.invoiceFinalizedAt = steps.invoiceFinalizedAt || now
        break
      case "StockFinalized":
        steps.stockFinalizedAt = steps.stockFinalizedAt || now
        break
      case "Completed":
        steps.completedAt = steps.completedAt || now
        break
      case "Failed":
        steps.failedAt = steps.failedAt || now
        break
      case "Cancelled":
        steps.cancelledAt = steps.cancelledAt || now
        break
      default:
        break
    }
    return this.persist({
      ...existing,
      ...patch,
      status,
      steps,
      updatedAt: now,
    })
  }

  async hydrate(): Promise<SaleTransactionRecord[]> {
    const remote = await listDocuments<SaleTransactionRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalSaleTransaction(row)
      }
    }
    return this.list()
  }

  private async persist(
    record: SaleTransactionRecord
  ): Promise<SaleTransactionRecord> {
    upsertLocalSaleTransaction(record)
    await upsertDocument(COLLECTION, record.id, record)
    return record
  }
}

export const saleTransactionRepository = new SaleTransactionRepository()
