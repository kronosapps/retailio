import { getRecordedSale } from "@/data/invoices"
import { EventSubscriber } from "@/events/EventSubscriber"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { AuditService } from "./AuditService"
import type { OpsAuditKind } from "./types"

const STOCK_MOVEMENT_TYPES = new Set([
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "WASTAGE",
  "OPENING",
])

function totalDiscountPaisa(sale: NonNullable<ReturnType<typeof getRecordedSale>>) {
  const t = sale.totals
  return (
    (t.friendsFamilyDiscount || 0) +
    (t.occasionDiscount || 0) +
    (t.loyaltyDiscount || 0) +
    (t.couponDiscount || 0) +
    (t.pointsDiscount || 0)
  )
}

/**
 * Subscribes to domain events and appends ops audit rows.
 * Login / banking / staff / settings call AuditService.record directly.
 */
export class AuditEngine {
  private subscriber = new EventSubscriber()
  private started = false

  start() {
    if (this.started) return
    this.started = true

    this.subscriber.on(EventTypes.PRODUCT_CREATED, (e) => {
      void this.onProduct(e, "PRODUCT_CREATED")
    })
    this.subscriber.on(EventTypes.PRODUCT_UPDATED, (e) => {
      void this.onProduct(e, "PRODUCT_UPDATED")
    })
    this.subscriber.on(EventTypes.PRICE_CHANGED, (e) => {
      void this.onPriceChanged(e)
    })
    this.subscriber.on(EventTypes.INVENTORY_MOVEMENT_CREATED, (e) => {
      void this.onInventoryMovement(e)
    })
    this.subscriber.on(EventTypes.REFUND_CREATED, (e) => {
      void this.onRefund(e)
    })
    this.subscriber.on(EventTypes.INVOICE_CREATED, (e) => {
      void this.onInvoiceCreated(e)
    })
    this.subscriber.on(EventTypes.EXPENSE_CREATED, (e) => {
      void this.onExpense(e)
    })
    this.subscriber.on(EventTypes.PROMOTION_CREATED, (e) => {
      void this.onPromo(e, "PROMOTION_CHANGED", "created")
    })
    this.subscriber.on(EventTypes.PROMOTION_UPDATED, (e) => {
      void this.onPromo(e, "PROMOTION_CHANGED", "updated")
    })
    this.subscriber.on(EventTypes.COUPON_CREATED, (e) => {
      void this.onCoupon(e, "created")
    })
    this.subscriber.on(EventTypes.COUPON_UPDATED, (e) => {
      void this.onCoupon(e, "updated")
    })
  }

  stop() {
    this.subscriber.dispose()
    this.started = false
  }

  private async onProduct(
    event: DomainEvent,
    kind: "PRODUCT_CREATED" | "PRODUCT_UPDATED"
  ) {
    const p = event.payload as {
      sku?: string
      name?: string
      sellingPrice?: number
      productId?: string
      updatedBy?: string | null
      createdBy?: string | null
    }
    const sku = p.sku || p.productId || "product"
    const actorId = p.updatedBy ?? p.createdBy ?? null
    await AuditService.record({
      kind,
      message:
        kind === "PRODUCT_CREATED"
          ? `Created product ${p.name || sku}`
          : `Updated product ${p.name || sku}${typeof p.sellingPrice === "number" ? ` · sell ₹${p.sellingPrice}` : ""}`,
      actorId,
      storeId: event.storeId,
      entityType: "product",
      entityId: sku,
      after: {
        sku,
        name: p.name ?? null,
        sellingPrice: p.sellingPrice ?? null,
      },
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onPriceChanged(event: DomainEvent) {
    const p = event.payload as {
      sku?: string
      productName?: string
      oldSellingPricePaisa?: number
      newSellingPricePaisa?: number
      changedBy?: string | null
      storeId?: string | null
    }
    const oldP = p.oldSellingPricePaisa ?? 0
    const newP = p.newSellingPricePaisa ?? 0
    await AuditService.record({
      kind: "PRICE_CHANGED",
      message: `Selling price ${p.productName || p.sku || "SKU"}: ${AuditService.formatRupees(oldP)} → ${AuditService.formatRupees(newP)}`,
      actorId: p.changedBy ?? null,
      storeId: p.storeId ?? event.storeId,
      entityType: "product",
      entityId: p.sku ?? null,
      before: { sellingPricePaisa: oldP },
      after: { sellingPricePaisa: newP },
      meta: { sku: p.sku, productName: p.productName },
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onInventoryMovement(event: DomainEvent) {
    const m = event.payload as {
      id?: string
      sku?: string
      productName?: string
      type?: string
      quantity?: number
      balanceAfter?: number
      reason?: string | null
      createdBy?: string | null
      createdByName?: string | null
      storeId?: string | null
    }
    if (!m.type || !STOCK_MOVEMENT_TYPES.has(m.type)) return

    await AuditService.record({
      kind: "STOCK_ADJUSTED",
      message: `${m.type.replace(/_/g, " ").toLowerCase()} · ${m.productName || m.sku} · qty ${m.quantity}${m.reason ? ` (${m.reason})` : ""} → on hand ${m.balanceAfter}`,
      actorId: m.createdBy ?? null,
      actorName: m.createdByName ?? null,
      storeId: m.storeId ?? event.storeId,
      entityType: "inventory",
      entityId: m.sku ?? m.id ?? null,
      after: {
        type: m.type,
        quantity: m.quantity,
        balanceAfter: m.balanceAfter,
        reason: m.reason ?? null,
      },
      meta: { movementId: m.id },
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onRefund(event: DomainEvent) {
    const p = event.payload as {
      refundId?: string
      invoiceId?: string
      customerName?: string
      amountPaisa?: number
      amount?: number
      method?: string
      reason?: string | null
      createdBy?: string | null
      storeId?: string | null
    }
    const amountPaisa =
      typeof p.amountPaisa === "number"
        ? p.amountPaisa
        : Math.round((p.amount || 0) * 100)
    await AuditService.record({
      kind: "REFUND",
      message: `Refund ${AuditService.formatRupees(amountPaisa)} · ${p.invoiceId || "sale"}${p.customerName ? ` · ${p.customerName}` : ""}${p.reason ? ` · ${p.reason}` : ""}`,
      actorId: p.createdBy ?? null,
      storeId: p.storeId ?? event.storeId,
      entityType: "refund",
      entityId: p.refundId ?? p.invoiceId ?? null,
      after: {
        amountPaisa,
        method: p.method ?? null,
        invoiceId: p.invoiceId ?? null,
      },
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onInvoiceCreated(event: DomainEvent) {
    const p = event.payload as {
      invoiceId?: string
      invoiceNumber?: string
      cashierId?: string | null
      cashierName?: string | null
      customerName?: string
      discountPaisa?: number
      storeId?: string | null
    }
    const invoiceId = p.invoiceId || p.invoiceNumber
    if (!invoiceId) return

    const sale = getRecordedSale(invoiceId)
    const discount =
      typeof p.discountPaisa === "number"
        ? p.discountPaisa
        : sale
          ? totalDiscountPaisa(sale)
          : 0
    if (discount <= 0) return

    const actorId = p.cashierId ?? sale?.cashierId ?? null
    const actorName = p.cashierName ?? sale?.cashierName ?? null

    await AuditService.record({
      kind: "DISCOUNT_APPLIED",
      message: `Discount ${AuditService.formatRupees(discount)} on ${invoiceId}${p.customerName || sale?.customerName ? ` · ${p.customerName || sale?.customerName}` : ""}`,
      actorId,
      actorName,
      storeId: p.storeId ?? event.storeId ?? sale?.storeId ?? null,
      entityType: "invoice",
      entityId: invoiceId,
      after: {
        discountPaisa: discount,
        totalPaisa: sale?.totals.total ?? null,
      },
      meta: sale
        ? {
            friendsFamilyDiscount: sale.totals.friendsFamilyDiscount,
            occasionDiscount: sale.totals.occasionDiscount,
            loyaltyDiscount: sale.totals.loyaltyDiscount,
            couponDiscount: sale.totals.couponDiscount ?? 0,
            pointsDiscount: sale.totals.pointsDiscount ?? 0,
          }
        : {},
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onExpense(event: DomainEvent) {
    const p = event.payload as {
      id?: string
      title?: string
      amountPaisa?: number
      category?: string
      paymentMethod?: string | null
      createdBy?: string | null
      storeId?: string | null
    }
    await AuditService.record({
      kind: "EXPENSE_CREATED",
      message: `Expense ${p.title || p.id} · ${AuditService.formatRupees(p.amountPaisa || 0)}${p.category ? ` · ${p.category}` : ""}`,
      actorId: p.createdBy ?? null,
      storeId: p.storeId ?? event.storeId,
      entityType: "expense",
      entityId: p.id ?? null,
      after: {
        amountPaisa: p.amountPaisa,
        category: p.category ?? null,
        paymentMethod: p.paymentMethod ?? null,
      },
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onPromo(
    event: DomainEvent,
    kind: OpsAuditKind,
    action: string
  ) {
    const p = event.payload as {
      id?: string
      name?: string
      createdBy?: string | null
      storeId?: string | null
    }
    await AuditService.record({
      kind,
      message: `Promotion ${action}: ${p.name || p.id}`,
      actorId: p.createdBy ?? null,
      storeId: p.storeId ?? event.storeId,
      entityType: "promotion",
      entityId: p.id ?? null,
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }

  private async onCoupon(event: DomainEvent, action: string) {
    const p = event.payload as {
      id?: string
      code?: string
      createdBy?: string | null
      storeId?: string | null
    }
    await AuditService.record({
      kind: "COUPON_CHANGED",
      message: `Coupon ${action}: ${p.code || p.id}`,
      actorId: p.createdBy ?? null,
      storeId: p.storeId ?? event.storeId,
      entityType: "coupon",
      entityId: p.id ?? p.code ?? null,
      sourceEventId: event.id,
      sourceEventType: event.type,
    })
  }
}

export const auditEngine = new AuditEngine()
