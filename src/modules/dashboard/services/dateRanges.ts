import type {
  DashboardDateRange,
  DashboardRangePreset,
} from "../types/dashboard"

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

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay() // 0 Sun
  const diff = day === 0 ? -6 : 1 - day // Monday start
  return addDays(d, diff)
}

function startOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1))
}

function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

function withPrevious(
  preset: DashboardRangePreset,
  label: string,
  start: Date,
  end: Date
): DashboardDateRange {
  const durationMs = end.getTime() - start.getTime()
  const previousEnd = new Date(start.getTime() - 1)
  const previousStart = new Date(previousEnd.getTime() - durationMs)
  return {
    preset,
    label,
    start,
    end,
    previousStart,
    previousEnd,
  }
}

export function resolveDashboardRange(
  preset: DashboardRangePreset,
  custom?: { start: Date; end: Date }
): DashboardDateRange {
  const now = new Date()

  switch (preset) {
    case "today": {
      const start = startOfDay(now)
      const end = endOfDay(now)
      return withPrevious("today", "Today", start, end)
    }
    case "yesterday": {
      const day = addDays(startOfDay(now), -1)
      return withPrevious("yesterday", "Yesterday", day, endOfDay(day))
    }
    case "this_week": {
      const start = startOfWeek(now)
      return withPrevious("this_week", "This week", start, endOfDay(now))
    }
    case "this_month": {
      const start = startOfMonth(now)
      return withPrevious("this_month", "This month", start, endOfDay(now))
    }
    case "last_month": {
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 15)
      return withPrevious(
        "last_month",
        "Last month",
        startOfMonth(ref),
        endOfMonth(ref)
      )
    }
    case "custom": {
      const start = startOfDay(custom?.start ?? now)
      const end = endOfDay(custom?.end ?? now)
      return withPrevious("custom", "Custom range", start, end)
    }
    default:
      return resolveDashboardRange("today")
  }
}

export function isInRange(
  iso: string | null | undefined,
  start: Date,
  end: Date
): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return false
  return t >= start.getTime() && t <= end.getTime()
}

export const RANGE_PRESETS: {
  id: DashboardRangePreset
  label: string
}[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "custom", label: "Custom" },
]
