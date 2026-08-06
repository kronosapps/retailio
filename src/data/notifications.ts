/**
 * Local notification cache (offline-first UI).
 * Cloud Functions own send lifecycle; this mirrors status for the POS.
 */

import type {
  NotificationLog,
  NotificationRecord,
} from "@/modules/notifications/types/notification"

const STORAGE_KEY = "retailos.notifications.v1"
const LOG_KEY = "retailos.notifications.logs.v1"

type NotificationStore = {
  version: 1
  items: NotificationRecord[]
}

type LogStore = {
  logs: NotificationLog[]
}

function emptyStore(): NotificationStore {
  return { version: 1, items: [] }
}

function readStore(): NotificationStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<NotificationStore>
    if (!Array.isArray(parsed.items)) return emptyStore()
    return { version: 1, items: parsed.items as NotificationRecord[] }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: NotificationStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function readLogs(): LogStore {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return { logs: [] }
    const parsed = JSON.parse(raw) as Partial<LogStore>
    return { logs: Array.isArray(parsed.logs) ? parsed.logs : [] }
  } catch {
    return { logs: [] }
  }
}

function writeLogs(store: LogStore) {
  localStorage.setItem(LOG_KEY, JSON.stringify(store))
}

export function listLocalNotifications(): NotificationRecord[] {
  return [...readStore().items].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function getLocalNotification(
  notificationId: string
): NotificationRecord | null {
  return (
    readStore().items.find((n) => n.notificationId === notificationId) ?? null
  )
}

export function getLocalNotificationByInvoice(
  invoiceId: string
): NotificationRecord | null {
  return (
    readStore().items.find(
      (n) =>
        n.invoiceId === invoiceId &&
        n.messageType === "receipt" &&
        n.channel === "whatsapp"
    ) ?? null
  )
}

export function upsertLocalNotification(
  record: NotificationRecord
): NotificationRecord {
  const store = readStore()
  const index = store.items.findIndex(
    (n) => n.notificationId === record.notificationId
  )
  if (index >= 0) store.items[index] = record
  else store.items.push(record)
  writeStore(store)
  return record
}

export function appendLocalNotificationLog(
  entry: Omit<NotificationLog, "id" | "createdAt"> & { id?: string }
): NotificationLog {
  const log: NotificationLog = {
    id:
      entry.id ||
      `nlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    notificationId: entry.notificationId,
    event: entry.event,
    message: entry.message,
    createdAt: new Date().toISOString(),
  }
  const store = readLogs()
  store.logs = [log, ...store.logs].slice(0, 500)
  writeLogs(store)
  return log
}

export function listLocalNotificationLogs(
  notificationId?: string
): NotificationLog[] {
  const logs = readLogs().logs
  if (!notificationId) return logs
  return logs.filter((l) => l.notificationId === notificationId)
}
