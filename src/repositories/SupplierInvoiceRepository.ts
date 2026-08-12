import {
  getLocalPurchaseInvoice,
  listLocalPurchaseInvoices,
  nextPurchaseInvoiceNumber,
  upsertLocalPurchaseInvoice,
  type CreatePurchaseInvoiceInput,
  type PurchaseInvoiceRecord,
} from "@/data/purchaseInvoices"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.PURCHASE_INVOICES

export type { CreatePurchaseInvoiceInput, PurchaseInvoiceRecord }

/**
 * Owns `purchase_invoices` (+ local fallback).
 * Does not touch inventory — GRN posting owns stock-in.
 */
export class SupplierInvoiceRepository {
  list(): PurchaseInvoiceRecord[] {
    return listLocalPurchaseInvoices()
  }

  getById(id: string): PurchaseInvoiceRecord | null {
    return getLocalPurchaseInvoice(id)
  }

  async hydrate(): Promise<PurchaseInvoiceRecord[]> {
    const remote = await listDocuments<PurchaseInvoiceRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalPurchaseInvoice(row)
      }
    }
    return this.list()
  }

  async createDraft(
    input: CreatePurchaseInvoiceInput
  ): Promise<PurchaseInvoiceRecord> {
    const now = new Date().toISOString()
    const lines = input.lines.map((l) => {
      const qty = Number(l.quantity)
      const unit = Math.round(Number(l.unitCostPaisa))
      return {
        sku: l.sku.trim().toUpperCase(),
        productName: (l.productName || l.sku).trim(),
        quantity: qty,
        unitCostPaisa: unit,
        lineTotalPaisa: Math.round(qty * unit),
        goodsReceiptId: l.goodsReceiptId,
      }
    })
    const total = lines.reduce((s, l) => s + l.lineTotalPaisa, 0)
    const record: PurchaseInvoiceRecord = {
      id: createId("pin"),
      invoiceNumber: nextPurchaseInvoiceNumber(),
      supplierBillNumber: input.supplierBillNumber?.trim() || null,
      supplierId: input.supplierId,
      supplierName: input.supplierName.trim(),
      goodsReceiptIds: [...input.goodsReceiptIds],
      purchaseOrderId: input.purchaseOrderId ?? null,
      billDate: input.billDate || now.slice(0, 10),
      dueAt: input.dueAt ?? null,
      notes: input.notes?.trim() || null,
      lines,
      subtotalPaisa: total,
      totalPaisa: total,
      amountPaidPaisa: 0,
      status: "DRAFT",
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      postedAt: null,
    }
    return this.persist(record, "created")
  }

  async save(
    record: PurchaseInvoiceRecord,
    event: "updated" | "posted" | "created" = "updated"
  ): Promise<PurchaseInvoiceRecord> {
    const next = {
      ...record,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, event)
  }

  private async persist(
    record: PurchaseInvoiceRecord,
    event: "created" | "updated" | "posted"
  ): Promise<PurchaseInvoiceRecord> {
    const next = upsertLocalPurchaseInvoice(record)
    await upsertDocument(COLLECTION, next.id, next)
    const type =
      event === "created"
        ? EventTypes.PURCHASE_INVOICE_CREATED
        : event === "posted"
          ? EventTypes.PURCHASE_INVOICE_POSTED
          : EventTypes.PURCHASE_INVOICE_UPDATED
    await EventPublisher.publish(type, toSheetsPayload(next), next.storeId)
    return next
  }
}

function toSheetsPayload(record: PurchaseInvoiceRecord) {
  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber,
    supplierBillNumber: record.supplierBillNumber,
    supplierId: record.supplierId,
    supplierName: record.supplierName,
    goodsReceiptIds: record.goodsReceiptIds.join(","),
    status: record.status,
    billDate: record.billDate,
    totalPaisa: record.totalPaisa,
    amountPaidPaisa: record.amountPaidPaisa,
    storeId: record.storeId,
    postedAt: record.postedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export const supplierInvoiceRepository = new SupplierInvoiceRepository()
