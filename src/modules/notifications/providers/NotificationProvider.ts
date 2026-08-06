/**
 * Channel-agnostic provider contract (frontend type surface).
 * Concrete WhatsApp delivery is implemented in backend/functions only.
 */
import type {
  NotificationProvider as ProviderContract,
  NotificationRecord,
  NotificationStatus,
} from "../types/notification"

export type { ProviderContract as NotificationProvider }

/** Placeholder — SMS/Email/Push providers will implement this later. */
export type FutureNotificationProvider = {
  send(notification: NotificationRecord): Promise<{ ok: boolean; error?: string }>
  retry(notification: NotificationRecord): Promise<{ ok: boolean; error?: string }>
  cancel(notification: NotificationRecord): Promise<{ ok: boolean }>
  status(notification: NotificationRecord): Promise<NotificationStatus>
}
