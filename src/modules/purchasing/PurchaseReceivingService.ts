import { ProductService } from "@/modules/products"
import {
  InventoryError,
  InventoryService,
} from "@/modules/inventory"
import { SupplierService } from "@/modules/supplier"
import {
  goodsReceiptRepository,
  type CreateGoodsReceiptInput,
  type GoodsReceiptRecord,
} from "@/repositories/GoodsReceiptRepository"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"

import {
  PurchaseOrderService,
  remainingQty,
} from "./PurchaseOrderService"

export class PurchaseReceivingError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "ALREADY_POSTED" | "STOCK"

  constructor(code: PurchaseReceivingError["code"], message: string) {
    super(message)
    this.name = "PurchaseReceivingError"
    this.code = code
  }
}

export type PostAdHocGrnInput = {
  supplierId: string
  receivedAt?: string
  notes?: string | null
  lines: Array<{
    sku: string
    quantity: number
    unitCostRupees?: number | null
    notes?: string | null
  }>
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  /** If true, save draft only (no stock). Default posts immediately. */
  draftOnly?: boolean
}

export type ReceiveAgainstPoInput = {
  purchaseOrderId: string
  receivedAt?: string
  notes?: string | null
  /** Quantities to receive now (must be on the PO and ≤ remaining). */
  lines: Array<{
    sku: string
    quantity: number
    unitCostRupees?: number | null
    notes?: string | null
  }>
  actorId?: string | null
  actorName?: string | null
}

/**
 * Purchasing receiving — GRN posts stock via InventoryService.addStock.
 * Ad-hoc GRNs or GRNs linked to issued POs.
 */
export class PurchaseReceivingService {
  static list(): GoodsReceiptRecord[] {
    return goodsReceiptRepository.list()
  }

  static getById(id: string): GoodsReceiptRecord | null {
    return goodsReceiptRepository.getById(id)
  }

  static hydrate() {
    return goodsReceiptRepository.hydrate()
  }

  /**
   * Create and optionally post an ad-hoc GRN (no purchase order).
   */
  static async receiveAdHoc(
    input: PostAdHocGrnInput
  ): Promise<GoodsReceiptRecord> {
    const supplier = SupplierService.getById(input.supplierId)
    if (!supplier || !supplier.active) {
      throw new PurchaseReceivingError(
        "VALIDATION",
        "Select an active supplier."
      )
    }

    const normalizedLines = this.validateProductLines(input.lines)

    const draftInput: CreateGoodsReceiptInput = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      purchaseOrderId: null,
      receivedAt: input.receivedAt,
      notes: input.notes,
      lines: normalizedLines,
      storeId: input.storeId ?? supplier.storeId,
      actorId: input.actorId,
    }

    const draft = await goodsReceiptRepository.saveDraft(draftInput)
    if (input.draftOnly) return draft

    return this.post(draft.id, {
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
    })
  }

  /**
   * Receive against an issued/partial PO (over-receipt blocked).
   * Posts GRN + stock, then updates PO received quantities.
   */
  static async receiveAgainstPo(
    input: ReceiveAgainstPoInput
  ): Promise<GoodsReceiptRecord> {
    const po = PurchaseOrderService.getById(input.purchaseOrderId)
    if (!po) {
      throw new PurchaseReceivingError(
        "NOT_FOUND",
        "Purchase order not found."
      )
    }
    if (po.status !== "ISSUED" && po.status !== "PARTIAL") {
      throw new PurchaseReceivingError(
        "VALIDATION",
        `PO ${po.poNumber} is ${po.status} and cannot receive goods.`
      )
    }

    if (!input.lines.length) {
      throw new PurchaseReceivingError(
        "VALIDATION",
        "Add at least one product line."
      )
    }

    const normalizedLines = this.validateProductLines(input.lines)

    for (const line of normalizedLines) {
      const poLine = po.lines.find((l) => l.sku === line.sku)
      if (!poLine) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `SKU ${line.sku} is not on PO ${po.poNumber}.`
        )
      }
      const remaining = remainingQty(poLine)
      if (line.quantity > remaining) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `Over-receipt blocked for ${line.sku}: remaining ${remaining}, tried ${line.quantity}.`
        )
      }
      // Default unit cost from PO when not provided
      if (line.unitCostRupees == null && poLine.unitCostRupees != null) {
        line.unitCostRupees = poLine.unitCostRupees
      }
    }

    const draftInput: CreateGoodsReceiptInput = {
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      purchaseOrderId: po.id,
      receivedAt: input.receivedAt,
      notes: input.notes,
      lines: normalizedLines,
      storeId: po.storeId,
      actorId: input.actorId,
    }

    const draft = await goodsReceiptRepository.saveDraft(draftInput)
    return this.post(draft.id, {
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
    })
  }

  /** Post a draft GRN — applies stock once; updates linked PO when present. */
  static async post(
    grnId: string,
    opts: { actorId?: string | null; actorName?: string | null } = {}
  ): Promise<GoodsReceiptRecord> {
    const existing = goodsReceiptRepository.getById(grnId)
    if (!existing) {
      throw new PurchaseReceivingError("NOT_FOUND", "Goods receipt not found.")
    }
    if (existing.status === "POSTED") {
      throw new PurchaseReceivingError(
        "ALREADY_POSTED",
        "This goods receipt is already posted."
      )
    }
    if (existing.status === "CANCELLED") {
      throw new PurchaseReceivingError(
        "VALIDATION",
        "Cancelled goods receipts cannot be posted."
      )
    }

    // Re-validate PO remaining if linked (race / concurrent receipts)
    if (existing.purchaseOrderId) {
      const po = PurchaseOrderService.getById(existing.purchaseOrderId)
      if (!po) {
        throw new PurchaseReceivingError(
          "NOT_FOUND",
          "Linked purchase order not found."
        )
      }
      for (const line of existing.lines) {
        const poLine = po.lines.find((l) => l.sku === line.sku)
        if (!poLine) {
          throw new PurchaseReceivingError(
            "VALIDATION",
            `SKU ${line.sku} is not on PO ${po.poNumber}.`
          )
        }
        const remaining = remainingQty(poLine)
        if (line.quantity > remaining) {
          throw new PurchaseReceivingError(
            "VALIDATION",
            `Over-receipt blocked for ${line.sku}: remaining ${remaining}.`
          )
        }
      }
    }

    const prior = inventoryMovementRepository.findByReference(
      existing.id,
      "PURCHASE"
    )
    if (prior) {
      const now = new Date().toISOString()
      const posted = await goodsReceiptRepository.save({
        ...existing,
        status: "POSTED",
        postedAt: existing.postedAt || now,
        updatedBy: opts.actorId ?? existing.updatedBy,
      })
      // Stock already applied; update PO only if remaining still allows (idempotent).
      await this.applyPoReceiptIfNeeded(posted, opts.actorId ?? null)
      return posted
    }

    this.validateProductLines(existing.lines)

    try {
      for (const line of existing.lines) {
        await InventoryService.addStock({
          sku: line.sku,
          quantity: line.quantity,
          type: "PURCHASE",
          reason: `GRN ${existing.grnNumber}`,
          referenceId: existing.id,
          notes:
            [
              `Supplier: ${existing.supplierName}`,
              existing.purchaseOrderId
                ? `PO: ${PurchaseOrderService.getById(existing.purchaseOrderId)?.poNumber || existing.purchaseOrderId}`
                : "Ad-hoc",
              line.unitCostRupees != null
                ? `Unit cost ₹${line.unitCostRupees}`
                : null,
              line.notes,
              existing.notes,
            ]
              .filter(Boolean)
              .join(" · ") || null,
          actorId: opts.actorId ?? existing.createdBy,
          actorName: opts.actorName ?? null,
          storeId: existing.storeId,
        })
      }
    } catch (err) {
      if (err instanceof InventoryError) {
        throw new PurchaseReceivingError("STOCK", err.message)
      }
      throw err
    }

    const now = new Date().toISOString()
    const posted = await goodsReceiptRepository.save({
      ...existing,
      status: "POSTED",
      postedAt: now,
      updatedAt: now,
      updatedBy: opts.actorId ?? existing.updatedBy,
    })

    await this.applyPoReceiptIfNeeded(posted, opts.actorId ?? null)

    return posted
  }

  /** Apply PO received qty once — skip if remaining would be over-receipt (already applied). */
  private static async applyPoReceiptIfNeeded(
    posted: GoodsReceiptRecord,
    actorId: string | null
  ): Promise<void> {
    if (!posted.purchaseOrderId) return
    const po = PurchaseOrderService.getById(posted.purchaseOrderId)
    if (!po || po.status === "CANCELLED" || po.status === "RECEIVED") return

    const wouldOver = posted.lines.some((line) => {
      const poLine = po.lines.find((l) => l.sku === line.sku)
      return !poLine || line.quantity > remainingQty(poLine)
    })
    if (wouldOver) return

    await PurchaseOrderService.applyReceipt(
      posted.purchaseOrderId,
      posted.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
      actorId
    )
  }

  private static validateProductLines(
    lines: Array<{
      sku: string
      quantity: number
      unitCostRupees?: number | null
      notes?: string | null
      productName?: string
    }>
  ) {
    if (!lines.length) {
      throw new PurchaseReceivingError(
        "VALIDATION",
        "Add at least one product line."
      )
    }

    const seen = new Set<string>()
    const normalized: Array<{
      sku: string
      productName: string
      quantity: number
      unitCostRupees: number | null
      notes: string | null
    }> = []

    for (const line of lines) {
      const sku = line.sku.trim().toUpperCase()
      if (!sku) {
        throw new PurchaseReceivingError("VALIDATION", "SKU is required.")
      }
      if (seen.has(sku)) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `Duplicate SKU in receipt: ${sku}. Combine quantities into one line.`
        )
      }
      seen.add(sku)

      const qty = Number(line.quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `Quantity for ${sku} must be a positive number.`
        )
      }

      const product = ProductService.getById(sku)
      if (!product) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `Unknown product SKU: ${sku}. Add the item in Inventory first.`
        )
      }
      if (!product.active) {
        throw new PurchaseReceivingError(
          "VALIDATION",
          `Product ${sku} is inactive.`
        )
      }

      let unitCostRupees: number | null = null
      if (line.unitCostRupees != null) {
        const n = Number(line.unitCostRupees)
        if (!Number.isFinite(n) || n < 0) {
          throw new PurchaseReceivingError(
            "VALIDATION",
            `Unit cost for ${sku} cannot be negative.`
          )
        }
        unitCostRupees = n
      }

      normalized.push({
        sku,
        productName: product.name,
        quantity: qty,
        unitCostRupees,
        notes: line.notes ? String(line.notes).trim() : null,
      })
    }

    return normalized
  }
}

export type { GoodsReceiptRecord }
