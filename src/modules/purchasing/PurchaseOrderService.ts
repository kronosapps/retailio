import { ProductService } from "@/modules/products"
import { SupplierService } from "@/modules/supplier"
import {
  derivePoStatus,
  remainingQty,
  type PurchaseOrderLine,
  type PurchaseOrderRecord,
} from "@/data/purchaseOrders"
import {
  purchaseOrderRepository,
  type CreatePurchaseOrderInput,
} from "@/repositories/PurchaseOrderRepository"

export class PurchaseOrderError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS"

  constructor(code: PurchaseOrderError["code"], message: string) {
    super(message)
    this.name = "PurchaseOrderError"
    this.code = code
  }
}

export type CreatePoInput = {
  supplierId: string
  expectedAt?: string | null
  notes?: string | null
  lines: Array<{
    sku: string
    quantityOrdered: number
    unitCostRupees?: number | null
    notes?: string | null
  }>
  storeId?: string | null
  actorId?: string | null
  /** If true, create as ISSUED immediately. */
  issue?: boolean
}

/**
 * Purchase order master — intent to buy. Does not change stock.
 */
export class PurchaseOrderService {
  static list(): PurchaseOrderRecord[] {
    return purchaseOrderRepository.list()
  }

  static getById(id: string): PurchaseOrderRecord | null {
    return purchaseOrderRepository.getById(id)
  }

  static hydrate() {
    return purchaseOrderRepository.hydrate()
  }

  /** Issued / partial POs available for goods receipt. */
  static listOpenForReceiving(supplierId?: string | null): PurchaseOrderRecord[] {
    return this.list().filter((po) => {
      if (po.status !== "ISSUED" && po.status !== "PARTIAL") return false
      if (supplierId && po.supplierId !== supplierId) return false
      return po.lines.some((l) => remainingQty(l) > 0)
    })
  }

  static remainingForSku(po: PurchaseOrderRecord, sku: string): number {
    const line = po.lines.find((l) => l.sku === sku.trim().toUpperCase())
    return line ? remainingQty(line) : 0
  }

  static async create(input: CreatePoInput): Promise<PurchaseOrderRecord> {
    const supplier = SupplierService.getById(input.supplierId)
    if (!supplier || !supplier.active) {
      throw new PurchaseOrderError("VALIDATION", "Select an active supplier.")
    }

    const lines = this.validateOrderLines(input.lines)
    const draftInput: CreatePurchaseOrderInput = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      expectedAt: input.expectedAt,
      notes: input.notes,
      lines,
      storeId: input.storeId ?? supplier.storeId,
      actorId: input.actorId,
    }

    const draft = await purchaseOrderRepository.createDraft(draftInput)
    if (input.issue) {
      return this.issue(draft.id, input.actorId ?? null)
    }
    return draft
  }

  static async issue(
    poId: string,
    actorId: string | null = null
  ): Promise<PurchaseOrderRecord> {
    const existing = purchaseOrderRepository.getById(poId)
    if (!existing) {
      throw new PurchaseOrderError("NOT_FOUND", "Purchase order not found.")
    }
    if (existing.status !== "DRAFT") {
      throw new PurchaseOrderError(
        "INVALID_STATUS",
        "Only draft purchase orders can be issued."
      )
    }
    if (!existing.lines.length) {
      throw new PurchaseOrderError(
        "VALIDATION",
        "Add at least one line before issuing."
      )
    }

    const now = new Date().toISOString()
    return purchaseOrderRepository.save(
      {
        ...existing,
        status: "ISSUED",
        orderedAt: now,
        issuedAt: now,
        updatedBy: actorId,
      },
      "issued"
    )
  }

  static async cancel(
    poId: string,
    actorId: string | null = null
  ): Promise<PurchaseOrderRecord> {
    const existing = purchaseOrderRepository.getById(poId)
    if (!existing) {
      throw new PurchaseOrderError("NOT_FOUND", "Purchase order not found.")
    }
    if (existing.status === "RECEIVED") {
      throw new PurchaseOrderError(
        "INVALID_STATUS",
        "Fully received purchase orders cannot be cancelled."
      )
    }
    if (existing.status === "CANCELLED") return existing

    const now = new Date().toISOString()
    return purchaseOrderRepository.save(
      {
        ...existing,
        status: "CANCELLED",
        cancelledAt: now,
        updatedBy: actorId,
      },
      "updated"
    )
  }

  /**
   * Apply received quantities after a GRN against this PO is posted.
   * Over-receipt is rejected by the caller before stock is applied.
   */
  static async applyReceipt(
    poId: string,
    receivedLines: Array<{ sku: string; quantity: number }>,
    actorId: string | null = null
  ): Promise<PurchaseOrderRecord> {
    const existing = purchaseOrderRepository.getById(poId)
    if (!existing) {
      throw new PurchaseOrderError("NOT_FOUND", "Purchase order not found.")
    }
    if (existing.status !== "ISSUED" && existing.status !== "PARTIAL") {
      throw new PurchaseOrderError(
        "INVALID_STATUS",
        "Goods can only be received against issued or partially received POs."
      )
    }

    const lines: PurchaseOrderLine[] = existing.lines.map((l) => ({ ...l }))
    for (const recv of receivedLines) {
      const sku = recv.sku.trim().toUpperCase()
      const line = lines.find((l) => l.sku === sku)
      if (!line) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `SKU ${sku} is not on purchase order ${existing.poNumber}.`
        )
      }
      const remaining = remainingQty(line)
      if (recv.quantity > remaining) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `Over-receipt blocked for ${sku}: ordered ${line.quantityOrdered}, already received ${line.quantityReceived}, remaining ${remaining}, tried ${recv.quantity}.`
        )
      }
      line.quantityReceived += recv.quantity
    }

    const status = derivePoStatus(lines, existing.status)
    return purchaseOrderRepository.save(
      {
        ...existing,
        lines,
        status,
        updatedBy: actorId,
      },
      "updated"
    )
  }

  private static validateOrderLines(lines: CreatePoInput["lines"]) {
    if (!lines.length) {
      throw new PurchaseOrderError(
        "VALIDATION",
        "Add at least one product line."
      )
    }
    const seen = new Set<string>()
    const normalized = []

    for (const line of lines) {
      const sku = line.sku.trim().toUpperCase()
      if (!sku) {
        throw new PurchaseOrderError("VALIDATION", "SKU is required.")
      }
      if (seen.has(sku)) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `Duplicate SKU on PO: ${sku}.`
        )
      }
      seen.add(sku)

      const qty = Number(line.quantityOrdered)
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `Ordered quantity for ${sku} must be positive.`
        )
      }

      const product = ProductService.getById(sku)
      if (!product) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `Unknown product SKU: ${sku}.`
        )
      }
      if (!product.active) {
        throw new PurchaseOrderError(
          "VALIDATION",
          `Product ${sku} is inactive.`
        )
      }

      let unitCostRupees: number | null = null
      if (line.unitCostRupees != null) {
        const n = Number(line.unitCostRupees)
        if (!Number.isFinite(n) || n < 0) {
          throw new PurchaseOrderError(
            "VALIDATION",
            `Unit cost for ${sku} cannot be negative.`
          )
        }
        unitCostRupees = n
      }

      normalized.push({
        sku,
        productName: product.name,
        quantityOrdered: qty,
        unitCostRupees,
        notes: line.notes?.trim() || null,
      })
    }

    return normalized
  }
}

export type { PurchaseOrderRecord }
export { remainingQty }
