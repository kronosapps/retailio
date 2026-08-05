import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { useAuth } from "@/providers/AuthProvider"

import { DashboardAnalyticsService } from "../services/DashboardAnalyticsService"
import type { DashboardRangePreset } from "../types/dashboard"

export function useDashboard() {
  const { profile } = useAuth()
  const storeId = profile?.storeId ?? null

  const [preset, setPreset] = useState<DashboardRangePreset>("today")
  const [customStart, setCustomStart] = useState<string>("")
  const [customEnd, setCustomEnd] = useState<string>("")

  const queryKey = useMemo(
    () =>
      [
        "dashboard",
        storeId,
        preset,
        preset === "custom" ? customStart : null,
        preset === "custom" ? customEnd : null,
      ] as const,
    [storeId, preset, customStart, customEnd]
  )

  const query = useQuery({
    queryKey,
    queryFn: () =>
      DashboardAnalyticsService.load({
        storeId,
        preset,
        customStart: customStart ? new Date(customStart) : undefined,
        customEnd: customEnd ? new Date(customEnd) : undefined,
      }),
    staleTime: 30_000,
  })

  return {
    data: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: () => void query.refetch(),
    preset,
    setPreset,
    customStart,
    customEnd,
    setCustomStart,
    setCustomEnd,
    storeId,
  }
}
