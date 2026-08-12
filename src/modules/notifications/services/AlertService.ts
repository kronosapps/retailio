/**
 * Staff operational alerts — queues `in_app` notifications via NotificationRepository.
 * Does not talk to WhatsApp / Meta. Dedupes by dedupeKey within threshold window.
 */

import { getRecordedSale } from "@/data/invoices"
import { EventTypes, type DomainEvent } from "@/events/EventTypes"
import { StockAnalyticsService } from "@/modules/inventory/StockAnalyticsService"
import { CustomerService } from "@/modules/customer"
import {
  PurchaseOrderService,
  SupplierInvoiceService,
} from "@/modules/purchasing"
import { notificationRepository } from "@/repositories/NotificationRepository"
import { createId } from "@/utils/id"
import { getAlertThresholds } from "../alertThresholds"
import type {
  NotificationMessageType,
  NotificationPriority,
  NotificationRecord,
} from "../types/notification"
import { alertLabel, isStaffAlertType } from "../types/notification"

export type RaiseAlertInput = {
  messageType: NotificationMessageType
  title: string
  body: string
  dedupeKey: string
  priority?: NotificationPriority
  storeId?: string | null
  href?: string | null
  meta?: Record<string, unknown>
  /** Related business ids for inbox context. */
  invoiceId?: string | null
  customerId?: string | null
  customerName?: string
}

function formatRupees(paisa: number): string {
  return `₹${(Math.abs(paisa) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function totalDiscountPaisa(sale: NonNullable<ReturnType<typeof getRecordedSale>>): number {
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
 * Business triggers for soft staff alerts.
 */
export class AlertService {
  static listStaffAlerts(storeId?: string | null): NotificationRecord[] {
    return notificationRepository
      .list()
      .filter(
        (n) =>
          (n.audience === "staff" || n.channel === "in_app" || isStaffAlertType(n.messageType)) &&
          (!storeId || !n.storeId || n.storeId === storeId)
      )
  }

  static unreadCount(storeId?: string | null): number {
    return this.listStaffAlerts(storeId).filter((n) => !n.readAt).length
  }

  static async markRead(notificationId: string): Promise<NotificationRecord | null> {
    return notificationRepository.markRead(notificationId)
  }

  static async markAllRead(storeId?: string | null): Promise<number> {
    const unread = this.listStaffAlerts(storeId).filter((n) => !n.readAt)
    for (const n of unread) {
      await notificationRepository.markRead(n.notificationId)
    }
    return unread.length
  }

  static async raise(input: RaiseAlertInput): Promise<NotificationRecord | null> {
    if (!isStaffAlertType(input.messageType)) {
      if (import.meta.env.DEV) {
        console.warn("[AlertService] not a staff alert type", input.messageType)
      }
      return null
    }

    const thresholds = getAlertThresholds()
    const now = Date.now()
    const existing = notificationRepository
      .list()
      .find(
        (n) =>
          n.dedupeKey === input.dedupeKey &&
          now - new Date(n.createdAt).getTime() < thresholds.dedupeWindowMs
      )
    if (existing) return existing

    try {
      return await notificationRepository.queue({
        invoiceId: input.invoiceId || `alert:${input.dedupeKey}`,
        paymentId: null,
        customerId: input.customerId ?? null,
        customerName: input.customerName || "Staff",
        customerPhone: null,
        storeId: input.storeId ?? null,
        messageType: input.messageType,
        channel: "in_app",
        templateName: null,
        body: input.body,
        title: input.title,
        audience: "staff",
        priority: input.priority ?? "medium",
        dedupeKey: input.dedupeKey,
        forceNew: true,
        meta: {
          ...(input.meta || {}),
          href: input.href ?? null,
          alertKind: input.messageType,
        },
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[AlertService] raise failed", err)
      }
      return null
    }
  }

  /** Event-driven + aging scans entrypoints used by NotificationEngine. */
  static async onInventoryChanged(event: DomainEvent): Promise<void> {
    const payload = event.payload as { sku?: string }
    await this.scanStockAlerts(event.storeId, payload.sku)
  }

  static async onPaymentReceived(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      invoiceNumber?: string
      invoiceId?: string
      storeId?: string | null
      customerName?: string
    }
    const invoiceId = payload.invoiceId || payload.invoiceNumber
    if (!invoiceId) return
    const sale = getRecordedSale(invoiceId)
    if (!sale) return

    const discount = totalDiscountPaisa(sale)
    const gross = sale.totals.grossSubtotal || sale.totals.taxableAmount + discount
    const thresholds = getAlertThresholds()
    const ratio = gross > 0 ? discount / gross : 0
    if (
      discount >= thresholds.largeDiscountMinPaisa &&
      ratio >= thresholds.largeDiscountRatio
    ) {
      await this.raise({
        messageType: "large_discount",
        title: alertLabel("large_discount"),
        body: `${sale.customerName || "Sale"} · ${invoiceId} — ${formatRupees(discount)} off (${Math.round(ratio * 100)}%)`,
        dedupeKey: `large_discount:${invoiceId}`,
        priority: ratio >= 0.35 ? "high" : "medium",
        storeId: payload.storeId ?? event.storeId,
        invoiceId,
        customerName: sale.customerName || "Walk-in",
        href: "/transactions",
        meta: { discountPaisa: discount, ratio, grossPaisa: gross },
      })
    }
  }

  static async onPaymentRefunded(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      invoiceId?: string
      amount?: number
      amountPaisa?: number
      refundId?: string
      customerName?: string
      customerId?: string | null
    }
    const thresholds = getAlertThresholds()
    const amountPaisa =
      typeof payload.amountPaisa === "number"
        ? payload.amountPaisa
        : Math.round((payload.amount || 0) * 100)
    if (amountPaisa < thresholds.largeRefundMinPaisa) return

    const key = payload.refundId || payload.invoiceId || createId("refund")
    await this.raise({
      messageType: "large_refund",
      title: alertLabel("large_refund"),
      body: `${payload.customerName || "Customer"} · ${formatRupees(amountPaisa)}${payload.invoiceId ? ` on ${payload.invoiceId}` : ""}`,
      dedupeKey: `large_refund:${key}`,
      priority: amountPaisa >= thresholds.largeRefundMinPaisa * 3 ? "high" : "medium",
      storeId: event.storeId,
      invoiceId: payload.invoiceId ?? null,
      customerId: payload.customerId ?? null,
      customerName: payload.customerName || "Walk-in",
      href: "/transactions",
      meta: { amountPaisa },
    })
  }

  static async onPaymentFailed(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      paymentId?: string
      invoiceNumber?: string
      invoiceId?: string
      customerName?: string
      amount?: number
      paymentMethod?: string
    }
    const paymentId = payload.paymentId || createId("pay")
    await this.raise({
      messageType: "failed_payment",
      title: alertLabel("failed_payment"),
      body: `${payload.customerName || "Payment"} · ${payload.invoiceNumber || payload.invoiceId || paymentId}${payload.paymentMethod ? ` (${payload.paymentMethod})` : ""}`,
      dedupeKey: `failed_payment:${paymentId}`,
      priority: "high",
      storeId: event.storeId,
      invoiceId: payload.invoiceId || payload.invoiceNumber || null,
      customerName: payload.customerName || "Walk-in",
      href: "/transactions",
      meta: { paymentId, amount: payload.amount },
    })
  }

  static async onShiftClosed(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      id?: string
      shiftNumber?: string | number
      cashierName?: string
      variancePaisa?: number | null
    }
    const thresholds = getAlertThresholds()
    const variance = payload.variancePaisa
    if (typeof variance !== "number" || Math.abs(variance) < thresholds.cashVarianceMinPaisa) {
      return
    }
    const shiftKey = payload.id || String(payload.shiftNumber || "shift")
    await this.raise({
      messageType: "cash_variance",
      title: alertLabel("cash_variance"),
      body: `${payload.cashierName || "Cashier"} · variance ${variance >= 0 ? "+" : "−"}${formatRupees(variance)}`,
      dedupeKey: `cash_variance:${shiftKey}`,
      priority: Math.abs(variance) >= thresholds.cashVarianceMinPaisa * 5 ? "critical" : "high",
      storeId: event.storeId,
      href: "/day-ops",
      meta: { variancePaisa: variance, shiftId: payload.id },
    })
  }

  static async onSyncFailed(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      queueId?: string
      eventType?: string
      sheet?: string
      error?: string
    }
    const key = payload.queueId || createId("sync")
    await this.raise({
      messageType: "failed_sync",
      title: alertLabel("failed_sync"),
      body: `${payload.eventType || payload.sheet || "Sync"} failed${payload.error ? `: ${payload.error.slice(0, 120)}` : ""}`,
      dedupeKey: `failed_sync:${key}`,
      priority: "high",
      storeId: event.storeId,
      href: "/options",
      meta: { ...payload },
    })
  }

  static async onPurchaseChanged(event: DomainEvent): Promise<void> {
    void event
    await this.scanPendingPurchases(event.storeId)
    await this.scanOutstandingSuppliers(event.storeId)
  }

  static async onCustomerArChanged(event: DomainEvent): Promise<void> {
    void event
    await this.scanOutstandingCustomers(event.storeId)
  }

  /** Full aging pass — stock, expiry, PO, AR/AP. */
  static async runAgingScans(storeId: string | null = null): Promise<void> {
    await this.scanStockAlerts(storeId)
    await this.scanExpiringStock(storeId)
    await this.scanPendingPurchases(storeId)
    await this.scanOutstandingSuppliers(storeId)
    await this.scanOutstandingCustomers(storeId)
  }

  static async scanStockAlerts(
    storeId: string | null = null,
    skuFilter?: string
  ): Promise<void> {
    const suggestions = StockAnalyticsService.getReorderSuggestions()
    const filtered = skuFilter
      ? suggestions.filter((s) => s.sku.toUpperCase() === skuFilter.toUpperCase())
      : suggestions

    for (const row of filtered) {
      const type: NotificationMessageType =
        row.status === "out_of_stock" ? "out_of_stock" : "low_stock"
      await this.raise({
        messageType: type,
        title: alertLabel(type),
        body: `${row.name} (${row.sku}) · on hand ${row.onHand} / reorder ${row.reorderLevel}`,
        dedupeKey: `${type}:${row.sku.toUpperCase()}`,
        priority: type === "out_of_stock" ? "critical" : "high",
        storeId,
        href: "/inventory",
        meta: {
          sku: row.sku,
          onHand: row.onHand,
          reorderLevel: row.reorderLevel,
        },
      })
    }
  }

  static async scanExpiringStock(storeId: string | null = null): Promise<void> {
    const thresholds = getAlertThresholds()
    const { expired, expiringSoon } = StockAnalyticsService.getExpiryAlerts(
      thresholds.expiryWithinDays
    )

    for (const lot of expired) {
      await this.raise({
        messageType: "expiring_stock",
        title: "Expired stock",
        body: `${lot.sku} · lot ${lot.lotNumber || lot.id} expired ${lot.expiryDate || ""}`.trim(),
        dedupeKey: `expired:${lot.id}`,
        priority: "critical",
        storeId,
        href: "/inventory",
        meta: { lotId: lot.id, sku: lot.sku, expiryDate: lot.expiryDate },
      })
    }
    for (const lot of expiringSoon) {
      await this.raise({
        messageType: "expiring_stock",
        title: alertLabel("expiring_stock"),
        body: `${lot.sku} · lot ${lot.lotNumber || lot.id} expires ${lot.expiryDate || "soon"}`,
        dedupeKey: `expiring:${lot.id}`,
        priority: "high",
        storeId,
        href: "/inventory",
        meta: { lotId: lot.id, sku: lot.sku, expiryDate: lot.expiryDate },
      })
    }
  }

  static async scanPendingPurchases(storeId: string | null = null): Promise<void> {
    for (const po of PurchaseOrderService.listOpenForReceiving()) {
      await this.raise({
        messageType: "pending_purchase",
        title: alertLabel("pending_purchase"),
        body: `${po.supplierName || "Supplier"} · PO ${po.poNumber || po.id} (${po.status})`,
        dedupeKey: `pending_purchase:${po.id}`,
        priority: "medium",
        storeId: storeId ?? po.storeId,
        href: "/purchasing",
        meta: { purchaseOrderId: po.id, status: po.status },
      })
    }
  }

  static async scanOutstandingSuppliers(
    storeId: string | null = null
  ): Promise<void> {
    const thresholds = getAlertThresholds()
    const bySupplier = new Map<
      string,
      { name: string; remaining: number; storeId: string | null }
    >()

    for (const inv of SupplierInvoiceService.list()) {
      const remaining = SupplierInvoiceService.remainingPayablePaisa(inv)
      if (remaining < thresholds.supplierOutstandingMinPaisa) continue
      const prev = bySupplier.get(inv.supplierId) || {
        name: inv.supplierName,
        remaining: 0,
        storeId: inv.storeId,
      }
      prev.remaining += remaining
      bySupplier.set(inv.supplierId, prev)
    }

    for (const [supplierId, row] of bySupplier) {
      if (row.remaining < thresholds.supplierOutstandingMinPaisa) continue
      await this.raise({
        messageType: "outstanding_supplier",
        title: alertLabel("outstanding_supplier"),
        body: `${row.name} · ${formatRupees(row.remaining)} payable`,
        dedupeKey: `outstanding_supplier:${supplierId}`,
        priority: row.remaining >= thresholds.supplierOutstandingMinPaisa * 5 ? "high" : "medium",
        storeId: storeId ?? row.storeId,
        href: "/purchasing",
        meta: { supplierId, remainingPaisa: row.remaining },
      })
    }
  }

  static async scanOutstandingCustomers(
    storeId: string | null = null
  ): Promise<void> {
    const thresholds = getAlertThresholds()
    for (const customer of CustomerService.list()) {
      const outstanding = customer.outstandingPaisa || 0
      if (outstanding < thresholds.customerOutstandingMinPaisa) continue
      await this.raise({
        messageType: "outstanding_customer",
        title: alertLabel("outstanding_customer"),
        body: `${customer.name} · ${formatRupees(outstanding)} on account`,
        dedupeKey: `outstanding_customer:${customer.id}`,
        priority:
          outstanding >= thresholds.customerOutstandingMinPaisa * 5
            ? "high"
            : "medium",
        storeId: storeId ?? customer.storeId,
        customerId: customer.id,
        customerName: customer.name,
        href: "/customers",
        meta: { outstandingPaisa: outstanding },
      })
    }
  }
}

/** Event types that should refresh aging scans (lightweight). */
export const ALERT_AGING_EVENTS = [
  EventTypes.INVENTORY_CHANGED,
  EventTypes.PURCHASE_ORDER_ISSUED,
  EventTypes.PURCHASE_ORDER_UPDATED,
  EventTypes.GOODS_RECEIVED,
  EventTypes.PURCHASE_INVOICE_POSTED,
  EventTypes.SUPPLIER_PAYMENT_RECORDED,
  EventTypes.CUSTOMER_AR_SETTLED,
  EventTypes.CUSTOMER_UPDATED,
  EventTypes.CREDIT_NOTE_ISSUED,
] as const
