/**
 * Canonical domain events published after Firestore (or local) writes succeed.
 * Sync / analytics / notifications subscribe — never React components.
 */
export const EventTypes = {
  INVOICE_CREATED: "INVOICE_CREATED",
  INVOICE_UPDATED: "INVOICE_UPDATED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  INVENTORY_CHANGED: "INVENTORY_CHANGED",
  CUSTOMER_CREATED: "CUSTOMER_CREATED",
  CUSTOMER_UPDATED: "CUSTOMER_UPDATED",
  REFUND_CREATED: "REFUND_CREATED",
  REFUND_UPDATED: "REFUND_UPDATED",
  SUPPLIER_CREATED: "SUPPLIER_CREATED",
  EXPENSE_CREATED: "EXPENSE_CREATED",
} as const

export type EventType = (typeof EventTypes)[keyof typeof EventTypes]

export type DomainEvent<TPayload = unknown> = {
  id: string
  type: EventType
  storeId: string | null
  payload: TPayload
  createdAt: string
  /** Correlation for retries / logs */
  source: "repository" | "system"
}
