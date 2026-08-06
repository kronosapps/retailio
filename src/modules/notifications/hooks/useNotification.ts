import { useCallback, useEffect, useState } from "react"

import type { NotificationRecord } from "../types/notification"
import { NotificationService } from "../services/NotificationService"

export function useNotification(invoiceId: string | null) {
  const [notification, setNotification] = useState<NotificationRecord | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!invoiceId) {
      setNotification(null)
      return
    }
    setNotification(NotificationService.getByInvoiceId(invoiceId))
  }, [invoiceId])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 4000)
    return () => window.clearInterval(id)
  }, [refresh])

  const retry = useCallback(async () => {
    if (!notification) return
    setBusy(true)
    setError(null)
    try {
      const next = await NotificationService.retry(notification.notificationId)
      setNotification(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.")
    } finally {
      setBusy(false)
    }
  }, [notification])

  const sendAgain = useCallback(
    async (input: {
      customerName: string
      customerPhone: string | null
      paymentId?: string | null
      customerId?: string | null
      storeId?: string | null
    }) => {
      if (!invoiceId) return
      setBusy(true)
      setError(null)
      try {
        const next = await NotificationService.sendAgain({
          invoiceId,
          ...input,
          messageType: "receipt",
          channel: "whatsapp",
        })
        setNotification(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send again failed.")
      } finally {
        setBusy(false)
      }
    },
    [invoiceId]
  )

  return {
    notification,
    busy,
    error,
    refresh,
    retry,
    sendAgain,
    logs: notification
      ? NotificationService.listLogs(notification.notificationId)
      : [],
  }
}
