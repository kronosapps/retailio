/**
 * Notification Engine — channel-agnostic contracts.
 * Payment / Invoice modules never import WhatsApp APIs.
 */

export type NotificationChannel =
  | "whatsapp"
  | "sms"
  | "email"
  | "push"
  | "telegram"

export type NotificationStatus =
  | "Pending"
  | "Queued"
  | "Sending"
  | "Sent"
  | "Delivered"
  | "Read"
  | "Failed"
  | "Cancelled"

export type NotificationMessageType =
  | "receipt"
  | "invoice"
  | "order_confirmation"
  | "payment_success"
  | "refund"

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
