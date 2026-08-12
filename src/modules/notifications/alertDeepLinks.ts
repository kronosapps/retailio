/**
 * Deep-links from staff alert meta → focused screens.
 */

import type { NotificationMessageType } from "./types/notification"

export type AlertDeepLinkMeta = {
  href?: string | null
  sku?: string | null
  lotId?: string | null
  purchaseOrderId?: string | null
  supplierId?: string | null
  customerId?: string | null
  invoiceId?: string | null
  digest?: boolean
  skus?: string[]
}

export function buildAlertHref(input: {
  messageType: NotificationMessageType
  invoiceId?: string | null
  customerId?: string | null
  meta?: AlertDeepLinkMeta | Record<string, unknown> | null
}): string {
  const meta = (input.meta || {}) as AlertDeepLinkMeta
  if (typeof meta.href === "string" && meta.href.startsWith("/") && meta.href.includes("?")) {
    return meta.href
  }

  const sku =
    typeof meta.sku === "string" && meta.sku.trim()
      ? meta.sku.trim().toUpperCase()
      : null
  const invoiceId = input.invoiceId || null
  const customerId = input.customerId || meta.customerId || null

  switch (input.messageType) {
    case "low_stock":
    case "out_of_stock":
      if (meta.digest && Array.isArray(meta.skus) && meta.skus.length > 0) {
        return `/inventory/stock?sku=${encodeURIComponent(String(meta.skus[0]))}`
      }
      return sku
        ? `/inventory/stock?sku=${encodeURIComponent(sku)}`
        : "/inventory/stock"
    case "expiring_stock":
      return sku
        ? `/inventory/lots?sku=${encodeURIComponent(sku)}`
        : "/inventory/lots"
    case "pending_purchase": {
      const poId =
        typeof meta.purchaseOrderId === "string" ? meta.purchaseOrderId : null
      return poId
        ? `/purchasing/orders?poId=${encodeURIComponent(poId)}`
        : "/purchasing/orders"
    }
    case "outstanding_supplier": {
      const supplierId =
        typeof meta.supplierId === "string" ? meta.supplierId : null
      return supplierId
        ? `/purchasing/invoices?supplierId=${encodeURIComponent(supplierId)}`
        : "/purchasing/invoices"
    }
    case "outstanding_customer":
      return customerId ? `/customers/${customerId}` : "/customers"
    case "large_discount":
    case "large_refund":
    case "failed_payment":
      return invoiceId ? `/invoices/${encodeURIComponent(invoiceId)}` : "/transactions"
    case "cash_variance":
      return "/day-ops"
    case "failed_sync":
      return "/options"
    default:
      return typeof meta.href === "string" && meta.href.startsWith("/")
        ? meta.href
        : "/"
  }
}
