import {
  notificationRepository,
  type QueueNotificationInput,
} from "@/repositories/NotificationRepository"
import type {
  NotificationAnalytics,
  NotificationRecord,
} from "../types/notification"

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * UI → NotificationService → NotificationRepository.
 * Never talks to Meta WhatsApp APIs.
 */
export class NotificationService {
  static list(): NotificationRecord[] {
    return notificationRepository.list()
  }

  static hydrate() {
    return notificationRepository.hydrate()
  }

  static getByInvoiceId(invoiceId: string): NotificationRecord | null {
    return notificationRepository.getByInvoiceId(invoiceId)
  }

  static getById(notificationId: string): NotificationRecord | null {
    return notificationRepository.getById(notificationId)
  }

  static listLogs(notificationId?: string) {
    return notificationRepository.listLogs(notificationId)
  }

  static queue(input: QueueNotificationInput) {
    return notificationRepository.queue(input)
  }

  static retry(notificationId: string) {
    return notificationRepository.requestRetry(notificationId)
  }

  static sendAgain(input: QueueNotificationInput) {
    return notificationRepository.queue({ ...input, forceNew: true })
  }

  static analytics(storeId: string | null = null): NotificationAnalytics {
    const items = notificationRepository
      .list()
      .filter((n) => !storeId || !n.storeId || n.storeId === storeId)

    const today = startOfToday().getTime()
    const sentToday = items.filter(
      (n) =>
        (n.status === "Sent" ||
          n.status === "Delivered" ||
          n.status === "Read") &&
        n.sentAt &&
        new Date(n.sentAt).getTime() >= today
    ).length

    const failed = items.filter((n) => n.status === "Failed").length
    const pendingQueue = items.filter(
      (n) =>
        n.status === "Pending" ||
        n.status === "Queued" ||
        n.status === "Sending"
    ).length

    const terminal = items.filter(
      (n) =>
        n.status === "Sent" ||
        n.status === "Delivered" ||
        n.status === "Read" ||
        n.status === "Failed"
    )
    const deliveredLike = items.filter(
      (n) => n.status === "Delivered" || n.status === "Read"
    )
    const read = items.filter((n) => n.status === "Read")
    const sentLike = items.filter(
      (n) =>
        n.status === "Sent" ||
        n.status === "Delivered" ||
        n.status === "Read"
    )

    const deliveryRate =
      terminal.length === 0
        ? 0
        : (deliveredLike.length / terminal.length) * 100
    const readRate =
      sentLike.length === 0 ? 0 : (read.length / sentLike.length) * 100

    return {
      sentToday,
      failed,
      pendingQueue,
      deliveryRate,
      readRate,
    }
  }
}
