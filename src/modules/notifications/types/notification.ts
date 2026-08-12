/**
 * Notification Engine — channel-agnostic contracts.
 * Payment / Invoice modules never import WhatsApp APIs.
 * Staff ops alerts use channel `in_app` (local + Firestore inbox; CF no-ops).
 */

export type NotificationChannel =
  | "whatsapp"
  | "sms"
  | "email"
  | "push"
  | "telegram"
  | "in_app"

export type NotificationStatus =
  | "Pending"
  | "Queued"
  | "Sending"
  | "Sent"
  | "Delivered"
  | "Read"
  | "Failed"
  | "Cancelled"

/** Customer messaging + staff operational alerts. */
export type NotificationMessageType =
  | "receipt"
  | "invoice"
  | "order_confirmation"
  | "payment_success"
  | "refund"
  | "offer"
  | "reminder"
  | "campaign"
  | "low_stock"
  | "out_of_stock"
  | "expiring_stock"
  | "large_discount"
  | "large_refund"
  | "cash_variance"
  | "failed_sync"
  | "failed_payment"
  | "pending_purchase"
  | "outstanding_supplier"
  | "outstanding_customer"

export type NotificationAudience = "customer" | "staff"

export type NotificationPriority = "low" | "medium" | "high" | "critical"

export type NotificationRecord = {
  notificationId: string
  invoiceId: string
  paymentId: string | null
  customerId: string | null
  customerName: string
  customerPhone: string | null
  storeId: string | null
  channel: NotificationChannel
  status: NotificationStatus
  messageType: NotificationMessageType
  templateName: string | null
  receiptUrl: string | null
  messageId: string | null
  createdAt: string
  sentAt: string | null
  updatedAt: string
  retryCount: number
  nextRetryAt: string | null
  error: string | null
  /** Staff vs customer. Defaults customer for WhatsApp kinds. */
  audience?: NotificationAudience
  priority?: NotificationPriority
  /** Soft alert headline for inbox. */
  title?: string | null
  /** Dedupe key for staff alerts (e.g. low_stock:SKU-1). */
  dedupeKey?: string | null
  readAt?: string | null
  /** Free-form provider metadata (no secrets). */
  meta?: Record<string, unknown>
}

export type NotificationLogEvent =
  | "created"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "retry"
  | "cancelled"
  | "error"

export type NotificationLog = {
  id: string
  notificationId: string
  event: NotificationLogEvent
  message: string
  createdAt: string
}

export type NotificationAnalytics = {
  sentToday: number
  failed: number
  pendingQueue: number
  deliveryRate: number
  readRate: number
}

/** Channel provider contract — implemented only in Cloud Functions for WhatsApp. */
export interface NotificationProvider {
  readonly id: string
  readonly channel: NotificationChannel

  send(notification: NotificationRecord): Promise<{
    ok: boolean
    messageId?: string
    error?: string
  }>

  retry(notification: NotificationRecord): Promise<{
    ok: boolean
    messageId?: string
    error?: string
  }>

  cancel(notification: NotificationRecord): Promise<{ ok: boolean }>

  status(notification: NotificationRecord): Promise<NotificationStatus>
}

export type StoreSettingsRecord = {
  id: string
  storeId: string
  businessName: string
  /** Legal name for invoices / statutory (optional). */
  legalName?: string
  tradeName?: string
  businessType?: string
  whatsappBusinessNumber: string
  /** Public Meta phone number id — token stays in Cloud Functions env only. */
  phoneNumberId: string
  businessLogoUrl: string | null
  receiptFooter: string
  supportNumber: string
  businessAddress: string
  city?: string
  state?: string
  pin?: string
  country?: string
  email?: string
  website?: string
  storeGst: string
  pan?: string
  tan?: string
  /** Whether the store is liable to collect TCS (scaffold flag). */
  tcsApplicable?: boolean
  gstRegistrationType?: string
  invoicePrefix?: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

/** Visual tone for soft staff alerts. */
export type AlertTone =
  | "slate"
  | "amber"
  | "rose"
  | "sky"
  | "violet"
  | "emerald"

export const ALERT_MESSAGE_TYPES: NotificationMessageType[] = [
  "low_stock",
  "out_of_stock",
  "expiring_stock",
  "large_discount",
  "large_refund",
  "cash_variance",
  "failed_sync",
  "failed_payment",
  "pending_purchase",
  "outstanding_supplier",
  "outstanding_customer",
]

export function isStaffAlertType(type: NotificationMessageType): boolean {
  return ALERT_MESSAGE_TYPES.includes(type)
}

export function alertToneFor(
  type: NotificationMessageType,
  priority: NotificationPriority = "medium"
): AlertTone {
  if (type === "out_of_stock" || type === "failed_payment" || type === "failed_sync") {
    return "rose"
  }
  if (type === "low_stock" || type === "expiring_stock" || type === "cash_variance") {
    return "amber"
  }
  if (type === "large_discount" || type === "large_refund") return "violet"
  if (type === "pending_purchase") return "sky"
  if (type === "outstanding_supplier" || type === "outstanding_customer") {
    return "slate"
  }
  if (priority === "critical") return "rose"
  if (priority === "high") return "amber"
  return "emerald"
}

export function alertLabel(type: NotificationMessageType): string {
  switch (type) {
    case "low_stock":
      return "Low stock"
    case "out_of_stock":
      return "Out of stock"
    case "expiring_stock":
      return "Expiring stock"
    case "large_discount":
      return "Large discount"
    case "large_refund":
      return "Large refund"
    case "cash_variance":
      return "Cash variance"
    case "failed_sync":
      return "Failed sync"
    case "failed_payment":
      return "Failed payment"
    case "pending_purchase":
      return "Pending purchase"
    case "outstanding_supplier":
      return "Outstanding supplier"
    case "outstanding_customer":
      return "Outstanding customer"
    default:
      return type
  }
}
