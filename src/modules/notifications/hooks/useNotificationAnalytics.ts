import { useMemo } from "react"

import { useAuth } from "@/providers/AuthProvider"

import { NotificationService } from "../services/NotificationService"

export function useNotificationAnalytics() {
  const { profile } = useAuth()
  return useMemo(
    () => NotificationService.analytics(profile?.storeId ?? null),
    [profile?.storeId]
  )
}
