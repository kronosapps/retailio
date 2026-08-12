export type {
  AlertTone,
  NotificationAnalytics,
  NotificationAudience,
  NotificationChannel,
  NotificationLog,
  NotificationMessageType,
  NotificationPriority,
  NotificationProvider,
  NotificationRecord,
  NotificationStatus,
  StoreSettingsRecord,
} from "./types/notification"

export {
  ALERT_MESSAGE_TYPES,
  alertLabel,
  alertToneFor,
  isStaffAlertType,
} from "./types/notification"

export { NotificationService } from "./services/NotificationService"
export { AlertService } from "./services/AlertService"
export { StoreSettingsService } from "./services/StoreSettingsService"
export {
  NotificationEngine,
  notificationEngine,
} from "./services/NotificationEngine"
export {
  getAlertThresholds,
  saveAlertThresholds,
  defaultAlertThresholds,
  isAlertMutedForRole,
  type AlertThresholds,
  type AlertRoleMutes,
} from "./alertThresholds"
export { buildAlertHref } from "./alertDeepLinks"

export { useNotification } from "./hooks/useNotification"
export { useNotificationAnalytics } from "./hooks/useNotificationAnalytics"
export { useStaffAlerts } from "./hooks/useStaffAlerts"

export { NotificationStatusPanel } from "./components/NotificationStatusPanel"
export { NotificationAnalyticsCards } from "./components/NotificationAnalyticsCards"
export { SoftAlertsBell } from "./components/SoftAlertsBell"
export { AlertSettingsCard } from "./components/AlertSettingsCard"
