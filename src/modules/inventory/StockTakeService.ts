import { InventoryService, InventoryError } from "@/modules/inventory"
import { stockTakeRepository } from "@/repositories/StockTakeRepository"
import type { StockTakeRecord } from "@/data/stockTakes"

export class StockTakeError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: StockTakeError["code"], message: string) {
    super(message)
    this.name = "StockTakeError"
    this.code = code
  }
}

export type StartStockTakeInput = {
  notes?: string | null
  /** If omitted, seed lines from current stock (active products). */
  skus?: string[]
  storeId?: string | null
  actorId?: string | null
}

/**
 * Physical stock count → variance → post adjustments + lot updates.
 */
export class StockTakeService {
  static list(): StockTakeRecord[] {
    return stockTakeRepository.list()
  }

  static getById(id: string): StockTakeRecord | null {
    return stockTakeRepository.getById(id)
  }

  static hydrate() {
    return stockTakeRepository.hydrate()
  }

  static async startDraft(
    input: StartStockTakeInput = {}
  ): Promise<StockTakeRecord> {
    const stock = InventoryService.getAllStock({ includeInactive: false })
    const wanted = input.skus?.length
      ? new Set(input.skus.map((s) => s.trim().toUpperCase()))
      : null
    const lines = stock
      .filter((row) => !wanted || wanted.has(row.sku.toUpperCase()))
      .map((row) => ({
        sku: row.sku,
        productName: row.name,
        systemQty: row.quantity,
        countedQty: row.quantity,
        notes: null as string | null,
      }))

    if (!lines.length) {
      throw new StockTakeError(
        "VALIDATION",
        "No stock rows to count. Add products first."
      )
    }

    return stockTakeRepository.createDraft({
      notes: input.notes,
      lines,
      storeId: input.storeId,
      actorId: input.actorId,
    })
  }

  static async updateCounts(
    takeId: string,
    counts: Array<{ sku: string; countedQty: number; notes?: string | null }>,
    actorId: string | null = null
  ): Promise<StockTakeRecord> {
    const existing = stockTakeRepository.getById(takeId)
    if (!existing) {
      throw new StockTakeError("NOT_FOUND", "Stock take not found.")
    }
    if (existing.status !== "DRAFT") {
      throw new StockTakeError(
        "INVALID_STATUS",
        "Only draft stock takes can be edited."
      )
    }

    const bySku = new Map(
      counts.map((c) => [c.sku.trim().toUpperCase(), c])
    )
    const lines = existing.lines.map((line) => {
      const upd = bySku.get(line.sku)
      if (!upd) return line
      const countedQty = Math.max(0, Number(upd.countedQty) || 0)
      return {
        ...line,
        countedQty,
        varianceQty: countedQty - line.systemQty,
        notes: upd.notes !== undefined ? upd.notes?.trim() || null : line.notes,
      }
    })

    return stockTakeRepository.save({
      ...existing,
      lines,
      updatedBy: actorId,
    })
  }

  static async post(
    takeId: string,
    opts: { actorId?: string | null; actorName?: string | null } = {}
  ): Promise<StockTakeRecord> {
    const existing = stockTakeRepository.getById(takeId)
    if (!existing) {
      throw new StockTakeError("NOT_FOUND", "Stock take not found.")
    }
    if (existing.status === "POSTED") return existing
    if (existing.status !== "DRAFT") {
      throw new StockTakeError(
        "INVALID_STATUS",
        "Only draft stock takes can be posted."
      )
    }

    try {
      for (const line of existing.lines) {
        if (line.varianceQty === 0) continue
        if (line.varianceQty > 0) {
          await InventoryService.addStock({
            sku: line.sku,
            quantity: line.varianceQty,
            type: "ADJUSTMENT_IN",
            reason: `Stock take ${existing.takeNumber}`,
            referenceId: existing.id,
            notes: line.notes,
            actorId: opts.actorId ?? existing.createdBy,
            actorName: opts.actorName ?? null,
            storeId: existing.storeId,
          })
        } else {
          await InventoryService.removeStock({
            sku: line.sku,
            quantity: Math.abs(line.varianceQty),
            type: "ADJUSTMENT_OUT",
            reason: `Stock take ${existing.takeNumber}`,
            referenceId: existing.id,
            notes: line.notes,
            actorId: opts.actorId ?? existing.createdBy,
            actorName: opts.actorName ?? null,
            storeId: existing.storeId,
          })
        }
      }
    } catch (err) {
      if (err instanceof InventoryError) {
        throw new StockTakeError("VALIDATION", err.message)
      }
      throw err
    }

    const now = new Date().toISOString()
    return stockTakeRepository.save(
      {
        ...existing,
        status: "POSTED",
        postedAt: now,
        updatedBy: opts.actorId ?? existing.updatedBy,
      },
      true
    )
  }

  static async cancel(
    takeId: string,
    actorId: string | null = null
  ): Promise<StockTakeRecord> {
    const existing = stockTakeRepository.getById(takeId)
    if (!existing) {
      throw new StockTakeError("NOT_FOUND", "Stock take not found.")
    }
    if (existing.status === "CANCELLED") return existing
    if (existing.status !== "DRAFT") {
      throw new StockTakeError(
        "INVALID_STATUS",
        "Only draft stock takes can be cancelled."
      )
    }
    return stockTakeRepository.save({
      ...existing,
      status: "CANCELLED",
      updatedBy: actorId,
    })
  }
}

export type { StockTakeRecord }
