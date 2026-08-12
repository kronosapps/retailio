import {
  getLocalSalesReturn,
  listLocalSalesReturns,
  nextSalesReturnNumber,
  upsertLocalSalesReturn,
  type ExchangeLine,
  type SalesReturnLine,
  type SalesReturnRecord,
  type SalesReturnSettlement,
} from "@/data/salesReturns"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.SALES_RETURNS

export type {
  ExchangeLine,
  SalesReturnLine,
  SalesReturnRecord,
  SalesReturnSettlement,
}

export type CreateSalesReturnDraftInput = {
  invoiceId: string
  settlement: SalesReturnSettlement
  customerId?: string | null
  customerName?: string
  reason?: string | null
  notes?: string | null
  restock?: boolean
  lines: SalesReturnLine[]
  exchangeLines?: ExchangeLine[]
  subtotalPaisa: number
  gstPaisa: number
  totalPaisa: number
  exchangeTotalPaisa?: number
  storeId?: string | null
  actorId?: string | null
}

export class SalesReturnRepository {
  list(): SalesReturnRecord[] {
    return listLocalSalesReturns()
  }

  getById(id: string): SalesReturnRecord | null {
    return getLocalSalesReturn(id)
  }

  listForInvoice(invoiceId: string): SalesReturnRecord[] {
    return this.list().filter((r) => r.invoiceId === invoiceId)
  }

  async hydrate(): Promise<SalesReturnRecord[]> {
    const remote = await listDocuments<SalesReturnRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalSalesReturn(row)
      }
    }
    return this.list()
  }

  async createDraft(
    input: CreateSalesReturnDraftInput
  ): Promise<SalesReturnRecord> {
    const now = new Date().toISOString()
    const exchangeTotal = Math.max(
      0,
      Math.round(input.exchangeTotalPaisa || 0)
    )
    const total = Math.max(0, Math.round(input.totalPaisa))
    const record: SalesReturnRecord = {
      id: createId("srn"),
      returnNumber: nextSalesReturnNumber(),
      invoiceId: input.invoiceId,
      status: "DRAFT",
      settlement: input.settlement,
      customerId: input.customerId ?? null,
      customerName: input.customerName?.trim() || "Walk-in",
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      restock: input.restock !== false,
      lines: input.lines,
      exchangeLines: input.exchangeLines || [],
      subtotalPaisa: Math.max(0, Math.round(input.subtotalPaisa)),
      gstPaisa: Math.max(0, Math.round(input.gstPaisa)),
      totalPaisa: total,
      exchangeTotalPaisa: exchangeTotal,
      netDeltaPaisa: exchangeTotal - total,
      refundId: null,
      creditNoteId: null,
      exchangeInvoiceId: null,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      postedAt: null,
    }
    const saved = await this.persist(record, "created")
    return saved
  }

  async save(
    record: SalesReturnRecord,
    event: "updated" | "posted" = "updated"
  ): Promise<SalesReturnRecord> {
    return this.persist(
      { ...record, updatedAt: new Date().toISOString() },
      event
    )
  }

  private async persist(
    record: SalesReturnRecord,
    event: "created" | "updated" | "posted"
  ): Promise<SalesReturnRecord> {
    const next = upsertLocalSalesReturn(record)
    await upsertDocument(COLLECTION, next.id, next)
    const type =
      event === "created"
        ? EventTypes.SALE_RETURN_CREATED
        : event === "posted"
          ? EventTypes.SALE_RETURN_POSTED
          : EventTypes.SALE_RETURN_UPDATED
    await EventPublisher.publish(
      type,
      {
        id: next.id,
        returnNumber: next.returnNumber,
        invoiceId: next.invoiceId,
        status: next.status,
        settlement: next.settlement,
        totalPaisa: next.totalPaisa,
        exchangeTotalPaisa: next.exchangeTotalPaisa,
        netDeltaPaisa: next.netDeltaPaisa,
        restock: next.restock,
        refundId: next.refundId,
        creditNoteId: next.creditNoteId,
        exchangeInvoiceId: next.exchangeInvoiceId,
        storeId: next.storeId,
        postedAt: next.postedAt,
        customerId: next.customerId,
      },
      next.storeId
    )
    return next
  }
}

export const salesReturnRepository = new SalesReturnRepository()
