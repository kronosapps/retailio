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

/**
 * Purchasing receiving — ad-hoc GRN posts stock via InventoryService.addStock.
 * UI never calls InventoryService for purchase receipts; this service owns the flow.
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
   * Posted GRNs apply PURCHASE movements with referenceId = grn.id.
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

    const normalizedLines = this.validateLines(input.lines)

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

  /** Post a draft GRN — applies stock once; idempotent if already posted. */
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

    // Idempotency guard: if movements already exist for this GRN, mark posted.
    const prior = inventoryMovementRepository.findByReference(
      existing.id,
      "PURCHASE"
    )
    if (prior) {
      const now = new Date().toISOString()
      return goodsReceiptRepository.save({
        ...existing,
        status: "POSTED",
        postedAt: existing.postedAt || now,
        updatedBy: opts.actorId ?? existing.updatedBy,
      })
    }

    this.validateLines(existing.lines)

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
    return goodsReceiptRepository.save({
      ...existing,
      status: "POSTED",
      postedAt: now,
      updatedAt: now,
      updatedBy: opts.actorId ?? existing.updatedBy,
    })
  }

  private static validateLines(
    lines: PostAdHocGrnInput["lines"] | GoodsReceiptRecord["lines"]
  ) {
    if (!lines.length) {
      throw new PurchaseReceivingError(
        "VALIDATION",
        "Add at least one product line."
      )
    }

    const seen = new Set<string>()
    const normalized = []

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

      const rawCost =
        "unitCostRupees" in line ? line.unitCostRupees : null
      let unitCostRupees: number | null = null
      if (rawCost != null) {
        const n = Number(rawCost)
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
        notes:
          "notes" in line && line.notes ? String(line.notes).trim() : null,
      })
    }

    return normalized
  }
}

export type { GoodsReceiptRecord }
