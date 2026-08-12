import { useCallback, useEffect, useState } from "react"

import { EventBus } from "@/events/EventBus"
import { EventTypes } from "@/events/EventTypes"
import { useAuth } from "@/providers/AuthProvider"
import { AlertService } from "../services/AlertService"
import type { NotificationRecord } from "../types/notification"

/**
 * Live staff soft-alerts inbox (local NotificationRepository mirror).
 */
export function useStaffAlerts() {
  const { profile } = useAuth()
  const storeId = profile?.storeId ?? null
  const [alerts, setAlerts] = useState<NotificationRecord[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    setAlerts(AlertService.listStaffAlerts(storeId))
  }, [storeId])

  useEffect(() => {
    refresh()
    const offQueued = EventBus.subscribe(EventTypes.NOTIFICATION_QUEUED, refresh)
    const offUpdated = EventBus.subscribe(
      EventTypes.NOTIFICATION_UPDATED,
      refresh
    )
    const interval = window.setInterval(refresh, 8000)
    return () => {
      offQueued()
      offUpdated()
      window.clearInterval(interval)
    }
  }, [refresh])

  const unreadCount = alerts.filter((a) => !a.readAt).length

  const markRead = useCallback(
    async (notificationId: string) => {
      setBusy(true)
      try {
        await AlertService.markRead(notificationId)
        refresh()
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const markAllRead = useCallback(async () => {
    setBusy(true)
    try {
      await AlertService.markAllRead(storeId)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh, storeId])

  const rescan = useCallback(async () => {
    setBusy(true)
    try {
      await AlertService.runAgingScans(storeId)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh, storeId])

  return {
    alerts,
    unreadCount,
    busy,
    refresh,
    markRead,
    markAllRead,
    rescan,
  }
}
