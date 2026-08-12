/**
 * Derive a stable business idempotency key from a domain event payload.
 * Used by SyncQueue to prevent duplicate Sheets / provider work.
 */

export function syncIdempotencyKey(
  eventType: string,
  payload: unknown
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }
  const p = payload as Record<string, unknown>

  const paymentId = asString(p.paymentId)
  if (paymentId) return `payment:${paymentId}`

  const refundId = asString(p.refundId)
  if (refundId) return `refund:${refundId}`

  const invoiceId = asString(p.invoiceId) || asString(p.invoiceNumber)
  if (invoiceId && eventType.includes("INVOICE")) {
    return `invoice:${invoiceId}`
  }
  if (invoiceId && eventType.includes("PAYMENT")) {
    return `payment_invoice:${invoiceId}`
  }

  const customerId = asString(p.customerId) || asString(p.id)
  if (customerId && eventType.includes("CUSTOMER")) {
    return `customer:${customerId}`
  }

  const productId = asString(p.productId) || asString(p.sku)
  if (productId && eventType.includes("PRODUCT")) {
    return `product:${productId}`
  }

  const sku = asString(p.sku)
  if (sku && eventType.includes("INVENTORY")) {
    return `inventory:${sku}:${eventType}`
  }

  const movementId = asString(p.id)
  if (movementId && eventType.includes("INVENTORY_MOVEMENT")) {
    return `movement:${movementId}`
  }

  const expenseId = asString(p.id)
  if (expenseId && eventType.includes("EXPENSE")) {
    return `expense:${expenseId}`
  }

  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Sheet column used for Apps Script upsert. */
export function sheetUpsertKeyField(sheet: string): string | null {
  switch (sheet) {
    case "Payments":
      return "paymentId"
    case "Invoices":
      return "invoiceId"
    case "Refunds":
      return "refundId"
    case "Customers":
      return "id"
    case "Products":
      return "sku"
    case "Suppliers":
      return "id"
    case "Inventory":
      return "sku"
    case "InventoryMovements":
      return "id"
    case "PurchaseOrders":
      return "id"
    case "GoodsReceipts":
      return "id"
    case "PurchaseInvoices":
      return "id"
    case "SupplierPayments":
      return "id"
    case "Expenses":
      return "id"
    default:
      return null
  }
}
