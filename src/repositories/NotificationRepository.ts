import {
  appendLocalNotificationLog,
  getLocalNotification,
  getLocalNotificationByInvoice,
  listLocalNotificationLogs,
  listLocalNotifications,
  upsertLocalNotification,
} from "@/data/notifications"
import { EventPublisher } from "@/events/EventPublisher"
import { EventTypes } from "@/events/EventTypes"
import type {
  NotificationAudience,
  NotificationLog,
  NotificationMessageType,
  NotificationPriority,
  NotificationRecord,
  NotificationStatus,
} from "@/modules/notifications/types/notification"
import { isStaffAlertType } from "@/modules/notifications/types/notification"
import { createId } from "@/utils/id"

import { COLLECTIONS } from "@/core/firebase/collections"

import { listDocuments, upsertDocument } from "./firestoreHelpers"

const COLLECTION = COLLECTIONS.NOTIFICATIONS

export type QueueNotificationInput = {
  /** Optional for CRM offer/reminder/campaign (use crm:{customerId}). */
  invoiceId?: string
  paymentId?: string | null
  customerId?: string | null
  customerName: string
  customerPhone: string | null
  storeId?: string | null
  messageType?: NotificationMessageType
  channel?: NotificationRecord["channel"]
  templateName?: string | null
  /** Free-text body stored in meta for CRM messages / staff alerts. */
  body?: string | null
  title?: string | null
  audience?: NotificationAudience
  priority?: NotificationPriority
  dedupeKey?: string | null
  /** Force a new notification even if one exists for the invoice. */
  forceNew?: boolean
  meta?: Record<string, unknown>
}

/**
 * Owns the `notifications` collection (client queue + status mirror).
 * Actual WhatsApp delivery runs in Cloud Functions — never here.
 */
export class NotificationRepository {
  list(): NotificationRecord[] {
    return listLocalNotifications()
  }

  getById(notificationId: string): NotificationRecord | null {
    return getLocalNotification(notificationId)
  }

  getByInvoiceId(invoiceId: string): NotificationRecord | null {
    return getLocalNotificationByInvoice(invoiceId)
  }

  listLogs(notificationId?: string): NotificationLog[] {
    return listLocalNotificationLogs(notificationId)
  }

  /**
   * Queue a notification for Cloud Functions.
   * Writes Firestore doc with status Queued — CF sends via Meta API.
   */
  async queue(input: QueueNotificationInput): Promise<NotificationRecord> {
    const invoiceId =
      input.invoiceId?.trim() ||
      (input.customerId ? `crm:${input.customerId}` : createId("crmmsg"))

    if (!input.forceNew && input.invoiceId) {
      const existing = getLocalNotificationByInvoice(invoiceId)
      if (
        existing &&
        (existing.status === "Queued" ||
          existing.status === "Sending" ||
          existing.status === "Sent" ||
          existing.status === "Delivered" ||
          existing.status === "Read")
      ) {
        return existing
      }
    }

    const now = new Date().toISOString()
    const notificationId =
      input.paymentId && !input.forceNew
        ? `ntf_${input.paymentId}`
        : createId("ntf")
    const messageType = input.messageType ?? "receipt"
    const channel = input.channel ?? "whatsapp"
    const isInApp =
      channel === "in_app" ||
      input.audience === "staff" ||
      isStaffAlertType(messageType)

    const record: NotificationRecord = {
      notificationId,
      invoiceId,
      paymentId: input.paymentId ?? null,
      customerId: input.customerId ?? null,
      customerName: input.customerName.trim() || "Walk-in",
      customerPhone: input.customerPhone,
      storeId: input.storeId ?? null,
      channel: isInApp ? "in_app" : channel,
      // In-app staff alerts are delivered locally — CF no-ops this channel.
      status: isInApp ? "Delivered" : "Queued",
      messageType,
      templateName: isInApp
        ? null
        : (input.templateName ??
          (messageType === "offer" ||
          messageType === "reminder" ||
          messageType === "campaign"
            ? `${messageType}_notification`
            : "receipt_notification")),
      receiptUrl: null,
      messageId: null,
      createdAt: now,
      sentAt: isInApp ? now : null,
      updatedAt: now,
      retryCount: 0,
      nextRetryAt: null,
      error: null,
      audience: input.audience ?? (isInApp ? "staff" : "customer"),
      priority: input.priority ?? (isInApp ? "medium" : undefined),
      title: input.title ?? null,
      dedupeKey: input.dedupeKey ?? null,
      readAt: null,
      meta: {
        ...(input.meta || {}),
        ...(input.body ? { body: input.body } : {}),
      },
    }

    return this.persist(record, "created")
  }

  /** Mark a staff alert as read (soft inbox). */
  async markRead(notificationId: string): Promise<NotificationRecord | null> {
    const existing = getLocalNotification(notificationId)
    if (!existing) return null
    if (existing.readAt) return existing
    const now = new Date().toISOString()
    const next: NotificationRecord = {
      ...existing,
      readAt: now,
      status: existing.channel === "in_app" ? "Read" : existing.status,
      updatedAt: now,
    }
    return this.persist(next, "updated")
  }

  async updateStatus(
    notificationId: string,
    patch: Partial<
      Pick<
        NotificationRecord,
        | "status"
        | "messageId"
        | "receiptUrl"
        | "sentAt"
        | "error"
        | "retryCount"
        | "nextRetryAt"
        | "templateName"
        | "readAt"
      >
    >
  ): Promise<NotificationRecord | null> {
    const existing = getLocalNotification(notificationId)
    if (!existing) return null
    const next: NotificationRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    return this.persist(next, "updated")
  }

  /** Manual retry — bumps retryCount and sets Queued for CF. */
  async requestRetry(notificationId: string): Promise<NotificationRecord | null> {
    const existing = getLocalNotification(notificationId)
    if (!existing) return null
    if (existing.retryCount >= 3) {
      return this.updateStatus(notificationId, {
        status: "Failed",
        error: existing.error || "Maximum retries reached.",
      })
    }
    const next: NotificationRecord = {
      ...existing,
      status: "Queued",
      retryCount: existing.retryCount + 1,
      nextRetryAt: null,
      error: null,
      updatedAt: new Date().toISOString(),
    }
    upsertLocalNotification(next)
    appendLocalNotificationLog({
      notificationId: next.notificationId,
      event: "retry",
      message: `Retry ${next.retryCount} requested from admin UI.`,
    })
    await upsertDocument(COLLECTION, next.notificationId, {
      ...next,
      id: next.notificationId,
      retryRequestedAt: new Date().toISOString(),
    })
    await EventPublisher.publish(
      EventTypes.NOTIFICATION_RETRY,
      { notificationId: next.notificationId, retryCount: next.retryCount },
      next.storeId
    )
    return next
  }

  async mirrorFromRemote(record: NotificationRecord): Promise<NotificationRecord> {
    upsertLocalNotification(record)
    return record
  }

  /** Pull remote notification queue when Firestore is source of truth. */
  async hydrate(): Promise<NotificationRecord[]> {
    const remote = await listDocuments<NotificationRecord>(COLLECTION)
    if (remote) {
      for (const row of remote) {
        const id = row?.notificationId || (row as { id?: string }).id
        if (!id) continue
        upsertLocalNotification({
          ...row,
          notificationId: id,
        })
      }
    }
    return this.list()
  }

  private async persist(
    record: NotificationRecord,
    kind: "created" | "updated"
  ): Promise<NotificationRecord> {
    upsertLocalNotification(record)
    appendLocalNotificationLog({
      notificationId: record.notificationId,
      event: kind === "created" ? "created" : statusToLogEvent(record.status),
      message:
        kind === "created"
          ? `Notification queued (${record.channel}/${record.messageType}).`
          : `Status → ${record.status}`,
    })

    await upsertDocument(COLLECTION, record.notificationId, {
      ...record,
      id: record.notificationId,
    })

    await EventPublisher.publish(
      kind === "created"
        ? EventTypes.NOTIFICATION_QUEUED
        : EventTypes.NOTIFICATION_UPDATED,
      {
        notificationId: record.notificationId,
        invoiceId: record.invoiceId,
        status: record.status,
        channel: record.channel,
      },
      record.storeId
    )

    return record
  }
}

function statusToLogEvent(
  status: NotificationStatus
): NotificationLog["event"] {
  switch (status) {
    case "Queued":
      return "queued"
    case "Sending":
      return "sending"
    case "Sent":
      return "sent"
    case "Delivered":
      return "delivered"
    case "Read":
      return "read"
    case "Failed":
      return "failed"
    case "Cancelled":
      return "cancelled"
    default:
      return "created"
  }
}

export const notificationRepository = new NotificationRepository()
