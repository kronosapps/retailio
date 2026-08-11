import {
  isInRange,
  resolveDashboardRange,
} from "@/modules/dashboard/services/dateRanges"
import type { DashboardRangePreset } from "@/modules/dashboard/types/dashboard"

import type { ReportFilters, ReportPeriodPreset } from "../types/report"

export { isInRange }

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export type ResolvedReportPeriod = {
  preset: ReportPeriodPreset
  label: string
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}

/**
 * Resolve inclusive local-day report windows.
 * Reuses dashboard ranges for shared presets; adds last 7/30 days.
 */
export function resolveReportPeriod(
  preset: ReportPeriodPreset,
  custom?: { start: Date; end: Date }
): ResolvedReportPeriod {
  if (preset === "last_7_days") {
    const end = endOfDay(new Date())
    const start = startOfDay(addDays(new Date(), -6))
    const durationMs = end.getTime() - start.getTime()
    const previousEnd = new Date(start.getTime() - 1)
    const previousStart = new Date(previousEnd.getTime() - durationMs)
    return {
      preset,
      label: "Last 7 days",
      start,
      end,
      previousStart,
      previousEnd,
    }
  }

  if (preset === "last_30_days") {
    const end = endOfDay(new Date())
    const start = startOfDay(addDays(new Date(), -29))
    const durationMs = end.getTime() - start.getTime()
    const previousEnd = new Date(start.getTime() - 1)
    const previousStart = new Date(previousEnd.getTime() - durationMs)
    return {
      preset,
      label: "Last 30 days",
      start,
      end,
      previousStart,
      previousEnd,
    }
  }

  const mapped: DashboardRangePreset =
    preset === "custom" ? "custom" : (preset as DashboardRangePreset)
  const range = resolveDashboardRange(mapped, custom)
  return {
    preset,
    label: range.label,
    start: range.start,
    end: range.end,
    previousStart: range.previousStart,
    previousEnd: range.previousEnd,
  }
}

export function filtersFromPreset(
  preset: ReportPeriodPreset,
  extras: Partial<Omit<ReportFilters, "preset" | "startDate" | "endDate">> = {},
  custom?: { start: Date; end: Date }
): ReportFilters {
  const period = resolveReportPeriod(preset, custom)
  return {
    preset,
    startDate: period.start,
    endDate: period.end,
    storeId: extras.storeId ?? null,
    category: extras.category ?? null,
    productSku: extras.productSku ?? null,
    staffId: extras.staffId ?? null,
    paymentMethod: extras.paymentMethod ?? null,
  }
}

export const REPORT_PERIOD_PRESETS: {
  id: ReportPeriodPreset
  label: string
}[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
]

export function formatPeriodLabel(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}
