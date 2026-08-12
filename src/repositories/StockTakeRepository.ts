import {
  getLocalStockTake,
  listLocalStockTakes,
  nextStockTakeNumber,
  upsertLocalStockTake,
  type CreateStockTakeInput,
  type StockTakeRecord,
} from "@/data/stockTakes"
import { COLLECTIONS } from "@/core/firebase/collections"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import { createId } from "@/utils/id"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.STOCK_TAKES

export type { CreateStockTakeInput, StockTakeRecord }

export class StockTakeRepository {
  list(): StockTakeRecord[] {
    return listLocalStockTakes()
  }

  getById(id: string): StockTakeRecord | null {
    return getLocalStockTake(id)
  }

  async hydrate(): Promise<StockTakeRecord[]> {
    const remote = await listDocuments<StockTakeRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        if (!row?.id) continue
        upsertLocalStockTake(row)
      }
    }
    return this.list()
  }

  async createDraft(input: CreateStockTakeInput): Promise<StockTakeRecord> {
    const now = new Date().toISOString()
    const lines = input.lines.map((l) => {
      const systemQty = Math.max(0, Number(l.systemQty) || 0)
      const countedQty = Math.max(0, Number(l.countedQty) || 0)
      return {
        sku: l.sku.trim().toUpperCase(),
        productName: (l.productName || l.sku).trim(),
        systemQty,
        countedQty,
        varianceQty: countedQty - systemQty,
        notes: l.notes?.trim() || null,
      }
    })
    const record: StockTakeRecord = {
      id: createId("st"),
      takeNumber: nextStockTakeNumber(),
      status: "DRAFT",
      countedAt: input.countedAt || now,
      notes: input.notes?.trim() || null,
      lines,
      storeId: input.storeId ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: input.actorId ?? null,
      updatedBy: input.actorId ?? null,
      postedAt: null,
    }
    return this.persist(record, false)
  }

  async save(
    record: StockTakeRecord,
    publishPosted = false
  ): Promise<StockTakeRecord> {
    return this.persist(
      { ...record, updatedAt: new Date().toISOString() },
      publishPosted
    )
  }

  private async persist(
    record: StockTakeRecord,
    publishPosted: boolean
  ): Promise<StockTakeRecord> {
    const next = upsertLocalStockTake(record)
    await upsertDocument(COLLECTION, next.id, next)
    if (publishPosted && next.status === "POSTED") {
      await EventPublisher.publish(
        EventTypes.STOCK_TAKE_POSTED,
        {
          id: next.id,
          takeNumber: next.takeNumber,
          status: next.status,
          lineCount: next.lines.length,
          varianceLines: next.lines.filter((l) => l.varianceQty !== 0).length,
          storeId: next.storeId,
          postedAt: next.postedAt,
        },
        next.storeId
      )
    }
    return next
  }
}

export const stockTakeRepository = new StockTakeRepository()
