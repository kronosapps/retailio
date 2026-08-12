import { rupeesToPaisa } from "@/lib/money"
import type { GoodsReceiptRecord } from "@/data/goodsReceipts"
import type { PurchaseInvoiceRecord } from "@/data/purchaseInvoices"
import type { PurchaseReturnRecord } from "@/data/purchaseReturns"
import { InventoryService } from "@/modules/inventory"
import { goodsReceiptRepository } from "@/repositories/GoodsReceiptRepository"
import { inventoryMovementRepository } from "@/repositories/InventoryMovementRepository"
import {
  purchaseReturnRepository,
  type CreatePurchaseReturnInput,
} from "@/repositories/PurchaseReturnRepository"
import { supplierInvoiceRepository } from "@/repositories/SupplierInvoiceRepository"
import { SupplierService } from "@/modules/supplier"

import { SupplierInvoiceService } from "./SupplierInvoiceService"

export class PurchaseReturnError extends Error {
  code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATUS" | "INSUFFICIENT_STOCK"

  constructor(code: PurchaseReturnError["code"], message: string) {
    super(message)
    this.name = "PurchaseReturnError"
    this.code = code
  }
}

export type CreateReturnLineInput = {
  sku: string
  quantity: number
  unitCostRupees?: number | null
}

export type CreatePurchaseReturnFromSourceInput = {
  /** Prefer invoice debit note when AP exists; else GRN-only stock return. */
  purchaseInvoiceId?: string | null
  goodsReceiptId?: string | null
  lines: CreateReturnLineInput[]
  reason?: string | null
  notes?: string | null
  storeId?: string | null
  actorId?: string | null
  actorName?: string | null
  /** Create draft only; default posts immediately. */
  draftOnly?: boolean
}

/**
 * Purchase returns / RTV — stock out + optional AP credit (debit note).
 */
export class PurchaseReturnService {
  static list(): PurchaseReturnRecord[] {
    return purchaseReturnRepository.list()
  }

  static getById(id: string): PurchaseReturnRecord | null {
    return purchaseReturnRepository.getById(id)
  }

  static hydrate() {
    return purchaseReturnRepository.hydrate()
  }

  /** Qty already returned (posted) for a GRN, by SKU. */
  static returnedQtyBySkuForGrn(goodsReceiptId: string): Record<string, number> {
    const map: Record<string, number> = {}
    for (const ret of this.list()) {
      if (ret.status !== "POSTED") continue
      if (ret.goodsReceiptId !== goodsReceiptId) continue
      for (const line of ret.lines) {
        map[line.sku] = (map[line.sku] || 0) + line.quantity
      }
    }
    return map
  }

  /** Qty already returned (posted) for an invoice, by SKU. */
  static returnedQtyBySkuForInvoice(
    purchaseInvoiceId: string
  ): Record<string, number> {
    const map: Record<string, number> = {}
    for (const ret of this.list()) {
      if (ret.status !== "POSTED") continue
      if (ret.purchaseInvoiceId !== purchaseInvoiceId) continue
      for (const line of ret.lines) {
        map[line.sku] = (map[line.sku] || 0) + line.quantity
      }
    }
    return map
  }

  static remainingReturnableForGrn(
    grn: GoodsReceiptRecord
  ): Array<{
    sku: string
    productName: string
    receivedQty: number
    returnedQty: number
    remainingQty: number
    unitCostRupees: number | null
  }> {
    const returned = this.returnedQtyBySkuForGrn(grn.id)
    return grn.lines.map((l) => {
      const returnedQty = returned[l.sku] || 0
      return {
        sku: l.sku,
        productName: l.productName,
        receivedQty: l.quantity,
        returnedQty,
        remainingQty: Math.max(0, l.quantity - returnedQty),
        unitCostRupees: l.unitCostRupees,
      }
    })
  }

  static remainingReturnableForInvoice(
    inv: PurchaseInvoiceRecord
  ): Array<{
    sku: string
    productName: string
    billedQty: number
    returnedQty: number
    remainingQty: number
    unitCostPaisa: number
    goodsReceiptId: string
  }> {
    const returned = this.returnedQtyBySkuForInvoice(inv.id)
    // Aggregate by SKU across invoice lines (same SKU may appear on multiple GRNs).
    const bySku = new Map<
      string,
      {
        sku: string
        productName: string
        billedQty: number
        unitCostPaisa: number
        goodsReceiptId: string
      }
    >()
    for (const l of inv.lines) {
      const prev = bySku.get(l.sku)
      if (prev) {
        prev.billedQty += l.quantity
      } else {
        bySku.set(l.sku, {
          sku: l.sku,
          productName: l.productName,
          billedQty: l.quantity,
          unitCostPaisa: l.unitCostPaisa,
          goodsReceiptId: l.goodsReceiptId,
        })
      }
    }
    return [...bySku.values()].map((row) => {
      const returnedQty = returned[row.sku] || 0
      return {
        ...row,
        returnedQty,
        remainingQty: Math.max(0, row.billedQty - returnedQty),
      }
    })
  }

  /** Posted GRNs with remaining returnable qty (optionally for supplier). */
  static listReturnableGrns(supplierId?: string | null): GoodsReceiptRecord[] {
    return goodsReceiptRepository.list().filter((g) => {
      if (g.status !== "POSTED") return false
      if (supplierId && g.supplierId !== supplierId) return false
      return this.remainingReturnableForGrn(g).some((l) => l.remainingQty > 0)
    })
  }

  /** Posted/partial invoices with remaining returnable qty and remaining AP. */
  static listReturnableInvoices(
    supplierId?: string | null
  ): PurchaseInvoiceRecord[] {
    return supplierInvoiceRepository.list().filter((inv) => {
      if (
        inv.status !== "POSTED" &&
        inv.status !== "PARTIAL" &&
        inv.status !== "PAID"
      ) {
        return false
      }
      if (supplierId && inv.supplierId !== supplierId) return false
      if (!this.remainingReturnableForInvoice(inv).some((l) => l.remainingQty > 0)) {
        return false
      }
      // Allow stock return even if fully paid — credit can create negative remaining = 0 capped;
      // but applyCredit requires remaining AP. Fully paid invoices: stock-only if no remaining AP.
      return true
    })
  }

  static async createAndPost(
    input: CreatePurchaseReturnFromSourceInput
  ): Promise<PurchaseReturnRecord> {
    const draft = await this.createDraft(input)
    if (input.draftOnly) return draft
    return this.post(draft.id, {
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
    })
  }

  static async createDraft(
    input: CreatePurchaseReturnFromSourceInput
  ): Promise<PurchaseReturnRecord> {
    if (!input.lines.length) {
      throw new PurchaseReturnError(
        "VALIDATION",
        "Add at least one return line."
      )
    }
    if (!input.purchaseInvoiceId && !input.goodsReceiptId) {
      throw new PurchaseReturnError(
        "VALIDATION",
        "Select a purchase invoice or goods receipt to return against."
      )
    }

    let supplierId = ""
    let supplierName = ""
    let goodsReceiptId: string | null = input.goodsReceiptId ?? null
    let grnNumber: string | null = null
    let purchaseInvoiceId: string | null = input.purchaseInvoiceId ?? null
    let invoiceNumber: string | null = null
    let storeId = input.storeId ?? null
    let returnable: Array<{
      sku: string
      remainingQty: number
      unitCostPaisa: number
      productName: string
    }> = []

    if (purchaseInvoiceId) {
      const inv = supplierInvoiceRepository.getById(purchaseInvoiceId)
      if (!inv) {
        throw new PurchaseReturnError("NOT_FOUND", "Purchase invoice not found.")
      }
      if (
        inv.status !== "POSTED" &&
        inv.status !== "PARTIAL" &&
        inv.status !== "PAID"
      ) {
        throw new PurchaseReturnError(
          "INVALID_STATUS",
          "Only posted invoices can receive debit notes."
        )
      }
      supplierId = inv.supplierId
      supplierName = inv.supplierName
      invoiceNumber = inv.invoiceNumber
      storeId = storeId ?? inv.storeId
      if (!goodsReceiptId && inv.goodsReceiptIds.length === 1) {
        goodsReceiptId = inv.goodsReceiptIds[0]
      }
      if (goodsReceiptId) {
        const grn = goodsReceiptRepository.getById(goodsReceiptId)
        grnNumber = grn?.grnNumber ?? null
      }
      returnable = this.remainingReturnableForInvoice(inv).map((r) => ({
        sku: r.sku,
        remainingQty: r.remainingQty,
        unitCostPaisa: r.unitCostPaisa,
        productName: r.productName,
      }))
    } else if (goodsReceiptId) {
      const grn = goodsReceiptRepository.getById(goodsReceiptId)
      if (!grn) {
        throw new PurchaseReturnError("NOT_FOUND", "Goods receipt not found.")
      }
      if (grn.status !== "POSTED") {
        throw new PurchaseReturnError(
          "INVALID_STATUS",
          "Only posted goods receipts can be returned."
        )
      }
      supplierId = grn.supplierId
      supplierName = grn.supplierName
      grnNumber = grn.grnNumber
      storeId = storeId ?? grn.storeId
      // Auto-link billed invoice for AP credit when GRN is on exactly one invoice.
      const linked = supplierInvoiceRepository
        .list()
        .filter(
          (inv) =>
            inv.status !== "CANCELLED" &&
            inv.goodsReceiptIds.includes(grn.id)
        )
      if (linked.length === 1) {
        purchaseInvoiceId = linked[0].id
        invoiceNumber = linked[0].invoiceNumber
        returnable = this.remainingReturnableForInvoice(linked[0]).map((r) => ({
          sku: r.sku,
          remainingQty: r.remainingQty,
          unitCostPaisa: r.unitCostPaisa,
          productName: r.productName,
        }))
      } else {
        returnable = this.remainingReturnableForGrn(grn).map((r) => ({
          sku: r.sku,
          remainingQty: r.remainingQty,
          unitCostPaisa:
            r.unitCostRupees != null ? rupeesToPaisa(r.unitCostRupees) : 0,
          productName: r.productName,
        }))
      }
    }

    const supplier = SupplierService.getById(supplierId)
    if (supplier) supplierName = supplier.name

    const lines: CreatePurchaseReturnInput["lines"] = []
    for (const line of input.lines) {
      const sku = line.sku.trim().toUpperCase()
      const qty = Number(line.quantity)
      if (!sku || !Number.isFinite(qty) || qty <= 0) {
        throw new PurchaseReturnError(
          "VALIDATION",
          "Each return line needs a SKU and positive quantity."
        )
      }
      const cap = returnable.find((r) => r.sku === sku)
      if (!cap) {
        throw new PurchaseReturnError(
          "VALIDATION",
          `SKU ${sku} is not on the selected source document.`
        )
      }
      if (qty > cap.remainingQty) {
        throw new PurchaseReturnError(
          "VALIDATION",
          `Over-return blocked for ${sku}: remaining ${cap.remainingQty}, tried ${qty}.`
        )
      }
      const unitCostPaisa =
        line.unitCostRupees != null && Number.isFinite(Number(line.unitCostRupees))
          ? rupeesToPaisa(Number(line.unitCostRupees))
          : cap.unitCostPaisa
      if (unitCostPaisa < 0) {
        throw new PurchaseReturnError(
          "VALIDATION",
          `Unit cost for ${sku} cannot be negative.`
        )
      }
      if (purchaseInvoiceId && unitCostPaisa <= 0) {
        throw new PurchaseReturnError(
          "VALIDATION",
          `Unit cost required for ${sku} when applying an AP debit note.`
        )
      }
      lines.push({
        sku,
        productName: cap.productName,
        quantity: qty,
        unitCostPaisa,
      })
    }

    return purchaseReturnRepository.createDraft({
      supplierId,
      supplierName,
      goodsReceiptId,
      grnNumber,
      purchaseInvoiceId,
      invoiceNumber,
      reason: input.reason,
      notes: input.notes,
      lines,
      storeId,
      actorId: input.actorId,
    })
  }

  static async post(
    returnId: string,
    opts: { actorId?: string | null; actorName?: string | null } = {}
  ): Promise<PurchaseReturnRecord> {
    const existing = purchaseReturnRepository.getById(returnId)
    if (!existing) {
      throw new PurchaseReturnError("NOT_FOUND", "Purchase return not found.")
    }
    if (existing.status === "POSTED") return existing
    if (existing.status !== "DRAFT") {
      throw new PurchaseReturnError(
        "INVALID_STATUS",
        "Only draft returns can be posted."
      )
    }
    if (!existing.lines.length) {
      throw new PurchaseReturnError(
        "VALIDATION",
        "Return must have lines before posting."
      )
    }

    // Re-validate caps against live posted returns.
    if (existing.purchaseInvoiceId) {
      const inv = supplierInvoiceRepository.getById(existing.purchaseInvoiceId)
      if (!inv) {
        throw new PurchaseReturnError("NOT_FOUND", "Linked invoice not found.")
      }
      const caps = this.remainingReturnableForInvoice(inv)
      for (const line of existing.lines) {
        const cap = caps.find((c) => c.sku === line.sku)
        if (!cap || line.quantity > cap.remainingQty) {
          throw new PurchaseReturnError(
            "VALIDATION",
            `Over-return blocked for ${line.sku}.`
          )
        }
      }
    } else if (existing.goodsReceiptId) {
      const grn = goodsReceiptRepository.getById(existing.goodsReceiptId)
      if (!grn) {
        throw new PurchaseReturnError("NOT_FOUND", "Linked GRN not found.")
      }
      const caps = this.remainingReturnableForGrn(grn)
      for (const line of existing.lines) {
        const cap = caps.find((c) => c.sku === line.sku)
        if (!cap || line.quantity > cap.remainingQty) {
          throw new PurchaseReturnError(
            "VALIDATION",
            `Over-return blocked for ${line.sku}.`
          )
        }
      }
    }

    const prior = inventoryMovementRepository.findByReference(
      existing.id,
      "PURCHASE_RETURN"
    )
    if (!prior) {
      try {
        for (const line of existing.lines) {
          await InventoryService.removeStock({
            sku: line.sku,
            quantity: line.quantity,
            type: "PURCHASE_RETURN",
            reason: `PRN ${existing.returnNumber}`,
            referenceId: existing.id,
            notes: [
              existing.supplierName,
              existing.grnNumber ? `GRN ${existing.grnNumber}` : null,
              existing.invoiceNumber ? `Inv ${existing.invoiceNumber}` : null,
              existing.reason,
            ]
              .filter(Boolean)
              .join(" · "),
            actorId: opts.actorId ?? existing.createdBy,
            actorName: opts.actorName ?? null,
            storeId: existing.storeId,
          })
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not remove stock."
        throw new PurchaseReturnError("INSUFFICIENT_STOCK", message)
      }
    }

    // AP credit when linked to invoice — full return value (may create supplier credit).
    if (existing.purchaseInvoiceId && existing.totalPaisa > 0) {
      await SupplierInvoiceService.applyCredit(
        existing.purchaseInvoiceId,
        existing.totalPaisa,
        opts.actorId ?? existing.createdBy
      )
    }

    const now = new Date().toISOString()
    return purchaseReturnRepository.save(
      {
        ...existing,
        status: "POSTED",
        postedAt: now,
        updatedBy: opts.actorId ?? existing.updatedBy,
      },
      "posted"
    )
  }

  static async cancel(
    returnId: string,
    actorId: string | null = null
  ): Promise<PurchaseReturnRecord> {
    const existing = purchaseReturnRepository.getById(returnId)
    if (!existing) {
      throw new PurchaseReturnError("NOT_FOUND", "Purchase return not found.")
    }
    if (existing.status === "CANCELLED") return existing
    if (existing.status !== "DRAFT") {
      throw new PurchaseReturnError(
        "INVALID_STATUS",
        "Only draft returns can be cancelled."
      )
    }
    return purchaseReturnRepository.save(
      {
        ...existing,
        status: "CANCELLED",
        updatedBy: actorId,
      },
      "updated"
    )
  }
}

export type { PurchaseReturnRecord }
